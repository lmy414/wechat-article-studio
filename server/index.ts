import express, { type Response } from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { apiPort, projectRoot, publicRoot, webPort } from './config';
import { store } from './store';
import { dataRoot } from './store';
import { migrateDocument, type ArticleMutationRequest, type ArticleReplaceRequest, type LibraryPatch, type UsagePatch } from '../shared/article';
import type { RenderMode } from '../shared/components';
import { catalogFor, getDesignSystem, listDesignSystems, makeArticleFor, summarizeDesignSystem } from '../shared/design-system';
import { listTemplates } from '../shared/design';
import { auditArticle, auditCatalog, formatAudit } from '../shared/audit';
import { prepareAssets } from './assets';
import { describePreview, previewArticle } from './preview';

const app = express();
const server = createServer(app);
const clients = new Set<Response>();
const port = apiPort;
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`]);

app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: '仅允许本地工作台访问' });
  if (origin) res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function sendJson(res: Response, payload: unknown, status = 200) {
  res.status(status).json(payload);
}

/**
 * 编辑器完整载荷。写接口必须和 GET /api/editor/state 返回同样的形状：
 * 客户端把它当完整 payload 使用，少字段会让渲染抛异常并卸载整个界面。
 */
function editorPayload() {
  return { ...store.snapshot(), templates: store.templates(), components: store.components() };
}

function handleError(res: Response, error: unknown) {
  const err = error as Error & { status?: number; currentRevision?: number };
  if (err.status === 409) return sendJson(res, { error: err.message, currentRevision: err.currentRevision }, 409);
  return sendJson(res, { error: err.message || '请求失败' }, 400);
}

store.subscribe((event) => {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(payload);
});

/**
 * 健康检查。**回报数据目录**很重要：`EDITOR_DATA_DIR` 可以让服务指向别的状态文件，
 * 而"我以为在改 A 其实在改 B"是这里最容易踩的坑（端口被旧进程占着时尤其明显）。
 */
app.get('/api/health', (_req, res) => sendJson(res, { ok: true, service: 'wechat-layout-editor', dataDir: dataRoot }));

app.get('/api/editor/state', (_req, res) => sendJson(res, editorPayload()));
app.get('/api/templates', (_req, res) => sendJson(res, store.templates()));
/** 组件清单：AI 与组件库面板都靠它发现有哪些组件、各有哪些字段。 */
app.get('/api/components', (_req, res) => sendJson(res, store.components()));
app.get('/api/article', (_req, res) => sendJson(res, store.snapshot()));
app.get('/api/images', (_req, res) => sendJson(res, { images: store.snapshot().images, categories: store.snapshot().imageCategories }));
app.get('/api/assets', (_req, res) => sendJson(res, store.snapshot().images));

app.get('/api/render', (req, res) => {
  const mode: RenderMode = req.query.mode === 'high-fidelity' ? 'high-fidelity' : 'miniprogram-safe';
  sendJson(res, store.render(mode));
});

app.get('/api/events', (req, res) => {
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ revision: store.snapshot().document.revision })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.post('/api/article/mutate', async (req, res) => {
  try {
    await store.mutate(req.body as ArticleMutationRequest);
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

app.post('/api/article/replace', async (req, res) => {
  try {
    await store.replace(req.body as ArticleReplaceRequest);
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

app.post('/api/article/restore', async (req, res) => {
  try {
    await store.restore(Number(req.body.revision));
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

app.post('/api/article/undo', async (_req, res) => {
  try { await store.restoreFromHistory(-1); sendJson(res, editorPayload()); } catch (error) { handleError(res, error); }
});

app.post('/api/article/redo', async (_req, res) => {
  try { await store.restoreFromHistory(1); sendJson(res, editorPayload()); } catch (error) { handleError(res, error); }
});

/**
 * 丢弃当前版本之后的历史（还原之后清理被越过的版本）。
 * 目前只有端到端验证脚本在调；界面还没有入口（要做成按钮归 P2）。
 */
app.post('/api/article/prune', async (_req, res) => {
  try {
    await store.pruneFutureVersions();
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

/** 图片库：增删改素材与分类。不产生文章版本。 */
app.post('/api/library/mutate', async (req, res) => {
  try {
    await store.mutateLibrary(req.body as LibraryPatch);
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

/* ------------------------------------------------------------------ */
/* 设计系统 / 组件目录 / 校验 / 截图 / 素材导入                          */
/* 这一组是给 AI 用的：它先读客户的设计系统与组件目录，再写文章，          */
/* 然后截图自检、跑体检，最后才交给人工粘贴。                            */
/* ------------------------------------------------------------------ */

/** 设计系统概览：只到"选哪个客户"这个粒度。 */
app.get('/api/design-systems', (_req, res) => sendJson(res, listDesignSystems().map(summarizeDesignSystem)));

/** 某个客户设计系统的完整声明 + 组件目录（含 whenToUse），AI 一次拿全。 */
app.get('/api/design-systems/:id', (req, res) => {
  try {
    const design = getDesignSystem(String(req.params.id));
    sendJson(res, { ...design, catalog: catalogFor(design.id).components, templates: listTemplates() });
  } catch (error) { handleError(res, error); }
});

/** 组件目录：带"什么时候用/不用"、白名单状态与锁定字段。 */
app.get('/api/catalog', (req, res) => {
  try {
    const id = String(req.query.designSystemId ?? store.snapshot().document.templateId);
    sendJson(res, catalogFor(id));
  } catch (error) { handleError(res, error); }
});

/** 文章体检（B 类校验）。交付前 error 必须为 0。 */
app.get('/api/audit', (req, res) => {
  try {
    const state = store.snapshot();
    const id = String(req.query.designSystemId ?? state.document.templateId);
    const report = auditArticle(state.document, state.images, id);
    sendJson(res, { ...report, formatted: formatAudit(report) });
  } catch (error) { handleError(res, error); }
});

/** 目录回归（A 类校验）：声明与实现对不对得上，给开发者与 AI 改组件时用。 */
app.get('/api/audit/catalog', (req, res) => {
  try {
    const id = String(req.query.designSystemId ?? store.snapshot().document.templateId);
    const report = auditCatalog(id);
    sendJson(res, { ...report, formatted: formatAudit(report) });
  } catch (error) { handleError(res, error); }
});

/** 按客户开一篇新图文：骨架起手块 + 该客户绑定的模板。 */
app.post('/api/article/new', async (req, res) => {
  try {
    const current = store.snapshot().document;
    const designSystemId = String(req.body?.designSystemId ?? current.templateId);
    const document = makeArticleFor(
      designSystemId,
      String(req.body?.title ?? ''),
      String(req.body?.subtitle ?? ''),
      current.id,
    );
    await store.replace({
      baseRevision: current.revision,
      document,
      source: req.body?.source === 'human' ? 'human' : 'mcp',
      summary: `新建图文（${designSystemId}）`,
    });
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

/**
 * 导入素材：把本机文件或一个目录里的图片复制进 `web/public/library/uploads/` 并登记进图片库。
 * 返回载荷与写接口同形，另附一个 `import` 摘要（额外字段，客户端忽略）。
 */
app.post('/api/library/import', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { paths?: string[]; directory?: string; recursive?: boolean; labelPrefix?: string; categoryId?: string };
    const prepared = await prepareAssets(body);
    const state = store.snapshot();
    const known = new Set(state.images.map((asset) => asset.src));
    const duplicates = prepared.assets.filter((asset) => known.has(asset.src)).map((asset) => ({ path: asset.source, reason: '这张图已经在图片库里了（同内容同名）' }));
    const fresh = prepared.assets.filter((asset) => !known.has(asset.src));
    const category = body.categoryId?.trim() || '上传素材';
    if (fresh.length) {
      await store.mutateLibrary({
        kind: 'image-import',
        items: fresh.map((asset) => ({ label: asset.label, src: asset.src, categoryId: category, width: asset.width, height: asset.height })),
      });
    }
    const after = store.snapshot();
    sendJson(res, {
      ...editorPayload(),
      import: {
        imported: fresh.length,
        category,
        assets: prepared.assets.map((asset) => {
          const created = after.images.find((image) => image.src === asset.src);
          return { id: created?.id ?? null, label: asset.label, src: asset.src, source: asset.source, width: asset.width, height: asset.height, bytes: asset.bytes };
        }),
        skipped: [...prepared.skipped, ...duplicates],
      },
    });
  } catch (error) { handleError(res, error); }
});

/** 截图：把当前文章渲染成一张图，这是 AI 的"眼睛"。 */
app.post('/api/preview', async (req, res) => {
  try {
    const body = (req.body ?? {}) as { mode?: RenderMode; scale?: number; save?: boolean };
    const state = store.snapshot();
    const mode: RenderMode = body.mode === 'high-fidelity' ? 'high-fidelity' : 'miniprogram-safe';
    const result = await previewArticle(state.document, state.images, { mode, scale: body.scale, save: body.save });
    sendJson(res, { ...describePreview(result), pngBase64: result.png.toString('base64'), mimeType: 'image/png' });
  } catch (error) { handleError(res, error); }
});

/** 同一张图直接给浏览器看，方便人核对。 */
app.get('/api/preview.png', async (req, res) => {
  try {
    const state = store.snapshot();
    const mode: RenderMode = req.query.mode === 'high-fidelity' ? 'high-fidelity' : 'miniprogram-safe';
    const result = await previewArticle(state.document, state.images, { mode, scale: Number(req.query.scale) || 2 });
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'no-store');
    res.send(result.png);
  } catch (error) { handleError(res, error); }
});

/** 组件使用记录：只喂「常用」「最近使用」，不产生文章版本。 */
app.post('/api/usage/mutate', async (req, res) => {
  try {
    await store.mutateUsage(req.body as UsagePatch);
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

/** 导入整篇文档：前端把 Word/纯文本切分成组件后整体提交。 */
app.post('/api/article/import-document', async (req, res) => {
  try {
    const current = store.snapshot().document;
    const document = migrateDocument({ ...(req.body.document ?? {}), id: current.id, revision: current.revision });
    await store.replace({ baseRevision: current.revision, document, source: 'human', summary: String(req.body.summary ?? '导入文档') });
    sendJson(res, editorPayload());
  } catch (error) { handleError(res, error); }
});

app.use('/library', express.static(join(publicRoot, 'library')));
app.use('/exports', express.static(join(projectRoot, 'outputs')));
const builtSite = join(projectRoot, 'dist');
if (existsSync(join(builtSite, 'index.html'))) {
  app.use(express.static(builtSite));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(join(builtSite, 'index.html'));
    next();
  });
}
app.use((_req, res) => res.status(404).json({ error: '接口或文件不存在' }));

await store.init();
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`WeChat layout editor API listening on http://127.0.0.1:${port}`);
});
