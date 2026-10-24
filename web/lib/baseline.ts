/**
 * 基线的兜底值。
 *
 * **真正的基线来自设计系统声明**（`shared/design-system.ts`），界面通过
 * `/api/design-systems/:id` 取它（见 `web/use-editor.ts`）。这里只是给首帧、
 * 或面板还没取到数据时一个能渲染的值——所以**直接引用同一份声明，不再手抄数字**：
 * 两份真值迟早会不一致，而"基线"的全部意义就是唯一真值。
 *
 * 界面 chrome 的颜色不在这里，那是编辑器自己的配色（见 styles.css 的 --chrome-*）。
 */

import { getDesignSystem, type DesignBaseline } from '../../shared/design-system';

export type { DesignBaseline };

export const DISPLAY_BASELINE: DesignBaseline = getDesignSystem('generic').baseline;


export function baselineSummary(baseline: DesignBaseline = DISPLAY_BASELINE): string {
  return `字号 ${baseline.type.body}，行间距 ${baseline.lineHeight.body}，字间距 ${baseline.letterSpacing.body}`;
}
