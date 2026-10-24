import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDefaultArticle, migrateDocument } from '../shared/article';
import { defaultImageLibrary } from '../shared/images';
import { exportPreview, prepareExport, writeExport } from '../server/export';

const temporary: string[] = [];
afterAll(async () => { for (const path of temporary) await rm(path, { recursive: true, force: true }); });

describe('便携导出', () => {
  it('输出内联图片和可再次导出的 JSON，移动目录后仍可读取', async () => {
    const first = await prepareExport(makeDefaultArticle(), defaultImageLibrary(), { readOriginal: 'https://example.com/issue/1' });
    expect(first.body).toContain('src="data:image/svg+xml;base64,');
    expect(first.body).not.toContain('src="/library/');
    expect(first.body).not.toContain('href=');
    expect(first.preview).toContain('复制到公众号');
    expect(first.snapshot.images[0].src.startsWith('data:')).toBe(true);
    const second = await prepareExport(migrateDocument(first.snapshot.document), first.snapshot.images);
    expect(second.body).toBe(first.body);
    const directory = await mkdtemp(join(tmpdir(), 'article-export-'));
    temporary.push(directory);
    const names = await writeExport(directory, first);
    expect(names).toContain('preview.html');
    expect(JSON.parse(await readFile(join(directory, 'audit.json'), 'utf8')).errors).toBe(0);
  });

  it('缺失图片时中止导出，避免交付碎图', async () => {
    const images = defaultImageLibrary().map((asset) => ({ ...asset, src: '/library/sample/missing.png' }));
    await expect(prepareExport(makeDefaultArticle(), images)).rejects.toThrow('图片内联失败');
  });

  it('复制按钮脚本不会被文章或标题中的闭合标签打断', () => {
    const page = exportPreview('<p>&lt;/script&gt;</p>', 430, { title: '</title><script>unsafe()</script>' });
    expect(page).toContain('&lt;/title&gt;');
    expect(page).not.toContain('<script>unsafe()');
    expect(page).toContain('\\u003cp');
  });
});
