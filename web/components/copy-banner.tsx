

import type { CopyState } from '../use-editor';

export function CopyBanner({ copyState, onCopy, onExit }: {
  copyState: CopyState;
  onCopy: () => void;
  onExit: () => void;
}) {
  return <div className="copy-banner" role="status">
    <div className="copy-banner-text">
      点下方「复制到公众号」写入剪贴板，然后到公众号编辑器里 <kbd>Ctrl</kbd>+<kbd>V</kbd> 粘贴。
      图片会随正文复制，粘贴后请核对转存结果。
      <span className="copy-banner-hint">画布内容现在可以整段选中，也可以手动复制；按 Esc 退出复制模式。</span>
    </div>
    <div className="copy-banner-actions">
      <button className={`copy-cta${copyState === 'done' ? ' done' : ''}${copyState === 'error' ? ' failed' : ''}`} onClick={onCopy} disabled={copyState === 'copying'}>
        {copyState === 'copying' ? '正在复制…' : copyState === 'done' ? '已复制 ✓' : copyState === 'error' ? '复制失败' : '复制到公众号'}
      </button>
      <button onClick={onExit}>退出</button>
    </div>
  </div>;
}
