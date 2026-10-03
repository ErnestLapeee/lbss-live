import { NextRequest, NextResponse } from 'next/server';

/**
 * AI training crawlers, SEO crawlers, and scripted HTTP clients. Search engines (Googlebot, Bingbot)
 * and link-preview bots (Facebook, WhatsApp, Discord, Telegram, Slack, X) are intentionally not listed.
 */
const BLOCKED_USER_AGENTS =
  /GPTBot|CCBot|ClaudeBot|Claude-Web|anthropic-ai|Bytespider|Amazonbot|PerplexityBot|meta-externalagent|Diffbot|ImagesiftBot|Omgilibot|cohere-ai|YouBot|Timpibot|AhrefsBot|SemrushBot|MJ12bot|DotBot|BLEXBot|PetalBot|SeekportBot|serpstatbot|Barkrowler|MegaIndex|DataForSeoBot|python-requests|python-urllib|aiohttp|httpx|Scrapy|Go-http-client|okhttp|libwww-perl|curl\/|Wget|HeadlessChrome|PhantomJS/i;

export function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? '';
  if (BLOCKED_USER_AGENTS.test(ua)) {
    return new NextResponse(null, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|lbss-logo.png).*)'],
};
