import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'News' };

export default async function NewsPage() {
  let articles: any[] = [];
  try { articles = await apiFetch('/api/public/articles'); } catch {}

  return (
    <div>
      <PageHeader title="News" description="Announcements, recaps, and federation updates" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {articles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
            <p className="text-text-muted text-lg font-medium">No news articles published yet</p>
            <p className="text-text-faint text-sm mt-2">Check back soon for updates from LBSS.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {articles.map((article: any, i: number) => (
              <Link
                key={article.id}
                href={`/news/${article.slug}`}
                className="group block rounded-xl border border-border bg-surface p-5 hover:border-accent/30 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent">
                        News
                      </span>
                      <span className="text-[11px] text-text-faint">
                        {article.publishedAt
                          ? new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                          : ''}
                      </span>
                    </div>
                    <h2 className={`font-heading font-bold group-hover:text-accent transition-colors leading-snug ${
                      i === 0 ? 'text-xl' : 'text-base'
                    }`}>
                      {article.title}
                    </h2>
                    {article.excerpt && (
                      <p className="mt-2 text-sm text-text-muted line-clamp-2 leading-relaxed">{article.excerpt}</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-text-faint group-hover:text-accent transition-colors shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
