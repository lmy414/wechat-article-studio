

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { makeId, type ArticleDocument, type ArticlePatch, type RenderedArticle } from '../../shared/article';
import type { RenderMode } from '../../shared/components';
import type { ImageAsset } from '../../shared/images';
import { IconCopy, IconDown, IconTrash, IconUp } from './icons';

export interface BlockOps {
  move: (blockId: string, direction: 'up' | 'down') => void;
  duplicate: (blockId: string) => void;
  remove: (blockId: string) => void;
}

interface CanvasProps {
  pageWidth: number;
  document: ArticleDocument;
  rendered: RenderedArticle;
  mode: RenderMode;
  busy: boolean;
  /** 实际生效的显示比例（窗口放不下时已被 main.tsx 压小）。 */
  zoom: number;
  /** 窗口放不下"靠左留 82"的排法时改成居中。 */
  centered: boolean;
  selectedBlockId: string | null;
  images: ImageAsset[];
  ops: BlockOps;
  onSelect: (blockId: string | null) => void;
  onMode: (mode: RenderMode) => void;
  onSetting: (field: 'showFollowBanner' | 'showRelated' | 'showBrandFooter', value: boolean) => void;
  onMeta: (field: 'title' | 'subtitle', value: string) => void;
  onDropComponent: (componentId: string, index: number) => void;
  onPickCover: () => void;
}

export function Canvas({
  pageWidth, document, rendered, mode, busy, zoom, centered, selectedBlockId, images, ops,
  onSelect, onMode, onSetting, onMeta, onDropComponent, onPickCover,
}: CanvasProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ top: number; height: number } | null>(null);
  const [drop, setDrop] = useState<{ index: number; top: number } | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [subtitleDraft, setSubtitleDraft] = useState<string | null>(null);

  /** 选中块的位置：相对纸张量，标记与纸张一起滚动，所以滚轮不会让它错位。 */
  useLayoutEffect(() => {
    const paper = paperRef.current;
    if (!paper || !selectedBlockId) { setSelection(null); return; }
    const measure = () => {
      const node = paper.querySelector<HTMLElement>(`[data-editor-block="${CSS.escape(selectedBlockId)}"]`);
      if (!node) { setSelection(null); return; }
      const nodeRect = node.getBoundingClientRect();
      const paperRect = paper.getBoundingClientRect();
      setSelection({ top: nodeRect.top - paperRect.top, height: nodeRect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [selectedBlockId, rendered, zoom, document.blocks.length]);

  function computeDrop(event: React.DragEvent): { index: number; top: number } {
    const paper = paperRef.current;
    if (!paper) return { index: 0, top: 0 };
    const nodes = [...paper.querySelectorAll('[data-editor-block]')] as HTMLElement[];
    const paperTop = paper.getBoundingClientRect().top;
    for (let index = 0; index < nodes.length; index += 1) {
      const rect = nodes[index].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) return { index, top: rect.top - paperTop };
    }
    const last = nodes[nodes.length - 1]?.getBoundingClientRect();
    return { index: nodes.length, top: last ? last.bottom - paperTop : 0 };
  }

  const heroImage = document.blocks.find((block) => block.componentId === 'weekly.hero')?.props.image;
  const cover = images.find((asset) => asset.id === heroImage) ?? images.find((asset) => asset.categoryId === 'brand' && asset.src) ?? images.find((asset) => asset.src);

  return <div className={`paper-stack${centered ? ' centered' : ''}`} style={{ zoom, '--paper-w': `${pageWidth}px`, '--stack-width': `${pageWidth + 46}px` } as CSSProperties}>
    <section className="meta-panel">
      <div className="meta-body">
        <button className="meta-cover" onClick={onPickCover} title="封面在公众号后台单独设置；此处预览文章首图">
          {cover?.src ? <img src={cover.src} alt="" /> : <span>封面</span>}
        </button>
        <div className="meta-fields">
          <input
            className="meta-title"
            value={titleDraft ?? document.title}
            placeholder="请输入图文的标题"
            disabled={busy}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => { const next = titleDraft; setTitleDraft(null); if (next !== null && next !== document.title) onMeta('title', next); }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          />
          <textarea
            className="meta-summary"
            rows={2}
            value={subtitleDraft ?? document.subtitle}
            placeholder="摘要，用于正文开头的导语"
            disabled={busy}
            onChange={(event) => setSubtitleDraft(event.target.value)}
            onBlur={() => { const next = subtitleDraft; setSubtitleDraft(null); if (next !== null && next !== document.subtitle) onMeta('subtitle', next); }}
          />
        </div>
      </div>
      <div className="meta-controls">
        <div className="mode-switch compact">
          <button className={mode === 'miniprogram-safe' ? 'selected' : ''} onClick={() => onMode('miniprogram-safe')} title="减少装饰，仅输出内联样式；发布前仍需公众号预览">兼容版</button>
          <button className={mode === 'high-fidelity' ? 'selected' : ''} onClick={() => onMode('high-fidelity')} title="保留更多装饰，请在公众号预览中确认">装饰版</button>
        </div>
        <div className="meta-toggles">
          <button className={document.settings.showFollowBanner ? 'on' : ''} onClick={() => onSetting('showFollowBanner', !document.settings.showFollowBanner)}>关注横幅</button>
          <button className={document.settings.showRelated ? 'on' : ''} onClick={() => onSetting('showRelated', !document.settings.showRelated)}>相关文章</button>
          <button className={document.settings.showBrandFooter ? 'on' : ''} onClick={() => onSetting('showBrandFooter', !document.settings.showBrandFooter)}>品牌页脚</button>
        </div>
      </div>
    </section>

    <div
      className={`paper${drop ? ' dropping' : ''}`}
      ref={paperRef}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('text/component-id')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDrop(computeDrop(event));
      }}
      onDragLeave={() => setDrop(null)}
      onDrop={(event) => {
        const componentId = event.dataTransfer.getData('text/component-id');
        if (!componentId) return;
        event.preventDefault();
        const target = computeDrop(event);
        setDrop(null);
        onDropComponent(componentId, target.index);
      }}
      onClick={(event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-editor-block]');
        onSelect(target?.dataset.editorBlock ?? null);
      }}
    >
      {drop && <div className="drop-marker" style={{ top: drop.top }} />}
      {document.blocks.length === 0
        ? <div className="paper-empty">点击输入文字</div>
        : <div className="article-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />}
      {selection && selectedBlockId && <BlockDecor
        top={selection.top}
        height={selection.height}
        busy={busy}
        onMove={(direction) => ops.move(selectedBlockId, direction)}
        onDuplicate={() => ops.duplicate(selectedBlockId)}
        onRemove={() => ops.remove(selectedBlockId)}
      />}
    </div>

    <div className="paper-note">基础格式见底部；字号与行高由设计系统基线决定，界面不提供改样式的入口。</div>
  </div>;
}

function BlockDecor({ top, height, busy, onMove, onDuplicate, onRemove }: {
  top: number;
  height: number;
  busy: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return <>
    <span className="block-mark" style={{ top, height }} aria-hidden="true" />
    <div className="block-tools" style={{ top }}>
      <button title="上移一块" disabled={busy} onClick={(event) => { event.stopPropagation(); onMove('up'); }}><IconUp /></button>
      <button title="下移一块" disabled={busy} onClick={(event) => { event.stopPropagation(); onMove('down'); }}><IconDown /></button>
      <button title="复制这一块" disabled={busy} onClick={(event) => { event.stopPropagation(); onDuplicate(); }}><IconCopy /></button>
      <button className="danger" title="删除这一块" disabled={busy} onClick={(event) => { event.stopPropagation(); onRemove(); }}><IconTrash /></button>
    </div>
  </>;
}

/** 画布上的块操作，抽出来是为了让 main.tsx 的接线保持一行。 */
export function buildBlockOps(
  document: ArticleDocument | undefined,
  mutate: (patch: ArticlePatch, summary?: string) => Promise<unknown>,
): BlockOps {
  return {
    move: (blockId, direction) => { void mutate({ kind: 'move-block', blockId, direction }, '移动内容块'); },
    duplicate: (blockId) => {
      const index = document?.blocks.findIndex((block) => block.id === blockId) ?? -1;
      const block = index === -1 ? undefined : document?.blocks[index];
      if (!block) return;
      // 复制出来的块必须有新 id：`insert-block` 会原样采用传入的 id，重复 id 会撞 validate
      void mutate({ kind: 'insert-block', index: index + 1, block: { ...block, id: makeId('copy') } }, '复制内容块');
    },
    remove: (blockId) => { void mutate({ kind: 'remove-block', blockId }, '删除内容块'); },
  };
}
