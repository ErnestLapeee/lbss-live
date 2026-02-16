import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <div>
      <PageHeader title="Contact Us" description="Get in touch with LBSS" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-xl">
          <form className="space-y-5 rounded-xl border border-border bg-surface p-6">
            <div>
              <label htmlFor="name" className="block text-[11px] font-bold uppercase tracking-wider text-text-faint mb-1.5">Name</label>
              <input
                id="name"
                type="text"
                placeholder="Your name"
                className="w-full rounded-lg border border-border bg-surface-alt px-4 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-[11px] font-bold uppercase tracking-wider text-text-faint mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-surface-alt px-4 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-[11px] font-bold uppercase tracking-wider text-text-faint mb-1.5">Message</label>
              <textarea
                id="message"
                rows={4}
                placeholder="Your message..."
                className="w-full rounded-lg border border-border bg-surface-alt px-4 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors resize-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-accent hover:bg-accent-light text-white text-sm font-bold rounded-lg transition-colors"
            >
              Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
