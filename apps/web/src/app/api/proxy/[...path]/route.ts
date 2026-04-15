import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const apiPath = `/api/${path.join('/')}`;
  const url = new URL(apiPath, API_BASE);

  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
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
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'API unreachable' }, { status: 502 });
  }
}
