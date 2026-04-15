'use client';

import { useRef, useEffect, useCallback, type ReactNode } from 'react';

/**
 * Wide tables only show `overflow-x` at the bottom of the scroll area, so tall
 * tables force users to scroll vertically to reach the horizontal scrollbar.
 * This mirrors horizontal scroll at the top and keeps both in sync.
 */
export function HorizontalScrollArea({ children, className = '' }: { children: ReactNode; className?: string }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  const syncSpacerWidth = useCallback(() => {
    const bottom = bottomRef.current;
    const spacer = spacerRef.current;
    if (!bottom || !spacer) return;
    spacer.style.width = `${bottom.scrollWidth}px`;
  }, []);

  useEffect(() => {
    const bottom = bottomRef.current;
    const top = topRef.current;
    if (!bottom || !top) return;

    const ro = new ResizeObserver(() => syncSpacerWidth());
    ro.observe(bottom);
    syncSpacerWidth();

    const onBottomScroll = () => {
      if (top.scrollLeft !== bottom.scrollLeft) top.scrollLeft = bottom.scrollLeft;
    };
    const onTopScroll = () => {
      if (bottom.scrollLeft !== top.scrollLeft) bottom.scrollLeft = top.scrollLeft;
    };
    bottom.addEventListener('scroll', onBottomScroll, { passive: true });
    top.addEventListener('scroll', onTopScroll, { passive: true });

    return () => {
      ro.disconnect();
      bottom.removeEventListener('scroll', onBottomScroll);
      top.removeEventListener('scroll', onTopScroll);
    };
  }, [syncSpacerWidth]);

  return (
    <div className={className}>
      <div
        ref={topRef}
        className="overflow-x-auto overflow-y-hidden border-b border-border/60 bg-surface-alt/80 [-ms-overflow-style:auto] [scrollbar-width:thin]"
        style={{ scrollbarGutter: 'stable' }}
        aria-hidden
        title="Scroll horizontally"
      >
        {/* Non-zero height so the browser draws a horizontal scrollbar */}
        <div ref={spacerRef} className="h-3 w-full" />
      </div>
      <div ref={bottomRef} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
