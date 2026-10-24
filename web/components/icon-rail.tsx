

import { IconBlocks, IconChevronLeft, IconImage, IconOutline, IconPalette } from './icons';

export type PanelDomain = 'components' | 'library' | 'outline' | 'design';

const DOMAINS: { id: PanelDomain; label: string; Icon: (props: { size?: number }) => React.ReactElement }[] = [
  { id: 'components', label: '组件库', Icon: IconBlocks },
  { id: 'library', label: '图片库', Icon: IconImage },
  { id: 'outline', label: '大纲', Icon: IconOutline },
  { id: 'design', label: '设计系统', Icon: IconPalette },
];

export function IconRail({ domain, collapsed, onDomain, onToggleCollapse }: {
  domain: PanelDomain;
  collapsed: boolean;
  onDomain: (domain: PanelDomain) => void;
  onToggleCollapse: () => void;
}) {
  return <nav className="icon-rail" aria-label="功能域">
    {DOMAINS.map((item) => <button
      key={item.id}
      className={`rail-item${domain === item.id && !collapsed ? ' active' : ''}`}
      onClick={() => onDomain(item.id)}
      title={item.label}
    >
      <item.Icon size={22} />
      <span>{item.label}</span>
    </button>)}
    <button className="rail-collapse" onClick={onToggleCollapse} title={collapsed ? '展开面板' : '收起面板（只留图标栏）'}>
      <IconChevronLeft size={15} />
      <span>{collapsed ? '展开' : '收起'}</span>
    </button>
  </nav>;
}
