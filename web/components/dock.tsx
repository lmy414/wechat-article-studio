

import { useState } from 'react';
import type { RenderStats, RenderWarning } from '../../shared/article';
import type { DesignBaseline } from '../../shared/design-system';
import { DISPLAY_BASELINE } from '../lib/baseline';
import { IconDown, IconUp, IconZoom } from './icons';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];

/** 中文阅读速度按 350 字/分钟估，口径与"阅读约 N 分钟"的展示习惯一致。 */
function readingMinutes(characters: number): number {
  return Math.max(1, Math.round(characters / 350));
}


function baselineLine(baseline: DesignBaseline): string {
  return `字号 ${baseline.type.body}，行间距 ${baseline.lineHeight.body}，字间距 ${baseline.letterSpacing.body}`;
}

export function Dock({ stats, warnings, zoom, zoomLimited, baseline, busy, onZoom, onOpenBaseline, onOpenLibrary }: {
  stats: RenderStats;
  warnings: RenderWarning[];
  /** **实际生效**的显示比例（= min(用户选的比例, 窗口放得下的比例)）。 */
  zoom: number;
  /** 窗口放不下用户选的比例时，显示比例会被压小。 */
  zoomLimited?: boolean;
  /** 当前客户的设计系统基线；还没取到时用兜底值，避免首帧空白。 */
  baseline?: DesignBaseline;
  busy: boolean;
  onZoom: (zoom: number) => void;
  onOpenBaseline: () => void;
  onOpenLibrary: () => void;
}) {
  const [checksOpen, setChecksOpen] = useState(false);
  const errors = warnings.filter((warning) => warning.severity === 'error').length;
  const cautions = warnings.filter((warning) => warning.severity === 'warning').length;
  const design = baseline ?? DISPLAY_BASELINE;

  return <footer className="dock">
    <div className="dock-left">
      <button className="dock-link" onClick={onOpenBaseline} title="查看设计系统基线详情与 AI 自由区说明">
        基础格式：{baselineLine(design)}
      </button>
      <span className="dock-swatches" aria-hidden="true">
        {design.palette.slice(0, 5).map((color) => <i key={color} style={{ background: color }} />)}
      </span>
    </div>

    <div className="dock-stats">
      <span>组件 <b>{stats.blockCount}</b> 个</span>
      <span>图片 <b>{stats.imageCount}</b> 张</span>
      <span>字数 <b>{stats.textCharacters.toLocaleString('zh-CN')}</b></span>
      <span>阅读约 <b>{readingMinutes(stats.textCharacters)}</b> 分钟</span>
    </div>

    <div className="dock-right">
      <div className="dock-checks">
        <button className={`dock-link${errors ? ' error' : ''}`} onClick={() => setChecksOpen((open) => !open)}>
          校验：{errors ? `${errors} 个 error` : cautions ? `${cautions} 个提示` : '无异常'}
        </button>
        {checksOpen && <div className="dock-pop">
          <strong>交付前 error 必须为 0</strong>
          {!warnings.length && <p className="panel-empty">渲染器没有报出问题。</p>}
          <ul>{warnings.slice(0, 12).map((warning, index) => <li className={warning.severity} key={`${warning.code}-${warning.blockId ?? index}`}>
            {warning.severity === 'error' ? '⛔' : warning.severity === 'warning' ? '⚠️' : 'ⓘ'} {warning.message}
          </li>)}</ul>
          <p className="ds-note todo">
            TODO（P0-5）：完整校验器（颜色/字号闭集、品牌固定元素存在性、白名单、外链检查）尚未实现；
            这里显示的是渲染器当前的警告。
          </p>
        </div>}
      </div>
      <button className="dock-link dock-library" onClick={onOpenLibrary} disabled={busy}>图片库</button>
      <div className="zoom">
        <button
          className="icon-btn"
          title={zoomLimited ? '窗口宽度不够，显示比例已按窗口自适应' : '缩小'}
          disabled={zoomLimited || zoom <= ZOOM_STEPS[0]}
          onClick={() => {
            const index = ZOOM_STEPS.findIndex((step) => step >= zoom);
            onZoom(ZOOM_STEPS[Math.max(0, index - 1)]);
          }}><IconZoom size={15} /><IconDown size={9} /></button>
        <button
          className="zoom-value"
          onClick={() => onZoom(1)}
          title={zoomLimited ? '纸张已按窗口宽度缩到刚好放得下，放大需要更宽的窗口' : '恢复到 100%'}
        >{Math.round(zoom * 100)}%</button>
        <button
          className="icon-btn"
          title={zoomLimited ? '窗口宽度不够，显示比例已按窗口自适应' : '放大'}
          disabled={zoomLimited || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          onClick={() => {
            const index = ZOOM_STEPS.findIndex((step) => step > zoom);
            onZoom(ZOOM_STEPS[index === -1 ? ZOOM_STEPS.length - 1 : index]);
          }}><IconZoom size={15} /><IconUp size={9} /></button>
      </div>
    </div>
  </footer>;
}
