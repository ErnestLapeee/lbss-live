/** Uploaded logos are stored on the API. The public site loads them through its own proxy. */
export function resolveTeamLogoUrl(logoUrl?: string | null): string | null | undefined {
  if (!logoUrl) return logoUrl;
  if (logoUrl.startsWith('/api/public/teams/')) {
    return logoUrl.replace(/^\/api\//, '/api/proxy/');
  }
  return logoUrl;
}
