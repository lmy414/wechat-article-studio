import { describe, expect, it } from 'vitest';
import { parseWeeklyIssue, weeklyDocument } from '../shared/weekly';
import { auditArticle } from '../shared/audit';
import { defaultImageLibrary } from '../shared/images';
import sample from '../examples/weekly-issue.json';

const mapping = () => new Map(['cover', ...sample.works.map((work) => work.bvid)].map((id) => [id, 'sample-cover']));

describe('周刊导入', () => {
  it('完整保留片单顺序、原名、作者、BV 号与分数', () => {
    const issue = parseWeeklyIssue(sample);
    const document = weeklyDocument(issue, mapping());
    const cards = document.blocks.filter((block) => block.componentId === 'weekly.work');
    expect(cards).toHaveLength(issue.works.length);
    for (const [index, card] of cards.entries()) {
      const work = issue.works[index];
      expect(card.props).toMatchObject({ rank: String(work.rank).padStart(2, '0'), title: work.title, author: work.author, bvid: work.bvid, score: work.score.toLocaleString('en-US') });
    }
    expect(auditArticle(document, defaultImageLibrary()).errors).toBe(0);
  });

  it('只读取公开字段，不把内部分析带入文章', () => {
    const raw = { ...sample, privateAnalysis: 'internal-only', works: sample.works.map((work) => ({ ...work, transcript: 'internal-only', apiKey: 'not-a-real-key' })) };
    const issue = parseWeeklyIssue(raw);
    expect(JSON.stringify(issue)).not.toContain('internal-only');
    expect(JSON.stringify(weeklyDocument(issue, mapping()))).not.toContain('internal-only');
  });

  it('保留累计口径的提示，避免被理解成周期增量榜', () => {
    const document = weeklyDocument(parseWeeklyIssue(sample), mapping());
    expect(document.blocks.find((block) => block.componentId === 'weekly.note')!.props.text).toContain('累计指标');
  });

  it('拒绝缺图，不用其他作品图片补位', () => {
    expect(() => weeklyDocument(parseWeeklyIssue(sample), new Map())).toThrow('缺少封面素材');
  });

  it.each(['rank', 'score', 'duplicate', 'authors'])('拒绝不一致的 %s 数据', (kind) => {
    const raw = structuredClone(sample);
    if (kind === 'rank') raw.works[1].rank = 4;
    if (kind === 'score') raw.works[1].score = 999999;
    if (kind === 'duplicate') raw.works[1].bvid = raw.works[0].bvid;
    if (kind === 'authors') raw.authors = 8;
    expect(() => parseWeeklyIssue(raw)).toThrow();
  });
});
