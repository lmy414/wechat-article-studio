/**
 * 文章模型。
 *
 * 一篇文章 = 标题、副标题 + 一串**组件实例**。实例只记 `componentId` 与 `props`，
 * 结构、样式、可编辑字段都在组件注册表里（shared/components.ts）。
 * 这样人工拖放、AI 写入、模板换色都只碰数据，不碰 HTML。
 *
 * 历史包袱说明：标题/副标题是文档元数据（模板要用它渲染页头）；`related` 与 `settings`
 * 目前仍是模板级装饰，没有拆成组件，见 docs/ROADMAP.md。
 */

import { getComponent, normalizeProps, listComponents, type RenderMode } from './components';
import { defaultImageLibrary, DEFAULT_IMAGE_CATEGORIES, type ImageAsset, type ImageCategory } from './images';
import { defaultTemplate, getTemplate } from './design';
import './packs';

export type ChangeSource = 'human' | 'mcp' | 'system';

/** 一个组件实例。文档就是它的有序列表。 */
export interface ArticleBlock {
  id: string;
  /** 组件定义 id，例如 `base.paragraph` / `weekly.work`。 */
  componentId: string;
  /** 字段值。键由组件定义的 fields 决定。 */
  props: Record<string, string>;
}

export interface RelatedItem {
  id: string;
  title: string;
  image: string;
}

export interface ArticleSettings {
  showFollowBanner: boolean;
  showRelated: boolean;
  showBrandFooter: boolean;
  showTitle?: boolean;
}

export interface ArticleDocument {
  id: string;
  templateId: string;
  title: string;
  subtitle: string;
  blocks: ArticleBlock[];
  related: RelatedItem[];
  settings: ArticleSettings;
  brandFooter: string;
  revision: number;
  updatedAt: string;
}

export interface ArticleVersion {
  id: string;
  revision: number;
  source: ChangeSource;
  summary: string;
  createdAt: string;
  document: ArticleDocument;
}

/** 组件使用记录：驱动组件库的「常用」「最近使用」两个二级页签。 */
export interface ComponentUsage {
  count: number;
  lastUsedAt: string;
}

export interface RenderWarning {
  code: string;
  message: string;
  blockId?: string;
  severity: 'info' | 'warning' | 'error';
}

export interface RenderStats {
  blockCount: number;
  imageCount: number;
  textCharacters: number;
  htmlCharacters: number;
}

export interface RenderedArticle {
  /** 预览 HTML，保留 `data-editor-block` 便于点选。 */
  html: string;
  /** 导出 HTML，已去掉编辑器标记。 */
  exportHtml: string;
  warnings: RenderWarning[];
  stats: RenderStats;
}

export interface EditorSnapshot {
  document: ArticleDocument;
  versions: ArticleVersion[];
  images: ImageAsset[];
  imageCategories: ImageCategory[];
  /** 组件使用记录。属于界面偏好，不进 revision 历史，与图片库同样独立于文章版本。 */
  componentUsage: Record<string, ComponentUsage>;
  undoAvailable?: boolean;
  redoAvailable?: boolean;
}

export type ArticlePatch =
  | { kind: 'set-meta'; field: 'title' | 'subtitle' | 'brandFooter'; value: string }
  | { kind: 'set-template'; templateId: string }
  | { kind: 'set-block-props'; blockId: string; props: Record<string, string> }
  | { kind: 'insert-component'; index: number; componentId: string; props?: Record<string, string> }
  | { kind: 'insert-block'; index: number; block: ArticleBlock }
  | { kind: 'remove-block'; blockId: string }
  | { kind: 'move-block'; blockId: string; direction: 'up' | 'down' }
  | { kind: 'move-block-to'; blockId: string; index: number }
  | { kind: 'set-setting'; field: keyof ArticleSettings; value: boolean }
  | { kind: 'set-related'; items: RelatedItem[] };

/** 图片库的改动独立于文章版本，不进 revision 历史。 */
export type LibraryPatch =
  | { kind: 'image-add'; label: string; src: string; categoryId: string; width?: number; height?: number; placeholder?: boolean }
  /** 批量导入：一次落盘、一次事件，用于 AI 一次交一批素材。 */
  | { kind: 'image-import'; items: { label: string; src: string; categoryId: string; width?: number; height?: number }[] }
  | { kind: 'image-update'; id: string; label?: string; src?: string; categoryId?: string }
  | { kind: 'image-remove'; id: string }
  | { kind: 'category-add'; name: string }
  | { kind: 'category-rename'; id: string; name: string }
  | { kind: 'category-remove'; id: string; moveTo?: string };

/** 组件使用记录的改动。与图片库一样独立于文章 revision：它记的是偏好，不是内容。 */
export type UsagePatch =
  | { kind: 'touch-component'; componentId: string }
  | { kind: 'reset-usage' };

export interface ArticleMutationRequest {
  baseRevision: number;
  patch: ArticlePatch;
  source: ChangeSource;
  summary?: string;
}

export interface ArticleReplaceRequest {
  baseRevision: number;
  document: ArticleDocument;
  source: ChangeSource;
  summary?: string;
}

export function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

/** 造一个组件实例，props 缺失部分由组件定义的默认值补齐。 */
export function makeBlock(componentId: string, props: Record<string, string> = {}): ArticleBlock {
  return { id: makeId(componentId.split('.').pop() ?? 'block'), componentId, props: normalizeProps(componentId, props) };
}

export function blockTitle(block: ArticleBlock): string {
  return getComponent(block.componentId)?.name ?? block.componentId;
}

export function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function makeDefaultArticle(now = new Date().toISOString()): ArticleDocument {
  return {
    id: 'sample-article', templateId: 'generic',
    title: '把一篇文章，排成自己的样子', subtitle: '公众号排版工作台 · 开源示例',
    blocks: [
      makeBlock('base.intro', { label: '开始使用', text: '从左侧选择组件，在画布中调整顺序，再修改文字和图片。文章会保存在本机。' }),
      makeBlock('base.section', { title: '先写清楚，再安排版式' }),
      makeBlock('base.paragraph', { text: '每个内容块都有自己的用途。正文承载信息，配图补充细节，引用保留声音。先把内容放对位置，再决定需要强调什么。', emphasis: '内容' }),
      makeBlock('base.image', { src: 'sample-cover', alt: '几何山峰与粉色圆日', caption: '项目自绘示例，可随 MIT 代码一起使用。' }),
      makeBlock('base.section', { title: '交付前看一次完整预览' }),
      makeBlock('base.paragraph', { text: '检查标题、图片和长段落。复制富文本后，在公众号后台检查图片转存与手机预览，再由你确认发布。', emphasis: '' }),
      makeBlock('base.note', { title: '本地优先', text: '编辑数据、上传图片和导出文件留在本机。软件代码使用 MIT 协议，导入的内容仍遵循原权利人的授权。' }),
      makeBlock('base.divider', { label: 'END' }),
    ],
    related: [], settings: { showFollowBanner: false, showRelated: false, showBrandFooter: false },
    brandFooter: '', revision: 1, updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* 旧数据迁移                                                          */
/* ------------------------------------------------------------------ */

/** 老的语义块类型 → 组件 id。 */
const LEGACY_MAP: Record<string, { componentId: string; props: (block: Record<string, unknown>) => Record<string, string> }> = {
  section: { componentId: 'base.section', props: (b) => ({ title: String(b.title ?? '') }) },
  paragraph: { componentId: 'base.paragraph', props: (b) => ({ text: String(b.text ?? ''), emphasis: '' }) },
  image: { componentId: 'base.image', props: (b) => ({ src: String(b.src ?? ''), alt: String(b.alt ?? ''), caption: String(b.caption ?? '') }) },
  list: { componentId: 'base.list', props: (b) => ({ title: String(b.title ?? ''), items: (Array.isArray(b.items) ? b.items : []).join('\n') }) },
  callout: { componentId: 'base.callout', props: (b) => ({ title: String(b.title ?? ''), text: String(b.text ?? '') }) },
  quote: { componentId: 'base.quote', props: (b) => ({ text: String(b.text ?? ''), author: String(b.author ?? '') }) },
  about: { componentId: 'base.note', props: (b) => ({ title: String(b.title ?? ''), text: String(b.text ?? '') }) },
  divider: { componentId: 'base.divider', props: (b) => ({ label: String(b.label ?? 'END') }) },
};

const KNOWN_TEMPLATES = new Set(['generic', 'weekly']);

/**
 * 把任何历史形态的文档转换成当前模型。
 * 幂等：已经是新模型的文档原样返回（只补齐缺失字段）。
 */
export function migrateDocument(raw: unknown): ArticleDocument {
  const source = (raw ?? {}) as Record<string, unknown>;
  const legacyBlocks = Array.isArray(source.blocks) ? (source.blocks as Record<string, unknown>[]) : [];
  const blocks: ArticleBlock[] = [];
  let droppedLegacy = 0;

  // 旧模型的 intro 数组搬成独立的导语组件
  const legacyIntro = Array.isArray(source.intro) ? (source.intro as unknown[]).map(String).filter(Boolean) : [];
  if (legacyIntro.length) {
    blocks.push(makeBlock('base.intro', { text: legacyIntro.join('\n\n') }));
  }

  for (const raw of legacyBlocks) {
    if (!raw || typeof raw !== 'object') continue;
    if (typeof raw.componentId === 'string' && raw.componentId) {
      // 新模型
      const props = (raw.props && typeof raw.props === 'object' ? raw.props : {}) as Record<string, string>;
      const componentId = raw.componentId;
      blocks.push({
        id: String(raw.id ?? makeId('block')),
        componentId,
        props: getComponent(componentId) ? normalizeProps(componentId, props) : { ...props },
      });
      continue;
    }
    const type = String(raw.type ?? '');
    const mapping = LEGACY_MAP[type];
    if (!mapping) {
      droppedLegacy += 1;
      continue;
    }
    blocks.push({ id: String(raw.id ?? makeId(type)), componentId: mapping.componentId, props: normalizeProps(mapping.componentId, mapping.props(raw)) });
  }

  const templateId = KNOWN_TEMPLATES.has(String(source.templateId)) ? String(source.templateId) : defaultTemplate().summary.id;
  const settings = (source.settings ?? {}) as Record<string, unknown>;
  const related = Array.isArray(source.related) ? (source.related as Record<string, unknown>[]) : [];
  const fallback = makeDefaultArticle();

  // 老数据里图片字段存的是 /assets/xxx.png 这样的路径；能对上图片库的换成素材 id，
  // 这样字段面板显示的是素材名而不是路径。幂等：素材 id 不会再被映射一次。
  const bySrc = new Map(defaultImageLibrary().filter((asset) => asset.src).map((asset) => [asset.src, asset.id]));
  for (const block of blocks) {
    const definition = getComponent(block.componentId);
    if (!definition) continue;
    for (const field of definition.fields) {
      if (field.kind !== 'image') continue;
      const mapped = bySrc.get(block.props[field.key] ?? '');
      if (mapped) block.props[field.key] = mapped;
    }
  }

  return {
    id: String(source.id ?? fallback.id),
    templateId,
    title: typeof source.title === 'string' ? source.title : fallback.title,
    subtitle: typeof source.subtitle === 'string' ? source.subtitle : fallback.subtitle,
    blocks,
    /*
     * 相关文章：**只在旧数据里没有这个键时**才回落到示例文章。
     *
     * 这里踩过一个数据完整性 bug：原来写成 `related.length ? ... : fallback.related`，
     * 于是一个**有意清空**的相关文章列表（`related: []`）会被当成"缺字段"，
     * 每次服务重启（init → migrateDocument → persist）就把示例文章的三条相关文章塞回来——
     * 文档内容被悄悄改了，而 revision 没变，连"还原到某版本"都会得到不一样的内容。
     * 判断依据必须是"这个键在不在"，不是"数组空不空"。
     */
    related: Array.isArray(source.related)
      ? related.map((item) => {
        const image = String(item.image ?? '');
        return { id: String(item.id ?? makeId('related')), title: String(item.title ?? ''), image: bySrc.get(image) ?? image };
      })
      : fallback.related,
    settings: {
      showFollowBanner: settings.showFollowBanner === true,
      showRelated: settings.showRelated === true,
      showBrandFooter: settings.showBrandFooter === true,
      showTitle: settings.showTitle !== false,
    },
    brandFooter: typeof source.brandFooter === 'string' ? source.brandFooter : fallback.brandFooter,
    revision: Number.isFinite(source.revision) ? Number(source.revision) : 1,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
  };
}

export function defaultLibrary(): { images: ImageAsset[]; imageCategories: ImageCategory[] } {
  return { images: defaultImageLibrary(), imageCategories: cloneDocument(DEFAULT_IMAGE_CATEGORIES) };
}

/* ------------------------------------------------------------------ */
/* Patch                                                               */
/* ------------------------------------------------------------------ */

export function findBlock(document: ArticleDocument, blockId: string): ArticleBlock | undefined {
  return document.blocks.find((block) => block.id === blockId);
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

export function applyArticlePatch(document: ArticleDocument, patch: ArticlePatch): ArticleDocument {
  const next = cloneDocument(document);
  switch (patch.kind) {
    case 'set-meta':
      next[patch.field] = patch.value;
      break;
    case 'set-template':
      if (!KNOWN_TEMPLATES.has(patch.templateId)) throw new Error(`模板尚未实现: ${patch.templateId}`);
      next.templateId = patch.templateId;
      break;
    case 'set-block-props': {
      const block = findBlock(next, patch.blockId);
      if (!block) throw new Error(`内容块不存在: ${patch.blockId}`);
      block.props = normalizeProps(block.componentId, { ...block.props, ...patch.props });
      break;
    }
    case 'insert-component':
      next.blocks.splice(clampIndex(patch.index, next.blocks.length), 0, makeBlock(patch.componentId, patch.props));
      break;
    case 'insert-block': {
      const block = { ...cloneDocument(patch.block), props: normalizeProps(patch.block.componentId, patch.block.props) };
      next.blocks.splice(clampIndex(patch.index, next.blocks.length), 0, block);
      break;
    }
    case 'remove-block': {
      const index = next.blocks.findIndex((block) => block.id === patch.blockId);
      if (index === -1) throw new Error(`内容块不存在: ${patch.blockId}`);
      next.blocks.splice(index, 1);
      break;
    }
    case 'move-block': {
      const index = next.blocks.findIndex((block) => block.id === patch.blockId);
      if (index === -1) throw new Error(`内容块不存在: ${patch.blockId}`);
      const target = patch.direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.blocks.length) break;
      const [item] = next.blocks.splice(index, 1);
      next.blocks.splice(target, 0, item);
      break;
    }
    case 'move-block-to': {
      const index = next.blocks.findIndex((block) => block.id === patch.blockId);
      if (index === -1) throw new Error(`内容块不存在: ${patch.blockId}`);
      const [item] = next.blocks.splice(index, 1);
      // 目标下标按移除后的数组计算：原位置之后的落点要减一
      const target = clampIndex(patch.index > index ? patch.index - 1 : patch.index, next.blocks.length);
      next.blocks.splice(target, 0, item);
      break;
    }
    case 'set-setting':
      next.settings[patch.field] = patch.value;
      break;
    case 'set-related':
      next.related = cloneDocument(patch.items);
      break;
  }
  return next;
}

export function applyLibraryPatch(
  library: { images: ImageAsset[]; imageCategories: ImageCategory[] },
  patch: LibraryPatch,
): { images: ImageAsset[]; imageCategories: ImageCategory[] } {
  const next = cloneDocument(library);
  switch (patch.kind) {
    case 'image-add': {
      if (!patch.src.trim()) throw new Error('图片地址不能为空');
      if (!next.imageCategories.some((category) => category.id === patch.categoryId)) throw new Error(`分类不存在: ${patch.categoryId}`);
      next.images.push({
        id: makeId('image'),
        label: patch.label.trim() || '未命名素材',
        src: patch.src.trim(),
        categoryId: patch.categoryId,
        width: patch.width,
        height: patch.height,
        placeholder: patch.placeholder,
      });
      break;
    }
    case 'image-import': {
      /**
       * 批量导入。`categoryId` 允许是**分类 id 或分类名**：不存在就按这个名字新建。
       * 这样 AI 只需要说"这些图放'客户素材'分类"，不必先建分类再拿 id。
       */
      const resolveCategory = (reference: string): string => {
        const wanted = reference.trim() || '上传素材';
        const byId = next.imageCategories.find((category) => category.id === wanted);
        if (byId) return byId.id;
        const byName = next.imageCategories.find((category) => category.name === wanted);
        if (byName) return byName.id;
        const created: ImageCategory = { id: makeId('category'), name: wanted, order: next.imageCategories.length + 1 };
        next.imageCategories.push(created);
        return created.id;
      };
      for (const item of patch.items) {
        if (!item.src.trim()) continue;
        next.images.push({
          id: makeId('image'),
          label: item.label.trim() || '未命名素材',
          src: item.src.trim(),
          categoryId: resolveCategory(item.categoryId),
          width: item.width,
          height: item.height,
        });
      }
      break;
    }
    case 'image-update': {
      const asset = next.images.find((item) => item.id === patch.id);
      if (!asset) throw new Error(`素材不存在: ${patch.id}`);
      if (patch.categoryId && !next.imageCategories.some((category) => category.id === patch.categoryId)) throw new Error(`分类不存在: ${patch.categoryId}`);
      Object.assign(asset, {
        label: patch.label?.trim() || asset.label,
        src: patch.src !== undefined ? patch.src.trim() : asset.src,
        categoryId: patch.categoryId ?? asset.categoryId,
      });
      break;
    }
    case 'image-remove':
      next.images = next.images.filter((item) => item.id !== patch.id);
      break;
    case 'category-add': {
      const name = patch.name.trim();
      if (!name) throw new Error('分类名不能为空');
      if (next.imageCategories.some((category) => category.name === name)) throw new Error(`分类已存在: ${name}`);
      next.imageCategories.push({ id: makeId('category'), name, order: next.imageCategories.length + 1 });
      break;
    }
    case 'category-rename': {
      const category = next.imageCategories.find((item) => item.id === patch.id);
      if (!category) throw new Error(`分类不存在: ${patch.id}`);
      category.name = patch.name.trim() || category.name;
      break;
    }
    case 'category-remove': {
      if (next.imageCategories.length <= 1) throw new Error('至少要保留一个分类');
      const category = next.imageCategories.find((item) => item.id === patch.id);
      if (!category) throw new Error(`分类不存在: ${patch.id}`);
      const used = next.images.filter((item) => item.categoryId === patch.id);
      if (used.length) {
        const target = patch.moveTo ?? next.imageCategories.find((item) => item.id !== patch.id)!.id;
        if (!next.imageCategories.some((item) => item.id === target)) throw new Error(`分类不存在: ${target}`);
        for (const asset of used) asset.categoryId = target;
      }
      next.imageCategories = next.imageCategories.filter((item) => item.id !== patch.id);
      break;
    }
  }
  return next;
}

/**
 * 组件使用记录的纯函数部分。
 * 只认已注册的组件 id：AI 或旧数据里出现的陌生 id 不该污染「常用」列表。
 */
export function applyUsagePatch(
  usage: Record<string, ComponentUsage>,
  patch: UsagePatch,
  now = new Date().toISOString(),
): Record<string, ComponentUsage> {
  if (patch.kind === 'reset-usage') return {};
  if (!getComponent(patch.componentId)) throw new Error(`未知组件: ${patch.componentId}`);
  const previous = usage[patch.componentId];
  return {
    ...usage,
    [patch.componentId]: { count: (previous?.count ?? 0) + 1, lastUsedAt: now },
  };
}

export function validateArticle(document: ArticleDocument): string[] {
  const errors: string[] = [];
  if (!document.id) errors.push('文章缺少 id');
  if (!document.templateId) errors.push('文章缺少模板 id');
  try {
    getTemplate(document.templateId);
  } catch {
    errors.push(`模板不存在: ${document.templateId}`);
  }
  if (!document.title.trim()) errors.push('标题不能为空');
  if (!Array.isArray(document.blocks)) errors.push('blocks 必须是数组');
  const ids = new Set<string>();
  const known = new Set(listComponents().map((item) => item.id));
  for (const block of document.blocks ?? []) {
    if (!block.id) errors.push('存在没有 id 的内容块');
    if (ids.has(block.id)) errors.push(`内容块 id 重复: ${block.id}`);
    ids.add(block.id);
    if (!block.componentId) errors.push(`内容块 ${block.id} 缺少 componentId`);
    else if (!known.has(block.componentId)) errors.push(`未知组件: ${block.componentId}`);
  }
  return errors;
}
