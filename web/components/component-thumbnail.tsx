

import { useEffect, useMemo, useRef, useState } from 'react';
import { getComponent, type RenderContext } from '../../shared/components';
import '../../shared/packs';
import { useInView } from '../lib/use-in-view';

/**
 * 缩略图按**当前客户的版心宽度**渲染再等比缩放，这样缩略图与画布是同一套排版。
 * 宽度由调用方传入（来自设计系统的 baseline.page.width），别在这里写死——
 * 版心是可配置的，写死就会和画布不一致。
 */
const FRAME_WIDTH = 325;

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 329;

export function useThumbnailHtml(componentId: string, ctx: RenderContext): string {
  return useMemo(() => {
    const definition = getComponent(componentId);
    if (!definition) return '';
    try {
      return definition.render(definition.defaults(), ctx);
    } catch {
      return '';
    }
  }, [componentId, ctx]);
}

export function ComponentThumbnail({ componentId, ctx, renderWidth }: { componentId: string; ctx: RenderContext; renderWidth: number }) {
  const html = useThumbnailHtml(componentId, ctx);
  const scale = FRAME_WIDTH / renderWidth;
  const { ref: viewRef, inView } = useInView<HTMLDivElement>();
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  useEffect(() => {
    if (!inView) return;
    const node = innerRef.current;
    if (!node) return;
    const measure = () => {
      // scrollHeight 是未经 transform 的布局高度，正好是要缩放的那个值
      const natural = node.scrollHeight;
      if (!natural) return;
      setHeight(Math.max(MIN_HEIGHT, Math.min(Math.round(natural * scale), MAX_HEIGHT)));
    };
    measure();
    // 图片加载完成会改变高度，ResizeObserver 能一并接住
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, html, scale]);

  return <div className="thumb-frame" ref={viewRef} style={{ height }}>
    {inView && <div
      className="thumb-scale"
      ref={innerRef}
      style={{ width: renderWidth, transform: `scale(${scale})` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />}
  </div>;
}
