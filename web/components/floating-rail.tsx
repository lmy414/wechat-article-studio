

import { IconHelp, IconRedo, IconSettings, IconUndo } from './icons';

export function FloatingRail({ undoAvailable, redoAvailable, busy, onUndo, onRedo, onHelp, onSettings }: {
  undoAvailable: boolean;
  redoAvailable: boolean;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHelp: () => void;
  onSettings: () => void;
}) {
  return <div className="float-rail">
    <button onClick={onUndo} disabled={busy || !undoAvailable} title="撤销上一步（按版本历史回退）"><IconUndo size={19} /><span>撤销</span></button>
    <button onClick={onRedo} disabled={busy || !redoAvailable} title="重做"><IconRedo size={19} /><span>重做</span></button>
    <button onClick={onHelp} title="怎么用这个排版器"><IconHelp size={19} /><span>帮助</span></button>
    <button onClick={onSettings} title="本地服务与数据文件位置"><IconSettings size={19} /><span>设置</span></button>
  </div>;
}
