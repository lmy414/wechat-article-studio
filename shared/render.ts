/**
 * 渲染器：注册表驱动。
 *
 * 每个组件自己知道怎么把自己渲染成微信能接收的 HTML，渲染器只负责：
 * 组织页头/关注横幅/相关文章/品牌页脚的模板外壳、解析图片库引用、收集警告与统计。
 *
 * 两种模式都产出可发布的内容，区别只在装饰强度（见 packs/base.ts 顶部说明）。
 */

import { getComponent, type RenderContext, type RenderMode } from './components';
import { getTemplate } from './design';
import { imageIndex, resolveImageRef, type ImageAsset } from './images';
import type { ArticleBlock, ArticleDocument, RenderWarning, RenderedArticle } from './article';
import './packs';

export const EDITOR_MARKER = 'data-editor-block';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 给组件渲染出的根节点打上编辑器标记，这样点预览就能选中对应内容块。 */
function markBlock(html: string, blockId: string): string {
  const match = html.match(/^(\s*<)([a-zA-Z][a-zA-Z0-9-]*)/);
  if (!match) return html;
  return `${match[1]}${match[2]} ${EDITOR_MARKER}="${escapeHtml(blockId)}"${html.slice(match[0].length)}`;
}

export function cleanRenderedHtml(html: string): string {
  return html.replace(new RegExp(`\\s${EDITOR_MARKER}="[^"]*"`, 'g'), '');
}

function renderBlock(block: ArticleBlock, ctx: RenderContext, warnings: RenderWarning[]): string {
  const definition = getComponent(block.componentId);
  if (!definition) {
    warnings.push({ code: 'unknown-component', message: `未知组件 ${block.componentId}，已跳过。`, blockId: block.id, severity: 'error' });
    return '';
  }
  const missing = definition.fields
    .filter((field) => field.kind !== 'image' && !(block.props[field.key] ?? '').trim())
    .map((field) => field.label);
  if (missing.length) {
    warnings.push({ code: 'empty-field', message: `「${definition.name}」还有未填写字段：${missing.join('、')}`, blockId: block.id, severity: 'info' });
  }
  try {
    return markBlock(definition.render(block.props, ctx), block.id);
  } catch (error) {
    warnings.push({ code: 'render-failed', message: `「${definition.name}」渲染失败：${String(error)}`, blockId: block.id, severity: 'error' });
    return '';
  }
}

function renderHeader(document: ArticleDocument, mode: RenderMode, tokens: ReturnType<typeof getTemplate>['tokens']): string {
  if (document.settings.showTitle === false) return '';
  if (mode === 'miniprogram-safe') {
    return `<p style="margin:0;padding:22px 20px 0;color:#1f2f3b;text-align:center;font-size:22px;font-weight:700;line-height:1.5;letter-spacing:1px;">${escapeHtml(document.title)}</p><p style="margin:9px 20px 20px;color:${tokens.muted};text-align:center;font-size:13px;line-height:1.7;letter-spacing:.5px;">${escapeHtml(document.subtitle)}</p>`;
  }
  return `<section style="padding:25px 22px 0;box-sizing:border-box;"><p style="margin:0 0 10px;text-align:center;color:${tokens.primary};font-size:12px;letter-spacing:2px;font-weight:700;">${escapeHtml(document.title ? '正文' : '')}</p><h1 style="margin:0;text-align:center;color:#1f2f3b;font-size:23px;line-height:1.48;letter-spacing:.5px;">${escapeHtml(document.title)}</h1><p style="margin:10px 0 24px;text-align:center;color:${tokens.muted};font-size:13px;line-height:1.65;letter-spacing:.5px;">${escapeHtml(document.subtitle)}</p></section>`;
}

function renderRelated(document: ArticleDocument, mode: RenderMode, tokens: ReturnType<typeof getTemplate>['tokens'], ctx: RenderContext): string {
  if (!document.settings.showRelated || !document.related.length) return '';
  const items = document.related.map((item) => ({ ...item, src: ctx.imageUrl(item.image) }));
  if (mode === 'miniprogram-safe') {
    return `<p style="margin:0;padding:20px;color:${tokens.primary};background:${tokens.footer};font-size:15px;font-weight:700;line-height:1.5;letter-spacing:1px;">相关文章</p>${items
      .map((item) => `<p style="margin:0;padding:13px 20px;color:#504e52;background:${tokens.footer};border-bottom:1px solid #d9e3ea;font-size:14px;line-height:1.75;letter-spacing:1px;">👉 ${escapeHtml(item.title)}${item.src ? `<img src="${escapeHtml(item.src)}" alt="相关文章缩略图" style="display:block;width:100%;height:auto !important;margin:8px 0 0;">` : ''}</p>`)
      .join('')}`;
  }
  return `<section style="margin:0;padding:20px;background:${tokens.footer};box-sizing:border-box;"><section style="padding:4px 12px;background:#fff;box-sizing:border-box;"><h2 style="margin:8px 0 4px;color:${tokens.primary};font-size:15px;letter-spacing:1px;">相关文章</h2>${items
    .map((item) => `<section style="display:flex;justify-content:space-between;align-items:center;gap:5%;padding:13px 0;background-image:linear-gradient(to right,#99b9cf 0,#99b9cf 4px,transparent 4px,transparent 7px);background-size:7px 1px;background-repeat:repeat-x;background-position:left bottom;box-sizing:border-box;"><p style="margin:0;width:60%;color:#504e52;font-size:14px;line-height:1.75;letter-spacing:1px;">👉 ${escapeHtml(item.title)}</p>${item.src ? `<img src="${escapeHtml(item.src)}" alt="相关文章缩略图" style="width:35%;height:auto !important;border-radius:3px;">` : ''}</section>`)
    .join('')}</section></section>`;
}

export interface RenderOptions {
  mode: RenderMode;
  /** 图片库。组件里的图片引用靠它解析成地址。 */
  images?: ImageAsset[];
}

export function renderArticle(document: ArticleDocument, options: RenderMode | RenderOptions): RenderedArticle {
  const opts: RenderOptions = typeof options === 'string' ? { mode: options } : options;
  const mode = opts.mode;
  const template = getTemplate(document.templateId);
  const tokens = template.tokens;
  const index = imageIndex(opts.images ?? []);
  const ctx: RenderContext = { mode, tokens, imageUrl: (ref) => resolveImageRef(ref, index) };
  const warnings: RenderWarning[] = [];

  if (document.settings.showFollowBanner) {
    warnings.push({ code: 'missing-follow-asset', message: '关注横幅使用占位样式，原始微信 CDN 素材尚未本地化。', severity: 'warning' });
  }
  if (document.settings.showBrandFooter) {
    warnings.push({ code: 'missing-brand-asset', message: '品牌页脚使用占位样式，原始微信 CDN 素材尚未本地化。', severity: 'warning' });
  }

  const body = document.blocks.map((block) => renderBlock(block, ctx, warnings)).join('');

  const follow = document.settings.showFollowBanner
    ? mode === 'miniprogram-safe'
      ? `<p style="margin:0;padding:13px 18px;color:#fff;background:${tokens.primary};text-align:center;font-size:13px;line-height:1.6;letter-spacing:1px;"><strong>关注公众号 · 获取内容更新</strong><br>关注横幅占位样式</p>`
      : `<section style="min-height:59px;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;color:#fff;background:linear-gradient(110deg,#005795,${tokens.primary} 55%,#1788cf);letter-spacing:.8px;box-sizing:border-box;"><strong style="font-size:17px;letter-spacing:1.5px;">关注公众号</strong><span style="font-size:12px;opacity:.9;">关注横幅占位样式</span></section>`
    : '';

  const footer = document.settings.showBrandFooter
    ? `<p style="margin:0;padding:30px 22px;color:#fff;background:${tokens.primary};text-align:center;font-size:13px;line-height:1.8;letter-spacing:1px;"><strong style="font-size:17px;letter-spacing:2px;">${escapeHtml(document.brandFooter)}</strong></p>`
    : '';

  const page = mode === 'miniprogram-safe'
    ? `<section style="box-sizing:border-box;">${follow}${renderHeader(document, mode, tokens)}${body}${renderRelated(document, mode, tokens, ctx)}${footer}</section>`
    : `<section style="max-width:430px;margin:0 auto;background:#fff;color:${tokens.text};box-sizing:border-box;">${follow}${renderHeader(document, mode, tokens)}${body}${renderRelated(document, mode, tokens, ctx)}${footer}</section>`;

  const textCharacters = document.title.length + document.subtitle.length + document.blocks.reduce((sum, block) => sum + Object.values(block.props).join('').length, 0);
  const exportHtml = cleanRenderedHtml(page);
  return {
    html: page,
    exportHtml,
    warnings,
    stats: {
      blockCount: document.blocks.length,
      imageCount: document.blocks.filter((block) => getComponent(block.componentId)?.fields.some((field) => field.kind === 'image')).length,
      textCharacters,
      htmlCharacters: exportHtml.length,
    },
  };
}
