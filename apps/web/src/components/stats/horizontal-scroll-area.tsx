'use client';

import { useRef, useEffect, type ReactNode } from 'react';

const DRAG_THRESHOLD_PX = 5;

function isInteractiveTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest('a, button, input, select, textarea, [role="button"], label'));
}

/**
 * Scrollable table viewport: horizontal + vertical overflow with click-drag to pan
 * (grab). Skips interactive elements; small movements still count as clicks.
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
      const startScrollLeft = el.scrollLeft;
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

        const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
        const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollLeft = Math.max(0, Math.min(startScrollLeft - dx, maxX));
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
      className={`overflow-auto cursor-grab max-h-[min(72vh,calc(100dvh-12rem))] [-ms-overflow-style:auto] [scrollbar-width:thin] ${className}`}
      title="Drag to scroll the table"
    >
      {children}
    </div>
  );
}
