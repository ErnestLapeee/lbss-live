import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="bg-primary text-white/70">
      {/* Accent stripe */}
      <div className="h-[2px] bg-gradient-to-r from-accent via-gold to-accent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/lbss-logo.png" alt="LBSS" className="h-8 w-8 object-contain opacity-80" />
              <div>
                <div className="font-heading text-sm font-bold text-white">LBSS</div>
                <div className="text-[9px] uppercase tracking-[0.1em] text-white/40">Est. ----</div>
              </div>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              Latvijas Beisbola Softbola Savieniba — the official governing body for baseball and softball in Latvia.
            </p>
          </div>

          {/* League */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-3">League</h3>
            <ul className="space-y-2">
              <li><Link href="/schedule" className="text-sm hover:text-white transition-colors">Schedule</Link></li>
              <li><Link href="/standings" className="text-sm hover:text-white transition-colors">Standings</Link></li>
              <li><Link href="/teams" className="text-sm hover:text-white transition-colors">Teams</Link></li>
              <li><Link href="/leaderboards" className="text-sm hover:text-white transition-colors">Statistics</Link></li>
            </ul>
          </div>

          {/* Federation */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-3">Federation</h3>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-sm hover:text-white transition-colors">About LBSS</Link></li>
              <li><Link href="/news" className="text-sm hover:text-white transition-colors">News</Link></li>
              <li><Link href="/players" className="text-sm hover:text-white transition-colors">Players</Link></li>
              <li><Link href="/contact" className="text-sm hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-3">Contact</h3>
            <ul className="space-y-2 text-sm text-white/50">
              <li>Riga, Latvia</li>
              <li>info@lbss.lv</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-white/30">
            &copy; {new Date().getFullYear()} Latvijas Beisbola Softbola Savieniba. All rights reserved.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_ADMIN_URL || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
          >
            Admin
          </a>
        </div>
      </div>
    </footer>
  );
}
