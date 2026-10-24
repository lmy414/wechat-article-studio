/**
 * 编辑器数据层。
 *
 * 界面（web/components/*）只从这里拿数据与动作，不直接 fetch——因为服务端有一条硬约束：
 * 所有写接口都返回与 `GET /api/editor/state` **相同形状**的完整载荷，客户端把它整个换上去。
 * 少字段会让渲染期抛异常并卸载整棵 React 树（表现为白屏），所以载荷的拼接只在一个地方做。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  makeBlock,
  type ArticleDocument,
  type ArticlePatch,
  type ArticleVersion,
  type ComponentUsage,
  type LibraryPatch,
  type RenderedArticle,
} from '../shared/article';
import type { ComponentDigest, RenderMode } from '../shared/components';
import type { ImageAsset, ImageCategory } from '../shared/images';
import type { TemplateSummary } from '../shared/design';
import type { CatalogEntry, DesignSystem } from '../shared/design-system';
import { htmlToPlainText, inlineImages, neutralizeLocalLinks, writeRichClipboard } from './lib/clipboard';

/** `/api/design-systems/:id` 的返回：设计系统声明 + 该客户的组件目录。 */
export type DesignSystemPayload = DesignSystem & { catalog: CatalogEntry[]; templates: TemplateSummary[] };

export interface EditorPayload {
  document: ArticleDocument;
  versions: ArticleVersion[];
  images: ImageAsset[];
  imageCategories: ImageCategory[];
  templates: TemplateSummary[];
  components: ComponentDigest[];
  componentUsage: Record<string, ComponentUsage>;
  undoAvailable?: boolean;
  redoAvailable?: boolean;
}

export type CopyState = 'idle' | 'copying' | 'done' | 'error';

export interface CopyResult {
  bytes: number;
  inlined: number;
  failed: string[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`请求失败 ${response.status}`);
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `请求失败 ${response.status}`);
  return result as T;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** 纯文本导入：第一行标题，第二行副标题，空行分段，其余每行一段。 */
function documentFromText(text: string, base: ArticleDocument): ArticleDocument {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const filled = lines.filter(Boolean);
  const chunks = text.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
  const paragraphs = chunks.length > 1 ? chunks.slice(2) : filled.slice(2);
  const blocks = (paragraphs.length ? paragraphs : ['在这里写正文。'])
    .map((paragraph) => makeBlock('base.paragraph', { text: paragraph.replace(/\n/g, ' '), emphasis: '' }));
  return { ...base, title: filled[0] ?? base.title, subtitle: filled[1] ?? base.subtitle, blocks };
}

/** Markdown 导入：只做"去掉标记、保住段落"，不做语法树。 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, ''))
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[\s(])(\*|_)([^*_]+)\2/g, '$1$3')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface EditorApi {
  payload: EditorPayload | null;
  document: ArticleDocument | undefined;
  rendered: RenderedArticle | null;
  /** 当前客户的设计系统完整声明（面板与 dock 都从这里取基线，不再有第二份硬编码副本）。 */
  designSystem: DesignSystemPayload | null;
  mode: RenderMode;
  setMode: (mode: RenderMode) => void;
  busy: boolean;
  error: string;
  notice: string;
  setError: (message: string) => void;
  copyState: CopyState;
  copyResult: CopyResult | null;
  mutate: (patch: ArticlePatch, summary?: string) => Promise<EditorPayload | undefined>;
  replaceDocument: (document: ArticleDocument, summary: string) => Promise<void>;
  importText: (text: string, kind: 'text' | 'markdown') => Promise<void>;
  newArticle: () => Promise<void>;
  libraryMutate: (patch: LibraryPatch) => Promise<void>;
  restore: (revision: number) => Promise<void>;
  history: (offset: -1 | 1) => Promise<void>;
  insertComponent: (componentId: string, index?: number) => Promise<string | undefined>;
  selectTemplate: (templateId: string) => Promise<void>;
  copyForWeChat: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useEditor(): EditorApi {
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [rendered, setRendered] = useState<RenderedArticle | null>(null);
  const [mode, setMode] = useState<RenderMode>('miniprogram-safe');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);
  const [designSystem, setDesignSystem] = useState<DesignSystemPayload | null>(null);

  const document = payload?.document;
  /** 数据层在读服务器状态时要用到最新 revision，闭包里的旧值会撞 REVISION_CONFLICT。 */
  const documentRef = useRef<ArticleDocument | undefined>(undefined);
  documentRef.current = document;

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? '' : current)), 1600);
  }, []);

  const loadRender = useCallback(async (nextMode: RenderMode) => {
    setRendered(await getJson<RenderedArticle>(`/api/render?mode=${nextMode}`));
  }, []);

  const refresh = useCallback(async () => {
    const next = await getJson<EditorPayload>('/api/editor/state');
    setPayload(next);
    await loadRender(mode);
  }, [loadRender, mode]);

  const applyPayload = useCallback(async (next: EditorPayload) => {
    setPayload(next);
    await loadRender(mode);
  }, [loadRender, mode]);

  useEffect(() => {
    refresh().catch((reason) => setError(String(reason)));
    // 只在挂载时拉一次；mode 变化由下面那条 effect 负责
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/events');
    const reload = () => { refresh().catch((reason) => setError(String(reason))); };
    source.addEventListener('article-updated', reload);
    source.addEventListener('article-restored', reload);
    source.addEventListener('library-updated', reload);
    return () => source.close();
  }, [refresh]);

  useEffect(() => {
    loadRender(mode).catch((reason) => setError(String(reason)));
  }, [mode, loadRender]);

  /**
   * 设计系统随模板走。**不在客户端放第二份基线副本**：一旦两处都写，它们迟早不一致，
   * 而"基线"的全部意义就是唯一真值（docs/DESIGN-SYSTEM.md §3）。
   */
  useEffect(() => {
    const id = document?.templateId;
    if (!id) return;
    let cancelled = false;
    getJson<DesignSystemPayload>(`/api/design-systems/${encodeURIComponent(id)}`)
      .then((next) => { if (!cancelled) setDesignSystem(next); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [document?.templateId]);

  const reportFailure = useCallback(async (reason: unknown) => {
    setError(String(reason));
    await refresh().catch(() => undefined);
  }, [refresh]);

  const mutate = useCallback(async (patch: ArticlePatch, summary?: string) => {
    const current = documentRef.current;
    if (!current) return undefined;
    setBusy(true); setError('');
    try {
      const next = await postJson<EditorPayload>('/api/article/mutate', {
        baseRevision: current.revision, patch, source: 'human', summary,
      });
      await applyPayload(next);
      flash('已保存');
      return next;
    } catch (reason) {
      await reportFailure(reason);
      return undefined;
    } finally { setBusy(false); }
  }, [applyPayload, flash, reportFailure]);

  const replaceDocument = useCallback(async (next: ArticleDocument, summary: string) => {
    const current = documentRef.current;
    if (!current) return;
    setBusy(true); setError('');
    try {
      await applyPayload(await postJson<EditorPayload>('/api/article/replace', {
        baseRevision: current.revision, document: next, source: 'human', summary,
      }));
      flash(summary);
    } catch (reason) { await reportFailure(reason); } finally { setBusy(false); }
  }, [applyPayload, flash, reportFailure]);

  const importText = useCallback(async (text: string, kind: 'text' | 'markdown') => {
    const current = documentRef.current;
    if (!current || !text.trim()) return;
    const source = kind === 'markdown' ? markdownToPlainText(text) : text;
    setBusy(true); setError('');
    try {
      const next = await postJson<EditorPayload>('/api/article/import-document', {
        document: documentFromText(source, current),
        summary: kind === 'markdown' ? '导入 Markdown' : '导入正文',
      });
      await applyPayload(next);
      flash(kind === 'markdown' ? '已导入 Markdown' : '已导入正文');
    } catch (reason) { await reportFailure(reason); } finally { setBusy(false); }
  }, [applyPayload, flash, reportFailure]);

  /** 新建图文：清空正文，保留图片库、模板与 settings（图片库是素材，不属于文章）。 */
  const newArticle = useCallback(async () => {
    const current = documentRef.current;
    if (!current) return;
    await replaceDocument({
      ...current,
      title: '',
      subtitle: '',
      blocks: [],
      related: [],
      revision: current.revision,
    }, '新建图文');
  }, [replaceDocument]);

  const libraryMutate = useCallback(async (patch: LibraryPatch) => {
    setBusy(true); setError('');
    try {
      setPayload(await postJson<EditorPayload>('/api/library/mutate', patch));
      flash('图片库已更新');
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }, [flash]);

  const restore = useCallback(async (revision: number) => {
    setBusy(true); setError('');
    try {
      await applyPayload(await postJson<EditorPayload>('/api/article/restore', { revision }));
      flash(`已恢复到版本 ${revision}`);
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }, [applyPayload, flash]);

  const history = useCallback(async (offset: -1 | 1) => {
    setBusy(true); setError('');
    try {
      await applyPayload(await postJson<EditorPayload>(offset === -1 ? '/api/article/undo' : '/api/article/redo', {}));
      flash(offset === -1 ? '已撤销' : '已重做');
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }, [applyPayload, flash]);

  const insertComponent = useCallback(async (componentId: string, index?: number) => {
    const current = documentRef.current;
    if (!current) return undefined;
    const at = Math.max(0, Math.min(index ?? current.blocks.length, current.blocks.length));
    const block = makeBlock(componentId);
    const next = await mutate({ kind: 'insert-component', index: at, componentId, props: block.props }, '新增组件');
    // 服务端会自己生成块 id（客户端预生成的不会入库），所以按插入位置回读真实 id
    const insertedId = next?.document.blocks[at]?.id;
    // 使用记录不产生文章版本，失败也不该影响插入结果，所以单独发且不 await 结果
    void postJson<EditorPayload>('/api/usage/mutate', { kind: 'touch-component', componentId })
      .then((usagePayload) => setPayload(usagePayload))
      .catch(() => undefined);
    return insertedId;
  }, [mutate]);

  const selectTemplate = useCallback(async (templateId: string) => {
    const current = documentRef.current;
    if (!current || templateId === current.templateId) return;
    const name = payload?.templates.find((item) => item.id === templateId)?.name ?? templateId;
    await mutate({ kind: 'set-template', templateId }, `切换到模板 ${name}`);
  }, [mutate, payload?.templates]);

  /** 唯一出口：渲染 → 图片内联 base64 → 净化本机链接 → 写富文本剪贴板。 */
  const copyForWeChat = useCallback(async () => {
    if (!rendered) return;
    setCopyState('copying'); setError('');
    try {
      const { html: inlinedHtml, inlined, failed } = await inlineImages(rendered.exportHtml);
      if (failed.length) throw new Error(`图片尚未准备好：${failed.join('、')}。请修复后再复制。`);
      const html = neutralizeLocalLinks(inlinedHtml);
      const bytes = new Blob([html]).size;
      await writeRichClipboard(html, htmlToPlainText(html));
      setCopyState('done');
      setCopyResult({ bytes, inlined, failed });
      flash(`已复制到剪贴板 · ${inlined} 张图片已内联 · ${formatBytes(bytes)}`);
      if (failed.length) setError(`有 ${failed.length} 张图片未能内联：${failed.join('、')}`);
    } catch (reason) {
      setCopyState('error');
      setError(String(reason));
    } finally {
      window.setTimeout(() => setCopyState((current) => (current === 'copying' ? 'idle' : current)), 1800);
    }
  }, [flash, rendered]);

  return useMemo<EditorApi>(() => ({
    payload, document, rendered, designSystem, mode, setMode, busy, error, notice, setError,
    copyState, copyResult,
    mutate, replaceDocument, importText, newArticle, libraryMutate, restore, history,
    insertComponent, selectTemplate, copyForWeChat, refresh,
  }), [
    payload, document, rendered, designSystem, mode, busy, error, notice, copyState, copyResult,
    mutate, replaceDocument, importText, newArticle, libraryMutate, restore, history,
    insertComponent, selectTemplate, copyForWeChat, refresh,
  ]);
}
