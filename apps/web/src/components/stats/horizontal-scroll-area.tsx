'use client';

import { useRef, useEffect, type ReactNode } from 'react';

const DRAG_THRESHOLD_PX = 5;

function isInteractiveTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest('a, button, input, select, textarea, [role="button"], label'));
}

/**
 * Scrollable table viewport: vertical scrollbar on the left (RTL wrapper),
 * horizontal at bottom. Click-drag pans both axes.
 *
 * Uses incremental `scrollBy()` so panning works with `dir="rtl"` (assigning
 * `scrollLeft` directly is unreliable across browsers for RTL).
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
      const pointerId = e.pointerId;
      let lastX = e.clientX;
      let lastY = e.clientY;
      let active = false;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;

        if (!active) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
          active = true;
          try {
            el.setPointerCapture(pointerId);
          } catch {
            /* ignore */
          }
          el.style.cursor = 'grabbing';
          el.style.userSelect = 'none';
          document.body.style.userSelect = 'none';
        }
        ev.preventDefault();
        // Incremental scroll; works with dir=rtl (unlike assigning scrollLeft)
        el.scrollBy({ left: -dx, top: -dy });
      };

      const onUp = () => {
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
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
