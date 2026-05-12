import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import compress from '@fastify/compress';
import { Server as SocketIOServer } from 'socket.io';
import { ensureOptionalSchemaColumns } from './db/ensure-schema.js';
import { publicRoutes } from './routes/public/index.js';
import { adminRoutes } from './routes/admin/index.js';

/** Comma- or whitespace-separated absolute origins (e.g. two Railway admin URLs). */
function parseOriginList(envVal: string | undefined, fallback: string): string[] {
  const raw = (envVal ?? '').trim() || fallback;
  const parts = raw
    .split(/[,|\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(parts.length > 0 ? parts : [fallback])];
}

// Global IO reference so routes can emit events
let io: SocketIOServer | null = null;
export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/** Reject malformed client payloads (Socket.io often sends strings). */
function parsePositiveIntId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

export async function buildApp() {
  await ensureOptionalSchemaColumns();

  const app = Fastify({ logger: true });

  const corsOrigins = [
    ...parseOriginList(process.env.WEB_URL, 'http://localhost:3000'),
    ...parseOriginList(process.env.ADMIN_URL, 'http://localhost:3001'),
  ];

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(cookie);

  await app.register(compress, {
    threshold: 2048,
    encodings: ['gzip', 'deflate'],
  });

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Public API routes
  await app.register(publicRoutes, { prefix: '/api/public' });

  // Admin API routes
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // After server is ready, attach Socket.io
  app.addHook('onReady', () => {
    io = new SocketIOServer(app.server, {
      cors: {
        origin: corsOrigins,
        credentials: true,
      },
      path: '/ws',
    });

    io.on('connection', (socket) => {
      app.log.info(`Socket connected: ${socket.id}`);

      socket.on('game:subscribe', async (gameId: unknown) => {
        const id = parsePositiveIntId(gameId);
        if (id == null) return;
        socket.join(`game:${id}`);
        app.log.info(`Socket ${socket.id} subscribed to game:${id}`);
        // Broadcast updated viewer count to the room
        const room = io!.sockets.adapter.rooms.get(`game:${id}`);
        const count = room ? room.size : 1;
        io!.to(`game:${id}`).emit('game:viewers', { gameId: id, count });
      });

      socket.on('game:unsubscribe', (gameId: unknown) => {
        const id = parsePositiveIntId(gameId);
        if (id == null) return;
        socket.leave(`game:${id}`);
        // Broadcast updated viewer count after leaving
        setTimeout(() => {
          const room = io!.sockets.adapter.rooms.get(`game:${id}`);
          const count = room ? room.size : 0;
          io!.to(`game:${id}`).emit('game:viewers', { gameId: id, count });
        }, 100);
      });

      socket.on('disconnect', () => {
        app.log.info(`Socket disconnected: ${socket.id}`);
      });
    });

    app.log.info('Socket.io server attached');
  });

  // Cleanup on close
  app.addHook('onClose', async () => {
    if (io) {
      io.close();
      io = null;
    }
  });

  return app;
}
