#!/usr/bin/env node
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = String(process.env.PORT || '4173');
const listen = `tcp://0.0.0.0:${port}`;

// Runtime API base URL (set in Railway Variables). Must point at API root; we append /api so routes hit /api/admin/...
let apiUrl = (process.env.VITE_API_URL || process.env.API_URL || '').trim().replace(/\/$/, '');
if (apiUrl && !apiUrl.endsWith('/api')) apiUrl = apiUrl + '/api';
const configPath = join(__dirname, 'dist', 'config.js');
writeFileSync(
  configPath,
  `window.__LBSS_API_URL__=${JSON.stringify(apiUrl)};\n`,
  'utf8'
);

const child = spawn(
  'pnpm',
  ['exec', 'serve', '-s', 'dist', '-l', listen],
  {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env, PORT: port },
  }
);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
