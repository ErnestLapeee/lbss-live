import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import Link from 'next/link';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const article: any = await apiFetch(`/api/public/articles/${slug}`);
    return { title: article.title };
  } catch {
    return { title: 'Article' };
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  let article: any;
  try {
    article = await apiFetch(`/api/public/articles/${slug}`);
  } catch {
    notFound();
  }

  return (
    <div>
      <div className="bg-primary">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/news" className="text-xs text-white/40 hover:text-white/70 transition-colors mb-4 inline-block">
            &larr; Back to News
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent-bright">
              News
            </span>
            <span className="text-xs text-white/40">
              {article.publishedAt
                ? new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : ''}
            </span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug">
            {article.title}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <article className="prose prose-lg max-w-none text-text leading-relaxed whitespace-pre-wrap">
          {article.content}
        </article>
      </div>
    </div>
  );
}
