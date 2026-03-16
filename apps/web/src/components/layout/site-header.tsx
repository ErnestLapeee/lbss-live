'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

const mainNavItems = [
  { label: 'Teams', href: '/teams' },
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
    <header className="sticky top-0 z-50 bg-[#2f2f2f] text-white border-b border-black/30">
      <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-10">
        <div className="flex h-12 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/lbss-logo.png" alt="LBSS" className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold text-white">LBSS</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <div
              ref={megaRef}
              className="relative"
              onMouseEnter={openMega}
              onMouseLeave={closeMega}
            >
              <button
                className="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:underline flex items-center gap-1"
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
                  <div className="w-40 border border-black/30 bg-[#3a3a3a] shadow-sm py-1">
                    <Link href="/schedule" className="block px-3 py-1.5 text-sm text-white/85 hover:bg-black/15" onClick={() => setMegaOpen(false)}>Schedule</Link>
                    <Link href="/standings" className="block px-3 py-1.5 text-sm text-white/85 hover:bg-black/15" onClick={() => setMegaOpen(false)}>Standings</Link>
                    <Link href="/stats" className="block px-3 py-1.5 text-sm text-white/85 hover:bg-black/15" onClick={() => setMegaOpen(false)}>Statistics</Link>
                  </div>
                </div>
              )}
            </div>
            {mainNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            className="md:hidden p-2 text-white/85 hover:text-white"
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
        <div className="md:hidden border-t border-black/30 bg-[#2f2f2f]">
          <div className="px-4 py-2 space-y-0">
            <div className="text-[11px] font-semibold text-white/55 uppercase pt-2 pb-1">League</div>
            <Link href="/schedule" className="block py-1.5 text-sm text-white/85" onClick={() => setMobileOpen(false)}>Schedule</Link>
            <Link href="/standings" className="block py-1.5 text-sm text-white/85" onClick={() => setMobileOpen(false)}>Standings</Link>
            <Link href="/stats" className="block py-1.5 text-sm text-white/85" onClick={() => setMobileOpen(false)}>Statistics</Link>
            <div className="border-t border-white/10 my-2" />
            {mainNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="block py-1.5 text-sm text-white/85" onClick={() => setMobileOpen(false)}>{item.label}</Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
