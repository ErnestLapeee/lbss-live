/**
 * Build @lbss/shared after install when source is present.
 * Docker copies only package manifests first; `pnpm install` would otherwise run
 * `tsc` with no tsconfig and fail. Skip until packages/shared/tsconfig.json exists.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const tsconfig = path.join(__dirname, '..', 'packages', 'shared', 'tsconfig.json');
if (!fs.existsSync(tsconfig)) {
  process.exit(0);
}

execSync('pnpm --filter @lbss/shared build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
