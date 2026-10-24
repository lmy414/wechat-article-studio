

import { IconExport, IconMore, IconOpen, IconPreview, IconSave } from './icons';

export interface TopBarProps {
  appName: string;
  documentTitle: string;
  templateName: string;
  copyMode: boolean;
  busy: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onPreview: () => void;
  onSave: () => void;
  onExport: () => void;
  onExitCopy: () => void;
  onToggleMenu: () => void;
  /** 下拉菜单本体由 main.tsx 提供：菜单项要触发的动作（导入/新建）都归它管。 */
  menu?: React.ReactNode;
}

export function TopBar({
  appName, documentTitle, templateName, copyMode, busy, menuOpen, menu,
  onOpen, onPreview, onSave, onExport, onExitCopy, onToggleMenu,
}: TopBarProps) {
  const dimmed = copyMode;
  return <header className="topbar">
    <div className="topbar-left">
      <span className="topbar-logo" aria-hidden="true">排</span>
      <nav className="breadcrumb">
        <span>{appName}</span>
        <i>/</i>
        <span>{templateName}</span>
        <i>/</i>
        <b>{documentTitle || '未命名图文'}</b>
      </nav>
    </div>

    <div className="top-actions">
      <button className="op-btn" onClick={onOpen} disabled={busy || dimmed} title="导入正文或 Markdown，替换当前全文">
        <IconOpen /><span>打开</span>
      </button>
      <button className="op-btn" onClick={onPreview} disabled={busy || dimmed} title="整页预览（发布后的样子）">
        <IconPreview /><span>预览</span>
      </button>
      <button className="op-btn" onClick={onSave} disabled={dimmed} title="已自动保存；点这里立即记录一个版本">
        <IconSave /><span>保存</span>
      </button>
      {copyMode
        ? <button className="op-btn exit" onClick={onExitCopy} title="退出复制模式（Esc）">
          <span className="op-glyph">✕</span><span>退出</span>
        </button>
        : <button className="op-btn primary" onClick={onExport} disabled={busy} title="进入复制模式，把内容粘贴到公众号编辑器">
          <IconExport /><span>导出</span>
        </button>}
      <div className="more-wrap">
        <button className={`op-btn${menuOpen ? ' active' : ''}`} onClick={onToggleMenu} disabled={busy || dimmed} aria-expanded={menuOpen} title="更多操作">
          <IconMore /><span>更多</span>
        </button>
        {menu}
      </div>
    </div>

    <div className="topbar-right">
      <span className="topbar-meta">{templateName}</span>
      <span className="topbar-status" title="直连本机 API，不经任何云端"><i />本地直连</span>
    </div>
  </header>;
}
