#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = String(process.env.PORT || '4173');
// Run from repo root so pnpm finds workspace; use admin package's vite
const root = join(__dirname, '..', '..');
const child = spawn(
  'pnpm',
  ['--filter', '@lbss/admin', 'exec', 'vite', 'preview', '--host', '0.0.0.0', '-p', port],
  { stdio: 'inherit', cwd: root, env: { ...process.env, PORT: port } }
);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
