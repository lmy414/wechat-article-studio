import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { migrateDocument } from '../shared/article';
import { defaultImageLibrary } from '../shared/images';
import { describePreview, previewArticle } from '../server/preview';
import { stateFile } from '../server/store';

const { values } = parseArgs({ options: {
  input: { type: 'string', default: stateFile }, output: { type: 'string', default: 'outputs/article.png' },
  scale: { type: 'string', default: '1' },
} });
try {
  const source = JSON.parse(await readFile(resolve(values.input!), 'utf8'));
  const result = await previewArticle(migrateDocument(source.document ?? source), source.images ?? defaultImageLibrary(), { mode: 'miniprogram-safe', scale: Number(values.scale), save: false });
  const target = resolve(values.output!);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, result.png);
  console.log(JSON.stringify({ ok: true, output: target, ...describePreview(result) }, null, 2));
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
