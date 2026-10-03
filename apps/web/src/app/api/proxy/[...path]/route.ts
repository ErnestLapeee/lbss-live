import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

function proxyPathKey(path: string[]): string {
  return path.join('/');
}

/** Live/scoring paths must never be cached; stats and standings can be. */
function upstreamFetchOptions(path: string[], searchParams: URLSearchParams): RequestInit {
  const p = proxyPathKey(path);

  if (searchParams.get('status') === 'live') {
    return { cache: 'no-store' };
  }
  if (/\/games\/\d+\/(events|lineups|boxscore|pitching-boxscore|fielding-boxscore)/.test(p)) {
    return { cache: 'no-store' };
  }
  if (p.startsWith('public/stats/') || p.startsWith('public/standings')) {
    return { next: { revalidate: 60 } };
  }
  if (p.startsWith('public/seasons') || p.startsWith('public/teams') || p.startsWith('public/articles')) {
    return { next: { revalidate: 120 } };
  }
  if (p === 'public/games' || /^public\/games\/\d+$/.test(p)) {
    return { next: { revalidate: 20 } };
  }
  if (p.startsWith('public/players')) {
    return { next: { revalidate: 60 } };
  }
  return { cache: 'no-store' };
}

function responseCacheControl(path: string[], searchParams: URLSearchParams): string {
  const p = proxyPathKey(path);
  if (searchParams.get('status') === 'live') return 'no-store';
  if (/\/games\/\d+\/(events|lineups|boxscore|pitching-boxscore|fielding-boxscore)/.test(p)) {
    return 'no-store';
  }
  if (p.startsWith('public/stats/') || p.startsWith('public/standings')) {
    return 'public, max-age=60, stale-while-revalidate=120';
  }
  if (p.startsWith('public/seasons') || p.startsWith('public/teams') || p.startsWith('public/articles')) {
    return 'public, max-age=120, stale-while-revalidate=300';
  }
  if (p === 'public/games' || /^public\/games\/\d+$/.test(p)) {
    return 'public, max-age=20, stale-while-revalidate=60';
  }
  return 'public, max-age=30, stale-while-revalidate=60';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const apiPath = `/api/${path.join('/')}`;
  const url = new URL(apiPath, API_BASE);

  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
      ...upstreamFetchOptions(path, url.searchParams),
    });
    const text = await res.text();
    if (!text) {
      return NextResponse.json({ message: 'Empty response from upstream API' }, { status: 502 });
    }
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      return NextResponse.json({ message: 'Invalid JSON from upstream API' }, { status: 502 });
    }
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        'Cache-Control': responseCacheControl(path, url.searchParams),
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch {
    return NextResponse.json({ message: 'API unreachable' }, { status: 502 });
  }
}
