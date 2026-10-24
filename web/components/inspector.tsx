

import { useEffect, useRef, useState } from 'react';
import type { ArticleBlock, ArticlePatch } from '../../shared/article';
import type { ComponentDigest } from '../../shared/components';
import type { ImageAsset } from '../../shared/images';
import { IconClose } from './icons';

interface InspectorProps {
  block: ArticleBlock;
  digest?: ComponentDigest;
  images: ImageAsset[];
  busy: boolean;
  mutate: (patch: ArticlePatch, summary?: string) => Promise<unknown>;
  onPickImage: (fieldKey: string) => void;
  onClose: () => void;
}

export function Inspector({ block, digest, images, busy, mutate, onPickImage, onClose }: InspectorProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const lastBlockId = useRef(block.id);
  useEffect(() => {
    if (lastBlockId.current !== block.id) {
      lastBlockId.current = block.id;
      setDraft({});
    }
  }, [block.id]);

  const value = (key: string, fallback: string) => draft[key] ?? fallback;
  const commit = (key: string, fallback: string) => {
    const next = value(key, fallback);
    if (next !== fallback) {
      void mutate({ kind: 'set-block-props', blockId: block.id, props: { [key]: next } }, `修改${digest?.name ?? '内容块'}`);
      setDraft((current) => { const copy = { ...current }; delete copy[key]; return copy; });
    }
  };

  return <aside className="inspector-card" aria-label="字段编辑">
    <div className="inspector-head">
      <div className="selected-badge">{digest?.name ?? block.componentId} <code>{block.componentId}</code></div>
      <button className="icon-btn" onClick={onClose} title="收起字段面板"><IconClose size={16} /></button>
    </div>
    {!digest ? <p className="panel-empty">未知组件：{block.componentId}</p> : <div className="block-editor">
      {digest.fields.map((field) => {
        if (field.kind === 'image') {
          const ref = value(field.key, block.props[field.key] ?? '');
          const asset = images.find((item) => item.id === ref);
          const preview = asset?.src || (/^(https?:|\/|data:)/.test(ref) ? ref : '');
          return <div className="field-label" key={field.key}>
            {field.label}
            <div className="image-field">
              <span className="image-thumb">{preview ? <img src={preview} alt="" /> : '空'}</span>
              <div className="image-field-body">
                <span className="image-field-name">{asset ? asset.label : ref || '未选择素材'}</span>
                <div className="row-actions">
                  <button onClick={() => onPickImage(field.key)} disabled={busy}>从图片库选择</button>
                  <input
                    className={busy ? 'disabled' : ''}
                    placeholder="或直接填图片地址"
                    value={/^(https?:|\/|data:)/.test(ref) ? ref : ''}
                    onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                    onBlur={() => commit(field.key, block.props[field.key] ?? '')}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />
                </div>
              </div>
            </div>
          </div>;
        }
        const rows = field.kind === 'lines' ? 6 : field.kind === 'textarea' ? 8 : undefined;
        return <label className="field-label" key={field.key}>
          {field.label}
          {rows ? <textarea
            rows={rows}
            disabled={busy}
            value={value(field.key, block.props[field.key] ?? '')}
            onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
            onBlur={() => commit(field.key, block.props[field.key] ?? '')}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.blur(); }}
          /> : <input
            disabled={busy}
            value={value(field.key, block.props[field.key] ?? '')}
            onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
            onBlur={() => commit(field.key, block.props[field.key] ?? '')}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          />}
          {field.help && <small className="field-help">{field.help}</small>}
        </label>;
      })}
    </div>}
  </aside>;
}
