/**
 * 复制到公众号的落地链路。
 *
 * 这是本项目**唯一**的出口，也是最容易改坏的一环，所以单独成模块：
 * 渲染 → 图片内联成 base64 → 写 `text/html` 剪贴板 → 到公众号编辑器粘贴。
 *
 * 两条已验证的约束（见 docs/WECHAT-CONSTRAINTS.md）：
 * - 微信编辑器读不到本机地址，而且剪贴板会把相对路径绝对化成本机 URL，粘贴后图片必然裂开，
 *   所以必须内联成 base64；
 * - 公众号编辑器只认 `text/html`，写纯文本源码粘进去是一堆字面量标签。
 */

export interface InlineResult {
  html: string;
  inlined: number;
  failed: string[];
}

export async function inlineImages(html: string): Promise<InlineResult> {
  const sources = [...new Set(Array.from(html.matchAll(/\bsrc="([^"]+)"/g), (match) => match[1]))];
  const inlined = new Map<string, string>();
  const failed: string[] = [];
  await Promise.all(sources.map(async (source) => {
    if (source.startsWith('data:')) return;
    try {
      // 渲染结果里的 `&` 是 HTML 实体，取图时要还原
      const response = await fetch(source.replaceAll('&amp;', '&'));
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('读取失败'));
        reader.readAsDataURL(blob);
      });
      inlined.set(source, dataUrl);
    } catch {
      failed.push(source);
    }
  }));
  const output = html.replace(/\bsrc="([^"]+)"/g, (whole, source: string) => (inlined.has(source) ? `src="${inlined.get(source)}"` : whole));
  return { html: output, inlined: inlined.size, failed };
}

export function htmlToPlainText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (parsed.body.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 粘贴前把指向本机的链接去掉。
 *
 * 组件里有些锚点写的是 `href="#"`（逆向原文时的占位写法，例如延伸阅读列表）。
 * 富文本剪贴板在序列化时会**把相对地址绝对化**，`#` 于是变成
 * `http://127.0.0.1:5178/#` —— 粘到公众号里就是把开发机的地址写进了已发布的文章，
 * 而且这些链接本身也点不跳。所以在写剪贴板之前把这类 href 摘掉，只留文字。
 *
 * 与图片内联同一个道理、同一层处理：**边界在写剪贴板那一刻**，不在组件里。
 * 组件保持对原文的保真度，落地时统一净化。
 */
export function neutralizeLocalLinks(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  let removed = 0;
  for (const anchor of parsed.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    const local = href.startsWith('#')
      || href.startsWith('/')
      || /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/i.test(href);
    if (!local) continue;
    anchor.removeAttribute('href');
    anchor.removeAttribute('target');
    removed += 1;
  }
  return removed ? parsed.body.innerHTML : html;
}

export async function writeRichClipboard(html: string, text: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return;
    } catch { /* 落到 execCommand 回退 */ }
  }
  // 非安全上下文（或权限被拒）时的回退：可编辑节点的选区复制
  const host = document.createElement('div');
  host.setAttribute('contenteditable', 'true');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
  host.innerHTML = html;
  document.body.appendChild(host);
  const range = document.createRange();
  range.selectNodeContents(host);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const copied = document.execCommand('copy');
  selection?.removeAllRanges();
  host.remove();
  if (!copied) throw new Error('浏览器不允许写入剪贴板，请改用 Chrome / Edge 打开');
}
