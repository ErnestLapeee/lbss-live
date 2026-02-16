import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { Server as SocketIOServer } from 'socket.io';
import { publicRoutes } from './routes/public/index.js';
import { adminRoutes } from './routes/admin/index.js';

// Global IO reference so routes can emit events
let io: SocketIOServer | null = null;
export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: [process.env.WEB_URL || 'http://localhost:3000', process.env.ADMIN_URL || 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(cookie);

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
        origin: [process.env.WEB_URL || 'http://localhost:3000', process.env.ADMIN_URL || 'http://localhost:3001'],
        credentials: true,
      },
      path: '/ws',
    });

    io.on('connection', (socket) => {
      app.log.info(`Socket connected: ${socket.id}`);

      socket.on('game:subscribe', async (gameId: number) => {
        socket.join(`game:${gameId}`);
        app.log.info(`Socket ${socket.id} subscribed to game:${gameId}`);
        // Broadcast updated viewer count to the room
        const room = io!.sockets.adapter.rooms.get(`game:${gameId}`);
        const count = room ? room.size : 1;
        io!.to(`game:${gameId}`).emit('game:viewers', { gameId, count });
      });

      socket.on('game:unsubscribe', (gameId: number) => {
        socket.leave(`game:${gameId}`);
        // Broadcast updated viewer count after leaving
        setTimeout(() => {
          const room = io!.sockets.adapter.rooms.get(`game:${gameId}`);
          const count = room ? room.size : 0;
          io!.to(`game:${gameId}`).emit('game:viewers', { gameId, count });
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
