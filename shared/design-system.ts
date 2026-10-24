import type { ArticleSettings } from './article';
import { makeBlock, type ArticleDocument } from './article';
import { digestComponents, getComponent, listComponents, type ComponentDigest, type FieldKind } from './components';
import { getTemplate, listTemplates } from './design';
import './packs';

export type BaselineSource = 'baked' | 'token-driven';

/** 语义色名。组件只许用这些名字，不许写字面色值（§3.1）。 */
export interface SemanticColors {
  primary: string;
  primaryDeep: string;
  accent: string;
  text: string;
  textStrong: string;
  textMuted: string;
  surface: string;
  surfacePale: string;
  line: string;
  onPrimary: string;
  /** 暖色语义区（引语、卡片）。 */
  warm?: string;
}

export interface DesignBaseline {
  source: BaselineSource;
  /** 画布、缩略图和截图共用的版心宽度。 */
  page: { width: number; note?: string };
  colors: SemanticColors;
  /** 允许出现的**全部**色值（闭集）。校验器只认这个列表。 */
  palette: string[];
  /** 字号阶（闭集）。 */
  typeScale: string[];
  type: { heading: string; subheading: string; body: string; secondary: string; caption: string };
  /** 行高（闭集）。 */
  lineHeights: string[];
  lineHeight: { tight: string; body: string; loose: string };
  /** 字距（闭集）。 */
  letterSpacings: string[];
  letterSpacing: { body: string; heading: string };
  spacing: { paragraph: string; block: string; section: string; card: string };
  shape: { radiusCard: string; radiusSmall: string; borderWidth: string };
  image: { radius: string; captionColor: string; captionSize: string; panelBackground: string };
  /** 留空表示不设置 font-family（微信官方不建议覆盖字体）。 */
  fontStack: string;
  /** 校验范围：这些前缀下的组件属于本设计系统（目录回归只渲染这些）。 */
  scopeComponentPrefixes: string[];
}

/** 锁定字段：AI 不能改，通常是品牌固定元素的内容。 */
export interface LockedField {
  componentId: string;
  field: string;
  reason: string;
}

export interface DesignFreedom {
  /** 组件白名单。AI 只能从这里选组件。 */
  allowedComponents: string[] | 'all';
  lockedFields: LockedField[];
  /** 自然语言：AI 可以自行决定什么。 */
  aiDecides: string[];
  /** 自然语言：AI 绝对不许做什么。 */
  aiMustNot: string[];
}

/** 品牌固定元素：必须存在、内容锁定、只能由设计系统提供（§5）。 */
export interface BrandSlot {
  id: string;
  name: string;
  description: string;
  required: boolean;
  /** 由文档级开关表达的存在性（关注横幅/相关文章/品牌页脚这些还没拆成组件的）。 */
  settingsField?: keyof ArticleSettings;
  /** 由组件表达的存在性。 */
  matchComponentIds?: string[];
  hint?: string;
}

/** 选择指南：每个组件回答"什么时候用、什么时候不用"（§6）。 */
export interface DesignGuideline {
  componentId: string;
  whenToUse: string;
  whenNotToUse: string;
}

export interface DesignSystem {
  id: string;
  /** 客户名。用户会先用它告诉 AI "做哪个客户的"。 */
  client: string;
  name: string;
  description: string;
  /** 绑定的配色模板（shared/design.ts）。 */
  templateId: string;
  /** 新文章的默认标题后缀之外的元信息，供 AI 写文案时参考。 */
  tone?: string;
  baseline: DesignBaseline;
  freedom: DesignFreedom;
  brandSlots: BrandSlot[];
  guidelines: DesignGuideline[];
  /** 成对使用的组件：只出现一个就是残缺语义（§7B）。 */
  pairs?: [string, string][];
  /**
   * 哪些分类"连着用两块"算问题。默认 media/emphasis/quote——
   * 两张图、两个信息卡、两段引语挨在一起会读成一片；
   * 收尾类（说明区 + END）与装饰类挨着是正常版式，所以不在默认列表里。
   */
  adjacencySensitiveCategories?: string[];
  /** 出现次数建议（§7B 的 info 级）。 */
  countRules?: { componentId: string; min: number; max: number; why?: string }[];
  /** 组合骨架：AI 排整篇时的节奏参考（§6）。 */
  skeleton: string[];
}

const GENERIC_GUIDELINES: DesignGuideline[] = [
  { componentId: 'base.intro', whenToUse: '开篇导语，交代背景或摘要，全文一次', whenNotToUse: '正文中间；当结论用' },
  { componentId: 'base.section', whenToUse: '开启新的一节，全文 2–6 次', whenNotToUse: '强调单句（那用 base.callout）' },
  { componentId: 'base.paragraph', whenToUse: '正文主力，承载解释、上下文与过渡', whenNotToUse: '标题、短标语；需要强调的一段用 base.callout' },
  { componentId: 'base.image', whenToUse: '整幅配图并需要说明文字', whenNotToUse: '需要"图 + 内嵌说明条"的复杂版式（请扩展对应组件包）' },
  { componentId: 'base.list', whenToUse: '罗列技术参数或要点', whenNotToUse: '只有一条要点（写成段落）' },
  { componentId: 'base.callout', whenToUse: '承载关键结论、核心卖点', whenNotToUse: '连续两块（强调会失效）' },
  { componentId: 'base.quote', whenToUse: '客户原话、专家观点', whenNotToUse: '自己写的结论' },
  { componentId: 'base.note', whenToUse: '固定说明区（企业介绍、免责声明），全文一次', whenNotToUse: '正文中段当过渡用；连着 END 放在最后才是它的位置' },
  { componentId: 'base.divider', whenToUse: '文章结束标记，全文一次', whenNotToUse: '段落之间的分隔（用空行）' },
];

/**
 * 通用设计系统是**新客户的起点**，也是 token 驱动型的样板：
 * 组件从 `ctx.tokens` 取色，所以换一套 template 就换一套配色。
 * 加新客户时复制这一段、换 palette 与 guidelines，不改组件代码。
 */
const generic: DesignSystem = {
  id: 'generic',
  client: '未指定（新客户起点）',
  name: '通用',
  description: '中性配色，适合没有既定品牌规范的文章，也是新客户的起点。',
  templateId: 'generic',
  tone: '中性、清楚，不带强烈的品牌语气。',
  baseline: {
    source: 'token-driven',
    page: { width: 430, note: '以手机阅读为基准；截图、画布与导出共用此宽度' },
    colors: {
      primary: '#2f6f9f',
      primaryDeep: '#1f5d87',
      accent: '#5b8cae',
      text: '#3e3e3e',
      textStrong: '#263f51',
      textMuted: '#7f7f7f',
      surface: '#fbfdff',
      surfacePale: '#f7fafc',
      line: '#d5e0e8',
      onPrimary: '#ffffff',
      warm: '#fff8e6',
    },
    // 实测自 extractCatalogFacts('generic')：通用模板的 9 个 token + 基础包的两个固定中性色
    // （引语灰 #40515f / 浅底 #fbfdff）与琥珀色警示三件套。色板随模板走，所以换客户只改这里。
    palette: [
      '#1f5d87', '#2f6f9f', '#3e3e3e', '#40515f', '#5b8cae', '#7f7f7f', '#9a8b5f', '#e0cf9a',
      '#eef4f9', '#f7fafc', '#fbfdff', '#fff8e6', '#ffffff',
    ],
    typeScale: ['12px', '13px', '14px', '15px', '16px'],
    type: { heading: '16px', subheading: '15px', body: '15px', secondary: '14px', caption: '12px' },
    lineHeights: ['1.5', '1.6', '1.7', '1.75', '1.85', '1.9', '2'],
    lineHeight: { tight: '1.5', body: '2', loose: '1.9' },
    letterSpacings: ['0.5px', '0.7px', '0.8px', '1px', '3px'],
    letterSpacing: { body: '1px', heading: '1.5px' },
    spacing: { paragraph: '15px', block: '20px', section: '25px', card: '14px' },
    shape: { radiusCard: '10px', radiusSmall: '7px', borderWidth: '1px' },
    image: { radius: '7px', captionColor: '#7f7f7f', captionSize: '12px', panelBackground: '#f5f9ff' },
    fontStack: '',
    scopeComponentPrefixes: ['base.'],
  },
  freedom: {
    allowedComponents: ['base.intro', 'base.section', 'base.paragraph', 'base.image', 'base.list', 'base.callout', 'base.quote', 'base.note', 'base.divider'],
    lockedFields: [],
    aiDecides: [
      '选哪些组件：从白名单里按语义选（见 guidelines）',
      '顺序与分段：一篇文章分成几节、每节用哪些组件承载、图放在哪',
      '文案：组件字段里的文字',
      '配图：从图片库选素材',
      '强调：正文段落里要突出哪些短语',
    ],
    aiMustNot: [
      '写 CSS 或 HTML',
      '用白名单外的组件',
      '改锁定字段',
      '引用图片库以外的图片地址',
      '在正文里放外链',
      '改变基线的颜色/字号/间距',
    ],
  },
  brandSlots: [
    { id: 'follow-banner', name: '关注横幅', description: '文末关注引导，由渲染器外壳提供', required: false, settingsField: 'showFollowBanner' },
    { id: 'end-mark', name: 'END 结束标记', description: '正文结束的收尾标记', required: true, matchComponentIds: ['base.divider'], hint: '全文一次' },
    { id: 'brand-footer', name: '品牌页脚', description: '品牌页脚，由渲染器外壳提供', required: false, settingsField: 'showBrandFooter' },
  ],
  guidelines: GENERIC_GUIDELINES,
  countRules: [
    { componentId: 'base.section', min: 2, max: 6, why: '少于 2 次不成节' },
    { componentId: 'base.divider', min: 1, max: 1, why: '只结束一次' },
    { componentId: 'base.intro', min: 1, max: 1, why: '导语只开一次' },
  ],
  skeleton: [
    'base.intro（导语）',
    '[ base.section → base.paragraph / base.image / base.list / base.callout / base.quote 的任意组合 ] × 2–6 节',
    'base.note（固定说明，可选）',
    'base.divider（END）',
  ],
};

/* ------------------------------------------------------------------ */

const weekly: DesignSystem = {
  ...generic,
  id: 'weekly', client: '周刊与作品集', name: '周刊与作品集', templateId: 'weekly',
  description: '完整内容在正文中阅读，原作入口集中在文末阅读原文。',
  tone: '具体、轻快，保留作者、出处与统计口径。',
  baseline: {
    ...generic.baseline,
    colors: { primary: '#28635b', primaryDeep: '#243746', accent: '#e87860', text: '#344a45', textStrong: '#243746', textMuted: '#748275', surface: '#ffffff', surfacePale: '#fcf8ec', line: '#e5eee8', onPrimary: '#ffffff' },
    palette: ['#28635b', '#243746', '#e87860', '#344a45', '#748275', '#e5eee8', '#fcf8ec', '#ffffff', '#40515f', '#fbfdff', '#9a8b5f', '#fff8e6', '#e0cf9a'],
    typeScale: ['12px', '13px', '14px', '15px', '16px', '18px', '20px', '22px', '24px', '28px', '32px', '48px'],
    lineHeights: ['1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.75', '1.8', '1.85', '1.9', '2'],
    letterSpacings: ['0px', '0.5px', '0.7px', '0.8px', '1px', '2px', '3px'],
    scopeComponentPrefixes: ['base.', 'weekly.'],
  },
  freedom: { ...generic.freedom, allowedComponents: [...(generic.freedom.allowedComponents as string[]), 'weekly.hero', 'weekly.overview', 'weekly.section', 'weekly.work', 'weekly.note', 'weekly.outro'] },
  brandSlots: [{ id: 'end', name: '结束标记', description: '全文一次', required: true, matchComponentIds: ['base.divider'] }],
  guidelines: [...GENERIC_GUIDELINES,
    { componentId: 'weekly.hero', whenToUse: '刊头，全文一次', whenNotToUse: '正文中间' },
    { componentId: 'weekly.overview', whenToUse: '本期概览，全文一次', whenNotToUse: '重复堆叠统计' },
    { componentId: 'weekly.section', whenToUse: '开启榜单或主题分组', whenNotToUse: '给每一句话加标题' },
    { componentId: 'weekly.work', whenToUse: '介绍一部作品，完整保留作者与出处', whenNotToUse: '无明确出处的搬运内容' },
    { componentId: 'weekly.note', whenToUse: '统计口径与来源说明', whenNotToUse: '替代作品介绍' },
    { componentId: 'weekly.outro', whenToUse: '收尾及阅读原文提示', whenNotToUse: '正文中间强制跳转' },
  ],
  adjacencySensitiveCategories: ['quote'],
  countRules: [{ componentId: 'weekly.hero', min: 1, max: 1 }, { componentId: 'weekly.overview', min: 1, max: 1 }, { componentId: 'base.divider', min: 1, max: 1 }],
  skeleton: ['weekly.hero', 'weekly.overview', '[weekly.section → weekly.work × N]', 'weekly.note', 'weekly.outro', 'base.divider'],
};

const designSystems: DesignSystem[] = [generic, weekly];

export function listDesignSystems(): DesignSystem[] {
  return designSystems.map((item) => ({ ...item }));
}

export function getDesignSystem(id: string): DesignSystem {
  const found = designSystems.find((item) => item.id === id);
  if (!found) throw new Error(`未知设计系统: ${id}（可用：${designSystems.map((item) => item.id).join('、')}）`);
  return found;
}

/** 给 AI 的概览：只到"选哪个客户"这个粒度，细节用 getDesignSystem 拿。 */
export function summarizeDesignSystem(design: DesignSystem) {
  return {
    id: design.id,
    client: design.client,
    name: design.name,
    description: design.description,
    templateId: design.templateId,
    baselineSource: design.baseline.source,
    componentCount: componentsOf(design).length,
    brandSlots: design.brandSlots.filter((slot) => slot.required).map((slot) => slot.name),
    skeleton: design.skeleton,
  };
}

/** 该设计系统校验范围内的组件定义。 */
export function componentsOf(design: DesignSystem) {
  return listComponents().filter((definition) => design.baseline.scopeComponentPrefixes.some((prefix) => definition.id.startsWith(prefix)));
}

/**
 * 给 AI 的组件目录：在 `digestComponents()` 的基础上补三样它选组件必需的信息——
 * **什么时候用**（guidelines）、**能不能用**（白名单）、**字段要注意什么**（锁定字段）。
 * 这些都属于设计系统，所以不放进组件定义本身。
 */
export interface CatalogEntry extends ComponentDigest {
  whenToUse?: string;
  whenNotToUse?: string;
  inWhitelist: boolean;
  lockedFields: { field: string; reason: string }[];
}

export function catalogFor(designSystemId: string): { designSystem: string; client: string; components: CatalogEntry[]; skeleton: string[] } {
  const design = getDesignSystem(designSystemId);
  const allowed = design.freedom.allowedComponents === 'all' ? null : new Set(design.freedom.allowedComponents);
  const guided = new Map(design.guidelines.map((item) => [item.componentId, item]));
  const scope = new Set(componentsOf(design).map((item) => item.id));
  const locked = new Map<string, { field: string; reason: string }[]>();
  for (const item of design.freedom.lockedFields) {
    locked.set(item.componentId, [...(locked.get(item.componentId) ?? []), { field: item.field, reason: item.reason }]);
  }

  const components = digestComponents()
    .filter((digest) => scope.has(digest.id))
    .map((digest) => {
      const guideline = guided.get(digest.id);
      return {
        ...digest,
        ...(guideline ? { whenToUse: guideline.whenToUse, whenNotToUse: guideline.whenNotToUse } : {}),
        inWhitelist: allowed ? allowed.has(digest.id) : true,
        lockedFields: locked.get(digest.id) ?? [],
      };
    });

  return { designSystem: design.id, client: design.client, components, skeleton: design.skeleton };
}

/** 字段类型的中文说明，给 AI 判断"这个字段该填什么"。 */
export const FIELD_KIND_HINT: Record<FieldKind, string> = {
  text: '单行文本',
  textarea: '多行文本',
  lines: '多行文本，一个换行 = 一条',
  image: '图片：填图片库素材 id（list_images 查），不要填外链',
};

/** 新文章的初始块序列：按骨架给出最小可用的结构，AI 在此基础上增删。 */
export function starterBlocks(designSystemId: string): { componentId: string; props?: Record<string, string> }[] {
  const design = getDesignSystem(designSystemId);
  if (design.id === 'weekly') {
    return [
      { componentId: 'weekly.hero' }, { componentId: 'weekly.overview' },
      { componentId: 'weekly.section' }, { componentId: 'weekly.work' },
      { componentId: 'weekly.note' }, { componentId: 'weekly.outro' },
      { componentId: 'base.divider' },
    ];
  }
  return [
    { componentId: 'base.intro', props: { text: '' } },
    { componentId: 'base.section', props: { title: '第一节标题' } },
    { componentId: 'base.paragraph', props: { text: '' } },
    { componentId: 'base.divider' },
  ];
}

/** 模板清单（含"待配置"的规划项），与设计系统对齐。 */
export function templateSummaries() {
  const ready = new Map(designSystems.map((design) => [design.templateId, design.name]));
  return listTemplates().map((item) => ({ ...item, designSystemId: [...ready.entries()].find(([templateId]) => templateId === item.id)?.[0] ?? null, designName: ready.get(item.id) ?? null }));
}

/** 该设计系统用到的模板 token（渲染时的配色来源）。 */
export function tokensOf(designSystemId: string) {
  return getTemplate(getDesignSystem(designSystemId).templateId).tokens;
}

/**
 * 按客户开一篇新文章：骨架的起手块 + 该客户绑定的模板。
 * id 由调用方给（保持文档 id 稳定，版本历史才不会断）。
 */
export function makeArticleFor(designSystemId: string, title: string, subtitle: string, id: string, now = new Date().toISOString()): ArticleDocument {
  const design = getDesignSystem(designSystemId);
  return {
    id,
    templateId: design.templateId,
    title,
    subtitle,
    blocks: starterBlocks(designSystemId).map((item) => makeBlock(item.componentId, item.props)),
    related: [],
    settings: { showFollowBanner: false, showRelated: false, showBrandFooter: false, showTitle: design.id !== 'weekly' },
    brandFooter: '',
    revision: 1,
    updatedAt: now,
  };
}

/** 白名单里的组件是否都存在——加客户时最常见的笔误，启动即查。 */
export function assertDesignSystemsValid(): void {
  for (const design of designSystems) {
    if (design.freedom.allowedComponents === 'all') continue;
    for (const id of design.freedom.allowedComponents) {
      if (!getComponent(id)) throw new Error(`设计系统 ${design.id} 的白名单里有不存在的组件: ${id}`);
    }
  }
}
