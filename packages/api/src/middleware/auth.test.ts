import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { adminRoutes } from '../routes/admin/index.js';

async function buildAdminApp() {
  const app = Fastify();
  await app.register(cookie);
  await app.register(adminRoutes, { prefix: '/api/admin' });
  return app;
}

test('admin routes require a session even when the query string mentions /auth/login', async () => {
  const app = await buildAdminApp();
  for (const url of [
    '/api/admin/seasons?x=/auth/login',
    '/api/admin/users?next=/api/admin/auth/logout',
    '/api/admin/users',
  ]) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 401, url);
  }
  const del = await app.inject({ method: 'DELETE', url: '/api/admin/seasons/1?x=/auth/login' });
  assert.equal(del.statusCode, 401);
  await app.close();
});
