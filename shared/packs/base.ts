/**
 * 基础组件包：与具体品牌无关的通用件。
 *
 * 两种渲染模式都产出微信可接收的 HTML，区别只在装饰强度，不是"能不能用"的区别：
 * - `miniprogram-safe`：最保守子集，只用 p / ul / img / blockquote 与内联样式，不碰 flex、渐变、负边距；
 * - `high-fidelity`：允许 flex、渐变、圆角、阴影、负边距——这些在已发布的公众号文章里都验证过能存活。
 */

import type { ComponentDefinition, RenderContext } from '../components';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 把用户指定要强调的短语包成品牌色加粗。先转义再替换，避免短语里的特殊字符破坏 HTML。 */
function emphasize(safeText: string, emphasis: string, color: string): string {
  const phrases = emphasis.split('\n').map((line) => line.trim()).filter(Boolean);
  return phrases.reduce(
    (output, phrase) => output.replaceAll(escapeHtml(phrase), `<strong style="color:${color};font-weight:700;">${escapeHtml(phrase)}</strong>`),
    safeText,
  );
}

function bodyText(text: string, emphasis: string, ctx: RenderContext): string {
  return emphasize(escapeHtml(text), emphasis, ctx.tokens.emphasis);
}

function lines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function imageTag(src: string, alt: string, style: string): string {
  if (!src) return `<p style="margin:0 0 12px;padding:14px;color:#9a8b5f;background:#fff8e6;border:1px dashed #e0cf9a;font-size:12px;line-height:1.7;">图片待补：${escapeHtml(alt || '未选择素材')}</p>`;
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="${style}">`;
}

export const basePack: ComponentDefinition[] = [
  {
    id: 'base.intro',
    name: '导语',
    category: 'head',
    summary: '文章开头的导语，浅色底 + 细描边框住整段，用于交代背景或摘要。',
    fields: [
      { key: 'label', label: '导语标签', kind: 'text', help: '高保真模式下显示在导语上方，留空则不显示。' },
      { key: 'text', label: '导语正文', kind: 'textarea', help: '空行分段；不空行则每行一段。' },
    ],
    defaults: () => ({ label: '导语', text: '在这里写导语。' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const chunks = (props.text ?? '').split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
      const paragraphs = chunks.length > 1 ? chunks : (props.text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
      const body = paragraphs.map((line) => escapeHtml(line)).join('');
      if (ctx.mode === 'miniprogram-safe') {
        return paragraphs
          .map((line) => `<p style="margin:0 20px 22px;padding:14px;color:${t.text};background-color:${t.soft};border:1px solid ${t.primary};font-size:15px;line-height:1.75;letter-spacing:1px;text-align:justify;box-sizing:border-box;">${escapeHtml(line)}</p>`)
          .join('');
      }
      const label = escapeHtml(props.label ?? '');
      const head = label
        ? `<section style="display:flex;align-items:center;gap:10px;margin-bottom:13px;color:${t.primary};box-sizing:border-box;"><span style="width:34px;height:5px;border-radius:9px;background:${t.primary};"></span><strong style="font-size:14px;letter-spacing:1px;">${label}</strong></section>`
        : '';
      return `<section style="margin:0 0 25px;padding:4px;background:${t.primary};border-radius:0 15px 0 15px;box-sizing:border-box;"><section style="margin:-7px 3px 3px -7px;padding:20px 17px 16px;background:#fff;border:1px solid ${t.primary};border-radius:0 15px 0 15px;box-sizing:border-box;">${head}<p style="margin:0;text-align:justify;color:${t.text};font-size:15px;line-height:2;letter-spacing:1px;">${body}</p></section></section>`;
    },
  },
  {
    id: 'base.section',
    name: '章节标题',
    category: 'text',
    summary: '分隔长文的小标题，蓝色胶囊样式，用于开启新的一节。',
    fields: [
      { key: 'title', label: '章节标题', kind: 'text' },
    ],
    defaults: () => ({ title: '新的章节' }),
    render: (props, ctx) => {
      const title = escapeHtml(props.title ?? '');
      const t = ctx.tokens;
      if (ctx.mode === 'miniprogram-safe') {
        return `<p style="margin:25px 20px 15px;padding:8px 16px;color:${t.white};background-color:${t.primary};border-radius:0 15px 15px 0;font-size:16px;font-weight:700;line-height:1.5;letter-spacing:1px;text-align:center;box-sizing:border-box;">${title}</p>`;
      }
      return `<section style="display:flex;align-items:center;gap:12px;margin:30px 0 18px;box-sizing:border-box;"><span style="flex:0 0 auto;padding:7px 18px;color:${t.white};background:${t.primary};border-radius:0 15px 15px 0;font-size:16px;font-weight:700;letter-spacing:1px;">${title}</span><span style="height:2px;flex:1;background:linear-gradient(90deg,${t.primary},${withAlpha(t.primary, 0)});"></span></section>`;
    },
  },
  {
    id: 'base.paragraph',
    name: '正文段落',
    category: 'text',
    summary: '最常用的正文段落，15px、行高 2、字距 1px，可指定要强调的短语。',
    fields: [
      { key: 'text', label: '正文', kind: 'textarea' },
      { key: 'emphasis', label: '强调短语', kind: 'lines', optional: true, help: '每行一个，命中的短语会变成品牌色加粗。留空表示不强调。' },
    ],
    defaults: () => ({ text: '在这里写正文。排版规范已经内置，只需要写内容。', emphasis: '' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const body = bodyText(props.text ?? '', props.emphasis ?? '', ctx);
      const style = ctx.mode === 'miniprogram-safe'
        ? `margin:0 20px 15px;color:${t.text};font-size:15px;line-height:2;letter-spacing:1px;text-align:justify;box-sizing:border-box;`
        : `margin:0 0 15px;color:${t.text};font-size:15px;line-height:2;letter-spacing:1px;text-align:justify;`;
      return `<p style="${style}">${body}</p>`;
    },
  },
  {
    id: 'base.image',
    name: '图片',
    category: 'media',
    summary: '整幅配图，带居中的灰色说明文字，从图片库选素材。',
    fields: [
      { key: 'src', label: '图片素材', kind: 'image' },
      { key: 'alt', label: '替代文本', kind: 'text', help: '给读屏和图片加载失败时用，也帮助 AI 理解图片内容。' },
      { key: 'caption', label: '图片说明', kind: 'textarea', optional: true, help: '不写就不显示说明文字。' },
    ],
    defaults: () => ({ src: 'sample-cover', alt: '示例插画', caption: '图片说明' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const src = ctx.imageUrl(props.src ?? '');
      const alt = props.alt ?? '';
      const caption = escapeHtml(props.caption ?? '');
      if (ctx.mode === 'miniprogram-safe') {
        return `${imageTag(src, alt, 'display:block;width:calc(100% - 40px);max-width:100% !important;height:auto !important;margin:17px 20px 8px;border-radius:7px;box-sizing:border-box;')}<p style="margin:0 20px 20px;color:${t.muted};font-size:12px;line-height:1.6;text-align:center;">${caption}</p>`;
      }
      return `<section style="margin:18px 0 23px;padding:9px;background:${t.pale};border-radius:10px;box-sizing:border-box;">${imageTag(src, alt, 'display:block;width:100%;height:auto !important;border-radius:7px;')}<p style="margin:9px 4px 1px;color:${t.muted};text-align:center;font-size:12px;line-height:1.6;">${caption}</p></section>`;
    },
  },
  {
    id: 'base.list',
    name: '参数列表',
    category: 'text',
    summary: '罗列技术参数或要点，第一项作为标题加粗显示。',
    fields: [
      { key: 'title', label: '列表标题', kind: 'text' },
      { key: 'items', label: '列表项', kind: 'lines', help: '每行一条。' },
    ],
    defaults: () => ({ title: '参数信息', items: '参数一\n参数二' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const title = escapeHtml(props.title ?? '');
      const items = lines(props.items ?? '').map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      if (ctx.mode === 'miniprogram-safe') {
        return `<ul style="margin:16px 20px 21px;padding:14px 14px 10px 31px;color:${t.text};border:1px solid ${t.primary};font-size:15px;line-height:1.85;letter-spacing:.7px;box-sizing:border-box;"><li style="list-style-position:outside;"><strong style="color:${t.emphasis};">${title}</strong></li>${items}</ul>`;
      }
      return `<section style="margin:18px 0 22px;padding:18px 17px 14px;border:1px solid ${t.emphasis};background:#fff;box-sizing:border-box;"><h3 style="margin:0 0 12px;color:${t.emphasis};font-size:16px;letter-spacing:1px;">${title}</h3><ul style="margin:0;padding-left:25px;color:${t.text};font-size:15px;line-height:1.85;letter-spacing:.8px;">${items}</ul></section>`;
    },
  },
  {
    id: 'base.callout',
    name: '信息卡',
    category: 'emphasis',
    summary: '浅蓝底 + 左侧粗边，承载关键结论和核心卖点。',
    fields: [
      { key: 'title', label: '卡片标题', kind: 'text' },
      { key: 'text', label: '卡片内容', kind: 'textarea' },
    ],
    defaults: () => ({ title: '重点信息。', text: '补充说明。' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const title = escapeHtml(props.title ?? '');
      const text = escapeHtml(props.text ?? '');
      if (ctx.mode === 'miniprogram-safe') {
        return `<p style="margin:18px 20px;padding:13px 14px;color:${t.emphasis};background-color:${t.soft};border-left:4px solid ${t.primary};font-size:15px;line-height:1.9;letter-spacing:1px;box-sizing:border-box;"><strong>${title}</strong>${text}</p>`;
      }
      return `<section style="margin:20px 0;padding:16px 17px;color:${t.emphasis};background:${t.soft};border-left:5px solid ${t.primary};font-size:15px;line-height:1.9;letter-spacing:1px;box-sizing:border-box;"><strong>${title}</strong>${text}</section>`;
    },
  },
  {
    id: 'base.quote',
    name: '引用块',
    category: 'quote',
    summary: '左侧细蓝线 + 浅底，用于客户原话、专家观点或模板说明。',
    fields: [
      { key: 'text', label: '引用内容', kind: 'textarea' },
      { key: 'author', label: '署名', kind: 'text', help: '留空则不显示署名。' },
    ],
    defaults: () => ({ text: '引用内容。', author: '' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const text = escapeHtml(props.text ?? '');
      const author = props.author ? ` —— ${escapeHtml(props.author)}` : '';
      if (ctx.mode === 'miniprogram-safe') {
        return `<p style="margin:17px 20px;padding:11px 13px;color:#40515f;background-color:${t.pale};border-left:2px solid ${t.primary};font-size:14px;line-height:2;letter-spacing:.8px;box-sizing:border-box;">${text}${author}</p>`;
      }
      return `<blockquote style="margin:20px 0;padding:13px 16px 13px 25px;background:#fbfdff;border-left:2px solid ${t.primary};color:#40515f;font-size:14px;line-height:2;letter-spacing:.8px;box-sizing:border-box;">“ ${text}${author}</blockquote>`;
    },
  },
  {
    id: 'base.note',
    name: '说明区块',
    category: 'closing',
    summary: '上下细线夹住的固定说明区，例如企业介绍、免责声明。',
    fields: [
      { key: 'title', label: '标题', kind: 'text' },
      { key: 'text', label: '内容', kind: 'textarea' },
    ],
    defaults: () => ({ title: '说明', text: '固定说明内容。' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const title = escapeHtml(props.title ?? '');
      const text = escapeHtml(props.text ?? '');
      if (ctx.mode === 'miniprogram-safe') {
        return `<p style="margin:24px 20px 20px;padding:14px 0;color:${t.text};border-top:1px solid ${t.emphasis};border-bottom:1px solid ${t.emphasis};font-size:13px;line-height:1.85;letter-spacing:.5px;box-sizing:border-box;"><strong style="display:block;margin:0 0 7px;color:${t.emphasis};font-size:16px;line-height:1.5;letter-spacing:1px;">${title}</strong>${text}</p>`;
      }
      return `<section style="margin:28px 0 23px;padding:16px 0;border-top:1px solid ${t.emphasis};border-bottom:1px solid ${t.emphasis};box-sizing:border-box;"><strong style="display:block;margin-bottom:8px;color:${t.emphasis};font-size:16px;letter-spacing:1px;">${title}</strong><p style="margin:0;color:${t.text};font-size:13px;line-height:1.85;letter-spacing:.5px;">${text}</p></section>`;
    },
  },
  {
    id: 'base.divider',
    name: 'END 收尾',
    category: 'closing',
    summary: '文章结束标记，文字下面压一小块品牌色块。',
    fields: [
      { key: 'label', label: '收尾文字', kind: 'text' },
    ],
    defaults: () => ({ label: 'END' }),
    render: (props, ctx) => {
      const t = ctx.tokens;
      const label = escapeHtml(props.label ?? '');
      if (ctx.mode === 'miniprogram-safe') {
        return `<p style="margin:0;padding:11px 0 20px;color:${t.end};text-align:center;font-size:16px;font-weight:700;line-height:1.5;letter-spacing:3px;">${label}</p><p style="width:30px;height:10px;margin:-22px auto 18px;background-color:${t.soft};"></p>`;
      }
      return `<section style="padding:10px 0 22px;text-align:center;color:${t.end};font-size:16px;font-weight:700;letter-spacing:3px;box-sizing:border-box;">${label}<span style="display:block;width:30px;height:10px;margin:-7px auto 0;background:${t.soft};"></span></section>`;
    },
  },
];
