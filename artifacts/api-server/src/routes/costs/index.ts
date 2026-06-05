import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { invalidateSettingsCache } from "../../lib/settings.js";

const router: IRouter = Router();

router.get("/costs", async (req, res) => {
  try {
    const rows = await db.execute(sql`SELECT settings FROM api_settings LIMIT 1`);
    const settings = (rows.rows[0] as { settings: Record<string, unknown> } | undefined)?.settings ?? {};
    res.json((settings.costs as Record<string, unknown>) ?? { wb: {}, ozon: {}, ym: {} });
  } catch (err) {
    req.log.error({ err }, "costs get error");
    res.status(500).json({ error: "Ошибка чтения себестоимости" });
  }
});

router.put("/costs", async (req, res) => {
  const incoming = req.body as Record<string, unknown>;
  if (!incoming || typeof incoming !== "object") {
    res.status(400).json({ error: "Неверный формат" });
    return;
  }
  try {
    const rows = await db.execute(sql`SELECT settings FROM api_settings LIMIT 1`);
    const existing = (rows.rows[0] as { settings: Record<string, unknown> } | undefined)?.settings ?? {};
    const updated = { ...existing, costs: incoming };
    await db.execute(
      sql`UPDATE api_settings SET settings = ${JSON.stringify(updated)}::jsonb, updated_at = NOW()`
    );
    invalidateSettingsCache();
    req.log.info("costs updated");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "costs put error");
    res.status(500).json({ error: "Ошибка сохранения себестоимости" });
  }
});

export default router;
