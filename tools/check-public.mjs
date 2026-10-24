import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const excluded = new Set(['.git', '.private', 'node_modules', 'dist', 'data', 'outputs']);
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    const name = relative(root, path).replaceAll('\\', '/');
    if (excluded.has(entry.name) || name.startsWith('web/public/library/uploads/')) return [];
    return entry.isDirectory() ? walk(path) : [name];
  });
}
let files;
try {
  files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  if (!files.length) files = walk(root);
} catch { files = walk(root); }
const failures = [];
for (const path of files) {
  if (/^(?:\.private|data|outputs|node_modules|dist)\//.test(path) || path.startsWith('web/public/library/uploads/')) failures.push(`${path}: runtime-or-private-file`);
  if (!/\.(?:ts|tsx|mjs|json|md|html|yml|yaml|txt)$/.test(path)) continue;
  const content = readFileSync(join(root, path), 'utf8');
  const patterns = [
    ['credential', /(?:ghp_|github_pat_)[A-Za-z0-9_]{25,}/],
    ['credential', /sk-[A-Za-z0-9_-]{24,}/],
    ['private-key', /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/],
    ['local-customer-path', /[A-Z]:[\\/](?:SEO|M_Workbench)[\\/]/i],
  ];
  for (const [code, expression] of patterns) if (expression.test(content)) failures.push(`${path}: ${code}`);
}
for (const required of ['README.md', 'LICENSE', 'package-lock.json', 'docs/WECHAT-CONSTRAINTS.md']) {
  if (!existsSync(join(root, required))) failures.push(`${required}: missing`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Public-source check passed: ${files.length} files; runtime content excluded.`);
