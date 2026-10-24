/**
 * MCP 服务：让外部 AI 端到端完成一篇公众号图文。
 *
 * 设计目标是一句话：**用户只说三件事——哪个客户、内容是什么、素材在哪**，
 * 剩下的由 AI 自己做：读客户的设计系统 → 导入素材 → 排版写文案 → **截图看效果** → 体检 → 改。
 *
 * 所以工具分四组：
 * 1. **读契约**：list_design_systems / get_design_system / list_components —— 什么不能动、能动什么、什么时候用哪个组件；
 * 2. **备料**：import_images / list_images —— 素材进来，拿素材 id；
 * 3. **写文章**：new_article / apply_plan / insert_component / set_block_props / move_block / remove_block；
 * 4. **自检**：preview_article（**返回图片**，AI 的眼睛）/ audit_article（交付前 error 必须为 0）。
 *
 * 关于 preview_article：截图是这套工具里最重要的一个。在此之前 AI 只能拿到 HTML 文本，
 * 是"闭着眼睛排版"，由人在公众号里粘贴后发现问题再回头告诉它。现在它能自己看。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { ArticlePatch, ArticleDocument, ArticleMutationRequest, ArticleReplaceRequest, LibraryPatch } from '../shared/article';

const apiBase = process.env.EDITOR_API ?? 'http://127.0.0.1:8787';

async function api(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${apiBase}${path}`, { headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  const body = await response.json().catch(() => ({ error: `响应不是 JSON（${response.status}）` }));
  if (!response.ok) throw new Error(body.error ?? `editor API ${response.status}`);
  return body;
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

async function patch(patchBody: ArticlePatch, baseRevision?: number, summary?: string) {
  const state = baseRevision === undefined ? await api('/api/article') : null;
  const request: ArticleMutationRequest = {
    baseRevision: baseRevision ?? state.document.revision,
    patch: patchBody,
    source: 'mcp',
    summary,
  };
  return api('/api/article/mutate', { method: 'POST', body: JSON.stringify(request) });
}

/**
 * 把一组 {componentId, props} 拼成完整文档。
 * 只换 templateId（配色绑定在模板上），其余文档级字段沿用当前文章；
 * props 缺失的部分由服务端的 normalizeProps 在 replace 时补齐。
 */
async function buildDocument(plan: { componentId: string; props?: Record<string, string> }[], options: { title?: string; subtitle?: string; designSystemId?: string; baseRevision?: number }) {
  const state = await api('/api/article');
  const current = state.document as ArticleDocument;
  let templateId = current.templateId;
  if (options.designSystemId && options.designSystemId !== current.templateId) {
    const design = await api(`/api/design-systems/${encodeURIComponent(options.designSystemId)}`);
    templateId = design.templateId;
  }
  const document: ArticleDocument = {
    ...current,
    templateId,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
    blocks: plan.map((item, index) => ({ id: `plan-${index + 1}`, componentId: item.componentId, props: item.props ?? {} })),
    revision: current.revision,
  };
  return { document, baseRevision: options.baseRevision ?? current.revision };
}

const server = new McpServer(
  { name: 'wechat-layout-editor', version: '0.3.0' },
  {
    instructions:
      '微信公众号排版器。用户通常只说三件事：**哪个客户、内容是什么、素材在哪**，剩下的你来做。\n' +
      '\n' +
      '推荐流程：\n' +
      '1. `list_design_systems` 看有哪几个客户的设计系统（含组合骨架）→ 选定后 `get_design_system` 拿完整声明：\n' +
      '   基线（什么不能动）、自由区（能动什么、锁定字段）、品牌固定元素、**每个组件什么时候用/什么时候不用**。\n' +
      '2. `import_images` 把素材导进图片库（可以给本机文件路径或一个目录），拿素材 id。\n' +
      '3. `new_article` 按客户开一篇（起手骨架），然后用 `apply_plan` **一次写入整篇结构**，或逐块 `insert_component` / `set_block_props`。\n' +
      '4. `preview_article` 截图看效果——**这是你的眼睛，用它自己发现"挤成一团""两张图卡挨在一起"这类问题**。\n' +
      '5. `audit_article` 体检。**交付前 error 必须为 0**，warning 需要判断或改掉。\n' +
      '6. 改完再 preview 一次确认，然后告诉用户"可以复制到公众号了"。\n' +
      '\n' +
      '硬约束：不要写 CSS/HTML（字段都是纯文本，会被转义）；不要用白名单外的组件；不要改锁定字段；\n' +
      '图片只能填图片库里的素材 id；正文不要放外链（微信正文的外链不可跳转，外链放文末「阅读原文」）。\n' +
      '写操作都带 `baseRevision`；冲突返回 REVISION_CONFLICT 时重新读一次再改。',
  },
);

/* ---------------- 1. 读契约 ---------------- */

server.registerTool('list_design_systems', {
  description: '列出所有客户的设计系统概览（客户名、基线来源、组件数、必备品牌元素、组合骨架）。先看这个决定"做哪个客户的"。',
  inputSchema: {},
}, async () => text(await api('/api/design-systems')));

server.registerTool('get_design_system', {
  description:
    '拿一个客户设计系统的完整声明：基线（色板闭集/字号阶/行高/字距，是"什么不能动"的唯一可执行定义）、' +
    '自由区（AI 可以决定什么、绝对不许做什么、锁定字段）、品牌固定元素、选择指南（每个组件什么时候用）、' +
    '以及组件目录（含字段与默认值）。排版前**必读**。',
  inputSchema: { id: z.string().describe('设计系统 id，来自 list_design_systems') },
}, async ({ id }) => text(await api(`/api/design-systems/${encodeURIComponent(id)}`)));

server.registerTool('list_components', {
  description: '列出可用组件（id、名称、字段、默认值，以及该客户的"什么时候用/什么时候不用"）。只想看目录时用它，比 get_design_system 轻。',
  inputSchema: { designSystemId: z.string().optional().describe('省略则用当前文章的设计系统') },
}, async ({ designSystemId }) => text(await api(`/api/catalog${designSystemId ? `?designSystemId=${encodeURIComponent(designSystemId)}` : ''}`)));

server.registerTool('list_templates', { description: '列出配色模板（设计系统与模板基本一一对应）。', inputSchema: {} }, async () => text(await api('/api/templates')));
server.registerTool('get_editor_state', { description: '读编辑器完整状态：文章、版本、图片库与分类、模板、组件、使用记录。', inputSchema: {} }, async () => text(await api('/api/editor/state')));
server.registerTool('get_article', { description: '读当前文章（每个块的 componentId 与 props）与版本历史。改之前先读它拿 revision 与 block id。', inputSchema: {} }, async () => text(await api('/api/article')));
server.registerTool('list_images', { description: '列出图片库素材与分类。组件里的图片字段只能填这里的素材 id。', inputSchema: {} }, async () => text(await api('/api/images')));
server.registerTool('render_article', {
  description: '渲染当前文章并返回 HTML 文本、警告和统计。**要看效果请用 preview_article（返回图片）**，这个只用来核对 HTML 结构。',
  inputSchema: { mode: z.enum(['high-fidelity', 'miniprogram-safe']).default('miniprogram-safe') },
}, async ({ mode }) => text(await api(`/api/render?mode=${mode}`)));

/* ---------------- 4. 自检（放在读契约之后，因为它是流程里的关键一环） ---------------- */

server.registerTool('preview_article', {
  description:
    '**截图看效果**——把当前文章渲染成一张 415px 版心的图片返回给你，这是你唯一的"眼睛"。' +
    '用它检查：图片是否正常显示、间距是否挤、同类组件是否连成一片、长文案有没有撑破版式、' +
    '标题层级是否清楚。看完再决定改哪里，改完再看一次。',
  inputSchema: {
    mode: z.enum(['high-fidelity', 'miniprogram-safe']).default('miniprogram-safe').describe('miniprogram-safe 是发布建议用的模式'),
    scale: z.number().min(0.5).max(3).default(2).describe('像素密度。2 足够看清文字；页面很长时用 1 减小体积'),
  },
}, async ({ mode, scale }) => {
  const result = await api('/api/preview', { method: 'POST', body: JSON.stringify({ mode, scale }) });
  const { pngBase64, mimeType, ...meta } = result;
  return {
    content: [
      { type: 'image' as const, data: pngBase64, mimeType },
      { type: 'text' as const, text: JSON.stringify(meta, null, 2) },
    ],
  };
});

server.registerTool('audit_article', {
  description:
    '文章体检：未知/白名单外的组件、空字段、改了锁定字段、图片引用了库外地址、正文里的外链（以上 error），' +
    '缺品牌固定元素、成对组件只出现一个、同类块连着出现（以上 warning），以及出现次数异常（info）。' +
    '**交付前 error 必须为 0。**',
  inputSchema: { designSystemId: z.string().optional() },
}, async ({ designSystemId }) => {
  const result = await api(`/api/audit${designSystemId ? `?designSystemId=${encodeURIComponent(designSystemId)}` : ''}`);
  return text(result.formatted ?? result);
});

server.registerTool('audit_catalog', {
  description:
    '目录回归：把该客户的全部组件渲染一遍，检查有没有越界的颜色/字号、禁用写法（display:grid、position、float、<div> 等）、' +
    '标签配平、文案掉字。**改组件或加新组件之后跑它**；它会告诉你声明的基线有没有被破坏。',
  inputSchema: { designSystemId: z.string().optional() },
}, async ({ designSystemId }) => {
  const result = await api(`/api/audit/catalog${designSystemId ? `?designSystemId=${encodeURIComponent(designSystemId)}` : ''}`);
  return text(result.formatted ?? result);
});

/* ---------------- 2. 备料 ---------------- */

server.registerTool('import_images', {
  description:
    '把本机素材导进图片库（用户说"素材在哪"时用它）。可以给若干文件路径，或给一个目录。' +
    '文件会被复制到项目的 web/public/library/uploads/ 下（**不改动源文件**），然后登记进图片库并返回素材 id。' +
    '支持 png/jpg/jpeg/gif/webp/svg，单文件上限 5MB。',
  inputSchema: {
    paths: z.array(z.string()).optional().describe('文件或目录路径，绝对路径最稳'),
    directory: z.string().optional().describe('一个目录：默认只取第一层的图片文件'),
    recursive: z.boolean().optional().describe('目录是否递归子目录'),
    categoryId: z.string().optional().describe('放进哪个分类（分类名或 id，不存在就按这个名字新建），默认「上传素材」'),
    labelPrefix: z.string().optional().describe('素材名前缀，便于一个客户的图排在一起'),
  },
}, async ({ paths, directory, recursive, categoryId, labelPrefix }) => {
  const result = await api('/api/library/import', {
    method: 'POST',
    body: JSON.stringify({ paths, directory, recursive, categoryId, labelPrefix }),
  });
  return text({
    imported: result.import?.imported ?? 0,
    category: result.import?.category,
    assets: result.import?.assets ?? [],
    skipped: result.import?.skipped ?? [],
    hint: '接着用这些素材 id 填组件的图片字段（image 类字段）。',
  });
});

server.registerTool('mutate_library', {
  description: '直接改图片库：新增/更新/删除素材，或增删改分类。批量导入请用 import_images。',
  inputSchema: { patch: z.record(z.any()) },
}, async ({ patch: body }) => text(await api('/api/library/mutate', { method: 'POST', body: JSON.stringify(body as LibraryPatch) })));

/* ---------------- 3. 写文章 ---------------- */

server.registerTool('new_article', {
  description: '按客户开一篇新图文：清空正文并放下该客户骨架的起手块（之后用 apply_plan 或逐块写）。会新建一个版本。',
  inputSchema: {
    designSystemId: z.string().describe('客户的设计系统 id，来自 list_design_systems'),
    title: z.string().optional().describe('标题（可留空，之后再设）'),
    subtitle: z.string().optional().describe('摘要/副标题'),
    baseRevision: z.number().int().optional(),
  },
}, async ({ designSystemId, title, subtitle, baseRevision }) => {
  const result = await api('/api/article/new', { method: 'POST', body: JSON.stringify({ designSystemId, title, subtitle, baseRevision }) });
  return text({ revision: result.document?.revision, blocks: result.document?.blocks?.map((block: any) => ({ id: block.id, componentId: block.componentId })) });
});

server.registerTool('apply_plan', {
  description:
    '**一次写入整篇结构**（AI 的主力入口）：传一个 { componentId, props } 数组，替换当前文章的全部内容块。' +
    '比一次次 insert 更快，也不会中途撞 revision 冲突。缺的字段由组件默认值补齐。' +
    '写完请立刻 preview_article 看效果。',
  inputSchema: {
    blocks: z.array(z.object({ componentId: z.string(), props: z.record(z.string()).optional() })).describe('内容块，按顺序'),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    designSystemId: z.string().optional().describe('顺带切换客户的模板（一般不用，new_article 已经设好）'),
    baseRevision: z.number().int().optional(),
    summary: z.string().optional(),
  },
}, async ({ blocks, title, subtitle, designSystemId, baseRevision, summary }) => {
  const built = await buildDocument(blocks, { title, subtitle, designSystemId, baseRevision });
  const request: ArticleReplaceRequest = {
    baseRevision: built.baseRevision,
    document: built.document,
    source: 'mcp',
    summary: summary ?? `写入整篇结构（${blocks.length} 块）`,
  };
  const result = await api('/api/article/replace', { method: 'POST', body: JSON.stringify(request) });
  return text({ revision: result.document?.revision, blocks: result.document?.blocks?.map((block: any) => ({ id: block.id, componentId: block.componentId })) });
});

server.registerTool('insert_component', {
  description: '在指定下标插入一个组件实例。index 省略则追加到文末。返回值里能拿到新块的 id。',
  inputSchema: {
    componentId: z.string().describe('组件 id，来自 list_components'),
    index: z.number().int().optional(),
    props: z.record(z.string()).optional().describe('字段值；缺的字段会用组件默认值补齐'),
    baseRevision: z.number().int().optional(),
    summary: z.string().optional(),
  },
}, async ({ componentId, index, props, baseRevision, summary }) => {
  const state = await api('/api/article');
  const at = index ?? state.document.blocks.length;
  return text(await patch({ kind: 'insert-component', index: at, componentId, props: props as Record<string, string> | undefined }, baseRevision, summary ?? `新增组件 ${componentId}`));
});

server.registerTool('set_block_props', {
  description: '修改一个内容块的字段值。只传要改的字段，其余保持不变。',
  inputSchema: {
    blockId: z.string(),
    props: z.record(z.string()),
    baseRevision: z.number().int().optional(),
    summary: z.string().optional(),
  },
}, async ({ blockId, props, baseRevision, summary }) => text(await patch({ kind: 'set-block-props', blockId, props: props as Record<string, string> }, baseRevision, summary)));

server.registerTool('move_block', {
  description: '移动内容块。给 direction 做相邻移动，或给 index 移动到指定下标。',
  inputSchema: {
    blockId: z.string(),
    direction: z.enum(['up', 'down']).optional(),
    index: z.number().int().optional(),
    baseRevision: z.number().int().optional(),
  },
}, async ({ blockId, direction, index, baseRevision }) => {
  const body: ArticlePatch = index !== undefined
    ? { kind: 'move-block-to', blockId, index }
    : { kind: 'move-block', blockId, direction: direction ?? 'down' };
  return text(await patch(body, baseRevision));
});

server.registerTool('remove_block', {
  description: '删除一个内容块。',
  inputSchema: { blockId: z.string(), baseRevision: z.number().int().optional() },
}, async ({ blockId, baseRevision }) => text(await patch({ kind: 'remove-block', blockId }, baseRevision)));

server.registerTool('patch_article', {
  description: '通用补丁入口，用于 set-meta（title/subtitle/brandFooter）/ set-template / set-related / set-setting。先调用 get_article 获取最新 revision。',
  inputSchema: { baseRevision: z.number().int(), patch: z.record(z.any()), summary: z.string().optional() },
}, async ({ baseRevision, patch: body, summary }) => {
  const request: ArticleMutationRequest = { baseRevision, patch: body as ArticlePatch, source: 'mcp', summary };
  return text(await api('/api/article/mutate', { method: 'POST', body: JSON.stringify(request) }));
});

server.registerTool('restore_version', { description: '恢复到历史 revision。', inputSchema: { revision: z.number().int() } }, async ({ revision }) => text(await api('/api/article/restore', { method: 'POST', body: JSON.stringify({ revision }) })));
server.registerTool('undo_article', { description: '撤销到上一个可用版本。', inputSchema: {} }, async () => text(await api('/api/article/undo', { method: 'POST', body: '{}' })));
server.registerTool('redo_article', { description: '重做到下一个可用版本。', inputSchema: {} }, async () => text(await api('/api/article/redo', { method: 'POST', body: '{}' })));

await server.connect(new StdioServerTransport());
