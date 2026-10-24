/**
 * 设计系统面板：把当前客户的设计系统**照实**展示出来。
 *
 * 数据来自 `/api/design-systems/:id`，也就是 `shared/design-system.ts` 的声明本身——
 * 界面不另存一份基线，否则"唯一真值"就不成立了（docs/DESIGN-SYSTEM.md §3）。
 *
 * 展示顺序就是契约的四个问题：基线（什么不能动）→ 自由区（AI 能动什么）→
 * 品牌固定元素（必须存在什么）→ 选择指南（什么时候用哪个）。末尾附组合骨架。
 * 这一屏同时也是**给人看的 AI 说明书**：AI 通过 MCP 拿到的就是这些内容。
 */

import type { TemplateSummary } from '../../shared/design';
import { COMPONENT_CATEGORIES } from '../../shared/components';
import type { DesignSystemPayload } from '../use-editor';
import { DISPLAY_BASELINE } from '../lib/baseline';

export function DesignSystemPanel({ design, templates, activeTemplateId, busy, onSelectTemplate }: {
  /** 当前客户的设计系统；还没取到时用兜底基线渲染骨架。 */
  design: DesignSystemPayload | null;
  templates: TemplateSummary[];
  activeTemplateId: string;
  busy: boolean;
  onSelectTemplate: (templateId: string) => void;
}) {
  const baseline = design?.baseline ?? DISPLAY_BASELINE;
  const freedom = design?.freedom;
  const whitelist = freedom?.allowedComponents === 'all' ? null : freedom?.allowedComponents ?? null;

  return <div className="panel-domain ds-panel">
    <div className="ds-block">
      <div className="ds-kicker">设计系统{design ? ` · ${design.client}` : ''}</div>
      <p className="ds-lead">
        {design?.description
          ?? '正在读取当前客户的设计系统…排版器的核心不是编辑器，是这套约束：它定义什么不能动、AI 可以动什么。'}
      </p>
      {design && <div className="ds-grid">
        <span>基线来源</span><b>{baseline.source === 'baked' ? '烘焙在组件里（描述+校验，不驱动渲染）' : 'token 驱动（换模板即换版式）'}</b>
        <span>客户</span><b>{design.client}</b>
        <span>语气</span><b>{design.tone ?? '—'}</b>
      </div>}
      <div className="ds-template-list">
        {templates.map((item) => <button
          key={item.id}
          className={`ds-template${item.id === activeTemplateId ? ' active' : ''}`}
          disabled={busy || item.status === 'planned' || item.id === activeTemplateId}
          onClick={() => onSelectTemplate(item.id)}
        >
          <span>{item.name}</span>
          <small>{item.status === 'planned' ? '待配置' : item.description}</small>
        </button>)}
      </div>
    </div>

    <div className="ds-block">
      <div className="ds-kicker">基线 · 什么不能动</div>
      <p className="ds-lead">
        基线是**闭集**：不在下面的色板与字号阶里的值一律不允许出现。它由 `shared/audit.ts`
        的目录回归逐个组件比对，所以这里显示的就是真实生效的约束。
      </p>
      <div className="ds-baseline-line">
        字号 {baseline.type.body}，行间距 {baseline.lineHeight.body}，字间距 {baseline.letterSpacing.body}
      </div>
      <div className="ds-grid">
        <span>字号阶</span><b>{baseline.typeScale.join(' / ')}</b>
        <span>语义字号</span><b>标题 {baseline.type.heading} · 小标题 {baseline.type.subheading} · 次要 {baseline.type.secondary} · 说明 {baseline.type.caption}</b>
        <span>行高</span><b>{baseline.lineHeights.join(' / ')}</b>
        <span>字距</span><b>{baseline.letterSpacings.join(' / ')}</b>
        <span>间距</span><b>段 {baseline.spacing.paragraph} · 块 {baseline.spacing.block} · 节 {baseline.spacing.section} · 卡 {baseline.spacing.card}</b>
        <span>圆角/描边</span><b>{baseline.shape.radiusCard} / {baseline.shape.radiusSmall} / {baseline.shape.borderWidth}</b>
        <span>图片</span><b>圆角 {baseline.image.radius} · 说明 {baseline.image.captionSize} {baseline.image.captionColor}</b>
      </div>
      <div className="ds-swatches">
        {baseline.palette.map((color) => <span key={color} title={color}>
          <i style={{ background: color }} />{color}
        </span>)}
      </div>
      <p className="ds-note">共 {baseline.palette.length} 个色值。禁用写法：display:grid、position、float、&lt;div&gt;、class=、&lt;style&gt;、@media、@keyframes（z-index 与 !important 允许）。</p>
    </div>

    <div className="ds-block">
      <div className="ds-kicker">自由区 · AI 可以动什么</div>
      {freedom ? <>
        <div className="ds-sub">可以</div>
        <ul className="ds-list">{freedom.aiDecides.map((item) => <li key={item}>{item}</li>)}</ul>
        <div className="ds-sub">不可以</div>
        <ul className="ds-list ds-list-warn">{freedom.aiMustNot.map((item) => <li key={item}>{item}</li>)}</ul>
        <p className="ds-note">
          白名单：{whitelist ? whitelist.join('、') : `全部 ${design?.catalog.length ?? 0} 个组件（按客户细化白名单是下一步）`}
        </p>
        {freedom.lockedFields.length > 0 && <>
          <div className="ds-sub">锁定字段（AI 不能改）</div>
          <ul className="ds-list">{freedom.lockedFields.map((lock) => <li key={`${lock.componentId}.${lock.field}`}>
            <b>{lock.componentId}.{lock.field}</b> — {lock.reason}
          </li>)}</ul>
        </>}
      </> : <p className="ds-note">正在读取…</p>}
    </div>

    <div className="ds-block">
      <div className="ds-kicker">品牌固定元素 · 必须存在</div>
      {design ? <ul className="ds-list">{design.brandSlots.map((slot) => <li key={slot.id}>
        <b>{slot.name}</b>{slot.required ? '（必需）' : '（可选）'} — {slot.description}
        {slot.hint ? <small> · {slot.hint}</small> : null}
      </li>)}</ul> : <p className="ds-note">正在读取…</p>}
    </div>

    <div className="ds-block">
      <div className="ds-kicker">选择指南 · 什么时候用哪个组件</div>
      {design ? <p className="ds-note">
        AI 通过 MCP 的 <code>list_components</code> / <code>get_design_system</code> 拿到的就是这些。
        缺了它只能靠猜——这也是当初"AI 选错组件"的根因。
      </p> : null}
      <div className="ds-guide">
        {COMPONENT_CATEGORIES.map((category) => {
          const items = (design?.catalog ?? []).filter((item) => item.category === category.id);
          if (!items.length) return null;
          return <details key={category.id}>
            <summary>{category.name} <em>{items.length}</em></summary>
            <ul>
              {items.map((item) => <li key={item.id}>
                <b>{item.name}{item.inWhitelist ? '' : '（白名单外）'}{item.lockedFields.length ? ' 🔒' : ''}</b>
                <small className="ds-when">用：{item.whenToUse ?? '（未声明）'}</small>
                <small className="ds-when-not">不用：{item.whenNotToUse ?? '—'}</small>
              </li>)}
            </ul>
          </details>;
        })}
      </div>
    </div>

    <div className="ds-block">
      <div className="ds-kicker">组合骨架 · 一篇的节奏</div>
      {design ? <ol className="ds-skeleton">{design.skeleton.map((step) => <li key={step}>{step}</li>)}</ol>
        : <p className="ds-note">正在读取…</p>}
      <p className="ds-note">
        AI 用 MCP 的 <code>new_article</code> 开篇时会放下这套骨架的起手块，
        用 <code>preview_article</code> 截图自查，用 <code>audit_article</code> 体检（error 必须为 0）。
      </p>
    </div>
  </div>;
}
