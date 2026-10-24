/**
 * 校验器（docs/DESIGN-SYSTEM.md §7）。
 *
 * 分两类，服务不同的人：
 * - **A 目录回归（`auditCatalog`）**：把全部组件在两种模式下渲染一遍，检查禁用属性、
 *   颜色/字号闭集、标签配平、文案不掉。这是**开发者与 AI 改组件时的挡板**——
 *   新组件引入越界色值或 `<div>`，回归立刻失败。
 * - **B 文章体检（`auditArticle`）**：对当前文章跑检查，**交付前 error 必须为 0**，
 *   warning 需要人工确认。
 *
 * 为什么把"A 目录回归"做成能跑的代码、而不是写在文档里的清单：设计系统 §7 那句
 * "光有声明没有强制，基线会在几周内漂移"。这里的 `extractCatalogFacts()` 同时也是
 * **声明基线的依据**——先量出真实值，再写进设计系统，两边不会各说各话。
 */

import { listComponents, type RenderMode, type RenderContext } from './components';
import { componentsOf, getDesignSystem, tokensOf, type DesignSystem } from './design-system';
import { getComponent } from './components';
import { imageIndex, type ImageAsset } from './images';
import type { ArticleBlock, ArticleDocument } from './article';
import './packs';

export type AuditLevel = 'error' | 'warning' | 'info';

export interface AuditFinding {
  level: AuditLevel;
  code: string;
  message: string;
  /** 出问题的块（文章体检才有）。 */
  blockId?: string;
  blockIndex?: number;
  field?: string;
  /** 怎么改，给 AI 与人的一句话。 */
  hint?: string;
}

export interface AuditReport {
  scope: 'catalog' | 'article';
  designSystemId: string;
  passed: boolean;
  errors: number;
  warnings: number;
  infos: number;
  findings: AuditFinding[];
}

export interface ForbiddenHit {
  code: string;
  componentId: string;
  sample: string;
}

export interface CatalogFacts {
  modes: RenderMode[];
  colors: string[];
  fontSizes: string[];
  lineHeights: string[];
  letterSpacings: string[];
  forbidden: ForbiddenHit[];
  unbalanced: string[];
  /** 默认文案没出现在渲染结果里的字段（"文案不掉"检查）。 */
  missingText: { componentId: string; field: string }[];
}

/** 禁用属性（DESIGN-SYSTEM §7A 第 1 条）。`z-index` 与 `!important` 是允许的。 */
export const FORBIDDEN_PATTERNS: { code: string; pattern: RegExp }[] = [
  { code: 'display-grid', pattern: /display\s*:\s*grid/i },
  { code: 'position', pattern: /(?<!list-style-)position\s*:/i },
  { code: 'float', pattern: /[;\s"']float\s*:/i },
  { code: 'div-tag', pattern: /<div[\s>/]/i },
  { code: 'class-attr', pattern: /\sclass\s*=/i },
  { code: 'style-tag', pattern: /<style[\s>]/i },
  { code: 'media-query', pattern: /@media/i },
  { code: 'keyframes', pattern: /@keyframes/i },
  { code: 'script-tag', pattern: /<script[\s>]/i },
];

export function normalizeColor(value: string): string {
  const hex = value.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(hex);
  if (short) return `#${short[1].split('').map((char) => char + char).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(hex);
  if (rgb) return `#${[1, 2, 3].map((i) => Number(rgb[i]).toString(16).padStart(2, '0')).join('')}`;
  return hex;
}

/**
 * 长度值归一化。组件里的写法并不统一（`.5px` 与 `0.5px`、`#fff` 与 `#ffffff`），
 * 不归一化的话闭集比对会被"写法差异"误判成越界。
 */
export function normalizeLength(value: string): string {
  return value.trim().toLowerCase().replace(/(^|[\s(])\.(\d)/g, '$10.$2');
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const FONT_SIZE_RE = /font-size\s*:\s*([^;"']+)/gi;
const LINE_HEIGHT_RE = /line-height\s*:\s*([^;"']+)/gi;
const LETTER_SPACING_RE = /letter-spacing\s*:\s*([^;"']+)/gi;

export interface FactOptions {
  designSystemId: string;
  modes?: RenderMode[];
}

/**
 * 渲染哪些字段组合。**不能只渲染默认值**：有些输出只在特定状态下出现，
 * 例如"图片待补"提示框只在图片字段为空时渲染（默认值是有素材的，所以默认值那轮看不到它）。
 * 只跑默认值的话，那套颜色的越界就永远抓不到。
 */
export type FactVariant = 'defaults' | 'empty' | 'long';

function variantProps(definition: { fields: { key: string; kind: string }[]; defaults(): Record<string, string> }, variant: FactVariant): Record<string, string> {
  const base = definition.defaults();
  if (variant === 'defaults') return base;
  if (variant === 'empty') {
    const blank: Record<string, string> = {};
    for (const field of definition.fields) blank[field.key] = '';
    return blank;
  }
  const filled: Record<string, string> = {};
  for (const field of definition.fields) {
    filled[field.key] = field.kind === 'image'
      ? base[field.key] ?? ''
      : field.kind === 'lines'
        ? '第一条：测试内容\n第二条：测试内容\n第三条：测试内容'
        : '这是一段用来压测换行与截断的较长中文文案，含标点、数字 123 与英文 ABC，用于确认长文本不会越界。';
  }
  return filled;
}

/**
 * 量出**某个设计系统**范围内组件的事实（用于声明基线、跑目录回归）。
 *
 * 渲染上下文必须用这个设计系统自己的模板 token，而不是一组无关的哨兵色——
 * 否则量出来的调色板里会混进与这个客户无关的颜色，闭集就失去意义了。
 */
export function extractCatalogFacts(options: FactOptions | string, legacyModes?: RenderMode[]): CatalogFacts {
  const settings: FactOptions = typeof options === 'string' ? { designSystemId: options, modes: legacyModes } : options;
  const design = getDesignSystem(settings.designSystemId);
  const modes = settings.modes ?? ['miniprogram-safe', 'high-fidelity'];
  const variants: FactVariant[] = ['defaults', 'empty', 'long'];
  const tokens = tokensOf(design.id);
  const definitions = componentsOf(design);
  const facts: CatalogFacts = {
    modes: [...modes],
    colors: [], fontSizes: [], lineHeights: [], letterSpacings: [],
    forbidden: [], unbalanced: [], missingText: [],
  };
  const colors = new Set<string>();
  const fontSizes = new Set<string>();
  const lineHeights = new Set<string>();
  const letterSpacings = new Set<string>();

  for (const definition of definitions) {
    for (const variant of variants) {
      const props = variantProps(definition, variant);
      for (const mode of modes) {
        const ctx: RenderContext = { mode, tokens: { ...tokens }, imageUrl: (ref) => ref };
        let html = '';
        try { html = definition.render(props, ctx); } catch (error) {
          facts.forbidden.push({ code: 'render-threw', componentId: `${definition.id}(${variant})`, sample: String(error).slice(0, 80) });
          continue;
        }
        for (const match of html.match(COLOR_RE) ?? []) colors.add(normalizeColor(match));
        for (const match of html.matchAll(FONT_SIZE_RE)) fontSizes.add(normalizeLength(match[1]));
        for (const match of html.matchAll(LINE_HEIGHT_RE)) lineHeights.add(normalizeLength(match[1]));
        for (const match of html.matchAll(LETTER_SPACING_RE)) letterSpacings.add(normalizeLength(match[1]));
        for (const { code, pattern } of FORBIDDEN_PATTERNS) {
          const hit = pattern.exec(html);
          if (hit) facts.forbidden.push({ code, componentId: `${definition.id}(${variant})`, sample: hit[0].slice(0, 40) });
        }
        const opens = (html.match(/<section/g) ?? []).length;
        const closes = (html.match(/<\/section>/g) ?? []).length;
        if (opens !== closes) facts.unbalanced.push(`${definition.id}(${mode}/${variant}) ${opens}开/${closes}闭`);
        // 文案不掉：只有默认值那轮能查（另外两轮本来就该把字段清空/换掉）
        if (variant === 'defaults') {
          for (const field of definition.fields) {
            if (field.kind === 'image') continue;
            const value = (props[field.key] ?? '').split('\n')[0].trim();
            if (value.length < 2) continue;
            if (!html.includes(value)) facts.missingText.push({ componentId: definition.id, field: field.key });
          }
        }
      }
    }
  }

  const sort = (set: Set<string>) => [...set].sort();
  return {
    ...facts,
    colors: sort(colors).filter((value) => value.startsWith('#')),
    fontSizes: sort(fontSizes),
    lineHeights: sort(lineHeights),
    letterSpacings: sort(letterSpacings),
  };
}

function summarize(findings: AuditFinding[], scope: AuditReport['scope'], designSystemId: string): AuditReport {
  const errors = findings.filter((item) => item.level === 'error').length;
  const warnings = findings.filter((item) => item.level === 'warning').length;
  const infos = findings.filter((item) => item.level === 'info').length;
  return { scope, designSystemId, passed: errors === 0, errors, warnings, infos, findings };
}

/** A 目录回归：声明（设计系统基线）与实现（组件渲染结果）对不对得上。 */
export function auditCatalog(designSystemId: string, modes?: RenderMode[]): AuditReport & { facts: CatalogFacts } {
  const design = getDesignSystem(designSystemId);
  const facts = extractCatalogFacts({ designSystemId, modes });
  const findings: AuditFinding[] = [];

  const allowed = new Set(design.baseline.palette.map(normalizeColor));
  for (const color of facts.colors) {
    if (!allowed.has(color)) {
      findings.push({
        level: 'error', code: 'color-outside-baseline',
        message: `组件用到了基线色板以外的颜色 ${color}`,
        hint: '要么在基线色板里补上它（确认这是有意为之），要么把组件改回语义色',
      });
    }
  }
  const declaredUnused = [...allowed].filter((color) => !facts.colors.includes(color));
  if (declaredUnused.length) {
    findings.push({
      level: 'info', code: 'palette-stale',
      message: `基线色板里有 ${declaredUnused.length} 个颜色没被任何组件用到：${declaredUnused.join(' ')}`,
      hint: '基线的值应当来自实测；这是"声明漂移"的信号，确认后从色板里删掉',
    });
  }

  const checkScale = (label: string, declared: string[], actual: string[], normalize: (value: string) => string) => {
    const set = new Set(declared.map(normalize));
    for (const value of actual) {
      if (!set.has(value)) {
        findings.push({
          level: 'error', code: `${label}-outside-baseline`,
          message: `组件用到了${label}闭集以外的值 ${value}`,
          hint: `基线声明：${declared.join(' / ')}`,
        });
      }
    }
    const unused = [...set].filter((value) => !actual.includes(value));
    if (unused.length) {
      findings.push({ level: 'info', code: `${label}-stale`, message: `${label}闭集里有 ${unused.length} 个值没被用到：${unused.join(' / ')}` });
    }
  };
  checkScale('字号', design.baseline.typeScale, facts.fontSizes, normalizeLength);
  checkScale('行高', design.baseline.lineHeights, facts.lineHeights, normalizeLength);
  checkScale('字距', design.baseline.letterSpacings, facts.letterSpacings, normalizeLength);

  for (const hit of facts.forbidden) {
    findings.push({
      level: 'error', code: `forbidden-${hit.code}`,
      message: `${hit.componentId} 出现禁用属性/写法：${hit.sample}`,
      hint: '微信会丢掉这些属性或标签，见 docs/WECHAT-CONSTRAINTS.md §3',
    });
  }
  for (const item of facts.unbalanced) {
    findings.push({ level: 'error', code: 'unbalanced-section', message: `${item}：<section> 开闭不配平` });
  }
  for (const item of facts.missingText) {
    findings.push({
      level: 'error', code: 'text-missing',
      message: `${item.componentId}.${item.field} 的默认文案没出现在渲染结果里`,
      hint: '字段被渲染逻辑丢掉了，检查组件实现',
    });
  }
  // 白名单里的组件必须存在，且每个都要有"什么时候用"的说明（DESIGN-SYSTEM §6）
  const known = new Set(listComponents().map((item) => item.id));
  if (design.freedom.allowedComponents !== 'all') {
    for (const id of design.freedom.allowedComponents) {
      if (!known.has(id)) findings.push({ level: 'error', code: 'whitelist-unknown', message: `白名单里的组件不存在：${id}` });
    }
  }
  const guided = new Set(design.guidelines.map((item) => item.componentId));
  for (const definition of componentsOf(design)) {
    if (!guided.has(definition.id)) {
      findings.push({
        level: 'warning', code: 'guideline-missing',
        message: `${definition.id} 没有"什么时候用"的说明`,
        hint: 'AI 靠它选组件，缺了就只能靠猜',
      });
    }
  }
  return { ...summarize(findings, 'catalog', designSystemId), facts };
}

/** 内部链接：正文里允许的 URL（微信只放行自己的域名）。 */
const INTERNAL_LINK_RE = /https?:\/\/(?:mp\.weixin\.qq\.com|work\.weixin\.qq\.com)\//i;
const ANY_LINK_RE = /https?:\/\/[^\s"'<>）)]+/gi;

/** B 文章体检：对当前文章跑检查。交付前 error 必须为 0。 */
export function auditArticle(document: ArticleDocument, images: ImageAsset[], designSystemId = document.templateId): AuditReport {
  const design = getDesignSystem(designSystemId);
  const findings: AuditFinding[] = [];
  const allowed = design.freedom.allowedComponents === 'all' ? null : new Set(design.freedom.allowedComponents);
  const library = imageIndex(images);
  const locked = new Map(design.freedom.lockedFields.map((item) => [`${item.componentId}.${item.field}`, item.reason]));

  const push = (finding: AuditFinding) => findings.push(finding);

  document.blocks.forEach((block: ArticleBlock, index: number) => {
    const definition = getComponent(block.componentId);
    const where = `第 ${index + 1} 块`;
    if (!definition) {
      push({ level: 'error', code: 'unknown-component', message: `${where} 是未知组件 ${block.componentId}`, blockId: block.id, blockIndex: index, hint: '删掉它，或换成白名单里的组件' });
      return;
    }
    if (allowed && !allowed.has(block.componentId)) {
      push({ level: 'error', code: 'component-not-allowed', message: `${where}「${definition.name}」不在 ${design.name} 的组件白名单里`, blockId: block.id, blockIndex: index, hint: `可用：${[...allowed].join('、')}` });
    }
    for (const field of definition.fields) {
      const value = (block.props[field.key] ?? '').trim();
      if (!value && field.kind !== 'image') {
        push({
          level: field.optional ? 'info' : 'error',
          code: field.optional ? 'optional-field-empty' : 'empty-field',
          message: field.optional
            ? `${where}「${definition.name}」的可选字段「${field.label}」是空的（可以不管）`
            : `${where}「${definition.name}」的「${field.label}」是空的`,
          blockId: block.id, blockIndex: index, field: field.key,
          hint: field.optional ? undefined : '字段为空会渲染出欠内容的版式',
        });
        continue;
      }
      if (locked.has(`${block.componentId}.${field.key}`)) {
        /*
         * 锁定字段的语义是"**不许改**"，不是"必须为空"——品牌图本来就该有素材。
         * 所以只有值与组件默认值不一致时才报：那说明有人（或 AI）换掉了品牌素材。
         */
        const expected = definition.defaults()[field.key] ?? '';
        if (value !== expected) {
          push({
            level: 'error', code: 'locked-field-changed',
            message: `${where}「${definition.name}」的「${field.label}」是锁定字段，现在被改成了 ${value.slice(0, 40)}（应为 ${expected.slice(0, 40)}）`,
            blockId: block.id, blockIndex: index, field: field.key,
            hint: `锁定理由：${locked.get(`${block.componentId}.${field.key}`)}`,
          });
        }
      }
      if (field.kind === 'image') {
        if (!value) {
          push({ level: 'info', code: 'image-empty', message: `${where}「${definition.name}」的图片字段没选素材`, blockId: block.id, blockIndex: index, field: field.key });
          continue;
        }
        const isAddress = value.startsWith('/') || value.startsWith('http') || value.startsWith('data:');
        if (isAddress && !value.startsWith('/library/') && !value.startsWith('/assets/')) {
          push({ level: 'error', code: 'image-outside-library', message: `${where} 的图片用的是库外地址 ${value.slice(0, 60)}`, blockId: block.id, blockIndex: index, field: field.key, hint: '先用 import_images 把素材放进图片库，再填素材 id' });
        } else if (!isAddress && !library.has(value)) {
          push({ level: 'error', code: 'image-unknown-asset', message: `${where} 引用了图片库里不存在的素材 ${value}`, blockId: block.id, blockIndex: index, field: field.key });
        }
        if (!value.startsWith('/library/') && !value.startsWith('/assets/') && assetMissingLabel(images, value)) {
          push({ level: 'info', code: 'image-label-placeholder', message: `${where} 用的素材还是占位素材`, blockId: block.id, blockIndex: index, field: field.key });
        }
        continue;
      }
      // 正文里的外链（DESIGN-SYSTEM §4.2）：微信正文的外链不可跳转
      for (const url of value.match(ANY_LINK_RE) ?? []) {
        if (!INTERNAL_LINK_RE.test(url)) {
          push({ level: 'error', code: 'external-link-in-body', message: `${where}「${definition.name}」的「${field.label}」里有外链 ${url.slice(0, 60)}`, blockId: block.id, blockIndex: index, field: field.key, hint: '外链放进文末「阅读原文」，正文只允许 mp.weixin.qq.com' });
        }
      }
    }
  });

  // 品牌固定元素必须存在（DESIGN-SYSTEM §5）
  for (const slot of design.brandSlots) {
    if (!slot.required) continue;
    if (slot.settingsField && !document.settings[slot.settingsField]) {
      push({ level: 'warning', code: 'brand-slot-off', message: `品牌固定元素「${slot.name}」被关掉了：${slot.description}`, hint: `打开 document.settings.${slot.settingsField}` });
      continue;
    }
    if (slot.matchComponentIds?.length && !document.blocks.some((block) => slot.matchComponentIds!.includes(block.componentId))) {
      const level = slot.required ? 'warning' : 'info';
      push({ level, code: 'brand-slot-missing', message: `文章里没有「${slot.name}」：${slot.description}`, hint: slot.hint });
    }
  }

  // 成对组件（DESIGN-SYSTEM §7B）
  for (const pair of design.pairs ?? []) {
    const hasA = document.blocks.some((block) => block.componentId === pair[0]);
    const hasB = document.blocks.some((block) => block.componentId === pair[1]);
    if (hasA !== hasB) {
      push({ level: 'warning', code: 'pair-broken', message: `${pair.join(' 与 ')} 应当成对出现，现在只出现了 ${hasA ? pair[0] : pair[1]}`, hint: '成对使用才有完整语义' });
    }
  }

  // 节奏检查：连续同类块、章节标题次数
  /*
   * 只对"连着用会明显变差"的分类报警。收尾类（说明区 + END）与装饰类挨着是正常的版式，
   * 拿它们报警只会制造噪音——实测第一版把"说明区 + END"报成了问题，那是误报。
   *
   * **声明的成对组件要豁免**：引语标记与引语块本来就是相邻出现的（原文就是这么排的），
   * 不豁免就会出现"必须成对"和"不许同类相邻"互相打架——这条是实际写一篇图文时暴露出来的。
   */
  const sensitive = new Set(design.adjacencySensitiveCategories ?? ['media', 'emphasis', 'quote']);
  const declaredPairs = new Set((design.pairs ?? []).flatMap(([left, right]) => [`${left}|${right}`, `${right}|${left}`]));
  const categories = document.blocks.map((block) => getComponent(block.componentId)?.category);
  for (let index = 1; index < categories.length; index += 1) {
    if (!categories[index] || categories[index] !== categories[index - 1] || !sensitive.has(categories[index]!)) continue;
    const previous = document.blocks[index - 1].componentId;
    const current = document.blocks[index].componentId;
    if (declaredPairs.has(`${previous}|${current}`)) continue;
    push({ level: 'warning', code: 'same-category-twice', message: `第 ${index} 与第 ${index + 1} 块是同一类（${categories[index]}），读起来会连成一片`, blockIndex: index, hint: '中间插一段正文或换一类组件' });
  }
  for (const rule of design.countRules ?? []) {
    const count = document.blocks.filter((block) => block.componentId === rule.componentId).length;
    if (count && (count < rule.min || count > rule.max)) {
      push({ level: 'info', code: 'count-out-of-range', message: `「${rule.componentId}」出现 ${count} 次，建议 ${rule.min}–${rule.max} 次${rule.why ? `：${rule.why}` : ''}` });
    }
  }

  return summarize(findings, 'article', designSystemId);
}

function assetMissingLabel(images: ImageAsset[], ref: string): boolean {
  return images.some((asset) => asset.id === ref && asset.placeholder);
}

/** 给 AI 与终端看的紧凑文本，别让调用方去解析 JSON。 */
export function formatAudit(report: AuditReport): string {
  const head = report.scope === 'catalog'
    ? `目录回归（设计系统 ${report.designSystemId}）`
    : `文章体检（设计系统 ${report.designSystemId}）`;
  const lines = [
    `${head}：${report.passed ? '通过' : '未通过'} — error ${report.errors} / warning ${report.warnings} / info ${report.infos}`,
  ];
  for (const level of ['error', 'warning', 'info'] as AuditLevel[]) {
    const items = report.findings.filter((item) => item.level === level);
    if (!items.length) continue;
    lines.push(`\n[${level}] ${items.length} 条`);
    for (const item of items.slice(0, 40)) lines.push(`  · ${item.message}${item.hint ? `  → ${item.hint}` : ''}`);
    if (items.length > 40) lines.push(`  …还有 ${items.length - 40} 条`);
  }
  if (report.scope === 'article' && report.errors) lines.push('\n交付前 error 必须为 0。');
  return lines.join('\n');
}
