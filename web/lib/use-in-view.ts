import { useEffect, useRef, useState } from 'react';

/**
 * 元素进入视口才渲染。
 *
 * 组件库是 30 个**渲染出来的**缩略图（复刻计划 B2），每个都带着完整的内联样式 DOM，
 * 一次性全部挂上去会让面板首次展开明显卡顿。所以缩略图内容延后到接近视口再渲染，
 * 骨架高度先占位，滚动时不会跳动。
 */
export function useInView<T extends HTMLElement>(rootMargin = '600px 0px'): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    }, { root: null, rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
