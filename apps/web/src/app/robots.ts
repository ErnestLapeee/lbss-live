import type { MetadataRoute } from 'next';

const BLOCKED_BOTS = [
  'GPTBot',
  'CCBot',
  'ClaudeBot',
  'anthropic-ai',
  'Bytespider',
  'Amazonbot',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'cohere-ai',
  'Diffbot',
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'BLEXBot',
  'PetalBot',
  'DataForSeoBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // `from` only drives the back link on player pages; each value is a duplicate URL for crawlers.
        disallow: ['/api/', '/*?from=', '/*&from='],
      },
      { userAgent: BLOCKED_BOTS, disallow: '/' },
    ],
  };
}
