

import { useState } from 'react';
import { blockTitle, type ArticleBlock, type ArticleVersion } from '../../shared/article';

export function OutlinePanel({ blocks, versions, revision, busy, selectedBlockId, onSelect, onReorder, onRestore }: {
  blocks: ArticleBlock[];
  versions: ArticleVersion[];
  revision: number;
  busy: boolean;
  selectedBlockId: string | null;
  onSelect: (blockId: string) => void;
  onReorder: (blockId: string, index: number) => void;
  onRestore: (revision: number) => void;
}) {
  const [tab, setTab] = useState<'blocks' | 'versions'>('blocks');
  const [dropRow, setDropRow] = useState<{ index: number; after: boolean } | null>(null);

  return <div className="outline">
    <div className="tabs-lv2 outline-tabs">
      <div className="tabs-lv2-list" role="tablist">
        <button role="tab" aria-selected={tab === 'blocks'} className={`tab-lv2${tab === 'blocks' ? ' active' : ''}`} onClick={() => setTab('blocks')}>内容块</button>
        <button role="tab" aria-selected={tab === 'versions'} className={`tab-lv2${tab === 'versions' ? ' active' : ''}`} onClick={() => setTab('versions')}>版本历史</button>
      </div>
    </div>

    {tab === 'blocks' ? <div className="block-list">
      {blocks.map((block, index) => <div
        key={block.id}
        className={`block-row${block.id === selectedBlockId ? ' selected' : ''}${dropRow?.index === index ? (dropRow.after ? ' drop-after' : ' drop-before') : ''}`}
        draggable
        onDragStart={(event) => { event.dataTransfer.setData('text/block-id', block.id); event.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('text/block-id')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
          setDropRow({ index, after: event.clientY > rect.top + rect.height / 2 });
        }}
        onDragLeave={() => setDropRow(null)}
        onDrop={(event) => {
          const blockId = event.dataTransfer.getData('text/block-id');
          if (!blockId) return;
          event.preventDefault();
          setDropRow(null);
          // 落点按行的上/下半区判断：上半区插到该行之前，下半区插到该行之后，避免"拖到哪算哪"的歧义
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
          const after = event.clientY > rect.top + rect.height / 2;
          onReorder(blockId, after ? index + 1 : index);
        }}
        onClick={() => onSelect(block.id)}
      >
        <span className="block-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="block-name">{blockTitle(block)}</span>
      </div>)}
      {!blocks.length && <p className="panel-empty">还没有内容块。从组件库点一个缩略图插入。</p>}
    </div> : <div className="block-list">
      {versions.slice().reverse().map((version) => <button
        className={`version${version.revision === revision ? ' current' : ''}`}
        key={version.id}
        disabled={busy}
        onClick={() => onRestore(version.revision)}
      >
        <span>REV {version.revision}</span>
        <small>{version.source === 'human' ? '人工' : version.source === 'mcp' ? 'MCP' : '系统'} · {version.summary}</small>
      </button>)}
    </div>}
  </div>;
}
