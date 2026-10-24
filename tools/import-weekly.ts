import { parseArgs } from 'node:util';
import { basename, join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parseWeeklyIssue, weeklyDocument, type WeeklyCopy } from '../shared/weekly';
import { prepareExport, writeExport, type Publication } from '../server/export';

const { values } = parseArgs({ options: {
  issue: { type: 'string' }, assets: { type: 'string' }, output: { type: 'string', default: 'outputs/weekly' },
  config: { type: 'string' }, api: { type: 'string', default: process.env.EDITOR_API ?? 'http://127.0.0.1:8787' },
} });
const base = values.api!;
async function api(path: string, data?: unknown) {
  const response = await fetch(`${base}${path}`, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

try {
  if (!values.issue || !values.assets) throw new Error('用法：npm run import:weekly -- --issue issue.json --assets 图片目录 [--config config.json] [--output 导出目录]');
  const issue = parseWeeklyIssue(JSON.parse(await readFile(resolve(values.issue), 'utf8')));
  const copy: WeeklyCopy & Publication = values.config ? JSON.parse(await readFile(resolve(values.config), 'utf8')) : {};
  const directory = resolve(values.assets);
  // 同名 JPEG/PNG 可替代 WebP，便于为公众号准备素材。
  const picture = async (name: string) => {
    const stem = basename(name).replace(/\.[^.]+$/, '');
    for (const extension of ['.jpg', '.png', '.webp', '.jpeg', '.svg']) {
      const file = join(directory, stem + extension);
      try { await readFile(file); return file; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    throw new Error(`找不到本期图片：${stem}`);
  };
  const keys = ['cover', ...issue.works.map((work) => work.bvid)];
  const paths = [await picture(issue.cover)];
  for (const work of issue.works) paths.push(await picture(work.cover));
  const imported = await api('/api/library/import', { paths, labelPrefix: `${issue.number} · `, categoryId: 'covers' });
  const mapping = new Map<string, string>();
  for (const [index, path] of paths.entries()) {
    const found = imported.import.assets.find((asset: { source: string }) => resolve(asset.source) === path);
    if (found?.id) mapping.set(keys[index], found.id);
    else throw new Error(`导入图片后找不到素材 id：${basename(path)}`);
  }
  const state = await api('/api/editor/state');
  const document = weeklyDocument(issue, mapping, copy);
  const result = await api('/api/article/replace', { baseRevision: state.document.revision, document, source: 'human', summary: `排版本期周刊 ${issue.number}，保留 ${issue.works.length} 部原片单作品` });
  const publication: Publication = { title: document.title, author: copy.author, digest: copy.digest ?? issue.deck, readOriginal: copy.readOriginal };
  const bundle = await prepareExport(result.document, result.images, publication);
  const target = resolve(values.output!);
  const files = await writeExport(target, bundle);
  await writeFile(join(target, 'source-check.json'), JSON.stringify({ issueId: issue.id, works: issue.works.map((work) => ({ bvid: work.bvid, rank: work.rank, score: work.score, author: work.author })), note: '只保留公开核对字段；片单、顺序、名次与分数未改动。' }, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, directory: target, files, works: issue.works.length, revision: result.document.revision, stats: bundle.stats, audit: { errors: bundle.audit.errors, warnings: bundle.audit.warnings } }, null, 2));
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
