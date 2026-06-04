import session, { type SessionData } from "express-session";
import type { Pool } from "pg";

const { Store } = session;

export class PgSessionStore extends Store {
  private pool: Pool;
  private tableName: string;
  private pruneInterval: NodeJS.Timeout | null = null;

  constructor(pool: Pool, tableName = "user_sessions") {
    super();
    this.pool = pool;
    this.tableName = tableName;
    this.schedulePrune();
  }

  async get(sid: string, cb: (err: unknown, session?: SessionData | null) => void) {
    try {
      const res = await this.pool.query(
        `SELECT sess FROM ${this.tableName} WHERE sid = $1 AND expire > NOW()`,
        [sid],
      );
      if (res.rows.length === 0) return cb(null, null);
      cb(null, res.rows[0].sess as SessionData);
    } catch (err) {
      cb(err);
    }
  }

  async set(sid: string, session: SessionData, cb?: (err?: unknown) => void) {
    const maxAge = session.cookie?.maxAge ?? 86400000;
    const expire = new Date(Date.now() + maxAge);
    try {
      await this.pool.query(
        `INSERT INTO ${this.tableName} (sid, sess, expire)
         VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = $2, expire = $3`,
        [sid, JSON.stringify(session), expire],
      );
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  async destroy(sid: string, cb?: (err?: unknown) => void) {
    try {
      await this.pool.query(`DELETE FROM ${this.tableName} WHERE sid = $1`, [sid]);
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  async touch(sid: string, session: SessionData, cb?: (err?: unknown) => void) {
    const maxAge = session.cookie?.maxAge ?? 86400000;
    const expire = new Date(Date.now() + maxAge);
    try {
      await this.pool.query(
        `UPDATE ${this.tableName} SET expire = $2 WHERE sid = $1`,
        [sid, expire],
      );
      cb?.();
    } catch (err) {
      cb?.(err);
    }
  }

  private schedulePrune() {
    this.pruneInterval = setInterval(async () => {
      try {
        await this.pool.query(`DELETE FROM ${this.tableName} WHERE expire < NOW()`);
      } catch {}
    }, 15 * 60 * 1000);
    this.pruneInterval.unref();
  }

  destroy_store() {
    if (this.pruneInterval) clearInterval(this.pruneInterval);
  }
}
