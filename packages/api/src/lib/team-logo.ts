/** Stored logos are served by the API. The query marks a new upload so browsers fetch it again. */
export function teamLogoPublicPath(teamId: number, version: number): string {
  return `/api/public/teams/${teamId}/logo?v=${version}`;
}

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(bytes: Buffer, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

export function sniffTeamLogo(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | null {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  const gif = bytes.toString('ascii', 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  return null;
}

const MAX_LOGO_BYTES = 700_000;

export function decodeTeamLogoUpload(dataBase64: unknown): { contentType: string; bytes: Buffer } {
  const raw = String(dataBase64 ?? '').replace(/\s/g, '');
  if (!raw) throw new Error('Choose an image file');
  if (raw.length > 1_200_000) throw new Error('That image is too large. Use a logo under 512 pixels.');
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length < 16 || bytes.length > MAX_LOGO_BYTES) {
    throw new Error('That image is too large. Use a logo under 512 pixels.');
  }
  const contentType = sniffTeamLogo(bytes);
  if (!contentType) throw new Error('Use a PNG, JPEG, WebP, or GIF logo');
  return { contentType, bytes };
}
