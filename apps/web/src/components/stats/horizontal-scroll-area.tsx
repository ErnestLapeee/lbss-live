'use client';

import { useRef, useEffect, useCallback, type ReactNode } from 'react';

const DRAG_THRESHOLD_PX = 5;

function isInteractiveTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest('a, button, input, select, textarea, [role="button"], label'));
}

/**
 * Wide tables only show `overflow-x` at the bottom of the scroll area, so tall
 * tables force users to scroll vertically to reach the horizontal scrollbar.
 * This mirrors horizontal scroll at the top and keeps both in sync.
 *
 * Click-and-drag (grab) pans horizontally; small movements still count as clicks.
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

  useEffect(() => {
    const bottom = bottomRef.current;
    const top = topRef.current;
    if (!bottom || !top) return;

    const attachDrag = (
      el: HTMLElement,
      getScrollLeft: () => number,
      setScrollLeft: (v: number) => void,
    ) => {
      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        if (isInteractiveTarget(e.target)) return;

        const startX = e.clientX;
        const startScroll = getScrollLeft();
        let active = false;

        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          if (!active) {
            if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
            active = true;
            el.style.cursor = 'grabbing';
            el.style.userSelect = 'none';
            document.body.style.userSelect = 'none';
          }
          ev.preventDefault();
          setScrollLeft(startScroll - dx);
        };

        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          el.style.cursor = '';
          el.style.userSelect = '';
          document.body.style.userSelect = '';
        };

        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      };

      el.addEventListener('pointerdown', onPointerDown);
      return () => el.removeEventListener('pointerdown', onPointerDown);
    };

    const setBoth = (v: number) => {
      const max = Math.max(0, bottom.scrollWidth - bottom.clientWidth);
      const clamped = Math.max(0, Math.min(v, max));
      bottom.scrollLeft = clamped;
      top.scrollLeft = clamped;
    };

    const cleanupBottom = attachDrag(bottom, () => bottom.scrollLeft, (v) => {
      setBoth(v);
    });

    const cleanupTop = attachDrag(top, () => bottom.scrollLeft, (v) => {
      setBoth(v);
    });

    return () => {
      cleanupBottom();
      cleanupTop();
    };
  }, []);

  return (
    <div className={className}>
      <div
        ref={topRef}
        className="overflow-x-auto overflow-y-hidden border-b border-border/60 bg-surface-alt/80 [-ms-overflow-style:auto] [scrollbar-width:thin] cursor-grab active:cursor-grabbing"
        style={{ scrollbarGutter: 'stable' }}
        aria-hidden
        title="Drag or scroll horizontally"
      >
        <div ref={spacerRef} className="h-3 w-full" />
      </div>
      <div
        ref={bottomRef}
        className="overflow-x-auto cursor-grab active:cursor-grabbing"
        title="Drag to scroll the table sideways"
      >
        {children}
      </div>
    </div>
  );
}
