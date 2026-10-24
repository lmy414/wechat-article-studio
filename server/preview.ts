/**
 * 截图通道：把"当前文章发布后会是什么样"渲染成一张图。
 *
 * 这是 AI 侧最高价值的一个缺口（docs/DESIGN-SYSTEM.md §9.1）：AI 现在只拿到 HTML 文本，
 * 看不到排版结果，只能靠人在公众号里粘贴后发现问题再回头告诉它——每轮迭代都要走一次真实公众号。
 * 补上它之后 AI 才能自己发现"这个卡片挤成一团""两张图卡连在一起了"。
 *
 * 实现遵循 docs/WECHAT-CONSTRAINTS.md §9 已验证的方法，**不引入 Puppeteer/Playwright**：
 * Node 内置 WebSocket 直接说 CDP 驱动本机 Chrome。
 *
 * 两个必须的细节：
 * - 图片必须**内联成 base64 再截图**，否则截图里的图片会是碎图（file:// 页面拿不到 /library/），
 *   而且这也正是复制到公众号后的真实形态；
 * - 页面宽度固定 415 —— 与画布纸张、与微信正文版心一致，截图才有参考价值。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderArticle } from '../shared/render';
import { getDesignSystem } from '../shared/design-system';
import type { ArticleDocument, RenderStats, RenderWarning } from '../shared/article';
import type { ImageAsset } from '../shared/images';
import type { RenderMode } from '../shared/components';
import { PUBLIC_DIR, readImageSize } from './assets';
import { dataRoot } from './store';

const BROWSERS = [
  process.env.EDITOR_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/**
 * 版心宽度的兜底值。**真正的宽度来自设计系统**（`baseline.page.width`）：
 * 纸张、缩略图与这张截图必须同宽，否则"AI 看到的"与"粘出去的"就不是一回事。
 * 兜底取微信网页版正文栏宽。
 */
export const PAPER_WIDTH = 677;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

export function findBrowser(): string | undefined {
  return BROWSERS.find((path): path is string => Boolean(path && existsSync(path)));
}

/** 把导出 HTML 里的图片地址换成 base64。本机素材读盘，外链抓取，失败的原样留着。 */
export async function inlineImagesForRender(html: string): Promise<{ html: string; inlined: number; failed: string[] }> {
  const sources = [...new Set(Array.from(html.matchAll(/\bsrc="([^"]+)"/g), (match) => match[1]))];
  const inlined = new Map<string, string>();
  const failed: string[] = [];

  await Promise.all(sources.map(async (source) => {
    if (source.startsWith('data:')) return;
    const url = source.replaceAll('&amp;', '&');
    try {
      if (url.startsWith('/')) {
        // `/library/... ` `/assets/...` 都落在 Vite 的 publicDir 下
        const file = resolve(PUBLIC_DIR, decodeURIComponent(url).replace(/^\/+/, ''));
        const relativePath = relative(PUBLIC_DIR, file);
        if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('图片路径超出素材目录');
        const buffer = readFileSync(file);
        const mime = MIME_BY_EXTENSION[extname(file).toLowerCase()] ?? 'application/octet-stream';
        inlined.set(source, `data:${mime};base64,${buffer.toString('base64')}`);
        return;
      }
      if (!/^https?:\/\//i.test(url)) throw new Error('不支持的图片地址');
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(String(response.status));
      const mime = response.headers.get('content-type')?.split(';')[0] ?? 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      inlined.set(source, `data:${mime};base64,${buffer.toString('base64')}`);
    } catch {
      failed.push(source);
    }
  }));

  const output = html.replace(/\bsrc="([^"]+)"/g, (whole, source: string) => (inlined.has(source) ? `src="${inlined.get(source)}"` : whole));
  return { html: output, inlined: inlined.size, failed };
}

/**
 * 截图用的最小页面：灰底 + 415px 白纸，与编辑器画布一致。
 *
 * **`img { max-width:100% !important }` 必须复现**：微信正文自己的 CSS 就带这条
 * （`.rich_media_content img`），已发布文章里那些 `width:444px` 的逆向图片正是靠它被压回容器宽的。
 * 不复现的话，截图会显示一张"被裁掉"的图，而微信里其实是正常缩放的——
 * 那就等于给 AI 看了一张假的画面，比没有眼睛更糟。
 */
export function previewPage(articleHtml: string, width = PAPER_WIDTH): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>preview</title>
<style>
  html,body{margin:0;padding:0;background:#edeceb;}
  body{width:${width}px;}
  .page{width:${width}px;background:#ffffff;color:#34363c;overflow:hidden;
    font-family:"Noto Sans CJK SC","Lucida Grande","Helvetica Neue",Helvetica,"Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;}
  /* 微信注入的全元素归一化，见上面的注释 */
  .page *{max-width:100% !important;box-sizing:border-box !important;word-wrap:break-word !important;}
  .page img{height:auto !important;}
</style></head><body><div class="page">${articleHtml}</div></body></html>`;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export interface CaptureResult {
  png: Buffer;
  /** 抓到的页面尺寸（CSS px）。 */
  width: number;
  height: number;
}

/**
 * 浏览器实例是稀缺资源，而且两次并发会抢端口，所以这里串行化。
 * 截图一次约 2–4 秒，串行完全够用。
 */
let queue: Promise<unknown> = Promise.resolve();

export function captureHtml(html: string, options: { width: number; scale: number; timeoutMs?: number }): Promise<CaptureResult> {
  const run = () => captureHtmlUnsafe(html, options);
  const next = queue.then(run, run);
  // 队列本身不能因为某次失败而断掉
  queue = next.catch(() => undefined);
  return next;
}

async function captureHtmlUnsafe(html: string, options: { width: number; scale: number; timeoutMs?: number }): Promise<CaptureResult> {
  const browser = findBrowser();
  if (!browser) throw new Error('找不到 Chrome 或 Edge，截图通道不可用（装一个 Chrome 即可）');
  const timeoutMs = options.timeoutMs ?? 30_000;
  const profile = mkdtempSync(join(tmpdir(), 'editor-shot-'));
  const page = join(profile, 'preview.html');
  const port = 9300 + Math.floor(Math.random() * 400);
  writeFileSync(page, html, 'utf8');

  const child = spawn(browser, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    // 中文字体在不同机器上不一定有同名的，交给系统回退即可；这里只保证不等字体加载
    '--font-render-hinting=none', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let ws: WebSocket | undefined;
  let sequence = 0;
  const pending = new Map<number, { done: (value: any) => void; fail: (error: Error) => void }>();
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((done, fail) => {
    const id = ++sequence;
    pending.set(id, { done, fail });
    ws!.send(JSON.stringify({ id, method, params }));
  });

  const deadline = Date.now() + timeoutMs;
  try {
    let target: any = null;
    while (Date.now() < deadline && !target) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as any[];
        target = list.find((item) => item.type === 'page');
      } catch { /* 端口还没起来 */ }
      if (!target) await sleep(200);
    }
    if (!target) throw new Error('调试端口未就绪');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((done, fail) => {
      ws!.onopen = () => done();
      ws!.onerror = () => fail(new Error('CDP 连接失败'));
    });
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const handler = pending.get(message.id)!;
        pending.delete(message.id);
        message.error ? handler.fail(new Error(JSON.stringify(message.error))) : handler.done(message.result);
      }
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: options.width, height: 900, deviceScaleFactor: options.scale, mobile: false,
    });
    await send('Page.navigate', { url: pathToFileURL(page).href });

    // 等页面与图片都就绪；用 readyState + image.complete 判断，不用固定 sleep
    const evaluate = async (expression: string) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return result.result?.value;
    };
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await evaluate(`(async () => {
        if (document.readyState !== 'complete') return false;
        const images = [...document.images];
        await Promise.all(images.map((img) => img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done; })));
        return images.every((img) => img.complete);
      })()`).catch(() => false);
      if (ready) break;
      await sleep(150);
    }
    await sleep(120);

    const size = await evaluate('({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })') as { width: number; height: number };
    const shot = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
    });
    return {
      png: Buffer.from(shot.data, 'base64'),
      width: size?.width ?? options.width,
      height: size?.height ?? 0,
    };
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    child.kill();
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 500);
  }
}

export interface PreviewResult extends CaptureResult {
  /** 这一张图用的版心宽度（CSS px）。 */
  pageWidth: number;
  mode: RenderMode;
  stats: RenderStats;
  warnings: RenderWarning[];
  inlinedImages: number;
  failedImages: string[];
  /** 落盘的截图路径，方便人直接看。 */
  path: string;
  scale: number;
}

/**
 * 渲染并截图当前文章。`save` 为真时把 PNG 落盘到 `data/previews/` 并返回路径。
 */
export async function previewArticle(
  document: ArticleDocument,
  images: ImageAsset[],
  options: { mode: RenderMode; scale?: number; waitMs?: number; save?: boolean; timeoutMs?: number; width?: number },
): Promise<PreviewResult> {
  const mode = options.mode;
  const scale = Math.min(3, Math.max(0.5, options.scale ?? 2));
  const rendered = renderArticle(document, { mode, images });
  const { html, inlined, failed } = await inlineImagesForRender(rendered.exportHtml);
  // 宽度来自客户的设计系统：与编辑器纸张、缩略图同宽，"看到的"才等于"粘出去的"
  const width = options.width ?? getDesignSystem(document.templateId).baseline.page.width;
  const captured = await captureHtml(previewPage(html, width), { width, scale, timeoutMs: options.timeoutMs });

  let path = '';
  if (options.save !== false) {
    const directory = join(dataRoot, 'previews');
    mkdirSync(directory, { recursive: true });
    let name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}.png`;
    // 同名时加序号，避免同一秒内两次截图互相覆盖
    let counter = 1;
    while (existsSync(join(directory, name))) {
      name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}-${counter++}.png`;
    }
    path = join(directory, name);
    writeFileSync(path, captured.png);
  }

  return {
    ...captured,
    pageWidth: width,
    mode,
    stats: rendered.stats,
    warnings: rendered.warnings,
    inlinedImages: inlined,
    failedImages: failed,
    path,
    scale,
  };
}

/** 给 MCP 用的紧凑描述：别把 base64 塞进日志或文本结果。 */
export function describePreview(result: PreviewResult): Record<string, unknown> {
  const pixels = readImageSize(result.png);
  return {
    mode: result.mode,
    scale: result.scale,
    pageWidthCss: result.pageWidth,
    pageHeightCss: result.height,
    imagePixelSize: pixels ? [pixels.width, pixels.height] : null,
    bytes: result.png.byteLength,
    inlinedImages: result.inlinedImages,
    failedImages: result.failedImages,
    stats: result.stats,
    warnings: result.warnings.map((warning) => `${warning.severity}: ${warning.message}`),
    savedTo: result.path || null,
  };
}

/** 路径展示用（Windows 上正反斜杠混用不好读）。 */
export function prettyPath(value: string): string {
  return isAbsolute(value) ? value.replaceAll('\\', '/') : resolve(value).replaceAll('\\', '/');
}

export { basename, dirname };
