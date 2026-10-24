import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import {
  applyArticlePatch,
  applyLibraryPatch,
  applyUsagePatch,
  cloneDocument,
  defaultLibrary,
  makeDefaultArticle,
  migrateDocument,
  type ArticleDocument,
  type ArticleMutationRequest,
  type ArticlePatch,
  type ArticleReplaceRequest,
  type ArticleVersion,
  type ChangeSource,
  type ComponentUsage,
  type EditorSnapshot,
  type LibraryPatch,
  type UsagePatch,
} from '../shared/article';
import { renderArticle } from '../shared/render';
import type { RenderMode } from '../shared/components';
import { listTemplates } from '../shared/design';
import { digestComponents } from '../shared/components';
import type { ImageAsset, ImageCategory } from '../shared/images';
import { dataRoot } from './config';

export interface StoreEvent {
  type: 'article-updated' | 'article-restored' | 'library-updated';
  revision: number;
  source: ChangeSource;
  summary: string;
}

export interface StoreSnapshot extends EditorSnapshot {}

const stateFile = join(dataRoot, 'editor-state.json');

class ArticleStore {
  private document: ArticleDocument = makeDefaultArticle();
  private versions: ArticleVersion[] = [];
  private images: ImageAsset[] = defaultLibrary().images;
  private imageCategories: ImageCategory[] = defaultLibrary().imageCategories;
  /** 组件使用记录，供组件库的「常用」「最近使用」用。不进 revision。 */
  private componentUsage: Record<string, ComponentUsage> = {};
  private ready = false;
  private listeners = new Set<(event: StoreEvent) => void>();
  private persistQueue: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    if (this.ready) return;
    await mkdir(dirname(stateFile), { recursive: true });
    try {
      const raw = await readFile(stateFile, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // 旧版本的数据文件里是语义块与 assets，migrateDocument 负责转换
      this.document = migrateDocument(parsed.document ?? parsed);
      const fallback = defaultLibrary();
      this.images = Array.isArray(parsed.images) ? (parsed.images as ImageAsset[]) : fallback.images;
      this.imageCategories = Array.isArray(parsed.imageCategories) ? (parsed.imageCategories as ImageCategory[]) : fallback.imageCategories;
      this.componentUsage = parsed.componentUsage && typeof parsed.componentUsage === 'object'
        ? (parsed.componentUsage as Record<string, ComponentUsage>)
        : {};
      this.versions = Array.isArray(parsed.versions) ? (parsed.versions as ArticleVersion[]).map((version) => ({ ...version, document: migrateDocument(version.document) })) : [];
      if (!this.versions.length) this.versions = [this.snapshotVersion(this.document, 'system', '初始版本')];
      await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.versions = [this.snapshotVersion(this.document, 'system', '初始版本')];
      await this.persist();
    }
    this.ready = true;
  }

  private snapshotVersion(document: ArticleDocument, source: ChangeSource, summary: string): ArticleVersion {
    return {
      id: `revision-${document.revision}`,
      revision: document.revision,
      source,
      summary,
      createdAt: document.updatedAt,
      document: cloneDocument(document),
    };
  }

  subscribe(listener: (event: StoreEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): StoreSnapshot {
    const currentIndex = this.versions.findIndex((item) => item.revision === this.document.revision);
    return {
      document: cloneDocument(this.document),
      versions: structuredClone(this.versions),
      images: cloneDocument(this.images),
      imageCategories: cloneDocument(this.imageCategories),
      componentUsage: cloneDocument(this.componentUsage),
      undoAvailable: currentIndex > 0,
      redoAvailable: currentIndex !== -1 && currentIndex < this.versions.length - 1,
    };
  }

  templates() { return listTemplates(); }
  components() { return digestComponents(); }

  render(mode: RenderMode) {
    return renderArticle(this.document, { mode, images: this.images });
  }

  async mutate(request: ArticleMutationRequest): Promise<StoreSnapshot> {
    this.assertRevision(request.baseRevision);
    const next = applyArticlePatch(this.document, request.patch);
    return this.commit(next, request.source, request.summary ?? `应用 ${request.patch.kind}`);
  }

  async replace(request: ArticleReplaceRequest): Promise<StoreSnapshot> {
    this.assertRevision(request.baseRevision);
    return this.commit(migrateDocument(request.document), request.source, request.summary ?? '替换整篇文章');
  }

  async restoreFromHistory(offset: -1 | 1): Promise<StoreSnapshot> {
    const currentIndex = this.versions.findIndex((item) => item.revision === this.document.revision);
    const targetIndex = currentIndex === -1 ? -1 : currentIndex + offset;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= this.versions.length) {
      throw new Error(offset === -1 ? '没有可撤销的版本' : '没有可重做的版本');
    }
    this.document = cloneDocument(this.versions[targetIndex].document);
    await this.persist();
    this.emit({ type: 'article-restored', revision: this.document.revision, source: 'human', summary: offset === -1 ? '撤销' : '重做' });
    return this.snapshot();
  }

  async restore(revision: number): Promise<StoreSnapshot> {
    const index = this.versions.findIndex((item) => item.revision === revision);
    if (index === -1) throw new Error(`版本不存在: ${revision}`);
    this.document = cloneDocument(this.versions[index].document);
    await this.persist();
    this.emit({ type: 'article-restored', revision: this.document.revision, source: 'human', summary: `恢复到版本 ${revision}` });
    return this.snapshot();
  }

  /** 图片库改动不产生文章版本：它是素材管理，不是内容修改。 */
  async mutateLibrary(patch: LibraryPatch): Promise<StoreSnapshot> {
    const next = applyLibraryPatch({ images: this.images, imageCategories: this.imageCategories }, patch);
    this.images = next.images;
    this.imageCategories = next.imageCategories;
    await this.persist();
    this.emit({ type: 'library-updated', revision: this.document.revision, source: 'human', summary: `图片库：${patch.kind}` });
    return this.snapshot();
  }

  /**
   * 组件使用记录：不产生文章版本、不发 SSE。
   * 它总是紧跟一次插入发生，那一次插入已经推送过 article-updated，再推一次只会让
   * 客户端把刚拿到的模板/组件列表重拉一遍。
   */
  async mutateUsage(patch: UsagePatch): Promise<StoreSnapshot> {
    this.componentUsage = applyUsagePatch(this.componentUsage, patch);
    await this.persist();
    return this.snapshot();
  }

  /**
   * 丢弃当前版本**之后**的历史。
   *
   * 为什么需要它：`restore()` 只把文档倒回旧版本，被越过的那些版本仍留在列表里，
   * 于是"还原"并不等于"回到当时的状态"。端到端脚本就踩到了这个缺口——
   * 它把文档还原了，却在受版本控制的数据文件里留下一串测试产生的版本
   * （实测：REV 25「新增组件」… REV 29「拖拽调整顺序」挂在已还原的 REV 24 后面）。
   *
   * 不推送 SSE：调用方（验证脚本／API）紧接着就会自己读快照。
   */
  async pruneFutureVersions(): Promise<StoreSnapshot> {
    const current = this.document.revision;
    this.versions = this.versions.filter((version) => version.revision <= current);
    await this.persist();
    return this.snapshot();
  }

  private assertRevision(baseRevision: number): void {
    if (baseRevision !== this.document.revision) {
      const error = new Error(`REVISION_CONFLICT:${this.document.revision}`);
      (error as Error & { status?: number; currentRevision?: number }).status = 409;
      (error as Error & { currentRevision?: number }).currentRevision = this.document.revision;
      throw error;
    }
  }

  private async commit(nextDocument: ArticleDocument, source: ChangeSource, summary: string): Promise<StoreSnapshot> {
    const next = cloneDocument(nextDocument);
    next.revision = this.document.revision + 1;
    next.updatedAt = new Date().toISOString();
    const version = this.snapshotVersion(next, source, summary);
    this.document = next;
    const currentIndex = this.versions.findIndex((item) => item.revision === next.revision - 1);
    const keep = currentIndex === -1 ? this.versions : this.versions.slice(0, currentIndex + 1);
    this.versions = [...keep, version].slice(-30);
    await this.persist();
    this.emit({ type: 'article-updated', revision: next.revision, source, summary });
    return this.snapshot();
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private async persist(): Promise<void> {
    const payload = {
      document: this.document,
      versions: this.versions,
      images: this.images,
      imageCategories: this.imageCategories,
      componentUsage: this.componentUsage,
    };
    const serialized = JSON.stringify(payload, null, 2);
    const save = async () => {
      const temporary = `${stateFile}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, 'utf8');
      await rename(temporary, stateFile);
    };
    const pending = this.persistQueue.then(save, save);
    this.persistQueue = pending.catch(() => undefined);
    await pending;
  }
}

export const store = new ArticleStore();
export { dataRoot, stateFile };
