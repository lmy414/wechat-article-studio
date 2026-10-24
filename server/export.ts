import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auditArticle } from '../shared/audit';
import type { ArticleDocument } from '../shared/article';
import type { ImageAsset } from '../shared/images';
import type { RenderMode } from '../shared/components';
import { escapeHtml } from '../shared/packs/base';
import { renderArticle } from '../shared/render';
import { inlineImagesForRender } from './preview';

export interface Publication {
  title?: string;
  author?: string;
  digest?: string;
  readOriginal?: string;
}

export function exportPreview(body: string, width: number, publication: Publication): string {
  const literal = JSON.stringify(body).replaceAll('<', '\\u003c');
  const title = escapeHtml(publication.title ?? '公众号图文预览');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>*{box-sizing:border-box}html{background:#edf0f4}body{margin:0;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;color:#162745}.toolbar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 22px;background:#ffffffed;border-bottom:1px solid #dde3eb;backdrop-filter:blur(10px)}.toolbar span{font-size:13px}.toolbar button{border:0;background:#2563eb;color:#fff;padding:11px 18px;cursor:pointer;font:inherit;font-size:14px;border-radius:5px}.article{width:100%;max-width:${width}px;margin:28px auto;background:#fff;box-shadow:0 8px 36px #16274512}.article *{max-width:100%!important;box-sizing:border-box!important;overflow-wrap:break-word!important}.article img{height:auto!important}.instructions{max-width:680px;margin:24px auto;padding:20px;background:#fff;font-size:13px;line-height:1.9;overflow-wrap:anywhere}.instructions p{margin:5px 0}.instructions a{color:#2563eb}@media(max-width:540px){.article{margin:0 auto;box-shadow:none}.toolbar{padding:10px 14px}.toolbar span{max-width:50%}.instructions{margin:0 auto}}</style></head><body>
<div class="toolbar"><span>整期图文预览 · 图片已内联</span><button id="copy" type="button">复制到公众号</button></div>
<article class="article" id="article">${body}</article>
<aside class="instructions"><p><strong>公众号设置</strong></p><p>标题：${title}</p><p>作者：${escapeHtml(publication.author ?? '')}</p><p>摘要：${escapeHtml(publication.digest ?? '')}</p>${publication.readOriginal ? `<p>阅读原文：<a href="${escapeHtml(publication.readOriginal)}" target="_blank" rel="noopener noreferrer">${escapeHtml(publication.readOriginal)}</a></p>` : ''}<p>复制后在公众号正文编辑区粘贴，再检查图片转存和手机预览。标题、作者、摘要与阅读原文在后台单独填写。</p></aside>
<script>const html=${literal};const button=document.getElementById('copy');button.addEventListener('click',async()=>{try{if(navigator.clipboard&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([document.getElementById('article').innerText],{type:'text/plain'})})]);}else{const range=document.createRange();range.selectNodeContents(document.getElementById('article'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);if(!document.execCommand('copy'))throw new Error('请手动复制正文');selection.removeAllRanges();}button.textContent='已复制，请到公众号粘贴';}catch(error){button.textContent='请选中正文，手动复制';}});</script></body></html>`;
}

export async function prepareExport(document: ArticleDocument, images: ImageAsset[], publication: Publication = {}, mode: RenderMode = 'miniprogram-safe') {
  if (publication.readOriginal && !/^https?:\/\//i.test(publication.readOriginal)) throw new Error('阅读原文必须是 HTTP(S) 网页地址');
  const audit = auditArticle(document, images);
  if (!audit.passed) throw new Error(`文章体检失败：${audit.findings.filter((item) => item.level === 'error').map((item) => item.message).join('；')}`);
  const rendered = renderArticle(document, { mode, images });
  const inlined = await inlineImagesForRender(rendered.exportHtml);
  if (inlined.failed.length) throw new Error(`图片内联失败，已停止导出：${inlined.failed.join('、')}`);
  const originalSources = [...rendered.exportHtml.matchAll(/\bsrc="([^"]+)"/g)].map((match) => match[1]);
  const inlineSources = [...inlined.html.matchAll(/\bsrc="([^"]+)"/g)].map((match) => match[1]);
  const sourceMap = new Map(originalSources.map((source, index) => [source, inlineSources[index]]));
  const portableImages = images.filter((asset) => sourceMap.has(escapeHtml(asset.src))).map((asset) => ({ ...asset, src: sourceMap.get(escapeHtml(asset.src))! }));
  const meta = { title: document.title, ...publication };
  return {
    body: inlined.html,
    preview: exportPreview(inlined.html, 430, meta),
    snapshot: { document, images: portableImages, imageCategories: [...new Set(portableImages.map((asset) => asset.categoryId))].map((id, order) => ({ id, name: id, order })) },
    publication: meta,
    audit,
    stats: { ...rendered.stats, inlinedImages: inlined.inlined, bytes: Buffer.byteLength(inlined.html) },
  };
}

export async function writeExport(directory: string, bundle: Awaited<ReturnType<typeof prepareExport>>) {
  await mkdir(directory, { recursive: true });
  const files = {
    'body.html': bundle.body,
    'preview.html': bundle.preview,
    'article.json': JSON.stringify(bundle.snapshot, null, 2),
    'publication.json': JSON.stringify(bundle.publication, null, 2),
    'audit.json': JSON.stringify({ ...bundle.audit, stats: bundle.stats }, null, 2),
    '公众号发布说明.txt': `标题：${bundle.publication.title}\n作者：${bundle.publication.author ?? ''}\n摘要：${bundle.publication.digest ?? ''}\n阅读原文：${bundle.publication.readOriginal ?? ''}\n\n打开 preview.html，点“复制到公众号”，在正文编辑区粘贴。\n标题、作者、摘要与阅读原文在公众号后台单独填写。\n图片已内联，请在后台核对转存结果，并完成手机预览。\narticle.json 是可再次导出的文章与内联图片数据。\n`,
  };
  for (const [name, content] of Object.entries(files)) await writeFile(join(directory, name), content, 'utf8');
  return Object.keys(files);
}
