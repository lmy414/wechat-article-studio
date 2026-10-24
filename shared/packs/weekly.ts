import type { ComponentDefinition, RenderContext } from '../components';
import { escapeHtml } from './base';

const text = (value = '') => escapeHtml(value).replaceAll('\n', '<br>');
const image = (ref: string, alt: string, ctx: RenderContext) => {
  const src = ctx.imageUrl(ref);
  return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:100% !important;height:auto !important;margin:0;">` : '';
};

/** 只用可编辑文本、内联样式和本地素材 id，不输出正文外链。 */
export const weeklyPack: ComponentDefinition[] = [
  {
    id: 'weekly.hero', name: '周刊刊头', category: 'head', summary: '期号、标题、时间范围和封面。全文使用一次。',
    fields: [
      { key: 'issue', label: '期号', kind: 'text' },
      { key: 'eyebrow', label: '栏目名称', kind: 'text' },
      { key: 'title', label: '主标题', kind: 'textarea' },
      { key: 'deck', label: '导语', kind: 'textarea' },
      { key: 'date', label: '发布日期', kind: 'text' },
      { key: 'period', label: '统计范围', kind: 'text' },
      { key: 'image', label: '封面图片', kind: 'image', optional: true },
    ],
    defaults: () => ({ issue: '001', eyebrow: 'WEEKLY / 本周作品集', title: '这一周，\n值得一读。', deck: '整理本周的作品与发现，把推荐理由和原始出处放在一起。', date: '2026.01.01', period: '本期时间范围', image: 'sample-cover' }),
    render: (p, { tokens: t, ...rest }) => {
      const ctx = { tokens: t, ...rest };
      return `<section style="padding:28px 24px 0;background:${t.white};box-sizing:border-box;">
        <p style="margin:0 0 22px;padding:0 0 12px;border-bottom:2px solid ${t.emphasis};color:${t.emphasis};font-size:12px;line-height:1.5;letter-spacing:2px;font-weight:700;">${text(p.eyebrow)}</p>
        <p style="margin:0 0 10px;color:${t.primary};font-size:13px;line-height:1.5;letter-spacing:2px;font-weight:700;">VOL. ${text(p.issue)} <span style="color:${t.end};"> / </span> ${text(p.date)}</p>
        <p style="margin:0 0 18px;color:${t.emphasis};font-size:48px;font-weight:700;line-height:1.2;letter-spacing:0px;">${text(p.title)}</p>
        <p style="margin:0 0 20px;color:${t.text};font-size:16px;line-height:1.8;letter-spacing:0.5px;">${text(p.deck)}</p>
        <p style="margin:0 0 18px;color:${t.muted};font-size:12px;line-height:1.7;letter-spacing:0.5px;">${text(p.period)}</p>
        ${image(p.image ?? '', p.title, ctx)}
      </section>`;
    },
  },
  {
    id: 'weekly.overview', name: '本期概览', category: 'head', summary: '数据概览与开篇手记，介绍这一期的范围。',
    fields: [
      { key: 'counts', label: '概览数字', kind: 'lines', help: '每行一个，建议三项。' },
      { key: 'title', label: '开篇标题', kind: 'text' },
      { key: 'text', label: '开篇手记', kind: 'textarea' },
    ],
    defaults: () => ({ counts: '3 部作品\n3 位创作者\n7 天记录', title: '每一份创作，都值得被看见', text: '这一期把不同类型的作品放进同一份片单。先在这里认识作品，再去原作认识创作者。' }),
    render: (p, { tokens: t }) => `<section style="padding:24px 24px 28px;box-sizing:border-box;">
      <section style="padding:16px 0;border-top:1px solid ${t.soft};border-bottom:1px solid ${t.soft};text-align:center;box-sizing:border-box;">${(p.counts ?? '').split('\n').map((line) => `<span style="display:inline-block;width:33%;padding:4px;color:${t.emphasis};font-size:14px;font-weight:700;line-height:1.7;box-sizing:border-box;">${text(line)}</span>`).join('')}</section>
      <p style="margin:24px 0 12px;color:${t.emphasis};font-size:20px;font-weight:700;line-height:1.5;letter-spacing:0.5px;">${text(p.title)}</p>
      <p style="margin:0;color:${t.text};font-size:16px;line-height:1.9;letter-spacing:0.5px;">${text(p.text)}</p>
    </section>`,
  },
  {
    id: 'weekly.section', name: '周刊分组标题', category: 'text', summary: '榜单或主题分组的标题与短说明。',
    fields: [
      { key: 'label', label: '分组标记', kind: 'text' },
      { key: 'title', label: '标题', kind: 'text' },
      { key: 'deck', label: '说明', kind: 'textarea', optional: true },
    ],
    defaults: () => ({ label: '01 / PICKS', title: '本期作品', deck: '依次认识这一期入选的创作者与作品。' }),
    render: (p, { tokens: t }) => `<section style="margin:8px 0 0;padding:24px;background:${t.soft};border-top:3px solid ${t.primary};box-sizing:border-box;">
      <p style="margin:0 0 8px;color:${t.primary};font-size:12px;font-weight:700;line-height:1.5;letter-spacing:2px;">${text(p.label)}</p>
      <p style="margin:0 0 10px;color:${t.emphasis};font-size:24px;font-weight:700;line-height:1.4;letter-spacing:0.5px;">${text(p.title)}</p>
      ${p.deck ? `<p style="margin:0;color:${t.text};font-size:14px;line-height:1.8;letter-spacing:0.5px;">${text(p.deck)}</p>` : ''}
    </section>`,
  },
  {
    id: 'weekly.work', name: '作品推荐卡', category: 'media', summary: '封面、作者、简评、指标和出处放在同一张卡片里。',
    fields: [
      { key: 'rank', label: '名次', kind: 'text' },
      { key: 'category', label: '类型', kind: 'text' },
      { key: 'title', label: '作品原名', kind: 'textarea' },
      { key: 'author', label: '创作者', kind: 'text' },
      { key: 'image', label: '作品封面', kind: 'image' },
      { key: 'summary', label: '作品介绍', kind: 'textarea' },
      { key: 'stats', label: '作品指标', kind: 'textarea' },
      { key: 'score', label: '综合得分', kind: 'text' },
      { key: 'bvid', label: '原作 BV 号', kind: 'text' },
      { key: 'published', label: '投稿日期', kind: 'text' },
      { key: 'timestamp', label: '周刊正片位置', kind: 'text' },
    ],
    defaults: () => ({ rank: '01', category: '作品', title: '一部值得停下来看的作品', author: '示例创作者', image: 'sample-cover', summary: '在这里写具体的作品介绍：发生了什么，有什么值得看。保留作者和原始出处。', stats: '播放 12,345 · 点赞 678\n投币 90 · 收藏 123', score: '1,234', bvid: 'BVxxxxxxxxxx', published: '2026.01.01', timestamp: '00:00' }),
    render: (p, ctx) => {
      const t = ctx.tokens;
      const top = Number(p.rank) <= 3;
      return `<section style="padding:26px 24px 28px;border-bottom:1px solid ${t.soft};background:${t.white};box-sizing:border-box;">
        <p style="margin:0 0 12px;color:${top ? t.primary : t.emphasis};font-size:28px;font-weight:700;line-height:1.3;letter-spacing:0px;">NO. ${text(p.rank)} <span style="display:inline-block;margin-left:10px;padding:3px 8px;color:${t.emphasis};background:${t.soft};font-size:12px;font-weight:400;line-height:1.5;letter-spacing:0.5px;vertical-align:middle;">${text(p.category)}</span></p>
        <p style="margin:0 0 10px;color:${t.emphasis};font-size:20px;font-weight:700;line-height:1.5;letter-spacing:0.5px;">${text(p.title)}</p>
        <p style="margin:0 0 16px;color:${t.muted};font-size:13px;line-height:1.7;letter-spacing:0.5px;">创作 / ${text(p.author)}</p>
        ${image(p.image ?? '', `${p.title}；作者：${p.author}`, ctx)}
        <p style="margin:16px 0 18px;color:${t.text};font-size:16px;line-height:1.9;letter-spacing:0.5px;">${text(p.summary)}</p>
        <section style="padding:13px 14px;background:${t.pale};border-left:2px solid ${top ? t.primary : t.end};box-sizing:border-box;">
          <p style="margin:0 0 6px;color:${t.text};font-size:12px;line-height:1.8;letter-spacing:0.5px;">${text(p.stats)}</p>
          <p style="margin:0;color:${t.emphasis};font-size:13px;font-weight:700;line-height:1.7;letter-spacing:0.5px;">综合得分 ${text(p.score)}</p>
        </section>
        <p style="margin:12px 0 0;color:${t.muted};font-size:12px;line-height:1.8;letter-spacing:0.5px;">B 站原作 / ${text(p.bvid)}<br>投稿 ${text(p.published)} · 周刊正片 ${text(p.timestamp)}</p>
      </section>`;
    },
  },
  {
    id: 'weekly.note', name: '周刊口径说明', category: 'closing', summary: '说明观察时间、计分规则和收录范围。',
    fields: [{ key: 'label', label: '说明标题', kind: 'text' }, { key: 'text', label: '说明正文', kind: 'textarea' }],
    defaults: () => ({ label: '关于这份片单', text: '数据为观察时点的快照。榜单范围以本期已核实的作品为准，不代表平台所有作品。' }),
    render: (p, { tokens: t }) => `<section style="margin:26px 24px 0;padding:18px;background:${t.pale};box-sizing:border-box;"><p style="margin:0 0 10px;color:${t.emphasis};font-size:14px;font-weight:700;line-height:1.6;letter-spacing:0.5px;">${text(p.label)}</p><p style="margin:0;color:${t.muted};font-size:12px;line-height:1.9;letter-spacing:0.5px;">${text(p.text)}</p></section>`,
  },
  {
    id: 'weekly.outro', name: '周刊收尾', category: 'closing', summary: '向创作者致意，并说明阅读原文提供的补充内容。',
    fields: [{ key: 'title', label: '收尾标题', kind: 'text' }, { key: 'text', label: '收尾正文', kind: 'textarea' }, { key: 'credit', label: '署名', kind: 'text' }],
    defaults: () => ({ title: '把掌声留给创作者', text: '本期原作入口和详细指标整理在同一期网页。可点击文末「阅读原文」查看。', credit: '本期编辑部' }),
    render: (p, { tokens: t }) => `<section style="padding:32px 24px 20px;box-sizing:border-box;"><p style="margin:0 0 12px;color:${t.emphasis};font-size:22px;font-weight:700;line-height:1.5;letter-spacing:0.5px;">${text(p.title)}</p><p style="margin:0 0 18px;color:${t.text};font-size:15px;line-height:1.9;letter-spacing:0.5px;">${text(p.text)}</p><p style="margin:0;color:${t.primary};font-size:12px;font-weight:700;line-height:1.7;letter-spacing:2px;">${text(p.credit)}</p></section>`,
  },
];
