import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function call(path: string[]) {
  const req = new NextRequest(`http://localhost/api/proxy/${path.join('/')}`);
  return GET(req, { params: Promise.resolve({ path }) });
}

describe('API proxy', () => {
  it('refuses anything outside /api/public without contacting the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const path of [
      ['admin', 'users'],
      ['public', '..', 'admin', 'users'],
      ['..', 'admin'],
      ['public', 'a/b'],
    ]) {
      const res = await call(path);
      expect(res.status, path.join('/')).toBe(404);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
