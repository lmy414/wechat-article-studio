import type { DesignTokens } from './components';

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  status: 'ready' | 'planned';
}
export interface TemplateDefinition { summary: TemplateSummary; tokens: DesignTokens }

export const genericTemplate: TemplateDefinition = {
  summary: { id: 'generic', name: '通用图文', description: '导语、章节、配图、引用和说明，适合日常长文。', status: 'ready' },
  tokens: {
    primary: '#2f6f9f', emphasis: '#1f5d87', text: '#3e3e3e', muted: '#7f7f7f',
    soft: '#eef4f9', pale: '#f7fafc', footer: '#fafafa', white: '#ffffff', end: '#5b8cae',
  },
};
export const weeklyTemplate: TemplateDefinition = {
  summary: { id: 'weekly', name: '周刊与作品集', description: '刊头、作品卡和数据说明，适合周刊、榜单与作品推荐。', status: 'ready' },
  tokens: {
    primary: '#28635b', emphasis: '#243746', text: '#344a45', muted: '#748275',
    soft: '#e5eee8', pale: '#fcf8ec', footer: '#fcf8ec', white: '#ffffff', end: '#e87860',
  },
};
const templates = [genericTemplate, weeklyTemplate];
export function listTemplates(): TemplateSummary[] { return templates.map((item) => item.summary); }
export function getTemplate(id: string): TemplateDefinition {
  const found = templates.find((item) => item.summary.id === id);
  if (!found) throw new Error(`未知模板: ${id}`);
  return found;
}
export function defaultTemplate(): TemplateDefinition { return genericTemplate; }
export function modeLabel(mode: 'high-fidelity' | 'miniprogram-safe'): string {
  return mode === 'high-fidelity' ? '装饰版' : '兼容版（建议发布）';
}
