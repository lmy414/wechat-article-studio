import { z } from 'zod';
import { makeBlock, type ArticleDocument } from './article';
import { makeArticleFor } from './design-system';

const count = z.number().int().nonnegative();
const workSchema = z.object({
  bvid: z.string().regex(/^BV[0-9A-Za-z]{10}$/), rank: z.number().int().positive(), score: count,
  title: z.string().min(1), author: z.string().min(1), category: z.string().min(1), summary: z.string().min(1),
  published_date: z.string().min(1), observed_at: z.string().min(1), timestamp: z.string().min(1), cover: z.string().min(1),
  metrics: z.object({ view: count, like: count, coin: count, favorite: count }),
});
const issueSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), number: z.string().min(1), title: z.string().min(1),
  label: z.string().min(1), date: z.string().min(1), period_label: z.string().min(1),
  metric_basis: z.enum(['cumulative', 'delta']), basis_label: z.string().min(1),
  deck: z.string().min(1), intro: z.string().min(1), authors: z.number().int().positive(),
  cover: z.string().min(1), works: z.array(workSchema).min(1),
});

export type WeeklyIssue = z.infer<typeof issueSchema>;
export interface WeeklyCopy {
  title?: string;
  heroTitle?: string;
  eyebrow?: string;
  overviewTitle?: string;
  author?: string;
}

/** 只读取公开介绍和指标，不读取分析、转写、凭据或原始视频字段。 */
export function parseWeeklyIssue(raw: unknown): WeeklyIssue {
  const issue = issueSchema.parse(raw);
  const identifiers = new Set<string>();
  for (const [index, work] of issue.works.entries()) {
    if (work.rank !== index + 1) throw new Error('名次必须按原片单从 1 连续排列；工具不会重新排名');
    if (identifiers.has(work.bvid)) throw new Error(`片单存在重复 BV 号：${work.bvid}`);
    if (index > 0 && work.score > issue.works[index - 1].score) throw new Error('得分顺序与名次不一致');
    identifiers.add(work.bvid);
  }
  if (new Set(issue.works.map((work) => work.author)).size !== issue.authors) throw new Error('创作者数量与片单不一致');
  return issue;
}

const number = (value: number) => value.toLocaleString('en-US');

export function weeklyDocument(
  issue: WeeklyIssue,
  assets: Map<string, string>,
  copy: WeeklyCopy = {},
): ArticleDocument {
  for (const key of ['cover', ...issue.works.map((work) => work.bvid)]) {
    if (!assets.has(key)) throw new Error(`缺少封面素材：${key}`);
  }
  const article = makeArticleFor('weekly', copy.title ?? issue.title, `${issue.label} · ${issue.period_label}`, issue.id);
  const scope = issue.metric_basis === 'cumulative'
    ? '创刊期使用观察时点的累计指标计分，不是近 28 天的播放增量排名。'
    : '本期使用各指标在统计周期内的净增量计分。';
  article.blocks = [
    makeBlock('weekly.hero', {
      issue: issue.number, eyebrow: copy.eyebrow ?? 'WEEKLY / 作品放映室',
      title: copy.heroTitle ?? issue.title, deck: issue.deck, date: issue.date,
      period: `收录范围 ${issue.period_label} · ${issue.basis_label}`, image: assets.get('cover')!,
    }),
    makeBlock('weekly.overview', {
      counts: `${issue.works.length} 部作品\n${issue.authors} 位创作者\n${issue.basis_label}`,
      title: copy.overviewTitle ?? '每一份创作，都值得被看见', text: issue.intro,
    }),
  ];
  for (const work of issue.works) {
    if (work.rank === 1) article.blocks.push(makeBlock('weekly.section', {
      label: '01 / TOP THREE', title: '先看本期前三名', deck: '按本期综合得分排列，先从前三部作品开始。',
    }));
    if (work.rank === 4) article.blocks.push(makeBlock('weekly.section', {
      label: '02 / MORE TO DISCOVER', title: '继续发现更多创作', deck: '剧情、音乐、动画与整活，往下还有更多值得停留的片段。',
    }));
    article.blocks.push(makeBlock('weekly.work', {
      rank: String(work.rank).padStart(2, '0'), category: work.category, title: work.title, author: work.author,
      image: assets.get(work.bvid)!, summary: work.summary,
      stats: `播放 ${number(work.metrics.view)} · 点赞 ${number(work.metrics.like)}\n投币 ${number(work.metrics.coin)} · 收藏 ${number(work.metrics.favorite)}`,
      score: number(work.score), bvid: work.bvid, published: work.published_date, timestamp: work.timestamp,
    }));
  }
  const observed = [...new Set(issue.works.map((work) => work.observed_at.slice(0, 10)))].join('、');
  article.blocks.push(
    makeBlock('weekly.note', { label: '这份片单如何阅读', text: `${scope}\n数据观测日期：${observed}（北京时间）；指标会随时间变化。\n综合得分并非播放量，点赞仅作为展示指标。详细公式和观测时间见当期网页。\n收录范围为本期已发现并经主题复核的 AI 拟人二创作品，不宣称覆盖全站。` }),
    makeBlock('weekly.outro', { title: '把掌声留给创作者', text: '本期作品的原作入口、详细指标与节目时间，已整理在同一期周刊网页。可点击文末「阅读原文」查看。\n作品与配图归原创作者所有，本刊保留作者与 BV 号，方便你查找原作。', credit: copy.author ?? '本期编辑部' }),
    makeBlock('base.divider', { label: 'END / 下期再见' }),
  );
  return article;
}
