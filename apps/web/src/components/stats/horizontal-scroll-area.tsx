'use client';

import { useRef, useEffect, type ReactNode } from 'react';

const DRAG_THRESHOLD_PX = 5;

function isInteractiveTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest('a, button, input, select, textarea, [role="button"], label'));
}

/** LTR scroll offset: 0 = start of content (left in LTR). Works with RTL scroll containers. */
function getScrollLeftNormalized(el: HTMLElement): number {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  if (getComputedStyle(el).direction === 'rtl') {
    return max - el.scrollLeft;
  }
  return el.scrollLeft;
}

function setScrollLeftNormalized(el: HTMLElement, value: number): void {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const clamped = Math.max(0, Math.min(value, max));
  if (getComputedStyle(el).direction === 'rtl') {
    el.scrollLeft = max - clamped;
  } else {
    el.scrollLeft = clamped;
  }
}

/**
 * Scrollable table viewport: vertical scrollbar on the left (RTL wrapper trick),
 * horizontal at bottom. Click-drag pans both axes; skips interactive elements.
 */
export function HorizontalScrollArea({ children, className = '' }: { children: ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startScrollLeft = getScrollLeftNormalized(el);
      const startScrollTop = el.scrollTop;
      let active = false;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!active) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          active = true;
          el.style.cursor = 'grabbing';
          el.style.userSelect = 'none';
          document.body.style.userSelect = 'none';
        }
        ev.preventDefault();

        const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
        setScrollLeftNormalized(el, startScrollLeft - dx);
        el.scrollTop = Math.max(0, Math.min(startScrollTop - dy, maxY));
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
  }, []);

  return (
    <div
      ref={scrollRef}
      dir="rtl"
      className={`stats-table-scroll overflow-auto cursor-grab max-h-[min(72vh,calc(100dvh-12rem))] ${className}`}
      title="Drag to scroll the table"
    >
      <div dir="ltr" className="min-w-full inline-block text-left">
        {children}
      </div>
    </div>
  );
}
