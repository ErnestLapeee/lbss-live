import { buildApp } from './app.js';

const PORT = Number(process.env.PORT || process.env.API_PORT || '3002');
const HOST = '0.0.0.0';

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`LBSS API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
