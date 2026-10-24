import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrateDocument } from '../shared/article';
import { defaultImageLibrary } from '../shared/images';
import { prepareExport, writeExport } from '../server/export';
import { stateFile } from '../server/store';

const { values } = parseArgs({ options: {
  input: { type: 'string', default: stateFile }, output: { type: 'string', default: 'outputs/article' },
  publication: { type: 'string' },
} });
try {
  const source = JSON.parse(await readFile(resolve(values.input!), 'utf8'));
  const publication = values.publication ? JSON.parse(await readFile(resolve(values.publication), 'utf8')) : {};
  const bundle = await prepareExport(migrateDocument(source.document ?? source), source.images ?? defaultImageLibrary(), publication);
  const files = await writeExport(resolve(values.output!), bundle);
  console.log(JSON.stringify({ ok: true, directory: resolve(values.output!), files, stats: bundle.stats, audit: { errors: bundle.audit.errors, warnings: bundle.audit.warnings } }, null, 2));
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
