'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

const mainNavItems = [
  { label: 'Teams', href: '/teams' },
  { label: 'News', href: '/news' },
];

export function SiteHeader() {
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const megaRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMega = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setMegaOpen(true);
  };
  const closeMega = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setMegaOpen(false);
      timeoutRef.current = null;
    }, 120);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) setMegaOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#ccc]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-12 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/lbss-logo.png" alt="LBSS" className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold text-[#111]">LBSS</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <div
              ref={megaRef}
              className="relative"
              onMouseEnter={() => setMegaOpen(true)}
              onMouseLeave={closeMega}
            >
              <button
                className="px-3 py-1.5 text-sm text-[#333] hover:text-[#111] hover:underline flex items-center gap-1"
                onClick={() => setMegaOpen(!megaOpen)}
              >
                League
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {megaOpen && (
                <div
                  className="absolute left-0 top-full pt-1"
                  onMouseEnter={openMega}
                  onMouseLeave={closeMega}
                >
                  <div className="w-40 border border-[#ccc] bg-white shadow-sm py-1">
                    <Link href="/schedule" className="block px-3 py-1.5 text-sm text-[#333] hover:bg-[#f0f0f0]" onClick={() => setMegaOpen(false)}>Schedule</Link>
                    <Link href="/standings" className="block px-3 py-1.5 text-sm text-[#333] hover:bg-[#f0f0f0]" onClick={() => setMegaOpen(false)}>Standings</Link>
                    <Link href="/stats" className="block px-3 py-1.5 text-sm text-[#333] hover:bg-[#f0f0f0]" onClick={() => setMegaOpen(false)}>Statistics</Link>
                  </div>
                </div>
              )}
            </div>
            {mainNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="px-3 py-1.5 text-sm text-[#333] hover:text-[#111] hover:underline">
                {item.label}
              </Link>
            ))}
            <Link href="/about" className="px-3 py-1.5 text-sm text-[#333] hover:text-[#111] hover:underline">About</Link>
          </nav>

          <button
            className="md:hidden p-2 text-[#333]"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#ccc] bg-white">
          <div className="px-4 py-2 space-y-0">
            <div className="text-[11px] font-semibold text-[#666] uppercase pt-2 pb-1">League</div>
            <Link href="/schedule" className="block py-1.5 text-sm text-[#333]" onClick={() => setMobileOpen(false)}>Schedule</Link>
            <Link href="/standings" className="block py-1.5 text-sm text-[#333]" onClick={() => setMobileOpen(false)}>Standings</Link>
            <Link href="/stats" className="block py-1.5 text-sm text-[#333]" onClick={() => setMobileOpen(false)}>Statistics</Link>
            <div className="border-t border-[#eee] my-2" />
            {mainNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="block py-1.5 text-sm text-[#333]" onClick={() => setMobileOpen(false)}>{item.label}</Link>
            ))}
            <Link href="/about" className="block py-1.5 text-sm text-[#333]" onClick={() => setMobileOpen(false)}>About</Link>
          </div>
        </div>
      )}
    </header>
  );
}
