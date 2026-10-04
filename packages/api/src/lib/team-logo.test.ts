import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTeamLogoUpload, sniffTeamLogo, teamLogoPublicPath } from './team-logo.js';

test('a stored logo has a stable public path with a version', () => {
  assert.equal(teamLogoPublicPath(12, 1700000000000), '/api/public/teams/12/logo?v=1700000000000');
});

test('png and jpeg bytes are accepted and a text file is refused', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sniffTeamLogo(png), 'image/png');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const decoded = decodeTeamLogoUpload(jpeg.toString('base64'));
  assert.equal(decoded.contentType, 'image/jpeg');
  assert.throws(() => decodeTeamLogoUpload(Buffer.from('not an image!!!!').toString('base64')), /PNG, JPEG/);
});
