---
name: Desktop Electron build quirks
description: PGlite/drizzle-orm peer-dep and electron-builder Wine issue on Linux (Replit)
---

## Problem 1: drizzle-orm PGlite peer-dep crashes api-server

Installing `@electric-sql/pglite` in `lib/db` causes pnpm to resolve `drizzle-orm` with a peer-dep variant (`drizzle-orm@x.x.x_@electric-sql+pglite@x.x.x`) that statically imports `@electric-sql/pglite` in `pglite/session.js`. esbuild marks pglite as external, so the static ESM import remains in the bundle. Node.js must resolve it at link time — and fails if pglite is not in any `node_modules` reachable from `artifacts/api-server/dist/`.

**Fix:** Add `@electric-sql/pglite` to `artifacts/api-server/package.json` dependencies. Then pnpm installs it in `artifacts/api-server/node_modules/`, making it resolvable at runtime.

**Why:** Even in Replit (where PGlite is never used), the bundle statically imports pglite because drizzle-orm's peer-dep version includes the pglite driver. The import is harmless at runtime (PGlite is only instantiated when DATABASE_URL starts with `pglite://`).

## Problem 2: electron-builder on Linux requires Wine for Windows builds

electron-builder v25.x uses `rcedit` (via `app-builder` binary) to modify the Windows PE executable (change icon, product name, PE resources). On Linux without Wine, this step fails with `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`.

**Fix:** Set `"signAndEditExecutable": false` in the `win` section of `package.json` build config. This skips rcedit and allows the build to complete.

**Side-effect:** The .exe keeps the default Electron icon (no custom icon embedded). App name in Windows title bar uses the productName from `package.json`, not PE resources. ASAR integrity is still embedded via `resedit` (pure Node.js, no Wine needed).

**Also set:** `CSC_IDENTITY_AUTO_DISCOVERY=false` env var when running electron-builder to suppress code-signing prompts.

## Desktop build flow

1. `node build.mjs --dist-win` from `artifacts/desktop-wb/`
2. Steps: build frontend (BASE_PATH=/) → build api-server → assemble server-assets → copy pglite → run electron-builder → copy ZIP to `artifacts/wb-optimizer/public/downloads/`
3. Output: `dist-electron/AD Unit R-1.0.0-win.zip` (~110MB)
4. Accessible in web UI at `/wb/downloads/ADUnitR-win-x64.zip`

## PGlite location search order (build.mjs)

Checks these paths in order for `@electric-sql` directory:
1. `{root}/node_modules/@electric-sql`
2. `{root}/lib/db/node_modules/@electric-sql`
3. `{root}/artifacts/api-server/node_modules/@electric-sql` ← currently resolves here
