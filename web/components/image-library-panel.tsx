

import { useState } from 'react';
import type { LibraryPatch } from '../../shared/article';
import type { ImageAsset, ImageCategory } from '../../shared/images';

export function ImageLibraryPanel({ images, categories, pickMode, pendingLabel, busy, onPick, onMutate, onCancelPick }: {
  images: ImageAsset[];
  categories: ImageCategory[];
  pickMode: boolean;
  pendingLabel: string;
  busy: boolean;
  onPick: (assetId: string) => void;
  onMutate: (patch: LibraryPatch) => Promise<void>;
  onCancelPick: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [draft, setDraft] = useState({ label: '', src: '' });
  const [newCategory, setNewCategory] = useState('');
  const [editing, setEditing] = useState<ImageAsset | null>(null);

  const sorted = [...categories].sort((a, b) => a.order - b.order);
  const shown = activeCategory === 'all' ? images : images.filter((item) => item.categoryId === activeCategory);

  return <div className="panel-domain library-panel">
    {pickMode && <div className="pick-banner">
      <span>为 <b>{pendingLabel}</b> 选择素材</span>
      <button className="icon-btn" onClick={onCancelPick}>取消</button>
    </div>}

    <div className="lib-categories">
      <button className={activeCategory === 'all' ? 'selected' : ''} onClick={() => setActiveCategory('all')}>全部<em>{images.length}</em></button>
      {sorted.map((category) => <span className={`category-chip${activeCategory === category.id ? ' selected' : ''}`} key={category.id}>
        <button onClick={() => setActiveCategory(category.id)}>{category.name}<em>{images.filter((item) => item.categoryId === category.id).length}</em></button>
        <button className="chip-action" title="重命名分类" disabled={busy} onClick={() => { const name = window.prompt('新的分类名', category.name); if (name?.trim()) void onMutate({ kind: 'category-rename', id: category.id, name: name.trim() }); }}>✎</button>
        <button className="chip-action" title="删除分类（素材会移到其它分类）" disabled={busy || categories.length <= 1} onClick={() => void onMutate({ kind: 'category-remove', id: category.id })}>✕</button>
      </span>)}
    </div>

    <div className="lib-add-category">
      <input placeholder="新分类名" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
      <button disabled={busy || !newCategory.trim()} onClick={() => { void onMutate({ kind: 'category-add', name: newCategory.trim() }); setNewCategory(''); }}>加分类</button>
    </div>

    <div className="lib-grid">
      {shown.map((asset) => <div className={`asset-card${asset.placeholder ? ' placeholder' : ''}`} key={asset.id}>
        <div className="asset-preview" onClick={() => pickMode && !asset.placeholder && onPick(asset.id)} title={pickMode ? '点击选用' : asset.src}>
          {asset.src ? <img src={asset.src} alt={asset.label} /> : <span>占位</span>}
        </div>
        <div className="asset-meta">
          <strong>{asset.label}</strong>
          <small>{sorted.find((item) => item.id === asset.categoryId)?.name ?? '未分类'}{asset.width ? ` · ${asset.width}×${asset.height ?? '?'}` : ''}</small>
        </div>
        <div className="asset-actions">
          {pickMode && !asset.placeholder && <button className="primary" onClick={() => onPick(asset.id)} disabled={busy}>选用</button>}
          <button disabled={busy} onClick={() => setEditing(asset)}>编辑</button>
          <button className="danger" disabled={busy} onClick={() => void onMutate({ kind: 'image-remove', id: asset.id })}>删除</button>
        </div>
      </div>)}
      {!shown.length && <p className="panel-empty">这个分类下还没有素材。</p>}
    </div>

    <div className="lib-foot">
      <div className="ds-kicker">新增素材</div>
      <div className="lib-add">
        <input placeholder="素材名称" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
        <input placeholder="图片地址（/library/… 或 https://…）" value={draft.src} onChange={(event) => setDraft({ ...draft, src: event.target.value })} />
        <select value={activeCategory === 'all' ? sorted[0]?.id ?? '' : activeCategory} onChange={(event) => setActiveCategory(event.target.value)}>
          {sorted.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
        <button
          className="primary"
          disabled={busy || !draft.src.trim() || !draft.label.trim()}
          onClick={() => {
            const categoryId = activeCategory === 'all' ? sorted[0]?.id : activeCategory;
            if (!categoryId) return;
            void onMutate({ kind: 'image-add', label: draft.label.trim(), src: draft.src.trim(), categoryId });
            setDraft({ label: '', src: '' });
          }}
        >加入图片库</button>
      </div>
      <p className="ds-note">图片库是单用户本地设计：分类自定义，不能上传文件，只能填地址或选已有素材。</p>
    </div>

    {editing && <div className="modal-backdrop" onClick={() => setEditing(null)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <strong>编辑素材</strong>
        <label className="field-label">名称<input value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /></label>
        <label className="field-label">地址<input value={editing.src} onChange={(event) => setEditing({ ...editing, src: event.target.value })} /></label>
        <label className="field-label">分类<select value={editing.categoryId} onChange={(event) => setEditing({ ...editing, categoryId: event.target.value })}>
          {sorted.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select></label>
        <div className="row-actions">
          <button className="primary" disabled={busy} onClick={() => { void onMutate({ kind: 'image-update', id: editing.id, label: editing.label, src: editing.src, categoryId: editing.categoryId }); setEditing(null); }}>保存</button>
          <button onClick={() => setEditing(null)}>取消</button>
        </div>
      </div>
    </div>}
  </div>;
}
