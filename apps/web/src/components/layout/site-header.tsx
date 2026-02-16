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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setMegaOpen(true);
  };

  const closeMega = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setMegaOpen(false);
      timeoutRef.current = null;
    }, 100);
  };

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) {
        setMegaOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-primary border-b border-white/[0.06]">
      {/* Top accent line */}
      <div className="h-[3px] bg-gradient-to-r from-accent via-gold to-accent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo + Org name */}
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/lbss-logo.png"
              alt="LBSS"
              className="h-10 w-10 object-contain transition-transform group-hover:scale-105"
            />
            <div className="hidden sm:block">
              <div className="font-heading text-[15px] font-bold text-white leading-tight tracking-tight">
                LBSS
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/50 leading-tight">
                Latvijas Beisbola Savieniba
              </div>
            </div>
          </Link>

          {/* Main nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {/* Liga mega-dropdown trigger */}
            <div
              ref={megaRef}
              className="relative"
              onMouseEnter={openMega}
              onMouseLeave={closeMega}
            >
              <button
                className={`relative px-3.5 py-2 text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors flex items-center gap-1.5 ${
                  megaOpen ? 'text-white' : 'text-white/70 hover:text-white'
                }`}
                onClick={() => setMegaOpen(!megaOpen)}
              >
                Latvijas Beisbola Liga
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${megaOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown */}
              {megaOpen && (
                <div
                  className="absolute left-0 top-full pt-2"
                  onMouseEnter={openMega}
                  onMouseLeave={closeMega}
                >
                  <div className="w-48 rounded-lg border border-white/10 bg-[#162038] shadow-2xl shadow-black/50 backdrop-blur-sm overflow-hidden">
                    {/* Accent top edge */}
                    <div className="h-[2px] bg-gradient-to-r from-accent to-accent/40" />

                    <div className="p-1.5">
                      {[
                        { label: 'Schedule', href: '/schedule', sub: 'Games & scores' },
                        { label: 'Standings', href: '/standings', sub: 'Rankings & records' },
                        { label: 'Statistics', href: '/stats', sub: 'Leaders & tables' },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="group flex flex-col gap-0.5 px-3 py-2.5 rounded-md hover:bg-white/[0.07] transition-colors"
                          onClick={() => setMegaOpen(false)}
                        >
                          <span className="text-[13px] font-semibold text-white/80 group-hover:text-white transition-colors">
                            {item.label}
                          </span>
                          <span className="text-[11px] text-white/30 group-hover:text-white/45 transition-colors">
                            {item.sub}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Regular nav items */}
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-3.5 py-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-white/70 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right section */}
          <div className="flex items-center gap-3">
            <Link
              href="/about"
              className="hidden lg:inline-flex text-[13px] font-medium text-white/50 hover:text-white/80 transition-colors"
            >
              About
            </Link>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 text-white/70 hover:text-white"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-primary-light">
          <div className="px-4 py-3 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
              Latvijas Beisbola Liga
            </div>
            <Link href="/schedule" className="block px-3 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg" onClick={() => setMobileOpen(false)}>
              Schedule
            </Link>
            <Link href="/standings" className="block px-3 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg" onClick={() => setMobileOpen(false)}>
              Standings
            </Link>
            <Link href="/stats" className="block px-3 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg" onClick={() => setMobileOpen(false)}>
              Statistics
            </Link>
            <div className="h-px bg-white/[0.06] my-2" />
            {mainNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="h-px bg-white/[0.06] my-2" />
            <Link href="/about" className="block px-3 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.04] rounded-lg" onClick={() => setMobileOpen(false)}>
              About
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
