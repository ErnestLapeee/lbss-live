import type { AuthUser } from '../db/schema/users.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireAuth` on admin routes after session validation. */
    user?: AuthUser;
    sessionId?: string;
  }
}
