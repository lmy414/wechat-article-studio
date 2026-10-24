

interface IconProps {
  size?: number;
}

function svg(path: string, size: number): React.ReactElement {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: path }} />;
}

export function IconOpen({ size = 20 }: IconProps) {
  return svg('<path d="M3 7.5A2 2 0 0 1 5 5.5h3.6l1.8 2.2H19a2 2 0 0 1 2 2v7A2 2 0 0 1 19 18.7H5a2 2 0 0 1-2-2z"/>', size);
}

export function IconPreview({ size = 20 }: IconProps) {
  return svg('<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>', size);
}

export function IconSave({ size = 20 }: IconProps) {
  return svg('<path d="M5 3.5h9.5L19 8v12.5H5z"/><path d="M8.5 3.5v5h6"/><path d="M8.5 20.5v-6h7v6"/>', size);
}

export function IconExport({ size = 20 }: IconProps) {
  return svg('<path d="M12 3.5v11"/><path d="M7.8 10.6 12 14.8l4.2-4.2"/><path d="M4.5 17.5v2a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-2"/>', size);
}

export function IconMore({ size = 20 }: IconProps) {
  return svg('<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4v4"/><path d="M12 20.6v-4"/><path d="M3.4 12h4"/><path d="M20.6 12h-4"/>', size);
}

export function IconUndo({ size = 20 }: IconProps) {
  return svg('<path d="M4 9h10.2A5.3 5.3 0 0 1 19.5 14.3 5.3 5.3 0 0 1 14.2 19.6H6"/><path d="M7.8 5.2 3.9 9l3.9 3.8"/>', size);
}

export function IconRedo({ size = 20 }: IconProps) {
  return svg('<path d="M20 9H9.8A5.3 5.3 0 0 0 4.5 14.3 5.3 5.3 0 0 0 9.8 19.6H18"/><path d="M16.2 5.2 20.1 9l-3.9 3.8"/>', size);
}

export function IconHelp({ size = 20 }: IconProps) {
  return svg('<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.8v.4"/><path d="M12 17.4h.01"/>', size);
}

export function IconSettings({ size = 20 }: IconProps) {
  return svg('<circle cx="12" cy="12" r="2.7"/><path d="M19.2 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1.1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1.1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.4 1Z"/>', size);
}

export function IconBlocks({ size = 22 }: IconProps) {
  return svg('<rect x="3.5" y="4" width="17" height="6" rx="1.2"/><rect x="3.5" y="14" width="17" height="6" rx="1.2"/>', size);
}

export function IconImage({ size = 22 }: IconProps) {
  return svg('<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.6" cy="9.6" r="1.7"/><path d="M4 17.5l4.6-4.2 3.2 2.9 3.1-3 4.6 4.3"/>', size);
}

export function IconOutline({ size = 22 }: IconProps) {
  return svg('<path d="M4 6.5h16"/><path d="M4 12h16"/><path d="M4 17.5h16"/>', size);
}

export function IconPalette({ size = 22 }: IconProps) {
  return svg('<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.9-.9 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-.9.7-1.6 1.6-1.6h1.6a4.4 4.4 0 0 0 4.4-4.4c0-3.7-3.7-6.8-8.5-6.8Z"/><circle cx="7.8" cy="11" r="1.1"/><circle cx="10.6" cy="7.6" r="1.1"/><circle cx="14.6" cy="7.6" r="1.1"/>', size);
}

export function IconSearch({ size = 18 }: IconProps) {
  return svg('<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20 20"/>', size);
}

export function IconClose({ size = 18 }: IconProps) {
  return svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>', size);
}

export function IconChevronLeft({ size = 16 }: IconProps) {
  return svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>', size);
}

export function IconUp({ size = 16 }: IconProps) {
  return svg('<path d="M5.5 14.5 12 8l6.5 6.5"/>', size);
}

export function IconDown({ size = 16 }: IconProps) {
  return svg('<path d="M5.5 9.5 12 16l6.5-6.5"/>', size);
}

export function IconCopy({ size = 16 }: IconProps) {
  return svg('<rect x="8.5" y="8.5" width="11" height="11" rx="1.6"/><path d="M15.5 8.5v-2a1.6 1.6 0 0 0-1.6-1.6H6.1A1.6 1.6 0 0 0 4.5 6.5V15a1.6 1.6 0 0 0 1.6 1.6h2"/>', size);
}

export function IconTrash({ size = 16 }: IconProps) {
  return svg('<path d="M4.5 7h15"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l1 12.5h9L17.5 7"/><path d="M10.5 10.5v6"/><path d="M13.5 10.5v6"/>', size);
}

export function IconZoom({ size = 16 }: IconProps) {
  return svg('<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20 20"/>', size);
}
