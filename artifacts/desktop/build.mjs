/**
 * Build script for the desktop (Electron) package.
 *
 * Usage:
 *   node build.mjs              — only assembles server-assets (no electron-builder)
 *   node build.mjs --dist-win   — assembles + runs electron-builder --win --x64
 */

import { execSync } from 'child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..', '..');

function run(cmd, env = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, {
    cwd: workspaceRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

console.log('═══════════════════════════════════════════════════');
console.log('  Unit Economics — Desktop Build');
console.log('═══════════════════════════════════════════════════');

// ── 1. Build the React frontend ──────────────────────────────
console.log('\n[1/3] Building frontend…');
run('pnpm --filter @workspace/ozon-unit-economics run build', {
  PORT: '3000',
  BASE_PATH: '/',
  NODE_ENV: 'production',
});

// ── 2. Build the Express API server ─────────────────────────
console.log('\n[2/3] Building API server…');
run('pnpm --filter @workspace/api-server run build');

// ── 3. Assemble server-assets ────────────────────────────────
console.log('\n[3/3] Assembling server-assets…');

const serverAssetsDir = join(__dirname, 'server-assets');
rmSync(serverAssetsDir, { recursive: true, force: true });
mkdirSync(serverAssetsDir, { recursive: true });

// API server bundle → server-assets/
const apiDist = join(workspaceRoot, 'artifacts', 'api-server', 'dist');
if (!existsSync(apiDist)) throw new Error(`API server dist not found: ${apiDist}`);
cpSync(apiDist, serverAssetsDir, { recursive: true });

// React build → server-assets/public/
const frontendDist = join(workspaceRoot, 'artifacts', 'ozon-unit-economics', 'dist', 'public');
if (!existsSync(frontendDist)) throw new Error(`Frontend dist not found: ${frontendDist}`);
cpSync(frontendDist, join(serverAssetsDir, 'public'), { recursive: true });

console.log('\n✅ server-assets assembled successfully.');
console.log('   API bundle: server-assets/index.mjs');
console.log('   Frontend:   server-assets/public/');

// ── 4. Optional: run electron-builder ───────────────────────
const buildDist = process.argv.includes('--dist-win');
if (buildDist) {
  console.log('\n[4/4] Running electron-builder for Windows…');
  execSync('npx electron-builder --win --x64', {
    cwd: __dirname,
    stdio: 'inherit',
  });
  console.log('\n✅ Installer created in artifacts/desktop/dist-electron/');
}
