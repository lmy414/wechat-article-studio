

export interface MoreMenuProps {
  busy: boolean;
  onClose: () => void;
  onNew: () => void;
  onImportText: () => void;
  onImportMarkdown: () => void;
  onSaveTemplate: () => void;
  onOneClickLayout: () => void;
}

export function MoreMenu({ busy, onClose, onNew, onImportText, onImportMarkdown, onSaveTemplate, onOneClickLayout }: MoreMenuProps) {
  const run = (action: () => void) => () => { onClose(); action(); };

  return <div className="more-menu" role="menu">
    <button role="menuitem" disabled={busy} onClick={run(onNew)}>新建图文</button>
    <button role="menuitem" disabled={busy} onClick={run(onImportText)}>导入正文</button>
    <button role="menuitem" disabled={busy} onClick={run(onImportMarkdown)}>导入 Markdown</button>
    <hr />
    <button role="menuitem" disabled title="模板目前是代码级配置，另存为模板需要模板持久化（P2）">
      另存为模板<em>待实现</em>
    </button>
    <button role="menuitem" disabled title="一键排版需要一个能读懂设计系统的模型与校验闭环（P0 + P2）">
      一键排版<em>待实现</em>
    </button>
    <hr />
    <button role="menuitem" disabled className="more-note" title="外部 AI 通过 MCP 读写，不需要在这里配置">
      外部 AI：npm run mcp
    </button>
  </div>;
}
