#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// serve reads process.env.PORT when -l is omitted and listens on 0.0.0.0
const child = spawn(
  'pnpm',
  ['exec', 'serve', '-s', 'dist'],
  {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env, PORT: process.env.PORT || '4173' },
  }
);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
