'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

const LEAGUE_LINKS = [
  { href: '/schedule', label: 'Schedule' },
  { href: '/standings', label: 'Standings' },
  { href: '/stats', label: 'Statistics' },
];

const JUNIORIEM_LINKS = [
  { href: '/junioriem/schedule', label: 'Schedule' },
  { href: '/junioriem/standings', label: 'Standings' },
  { href: '/junioriem/statistika', label: 'Statistics' },
];

const mainNavItems = [
  { label: 'Teams', href: '/teams' },
];

function NavDropdown({
  label,
  items,
  open,
  align = 'left',
  onOpen,
  onClose,
}: {
  label: string;
  items: { href: string; label: string }[];
  open: boolean;
  align?: 'left' | 'right';
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative" onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        className="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:underline flex items-center gap-1"
        onClick={() => (open ? onClose() : onOpen())}
      >
        {label}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`absolute top-full pt-1 ${align === 'right' ? 'right-0' : 'left-0'}`} onMouseEnter={onOpen} onMouseLeave={onClose}>
          <div className="w-40 border border-black/30 bg-[#3a3a3a] shadow-sm py-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-1.5 text-sm text-white/85 hover:bg-black/15"
                onClick={onClose}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const [openMenu, setOpenMenu] = useState<'league' | 'junioriem' | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = (menu: 'league' | 'junioriem') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setOpenMenu(menu);
  };
  const close = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setOpenMenu(null);
      timeoutRef.current = null;
    }, 120);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-nav-menu]')) return;
      setOpenMenu(null);
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

          <nav className="hidden md:flex items-center gap-1 mr-14" data-nav-menu>
            <NavDropdown
              label="League"
              items={LEAGUE_LINKS}
              open={openMenu === 'league'}
              onOpen={() => open('league')}
              onClose={close}
            />
            {mainNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:underline">
                {item.label}
              </Link>
            ))}
            <NavDropdown
              label="Junioriem"
              items={JUNIORIEM_LINKS}
              open={openMenu === 'junioriem'}
              onOpen={() => open('junioriem')}
              onClose={close}
            />
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
            {LEAGUE_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="block py-1.5 text-sm text-white/85" onClick={() => setMobileOpen(false)}>{item.label}</Link>
            ))}
            <div className="text-[11px] font-semibold text-white/55 uppercase pt-3 pb-1">Junioriem</div>
            {JUNIORIEM_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="block py-1.5 text-sm text-white/85" onClick={() => setMobileOpen(false)}>{item.label}</Link>
            ))}
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
