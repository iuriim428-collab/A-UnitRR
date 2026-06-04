import { Router } from "express";
import { getWbToken } from "../../lib/settings.js";

const router = Router();
const STAT_BASE = "https://statistics-api.wildberries.ru";

async function wbHeaders() {
  return { Authorization: await getWbToken() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function wbGet<T = any>(path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${STAT_BASE}${path}`, { headers: await wbHeaders() });
  if (res.status === 429) {
    if (attempt >= 3) throw new Error(`WB API rate limit exceeded for ${path}`);
    await sleep(3000 * (attempt + 1));
    return wbGet<T>(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`WB API ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function filterByDate(rows: any[], dateField: string, from: string, to: string) {
  const f = new Date(from).getTime();
  const t = new Date(to + "T23:59:59Z").getTime();
  return rows.filter((r) => {
    const d = new Date(r[dateField]).getTime();
    return d >= f && d <= t;
  });
}

// GET /api/wb-live/products?from=2026-05-01&to=2026-05-30
router.get("/wb-live/products", async (req, res) => {
  const token = await getWbToken();
  if (!token) {
    res.status(400).json({ error: "WB токен не настроен. Перейдите в Настройки и введите API-ключ WB Statistics." });
    return;
  }

  const to = (req.query.to as string) ?? isoDate(new Date());
  const from = (req.query.from as string) ?? isoDate(new Date(Date.now() - 30 * 86400000));

  let allOrders: any[], allSales: any[];
  try {
    // Sequential to avoid WB rate limit (429)
    allOrders = await wbGet<any[]>(`/api/v1/supplier/orders?dateFrom=${from}&flag=0`);
    await sleep(500);
    allSales = await wbGet<any[]>(`/api/v1/supplier/sales?dateFrom=${from}&flag=0`);
  } catch (e: any) {
    res.status(502).json({ error: `WB API ошибка: ${e?.message ?? String(e)}` });
    return;
  }

  const orders = filterByDate(allOrders, "date", from, to);
  const sales = filterByDate(allSales, "date", from, to);

  // Aggregate orders by nmId
  const byNm = new Map<
    number,
    {
      nmId: number;
      article: string;
      name: string;
      category: string;
      orders: number;
      cancels: number;
      revenue: number;
      forPay: number;
      sales: number;
      avgSpp: number;
      sppSum: number;
    }
  >();

  for (const o of orders) {
    const nm = o.nmId as number;
    if (!byNm.has(nm)) {
      byNm.set(nm, {
        nmId: nm,
        article: o.supplierArticle,
        name: o.subject,
        category: o.category,
        orders: 0,
        cancels: 0,
        revenue: 0,
        forPay: 0,
        sales: 0,
        avgSpp: 0,
        sppSum: 0,
      });
    }
    const row = byNm.get(nm)!;
    row.orders++;
    if (o.isCancel) {
      row.cancels++;
    } else {
      row.revenue += o.priceWithDisc ?? 0;
      row.sppSum += o.spp ?? 0;
    }
  }

  for (const s of sales) {
    const nm = s.nmId as number;
    if (!byNm.has(nm)) {
      byNm.set(nm, {
        nmId: nm,
        article: s.supplierArticle,
        name: s.subject,
        category: s.category,
        orders: 0,
        cancels: 0,
        revenue: 0,
        forPay: 0,
        sales: 0,
        avgSpp: 0,
        sppSum: 0,
      });
    }
    const row = byNm.get(nm)!;
    row.sales++;
    row.forPay += s.forPay ?? 0;
  }

  const rows = [...byNm.values()]
    .map((r) => {
      const delivered = r.orders - r.cancels;
      return {
        ...r,
        cancelRate: r.orders > 0 ? (r.cancels / r.orders) * 100 : 0,
        avgSpp: delivered > 0 ? r.sppSum / delivered : 0,
        forPay: Math.round(r.forPay * 100) / 100,
        revenue: Math.round(r.revenue),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totals = {
    orders: rows.reduce((s, r) => s + r.orders, 0),
    cancels: rows.reduce((s, r) => s + r.cancels, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    forPay: Math.round(rows.reduce((s, r) => s + r.forPay, 0) * 100) / 100,
  };

  res.json({ from, to, rows, totals });
});

// GET /api/wb-live/stocks
router.get("/wb-live/stocks", async (_req, res) => {
  const token = await getWbToken();
  if (!token) { res.json({ stocks: [] }); return; }

  const yesterday = isoDate(new Date(Date.now() - 86400000));
  let allStocks: any[];
  try {
    allStocks = await wbGet<any[]>(`/api/v1/supplier/stocks?dateFrom=${yesterday}`);
  } catch {
    res.json({ stocks: [] }); return;
  }

  // Aggregate by nmId across warehouses
  const byNm = new Map<number, { nmId: number; article: string; name: string; total: number; warehouses: Record<string, number> }>();

  for (const s of allStocks) {
    const nm = s.nmId as number;
    if (!byNm.has(nm)) {
      byNm.set(nm, { nmId: nm, article: s.supplierArticle, name: s.subject, total: 0, warehouses: {} });
    }
    const row = byNm.get(nm)!;
    row.total += s.quantityFull ?? 0;
    row.warehouses[s.warehouseName] = (row.warehouses[s.warehouseName] ?? 0) + (s.quantityFull ?? 0);
  }

  const stocks = [...byNm.values()].sort((a, b) => b.total - a.total);
  res.json({ stocks });
});

export default router;
