import * as schema from "./schema";
import { PGLITE_DDL } from "./init-pglite";

export type Queryable = {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
};

const url = process.env.DATABASE_URL ?? "";

async function createConnections(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  pool: Queryable;
}> {
  if (url.startsWith("pglite://")) {
    // Use string variables so esbuild cannot statically link @electric-sql/pglite
    // or drizzle-orm/pglite into the bundle. On Replit this branch is never reached,
    // so no resolution is needed. On Desktop the packages are in server-assets/node_modules.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const pglitePkg = ["@electric-sql", "pglite"].join("/");
    const drizzlePglitePkg = ["drizzle-orm", "pglite"].join("/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { PGlite } = (await import(pglitePkg)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { drizzle } = (await import(drizzlePglitePkg)) as any;
    const dataDir = url.slice("pglite://".length) || undefined;
    const pglite = new PGlite(dataDir);
    await pglite.waitReady;
    await pglite.exec(PGLITE_DDL);
    return {
      pool: pglite as Queryable,
      db: drizzle(pglite, { schema }),
    };
  }

  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const pg = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new pg.default.Pool({ connectionString: url });
  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

const { pool, db } = await createConnections();

export { pool, db };
export * from "./schema";
