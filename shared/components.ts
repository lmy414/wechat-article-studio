/**
 * 通用组件系统。
 *
 * 一次排版 = 一串组件实例（`ArticleBlock`），每个实例只记 `componentId` 与 `props`。
 * 组件的结构、样式与可编辑字段都定义在注册表里，所以：
 * - 人工排版：从组件库拖一个进画布即可；
 * - AI 排版：只要给出 `componentId` 和 `props`，不需要理解 CSS；
 * - 新增组件包：写一个 `ComponentDefinition[]` 并注册，不用改渲染器。
 */

export type RenderMode = 'high-fidelity' | 'miniprogram-safe';

/** 字段类型决定检查器用什么控件，也决定 AI 该填什么。 */
export type FieldKind = 'text' | 'textarea' | 'lines' | 'image';

export interface ComponentField {
  key: string;
  label: string;
  kind: FieldKind;
  /** 给人工与 AI 的填写提示。 */
  help?: string;
  /**
   * 可选字段：留空是**合法**的（例如正文的"要强调的短语"可能就没有）。
   * 校验器对可选字段的空值只报 info，不报 error——把可选当必填会让体检天天误报。
   */
  optional?: boolean;
}

/** 设计变量：一个模板就是一组 token，组件渲染时读取它，避免把品牌色写死在组件里。 */
export interface DesignTokens {
  primary: string;
  emphasis: string;
  text: string;
  muted: string;
  soft: string;
  pale: string;
  footer: string;
  white: string;
  end: string;
  /** 正文字体栈。留空表示不设置 font-family（微信会用自己的字体栈，官方不建议覆盖）。 */
  fontFamily?: string;
}

export interface RenderContext {
  mode: RenderMode;
  tokens: DesignTokens;
  /**
   * 把图片库里的引用解析成可用地址。
   * 组件里只写图片库的 id 或相对路径，不写死部署地址。
   */
  imageUrl(ref: string): string;
}

export interface ComponentDefinition {
  /** 稳定标识，形如 `base.paragraph` / `weekly.work`。数据里存的就是它，不要改。 */
  id: string;
  name: string;
  category: string;
  /** 一句话说明用在哪里，供人工和 AI 选择组件。 */
  summary: string;
  /** 可选来源标注，例如逆向自原文的哪个 DOM 节点，便于回溯维护。 */
  sourceRef?: string;
  /** 可编辑字段。空数组表示纯装饰件，拖进去即可用。 */
  fields: ComponentField[];
  /** 新建实例时的初始值，键与 fields 一一对应。 */
  defaults(): Record<string, string>;
  /**
   * 渲染为可粘贴进公众号编辑器的 HTML。
   * 约定：只用内联样式，块级容器用 `<section>`，不产出 `<style>` / `class` / `<div>` 包裹的布局。
   */
  render(props: Record<string, string>, ctx: RenderContext): string;
}

export interface ComponentCategory {
  id: string;
  name: string;
  /** 面板里的排列顺序。 */
  order: number;
}

export const COMPONENT_CATEGORIES: ComponentCategory[] = [
  { id: 'head', name: '开头与导语', order: 1 },
  { id: 'text', name: '正文与标题', order: 2 },
  { id: 'media', name: '图片与图文', order: 3 },
  { id: 'emphasis', name: '强调与卡片', order: 4 },
  { id: 'quote', name: '引用', order: 5 },
  { id: 'decor', name: '装饰与分隔', order: 6 },
  { id: 'closing', name: '收尾与延伸', order: 7 },
];

const registry = new Map<string, ComponentDefinition>();

export function registerComponents(definitions: ComponentDefinition[]): void {
  for (const definition of definitions) {
    if (registry.has(definition.id)) throw new Error(`组件 id 重复注册: ${definition.id}`);
    registry.set(definition.id, definition);
  }
}

export function getComponent(id: string): ComponentDefinition | undefined {
  return registry.get(id);
}

export function requireComponent(id: string): ComponentDefinition {
  const definition = registry.get(id);
  if (!definition) throw new Error(`未知组件: ${id}`);
  return definition;
}

export function listComponents(): ComponentDefinition[] {
  return [...registry.values()];
}

export function listCategories(): ComponentCategory[] {
  return [...COMPONENT_CATEGORIES].sort((a, b) => a.order - b.order);
}

/** 按分类分组，供组件库面板使用。 */
export function groupComponentsByCategory(): { category: ComponentCategory; components: ComponentDefinition[] }[] {
  return listCategories().map((category) => ({
    category,
    components: listComponents().filter((definition) => definition.category === category.id),
  })).filter((group) => group.components.length > 0);
}

/**
 * 组件给 AI 看的清单：只暴露选择与填值需要的信息，不含 HTML 细节。
 * `/api/components` 与 MCP 的 list_components 都用它。
 */
export interface ComponentDigest {
  id: string;
  name: string;
  category: string;
  summary: string;
  fields: ComponentField[];
  defaults: Record<string, string>;
}

export function digestComponents(): ComponentDigest[] {
  return listComponents().map((definition) => ({
    id: definition.id,
    name: definition.name,
    category: definition.category,
    summary: definition.summary,
    fields: definition.fields,
    defaults: definition.defaults(),
  }));
}

/** 用组件定义补全缺失的 props，避免旧数据或 AI 少填字段时渲染出空占位。 */
export function normalizeProps(componentId: string, props: Record<string, string> = {}): Record<string, string> {
  const definition = getComponent(componentId);
  if (!definition) throw new Error(`未知组件: ${componentId}`);
  const base = definition.defaults();
  for (const field of definition.fields) {
    const value = props[field.key];
    if (typeof value === 'string') base[field.key] = value;
  }
  return base;
}
