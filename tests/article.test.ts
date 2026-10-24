import { describe, expect, it } from 'vitest';
import { applyArticlePatch, makeBlock, makeDefaultArticle, migrateDocument } from '../shared/article';
import { digestComponents, getComponent, normalizeProps } from '../shared/components';
import { defaultImageLibrary } from '../shared/images';
import { auditArticle, auditCatalog } from '../shared/audit';
import { renderArticle } from '../shared/render';
import { listDesignSystems, makeArticleFor } from '../shared/design-system';

describe('文章与组件', () => {
  it('所有已注册组件都有唯一 id、字段与可渲染默认值', () => {
    const items = digestComponents();
    expect(items).toHaveLength(15);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) {
      for (const field of item.fields) expect(typeof item.defaults[field.key]).toBe('string');
    }
  });

  it('允许显式清空可选字段，重启迁移不会把默认文字补回来', () => {
    expect(normalizeProps('base.paragraph', { text: '正文', emphasis: '' }).emphasis).toBe('');
    const article = makeDefaultArticle();
    article.blocks = [makeBlock('base.image', { src: 'sample-cover', caption: '', alt: '示例' })];
    const migrated = migrateDocument(article);
    expect(migrated.blocks[0].props.caption).toBe('');
    expect(migrateDocument(migrated)).toEqual(migrated);
  });

  it('插入、移动与删除组件不修改输入文档', () => {
    const article = makeDefaultArticle();
    const original = structuredClone(article);
    const next = applyArticlePatch(article, { kind: 'insert-component', index: 0, componentId: 'base.quote' });
    expect(next.blocks).toHaveLength(article.blocks.length + 1);
    expect(next.blocks[0].componentId).toBe('base.quote');
    expect(article).toEqual(original);
  });

  it('保留有意清空的相关文章及关闭的装饰开关', () => {
    const article = migrateDocument({ ...makeDefaultArticle(), related: [], settings: { showFollowBanner: false, showRelated: false, showBrandFooter: false, showTitle: false } });
    expect(article.related).toEqual([]);
    expect(article.settings).toEqual({ showFollowBanner: false, showRelated: false, showBrandFooter: false, showTitle: false });
  });

  it('正文特殊字符按纯文本渲染', () => {
    const article = makeDefaultArticle();
    article.blocks = [makeBlock('base.paragraph', { text: '<script>alert("x")</script>', emphasis: '' })];
    const rendered = renderArticle(article, { mode: 'miniprogram-safe', images: defaultImageLibrary() });
    expect(rendered.exportHtml).not.toContain('<script>');
    expect(rendered.exportHtml).toContain('&lt;script&gt;');
    expect(rendered.exportHtml).not.toContain('data-editor-block');
    expect(rendered.html).toContain('data-editor-block');
  });

  it('示例文章可通过体检，并且没有客户内容或占位横幅', () => {
    const article = makeDefaultArticle();
    expect(auditArticle(article, defaultImageLibrary()).errors).toBe(0);
    const rendered = renderArticle(article, { mode: 'miniprogram-safe', images: defaultImageLibrary() });
    expect(rendered.warnings.filter((item) => item.severity !== 'info')).toEqual([]);
    expect(rendered.exportHtml).not.toContain('占位样式');
  });

  it.each(listDesignSystems().map((design) => design.id))('设计系统 %s 的组件遵循色板与排版基线', (id) => {
    const audit = auditCatalog(id);
    expect(audit.findings.filter((item) => item.level === 'error')).toEqual([]);
  });

  it('设计系统的白名单能阻止错用组件', () => {
    const article = makeDefaultArticle();
    article.blocks = [makeBlock('weekly.hero')];
    expect(auditArticle(article, defaultImageLibrary()).findings.some((item) => item.code === 'component-not-allowed')).toBe(true);
  });

  it('正文中的站外网址触发个人号发布配置的检查', () => {
    const article = makeDefaultArticle();
    article.blocks = [makeBlock('base.paragraph', { text: 'https://example.com/read', emphasis: '' })];
    expect(auditArticle(article, defaultImageLibrary()).findings.some((item) => item.code === 'external-link-in-body')).toBe(true);
  });

  it('新周刊使用自己的刊头，不重复输出文档标题', () => {
    const article = makeArticleFor('weekly', '标题', '摘要', 'sample');
    expect(article.settings.showTitle).toBe(false);
    expect(article.blocks[0].componentId).toBe('weekly.hero');
    expect(getComponent(article.blocks[0].componentId)).toBeDefined();
  });
});
