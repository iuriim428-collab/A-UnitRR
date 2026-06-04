/**
 * Build script for AD Unit R desktop (Electron) package.
 *
 * Usage:
 *   node build.mjs              — assembles server-assets only
 *   node build.mjs --dist-win   — assembles + runs electron-builder --win --x64
 */

import { execSync } from 'child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..', '..');
const require = createRequire(import.meta.url);

function run(cmd, env = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, {
    cwd: workspaceRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

console.log('═══════════════════════════════════════════════════');
console.log('  AD Unit R — Desktop Build');
console.log('═══════════════════════════════════════════════════');

// ── 1. Build the React frontend ──────────────────────────────
console.log('\n[1/4] Building frontend…');
run('pnpm --filter @workspace/wb-optimizer run build', {
  PORT: '3000',
  BASE_PATH: '/',
  BASE_URL: '/',
  NODE_ENV: 'production',
});

// ── 2. Build the Express API server ──────────────────────────
console.log('\n[2/4] Building API server…');
run('pnpm --filter @workspace/api-server run build');

// ── 3. Assemble server-assets ─────────────────────────────────
console.log('\n[3/4] Assembling server-assets…');

const serverAssetsDir = join(__dirname, 'server-assets');
rmSync(serverAssetsDir, { recursive: true, force: true });
mkdirSync(serverAssetsDir, { recursive: true });

// API server bundle → server-assets/
const apiDist = join(workspaceRoot, 'artifacts', 'api-server', 'dist');
if (!existsSync(apiDist)) throw new Error(`API server dist not found: ${apiDist}`);
cpSync(apiDist, serverAssetsDir, { recursive: true });

// React build → server-assets/public/
const frontendDist = join(workspaceRoot, 'artifacts', 'wb-optimizer', 'dist', 'public');
if (!existsSync(frontendDist)) throw new Error(`Frontend dist not found: ${frontendDist}`);
cpSync(frontendDist, join(serverAssetsDir, 'public'), { recursive: true });

// ── 4. Copy @electric-sql/pglite for embedded DB ─────────────
console.log('\n[4/4] Copying PGlite for embedded database…');

const nodeModulesDir = join(serverAssetsDir, 'node_modules');
mkdirSync(nodeModulesDir, { recursive: true });

// Locate pglite in the workspace
let pgliteSrcDir;
const candidates = [
  join(workspaceRoot, 'node_modules', '@electric-sql'),
  join(workspaceRoot, 'lib', 'db', 'node_modules', '@electric-sql'),
  join(workspaceRoot, 'artifacts', 'api-server', 'node_modules', '@electric-sql'),
];
for (const c of candidates) {
  if (existsSync(c)) {
    pgliteSrcDir = c;
    break;
  }
}
if (!pgliteSrcDir) {
  throw new Error(
    '@electric-sql/pglite not found in node_modules. Run: pnpm add @electric-sql/pglite --filter @workspace/db'
  );
}

const electricDir = join(nodeModulesDir, '@electric-sql');
mkdirSync(electricDir, { recursive: true });
cpSync(pgliteSrcDir, electricDir, { recursive: true });

console.log('\n✅ server-assets assembled successfully.');
console.log('   API bundle:     server-assets/index.mjs');
console.log('   Frontend:       server-assets/public/');
console.log('   PGlite:         server-assets/node_modules/@electric-sql/');

// ── 5. Optional: run electron-builder ────────────────────────
const buildDist = process.argv.includes('--dist-win');
if (buildDist) {
  console.log('\n[5/5] Running electron-builder for Windows x64…');
  execSync('npx electron-builder --win --x64', {
    cwd: __dirname,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    stdio: 'inherit',
  });
  console.log('\n✅ ZIP created in artifacts/desktop-wb/dist-electron/');

  // ── 6. Copy ZIP to wb-optimizer public/downloads/ ──────────
  console.log('\n[6/6] Copying ZIP to wb-optimizer public/downloads/…');
  const { readdirSync } = await import('fs');
  const distDir = join(__dirname, 'dist-electron');
  const zips = readdirSync(distDir).filter(f => f.endsWith('.zip'));
  if (zips.length === 0) throw new Error('No ZIP file found in dist-electron/');
  const srcZip = join(distDir, zips[0]);
  const destDir = join(workspaceRoot, 'artifacts', 'wb-optimizer', 'public', 'downloads');
  mkdirSync(destDir, { recursive: true });
  cpSync(srcZip, join(destDir, 'ADUnitR-win-x64.zip'));
  console.log(`   Copied: ${zips[0]} → wb-optimizer/public/downloads/ADUnitR-win-x64.zip`);
}
