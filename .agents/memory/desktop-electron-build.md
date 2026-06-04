---
name: Desktop Electron build quirks
description: PGlite/drizzle-orm peer-dep and electron-builder Wine issue on Linux (Replit)
---

## Problem 1: drizzle-orm PGlite peer-dep crashes api-server

Installing `@electric-sql/pglite` in `lib/db` causes pnpm to resolve `drizzle-orm` with a peer-dep variant that statically imports `@electric-sql/pglite` in `pglite/session.js`. esbuild marks pglite as external, so the static ESM import remains in the bundle. Node.js must resolve it at link time — fails if pglite not reachable from `artifacts/api-server/dist/`.

**Fix:** Add `@electric-sql/pglite` to `artifacts/api-server/package.json` dependencies.

## Problem 2: electron-builder NSIS on Linux requires Wine

electron-builder v25.x uses `rcedit` (app-builder binary) to modify the Windows PE executable. On Linux without Wine, NSIS and rcedit steps fail with `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`.

**Fix for ZIP target:** Set `"signAndEditExecutable": false` in `win` config. This skips rcedit (icon won't be updated), allows ZIP build to succeed.

**Fix for NSIS installer:** Use the Linux `makensis` binary cached by electron-builder at:
`.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis`

Compile `artifacts/desktop-wb/installer.nsi` directly:
```bash
"$NSIS_DIR/linux/makensis" -V3 installer.nsi
```

This produces `dist-electron/ADUnitR-Setup-win-x64.exe` (~90MB, LZMA-compressed, includes win-unpacked content).

**Also set:** `CSC_IDENTITY_AUTO_DISCOVERY=false` env var for electron-builder to suppress code-signing.

## Desktop build flow

`node build.mjs --dist-win` from `artifacts/desktop-wb/`:
1. Build frontend (BASE_PATH=/)
2. Build api-server
3. Assemble server-assets (use `{ dereference: true }` in cpSync for pglite!)
4. Run electron-builder (ZIP only, signAndEditExecutable:false)
5. Compile NSIS installer with Linux makensis (installer.nsi)
6. Copy ZIP + EXE to `artifacts/wb-optimizer/public/downloads/`

Outputs:
- `ADUnitR-win-x64.zip` (~110MB) → `/wb/downloads/ADUnitR-win-x64.zip`
- `ADUnitR-Setup-win-x64.exe` (~90MB) → `/wb/downloads/ADUnitR-Setup-win-x64.exe`

## PGlite copy fix

`cpSync` copies pnpm symlinks as symlinks (4KB), NOT the actual 23MB pglite package. Must use `{ dereference: true }`:
```js
cpSync(pgliteSrcDir, electricDir, { recursive: true, dereference: true });
```

## NSIS packages search

nsis is a NSIS Packages directory located at:
`.cache/electron-builder/nsis/nsis-resources-3.4.1/plugins/`

Subdirs: `x64-ansi`, `x64-unicode`, `x86-ansi`, `x86-unicode`
