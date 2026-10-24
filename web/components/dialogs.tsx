/**
 * 三个模态：预览、导入、帮助 / 设置。
 *
 * 都放在一个文件里，因为它们是同一类东西：盖住工作台的只读信息层。
 * 复制模式（B7）不在其中——它有顶栏变形与横幅，是状态而不是弹窗。
 */

import type { RenderedArticle } from '../../shared/article';
import type { DesignSystemPayload } from '../use-editor';
import { DISPLAY_BASELINE } from '../lib/baseline';

function Modal({ title, wide, onClose, children }: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return <div className="modal-backdrop" onClick={onClose}>
    <div className={`modal${wide ? ' wide' : ''}`} onClick={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <strong>{title}</strong>
        <button className="icon-btn" onClick={onClose} title="关闭">✕</button>
      </div>
      {children}
    </div>
  </div>;
}

export function PreviewDialog({ rendered, mode, onCopy, copyState, onClose }: {
  rendered: RenderedArticle;
  mode: 'miniprogram-safe' | 'high-fidelity';
  onCopy: () => void;
  copyState: string;
  onClose: () => void;
}) {
  return <Modal wide title={`预览 · ${mode === 'miniprogram-safe' ? '安全版' : '高保真'}`} onClose={onClose}>
    <div className="preview-note">这是复制到公众号后的样子（整页，含关注横幅/相关文章/品牌页脚）。</div>
    <div className="preview-scroll">
      <div className="paper preview-paper" dangerouslySetInnerHTML={{ __html: rendered.html }} />
    </div>
    <div className="modal-foot">
      <button className="primary" onClick={onCopy} disabled={copyState === 'copying'}>
        {copyState === 'copying' ? '正在复制…' : '复制到公众号'}
      </button>
      <button onClick={onClose}>关闭</button>
    </div>
  </Modal>;
}

export function ImportDialog({ kind, draft, busy, onKind, onDraft, onApply, onClose }: {
  kind: 'text' | 'markdown';
  draft: string;
  busy: boolean;
  onKind: (kind: 'text' | 'markdown') => void;
  onDraft: (draft: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return <Modal title="打开 / 导入" onClose={onClose}>
    <div className="mode-switch">
      <button className={kind === 'text' ? 'selected' : ''} onClick={() => onKind('text')}>正文</button>
      <button className={kind === 'markdown' ? 'selected' : ''} onClick={() => onKind('markdown')}>Markdown</button>
    </div>
    <p className="hint">{kind === 'text'
      ? '第一行标题，第二行副标题，空行分段，其余每行作为一段正文。导入会替换当前全文，可随时撤销。'
      : '按 Markdown 粘进来，我们只做"去掉标记、保住段落"，不做语法树：标题行会变成首行标题，其余按空行分段。'}</p>
    <textarea
      className="import-area"
      rows={12}
      value={draft}
      onChange={(event) => onDraft(event.target.value)}
      placeholder={kind === 'text'
        ? '文章标题\n副标题一句话\n\n第一段正文…\n\n第二段正文…'
        : '# 文章标题\n\n第一段正文…\n\n- 列表会变成普通段落'}
    />
    <div className="modal-foot">
      <button className="primary" onClick={onApply} disabled={busy || !draft.trim()}>导入并替换</button>
      <button onClick={onClose} disabled={busy}>取消</button>
    </div>
  </Modal>;
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="怎么用这个排版器" onClose={onClose}>
    <ol className="help-list">
      <li><b>左侧组件库</b>：点缩略图插入到选中块之后，也可以直接拖到画布上的任意位置。缩略图就是组件在 415px 版心里的真实样子。</li>
      <li><b>画布</b>：点任意内容块选中它；左侧出现彩色竖条，右侧出现上移/下移/复制/删除。</li>
      <li><b>字段编辑</b>：选中后在画布右侧的浮卡里改文字与图片。图片从图片库选素材，不能填外链以外的本机路径。</li>
      <li><b>导出</b>：点顶栏「导出」进入复制模式，再点「复制到公众号」写剪贴板，然后到公众号编辑器里 Ctrl+V。图片已内联为 base64，无需重新上传。</li>
    </ol>
    <div className="help-two">
      <div>
        <strong>两个固定环节，绕不开</strong>
        <p>图文只能靠网页编辑器粘贴：公众号官方 API 的 content 上限是 2 万字符，而一篇正常图文是 4.4 万字符，超限一倍以上。</p>
      </div>
      <div>
        <strong>AI 目前没有眼睛</strong>
        <p>它拿不到渲染截图，只能靠人发现"这里挤成一团"。补齐截图通道是当前最高价值缺口。</p>
      </div>
    </div>
  </Modal>;
}

/**
 * 「基础格式」详情。
 * 基线来自设计系统声明（`shared/design-system.ts`），由 `shared/audit.ts` 的目录回归
 * 逐个组件比对过——所以这里显示的是**真实生效的约束**，不是文档里的期望值。
 */
export function BaselineDialog({ design, onClose }: { design: DesignSystemPayload | null; onClose: () => void }) {
  const baseline = design?.baseline ?? DISPLAY_BASELINE;
  const freedom = design?.freedom;
  return <Modal title={`设计系统基线 · ${design?.client ?? '读取中'}`} onClose={onClose}>
    <div className="ds-baseline-line">
      字号 {baseline.type.body}，行间距 {baseline.lineHeight.body}，字间距 {baseline.letterSpacing.body}
    </div>
    <div className="ds-grid">
      <span>字号阶</span><b>{baseline.typeScale.join(' / ')}</b>
      <span>行高</span><b>{baseline.lineHeights.join(' / ')}</b>
      <span>字距</span><b>{baseline.letterSpacings.join(' / ')}</b>
      <span>基线来源</span><b>{baseline.source === 'baked' ? '烘焙在组件里' : 'token 驱动'}</b>
    </div>
    <div className="ds-swatches">
      {baseline.palette.map((color) => <span key={color} title={color}>
        <i style={{ background: color }} />{color}
      </span>)}
    </div>
    <div className="help-two">
      <div>
        <strong>AI 可以动什么</strong>
        <ul className="ds-list">{freedom?.aiDecides.slice(0, 4).map((item) => <li key={item}>{item}</li>) ?? <li>正在读取…</li>}</ul>
      </div>
      <div>
        <strong>AI 不许做什么</strong>
        <ul className="ds-list ds-list-warn">{freedom?.aiMustNot.slice(0, 5).map((item) => <li key={item}>{item}</li>) ?? <li>正在读取…</li>}</ul>
      </div>
    </div>
    <p className="ds-note">
      色板是闭集：不在里面的值一律不允许出现。禁用写法：display:grid、position、float、&lt;div&gt;、class=、&lt;style&gt;、@media、@keyframes。
    </p>
    <div className="modal-foot"><button onClick={onClose}>关闭</button></div>
  </Modal>;
}

export function SettingsDialog({ design, onClose }: { design: DesignSystemPayload | null; onClose: () => void }) {
  const baseline = design?.baseline ?? DISPLAY_BASELINE;
  return <Modal title="本地服务与数据" onClose={onClose}>
    <ul className="help-list">
      <li>编辑器：Vite <code>127.0.0.1:5178</code></li>
      <li>本机 API：<code>127.0.0.1:8787</code>（编辑器通过 <code>/api</code> 代理访问）</li>
      <li>数据文件：<code>data/editor-state.json</code>（文章 + 版本历史 + 图片库，已纳入版本控制）</li>
      <li>端口与数据目录可用环境变量覆盖：<code>EDITOR_PORT</code> / <code>EDITOR_DATA_DIR</code></li>
      <li>外部 AI 接入：先起本机 API，再运行 <code>npm run mcp</code>（stdio，转发到上面的 API）</li>
      <li>素材导入：AI 通过 MCP 的 <code>import_images</code> 把本机图片复制到 <code>web/public/library/uploads/</code></li>
      <li>截图：<code>POST /api/preview</code> 用本机 Chrome 渲染色图（也可直接开 <code>/api/preview.png</code> 看）</li>
    </ul>
    <div className="help-two">
      <div>
        <strong>界面配色</strong>
        <p>工作台自己的颜色（侧栏 <code>{'#282d36'}</code>、页面底 <code>{'#edeceb'}</code>）与**内容主色**是两回事：后者由客户设计系统基线决定。</p>
      </div>
      <div>
        <strong>当前基线</strong>
        <p>{baseline.type.body} / 行高 {baseline.lineHeight.body} / 字距 {baseline.letterSpacing.body}（{design?.client ?? '读取中'}）</p>
      </div>
    </div>
  </Modal>;
}
