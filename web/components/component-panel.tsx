

import type { ComponentDigest, RenderContext } from '../../shared/components';
import { COMPONENT_CATEGORIES } from '../../shared/components';
import type { ComponentUsage } from '../../shared/article';
import { IconSearch } from './icons';
import { ComponentThumbnail } from './component-thumbnail';

export type SubTab = 'all' | 'frequent' | 'recent' | 'weekly';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'frequent', label: '常用' },
  { id: 'recent', label: '最近使用' },
  { id: 'weekly', label: '周刊组件' },
];

/** 「常用」「最近使用」各取前 N 个：页签是快捷入口，不是完整列表。 */
const SHORTCUT_LIMIT = 12;


const TAB_LABELS: Record<string, string> = {
  head: '开头',
  text: '正文',
  media: '图片',
  emphasis: '强调',
  quote: '引用',
  decor: '装饰',
  closing: '收尾',
};

export function filterComponents(
  components: ComponentDigest[],
  options: { category: string; subTab: SubTab; query: string; usage: Record<string, ComponentUsage> },
): ComponentDigest[] {
  const { category, subTab, query, usage } = options;
  const needle = query.trim().toLowerCase();
  let list = components;

  if (category !== 'all') list = list.filter((item) => item.category === category);
  if (subTab === 'weekly') list = list.filter((item) => item.id.startsWith('weekly.'));
  if (subTab === 'frequent') {
    list = list
      .filter((item) => (usage[item.id]?.count ?? 0) > 0)
      .sort((a, b) => (usage[b.id]?.count ?? 0) - (usage[a.id]?.count ?? 0))
      .slice(0, SHORTCUT_LIMIT);
  }
  if (subTab === 'recent') {
    list = list
      .filter((item) => usage[item.id]?.lastUsedAt)
      .sort((a, b) => String(usage[b.id]?.lastUsedAt).localeCompare(String(usage[a.id]?.lastUsedAt)))
      .slice(0, SHORTCUT_LIMIT);
  }
  if (needle) {
    // whenToUse（P0）落地后要一起进搜索范围，否则 AI 与人都搜不到"什么时候用"
    list = list.filter((item) => `${item.name}${item.id}${item.summary}`.toLowerCase().includes(needle));
  }
  return list;
}

export function ComponentPanel({ components, usage, ctx, renderWidth, category, subTab, query, busy, onCategory, onSubTab, onQuery, onInsert }: {
  components: ComponentDigest[];
  usage: Record<string, ComponentUsage>;
  ctx: RenderContext;
  /** 缩略图的渲染宽度 = 当前客户的版心宽度。 */
  renderWidth: number;
  category: string;
  subTab: SubTab;
  query: string;
  busy: boolean;
  onCategory: (category: string) => void;
  onSubTab: (subTab: SubTab) => void;
  onQuery: (query: string) => void;
  onInsert: (componentId: string) => void;
}) {
  const shown = filterComponents(components, { category, subTab, query, usage });
  const emptyShortcut = (subTab === 'frequent' || subTab === 'recent') && !shown.length && !query.trim();

  return <div className="panel-domain pane-fixed">
    <div className="tabs-lv1" role="tablist">
      <button
        role="tab"
        aria-selected={category === 'all'}
        className={`tab-lv1${category === 'all' ? ' active' : ''}`}
        onClick={() => onCategory('all')}
      >全部</button>
      {COMPONENT_CATEGORIES.map((item) => <button
        key={item.id}
        role="tab"
        aria-selected={category === item.id}
        className={`tab-lv1${category === item.id ? ' active' : ''}`}
        title={`${item.name}（${components.filter((component) => component.category === item.id).length} 个组件）`}
        onClick={() => onCategory(item.id)}
      >{TAB_LABELS[item.id] ?? item.name}</button>)}
    </div>

    <div className="tabs-lv2">
      <div className="tabs-lv2-list" role="tablist">
        {SUB_TABS.map((item) => <button
          key={item.id}
          role="tab"
          aria-selected={subTab === item.id}
          className={`tab-lv2${subTab === item.id ? ' active' : ''}`}
          onClick={() => onSubTab(item.id)}
        >{item.label}</button>)}
      </div>
      <label className="panel-search" title="按组件名、说明或 id 搜索">
        <IconSearch size={15} />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索组件" />
      </label>
    </div>

    <div className="tpl-list">
      {shown.map((item) => <button
        key={item.id}
        className="tpl-item"
        data-component-id={item.id}
        draggable
        disabled={busy}
        title={`${item.name} · ${item.summary}`}
        onDragStart={(event) => { event.dataTransfer.setData('text/component-id', item.id); event.dataTransfer.effectAllowed = 'copy'; }}
        onClick={() => onInsert(item.id)}
      >
        <ComponentThumbnail componentId={item.id} ctx={ctx} renderWidth={renderWidth} />
      </button>)}
      {emptyShortcut && <p className="panel-empty">
        {subTab === 'frequent' ? '还没有常用组件。连续用几次某类组件后，它会出现在这里。' : '还没有使用记录。'}
      </p>}
      {!shown.length && !emptyShortcut && <p className="panel-empty">没有匹配的组件。</p>}
    </div>

    <div className="tpl-footer">
      <span>{shown.length} / {components.length} 个组件</span>
      <span className="tpl-footer-hint">点缩略图插入到选中块之后，也可以拖到画布上任意位置</span>
    </div>
  </div>;
}
