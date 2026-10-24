

import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { blockTitle, type ArticlePatch } from '../shared/article';
import type { RenderContext } from '../shared/components';
import '../shared/packs';
import { getTemplate } from '../shared/design';
import { imageIndex, resolveImageRef } from '../shared/images';
import { Canvas, buildBlockOps } from './components/canvas';
import { ComponentPanel, type SubTab } from './components/component-panel';
import { CopyBanner } from './components/copy-banner';
import { DesignSystemPanel } from './components/design-system-panel';
import { BaselineDialog, HelpDialog, ImportDialog, PreviewDialog, SettingsDialog } from './components/dialogs';
import { Dock } from './components/dock';
import { FloatingRail } from './components/floating-rail';
import { IconRail, type PanelDomain } from './components/icon-rail';
import { ImageLibraryPanel } from './components/image-library-panel';
import { Inspector } from './components/inspector';
import { MoreMenu } from './components/more-menu';
import { OutlinePanel } from './components/outline-panel';
import { TopBar } from './components/top-bar';
import { useEditor } from './use-editor';
import './styles.css';

type Dialog = 'none' | 'preview' | 'import' | 'help' | 'settings' | 'baseline';


function readCanvasMetrics(pageWidth: number): { padRight: number; stackWidth: number; offset: number } {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: number) => {
    const value = Number.parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    padRight: read('--canvas-pad-right', 62),
    stackWidth: pageWidth + 46,
    offset: read('--stack-offset', 16),
  };
}

function EditorApp() {
  const editor = useEditor();
  const { payload, document, rendered } = editor;
  const pageWidth = editor.designSystem?.baseline.page.width ?? 430;

  const [domain, setDomain] = useState<PanelDomain>('components');
  const [collapsed, setCollapsed] = useState(false);
  const [category, setCategory] = useState('all');
  const [subTab, setSubTab] = useState<SubTab>('all');
  const [query, setQuery] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [copyMode, setCopyMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>('none');
  const [importKind, setImportKind] = useState<'text' | 'markdown'>('text');
  const [importDraft, setImportDraft] = useState('');
  const [pickTarget, setPickTarget] = useState<{ blockId: string; fieldKey: string } | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  /** 画布能给的宽度所允许的最大显示比例，以及是否要改成居中（窗口窄时）。 */
  const [canvasFit, setCanvasFit] = useState({ centered: false, maxZoom: 1 });

  const ready = Boolean(payload && document && rendered);
  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return;
    const compute = () => {
      const metrics = readCanvasMetrics(pageWidth);
      // 画布内容区宽度 = 客户区 − 右侧给浮动竖条留的余地
      const usable = area.clientWidth - metrics.padRight;
      setCanvasFit({
        centered: usable < metrics.offset + metrics.stackWidth,
        maxZoom: Math.max(0.35, usable / metrics.stackWidth),
      });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(area);
    return () => observer.disconnect();
  }, [ready, pageWidth]);

  /** 用户选的比例不一定放得下，实际生效的是两者中小的那个。 */
  const effectiveZoom = Math.min(zoom, canvasFit.maxZoom);

  /**
   * 版心宽度由**设计系统**声明（baseline.page.width），不是界面常量：
   * 纸张、缩略图、AI 截图三处必须同宽，否则"看到的"和"粘出去的"就不是一回事。
   */

  const selectedBlock = useMemo(
    () => document?.blocks.find((block) => block.id === selectedBlockId) ?? null,
    [document, selectedBlockId],
  );

  /**
   * 选中的块在刷新后要保持住（SSE 回调闭包捕获的是挂载时的旧值，只能用函数式 setState）。
   * **但不在加载时自动选中第一块**：那样一进界面弹出一张浮动字段卡，正好压住纸张上的
   * 标题与正文开头，窗口越窄压得越多。要编辑就点一下块。
   */
  useEffect(() => {
    if (!document) return;
    setSelectedBlockId((current) => (current && document.blocks.some((block) => block.id === current) ? current : null));
  }, [document]);

  /** 组件缩略图的渲染上下文：与画布同宽（415），所以缩略图就是真实排版的样子。 */
  const thumbCtx = useMemo<RenderContext>(() => {
    const templateId = document?.templateId ?? 'generic';
    const index = imageIndex(payload?.images ?? []);
    return {
      mode: 'miniprogram-safe',
      tokens: getTemplate(templateId).tokens,
      imageUrl: (ref) => resolveImageRef(ref, index),
    };
  }, [document?.templateId, payload?.images]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dialog !== 'none') { setDialog('none'); return; }
      if (pickTarget) { setPickTarget(null); return; }
      if (menuOpen) { setMenuOpen(false); return; }
      if (copyMode) { setCopyMode(false); return; }
      setSelectedBlockId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copyMode, dialog, menuOpen, pickTarget]);

  if (!payload || !document || !rendered) {
    return <div className="loading">{editor.error ? `加载失败：${editor.error}` : '正在加载排版器…'}</div>;
  }

  const template = payload.templates.find((item) => item.id === document.templateId);
  const pendingImage = pickTarget ? document.blocks.find((block) => block.id === pickTarget.blockId) : null;
  const ops = buildBlockOps(document, editor.mutate);

  const insertFromLibrary = (componentId: string) => {
    const at = selectedBlock
      ? document.blocks.findIndex((block) => block.id === selectedBlock.id) + 1
      : document.blocks.length;
    void editor.insertComponent(componentId, at).then((id) => { if (id) setSelectedBlockId(id); });
  };

  return <div
    className={`app-shell${collapsed ? ' panel-collapsed' : ''}${copyMode ? ' copy-mode' : ''}`}
    style={{ '--paper-w': `${pageWidth}px` } as React.CSSProperties}
  >
    <TopBar
      appName="公众号排版器"
      documentTitle={document.title}
      templateName={template?.name ?? document.templateId}
      copyMode={copyMode}
      busy={editor.busy}
      menuOpen={menuOpen}
      onOpen={() => { setImportKind('text'); setDialog('import'); }}
      onPreview={() => setDialog('preview')}
      onSave={() => void editor.mutate({ kind: 'set-meta', field: 'title', value: document.title }, '手动记录版本')}
      onExport={() => setCopyMode(true)}
      onExitCopy={() => setCopyMode(false)}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      menu={menuOpen && <MoreMenu
        busy={editor.busy}
        onClose={() => setMenuOpen(false)}
        onNew={() => void editor.newArticle()}
        onImportText={() => { setImportKind('text'); setDialog('import'); }}
        onImportMarkdown={() => { setImportKind('markdown'); setDialog('import'); }}
        onSaveTemplate={() => undefined}
        onOneClickLayout={() => undefined}
      />}
    />

    <div className="workspace">
      <IconRail
        domain={domain}
        collapsed={collapsed}
        onDomain={(next) => { setDomain(next); setCollapsed(false); }}
        onToggleCollapse={() => setCollapsed((value) => !value)}
      />

      <aside className="side-panel">
        {domain === 'components' && <ComponentPanel
          components={payload.components}
          usage={payload.componentUsage ?? {}}
          ctx={thumbCtx}
          renderWidth={pageWidth}
          category={category}
          subTab={subTab}
          query={query}
          busy={editor.busy}
          onCategory={setCategory}
          onSubTab={setSubTab}
          onQuery={setQuery}
          onInsert={insertFromLibrary}
        />}

        {domain === 'library' && <ImageLibraryPanel
          images={payload.images}
          categories={payload.imageCategories}
          pickMode={Boolean(pickTarget)}
          pendingLabel={pendingImage && pickTarget ? `${blockTitle(pendingImage)} · ${pickTarget.fieldKey}` : ''}
          busy={editor.busy}
          onMutate={editor.libraryMutate}
          onCancelPick={() => setPickTarget(null)}
          onPick={(assetId) => {
            if (pickTarget) void editor.mutate({ kind: 'set-block-props', blockId: pickTarget.blockId, props: { [pickTarget.fieldKey]: assetId } }, '更换图片');
            setPickTarget(null);
            setDomain('components');
          }}
        />}

        {domain === 'outline' && <OutlinePanel
          blocks={document.blocks}
          versions={payload.versions}
          revision={document.revision}
          busy={editor.busy}
          selectedBlockId={selectedBlockId}
          onSelect={setSelectedBlockId}
          onReorder={(blockId, index) => void editor.mutate({ kind: 'move-block-to', blockId, index }, '拖拽调整顺序')}
          onRestore={(revision) => void editor.restore(revision)}
        />}

        {domain === 'design' && <DesignSystemPanel
          design={editor.designSystem}
          templates={payload.templates}
          activeTemplateId={document.templateId}
          busy={editor.busy}
          onSelectTemplate={(templateId) => void editor.selectTemplate(templateId)}
        />}
      </aside>

      <div className="canvas-column">
        {copyMode && <CopyBanner
          copyState={editor.copyState}
          onCopy={() => void editor.copyForWeChat()}
          onExit={() => setCopyMode(false)}
        />}

        <div className="canvas-viewport">
          <main className="canvas-area" ref={canvasAreaRef}>
            <Canvas
              pageWidth={pageWidth}
              document={document}
              rendered={rendered}
              mode={editor.mode}
              busy={editor.busy}
              zoom={effectiveZoom}
              centered={canvasFit.centered}
              selectedBlockId={selectedBlockId}
              images={payload.images}
              ops={ops}
              onSelect={setSelectedBlockId}
              onMode={editor.setMode}
              onSetting={(field, value) => void editor.mutate({ kind: 'set-setting', field, value }, '切换文档级开关')}
              onMeta={(field, value) => void editor.mutate({ kind: 'set-meta', field, value }, field === 'title' ? '修改标题' : '修改摘要')}
              onDropComponent={(componentId, index) => { void editor.insertComponent(componentId, index).then((id) => { if (id) setSelectedBlockId(id); }); }}
              onPickCover={() => { setPickTarget(null); setDomain('library'); }}
            />
          </main>

          {selectedBlock && <Inspector
            block={selectedBlock}
            digest={payload.components.find((item) => item.id === selectedBlock.componentId)}
            images={payload.images}
            busy={editor.busy}
            mutate={editor.mutate as (patch: ArticlePatch, summary?: string) => Promise<unknown>}
            onClose={() => setSelectedBlockId(null)}
            onPickImage={(fieldKey) => { setPickTarget({ blockId: selectedBlock.id, fieldKey }); setDomain('library'); setCollapsed(false); }}
          />}

          <FloatingRail
            undoAvailable={Boolean(payload.undoAvailable)}
            redoAvailable={Boolean(payload.redoAvailable)}
            busy={editor.busy}
            onUndo={() => void editor.history(-1)}
            onRedo={() => void editor.history(1)}
            onHelp={() => setDialog('help')}
            onSettings={() => setDialog('settings')}
          />

          {(editor.notice || editor.error) && <div className={`toast${editor.error ? ' error' : ''}`}>
            {editor.error || editor.notice}
            {editor.error && <button className="icon-btn" onClick={() => editor.setError('')}>✕</button>}
          </div>}
        </div>

        <Dock
          stats={rendered.stats}
          warnings={rendered.warnings}
          zoom={effectiveZoom}
          zoomLimited={zoom > effectiveZoom}
          baseline={editor.designSystem?.baseline}
          busy={editor.busy}
          onZoom={setZoom}
          onOpenBaseline={() => setDialog('baseline')}
          onOpenLibrary={() => { setPickTarget(null); setDomain('library'); setCollapsed(false); }}
        />
      </div>
    </div>

    {dialog === 'preview' && <PreviewDialog
      rendered={rendered}
      mode={editor.mode}
      copyState={editor.copyState}
      onCopy={() => void editor.copyForWeChat()}
      onClose={() => setDialog('none')}
    />}
    {dialog === 'import' && <ImportDialog
      kind={importKind}
      draft={importDraft}
      busy={editor.busy}
      onKind={setImportKind}
      onDraft={setImportDraft}
      onApply={() => void editor.importText(importDraft, importKind).then(() => { setImportDraft(''); setDialog('none'); })}
      onClose={() => setDialog('none')}
    />}
    {dialog === 'help' && <HelpDialog onClose={() => setDialog('none')} />}
    {dialog === 'settings' && <SettingsDialog design={editor.designSystem} onClose={() => setDialog('none')} />}
    {dialog === 'baseline' && <BaselineDialog design={editor.designSystem} onClose={() => setDialog('none')} />}
  </div>;
}

createRoot(document.getElementById('root')!).render(<EditorApp />);
