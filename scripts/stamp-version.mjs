// Runs before `npm run build`: stamps the build date and commit into
// src/app/shared/app-version.ts, so ledger entries say which build wrote them.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../src/app/shared/app-version.ts', import.meta.url);

let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // not a git checkout - the date alone still tells builds apart
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp =
  `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}` +
  (commit ? `-${commit}` : '');

const source = readFileSync(file, 'utf8').replace(
  /export const APP_VERSION = '[^']*';/,
  `export const APP_VERSION = '${stamp}';`,
);
writeFileSync(file, source);
console.log(`App version ${stamp}`);
