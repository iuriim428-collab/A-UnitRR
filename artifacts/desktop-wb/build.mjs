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
cpSync(pgliteSrcDir, electricDir, { recursive: true, dereference: true });

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

  // ── 6. Build NSIS installer with Linux makensis ────────────
  console.log('\n[6/7] Building NSIS installer (.exe)…');
  const nsisDir = join(workspaceRoot, '.cache', 'electron-builder', 'nsis', 'nsis-3.0.4.1');
  const makensis = join(nsisDir, 'linux', 'makensis');
  const nsisScript = join(__dirname, 'installer.nsi');
  if (existsSync(makensis) && existsSync(nsisScript)) {
    execSync(`"${makensis}" -V3 installer.nsi`, {
      cwd: __dirname,
      stdio: 'inherit',
    });
    console.log('   ✅ NSIS installer built.');
  } else {
    console.warn('   ⚠ makensis or installer.nsi not found — skipping NSIS step.');
  }

  // ── 7. Copy ZIP + EXE to wb-optimizer public/downloads/ ────
  console.log('\n[7/7] Copying artifacts to wb-optimizer public/downloads/…');
  const { readdirSync } = await import('fs');
  const distDir = join(__dirname, 'dist-electron');
  const destDir = join(workspaceRoot, 'artifacts', 'wb-optimizer', 'public', 'downloads');
  mkdirSync(destDir, { recursive: true });

  const zips = readdirSync(distDir).filter(f => f.endsWith('.zip'));
  if (zips.length > 0) {
    cpSync(join(distDir, zips[0]), join(destDir, 'ADUnitR-win-x64.zip'));
    console.log(`   Copied: ${zips[0]} → public/downloads/ADUnitR-win-x64.zip`);
  }

  const exe = join(distDir, 'ADUnitR-Setup-win-x64.exe');
  if (existsSync(exe)) {
    cpSync(exe, join(destDir, 'ADUnitR-Setup-win-x64.exe'));
    console.log('   Copied: ADUnitR-Setup-win-x64.exe → public/downloads/');
  }
}
