import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/settings", async (req, res) => {
  try {
    const rows = await db.execute(sql`SELECT settings FROM api_settings LIMIT 1`);
    const settings = (rows.rows[0] as { settings: Record<string, unknown> } | undefined)?.settings ?? {};
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "settings get error");
    res.status(500).json({ error: "Ошибка чтения настроек" });
  }
});

router.put("/settings", async (req, res) => {
  const incoming = req.body as Record<string, unknown>;
  if (!incoming || typeof incoming !== "object") {
    res.status(400).json({ error: "Неверный формат" });
    return;
  }
  try {
    await db.execute(
      sql`UPDATE api_settings SET settings = ${JSON.stringify(incoming)}::jsonb, updated_at = NOW()`
    );
    req.log.info("settings updated");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "settings put error");
    res.status(500).json({ error: "Ошибка сохранения настроек" });
  }
});

export default router;
