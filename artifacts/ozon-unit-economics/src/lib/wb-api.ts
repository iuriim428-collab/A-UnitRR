/**
 * Wildberries API clients + parsers.
 *
 * Statistics: request priority — local proxy → server proxy (cloud may be blocked by WB).
 * Analytics and Advertising: server proxy only (seller-analytics / advert-api).
 */
import { OzonReportRow } from '../types';

// ─── Raw types ────────────────────────────────────────────────────────────────

export interface WBDetailRow {
  rrd_id: number;
  gi_id: number;
  subject_name: string;
  nm_id: number;
  brand_name: string;
  sa_name: string;               // seller article
  ts_name: string;               // product name
  barcode: string;
  doc_type_name: string;         // "Продажа" | "Возврат" | etc.
  quantity: number;
  retail_price: number;
  retail_price_withdisc_rub: number;
  ppvz_for_pay: number;
  ppvz_sales_commission: number;
  delivery_rub: number;
  acquiring_fee: number;
  storage_fee: number;
  penalty: number;
  deduction: number;
  acceptance: number;
  retail_amount: number;
}

/** Per-SKU analytics from seller-analytics.wildberries.ru */
export interface WBAnalyticsCard {
  nmID: number;
  vendorCode: string;            // seller article
  statistics?: {
    selectedPeriod?: {
      openCardCount: number;     // card views
      addToCartCount: number;
      ordersCount: number;
      ordersSumRub: number;
      buyoutsCount: number;
      buyoutsSumRub: number;
    };
    periodComparison?: {
      addToCartConversion: number; // % of views → cart
      cartToOrderConversion: number;
      buyoutsPercent: number;      // % of orders actually paid
    };
  };
}

/** Ad spend per nm_id from advert-api.wildberries.ru */
export interface WBAdvertItem {
  nmId: number;
  spend: number;  // RUB
}

// ─── Derived analytics type (keyed by article) ────────────────────────────────
export interface WBAnalyticsItem {
  openCardCount: number;
  addToCartConversion: number;  // %
  buyoutsPercent: number;       // %
}

// ─── Local proxy ──────────────────────────────────────────────────────────────
const LOCAL_PROXY = 'http://localhost:3001';

export async function isLocalProxyAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(`${LOCAL_PROXY}/api/wb/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Statistics fetch ─────────────────────────────────────────────────────────

async function fetchAllPages(
  baseUrl: string,
  headers: Record<string, string>,
  dateFrom: string,
  dateTo: string,
  onProgress?: (rows: number) => void,
): Promise<WBDetailRow[]> {
  const allRows: WBDetailRow[] = [];
  let rrdid = 0;

  while (true) {
    const url =
      `${baseUrl}/api/wb/report?dateFrom=${dateFrom}&dateTo=${dateTo}` +
      (rrdid ? `&rrdid=${rrdid}` : '');

    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(body?.error ?? `HTTP ${resp.status}`);
    }

    const page = (await resp.json()) as WBDetailRow[];
    if (!Array.isArray(page) || page.length === 0) break;

    allRows.push(...page);
    onProgress?.(allRows.length);

    const last = page[page.length - 1];
    rrdid = Number(last?.rrd_id ?? 0);
    if (page.length < 100_000) break;
  }

  return allRows;
}

export async function fetchWBReport(
  token: string,
  dateFrom: string,
  dateTo: string,
  onProgress?: (rows: number) => void,
): Promise<WBDetailRow[]> {
  const localAvailable = await isLocalProxyAvailable();
  if (localAvailable) {
    return fetchAllPages(LOCAL_PROXY, { 'X-WB-Token': token }, dateFrom, dateTo, onProgress);
  }

  const url = `/api/wb/report?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const resp = await fetch(url, { headers: { 'X-WB-Token': token } });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body?.error ?? `HTTP ${resp.status}`);
  }

  const rows = (await resp.json()) as WBDetailRow[];
  onProgress?.(rows.length);
  return rows;
}

// ─── Analytics fetch ──────────────────────────────────────────────────────────

export async function fetchWBAnalytics(
  token: string,
  dateFrom: string,
  dateTo: string,
): Promise<WBAnalyticsCard[]> {
  const resp = await fetch(
    `/api/wb/analytics?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: { 'X-WB-Analytics-Token': token } },
  );
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body?.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<WBAnalyticsCard[]>;
}

// ─── Advertising fetch ────────────────────────────────────────────────────────

export async function fetchWBAdvert(
  token: string,
  dateFrom: string,
  dateTo: string,
): Promise<WBAdvertItem[]> {
  const resp = await fetch(
    `/api/wb/advert?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: { 'X-WB-Advert-Token': token } },
  );
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body?.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<WBAdvertItem[]>;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseWBRows(
  raw: WBDetailRow[],
): { rows: OzonReportRow[]; nmMap: Map<number, string> } {
  const acc: Record<string, OzonReportRow> = {};
  const nmMap = new Map<number, string>(); // nmId → article

  for (const row of raw) {
    const article = (row.sa_name || row.barcode || String(row.nm_id) || 'unknown').trim();

    // Build nm_id → article mapping for later advert merge
    if (row.nm_id) nmMap.set(row.nm_id, article);

    if (!acc[article]) {
      acc[article] = {
        article,
        name: row.ts_name || row.subject_name || '',
        ordersCount: 0, ordersSum: 0,
        returnsCount: 0, returnsSum: 0,
        salesCount: 0, netSales: 0,
        ozonCommission: 0,
        deliveryServices: 0, logistics: 0, returnLogistics: 0,
        lastMile: 0, processing: 0, otherDelivery: 0,
        agentServices: 0, acquiring: 0, returnProcessing: 0,
        promotion: 0, storage: 0, fboServices: 0, otherExpenses: 0,
      };
    }

    const r = acc[article];
    if (!r.name && (row.ts_name || row.subject_name)) {
      r.name = row.ts_name || row.subject_name;
    }

    const isSale   = row.doc_type_name === 'Продажа';
    const isReturn = row.doc_type_name === 'Возврат';
    const qty      = row.quantity || 0;
    const price    = row.retail_price_withdisc_rub || 0;

    if (isSale) {
      r.salesCount  += qty;
      r.ordersCount += qty;
      r.ordersSum   += price * qty;
    }
    if (isReturn) {
      r.returnsCount += qty;
      r.returnsSum   += price * qty;
    }

    r.ozonCommission   += row.ppvz_sales_commission || 0;
    r.deliveryServices += row.delivery_rub || 0;

    const acq = row.acquiring_fee || 0;
    r.acquiring     += acq;
    r.agentServices += acq;

    r.storage       += (row.storage_fee || 0) + (row.acceptance || 0);
    r.otherExpenses += (row.penalty || 0) + (row.deduction || 0);
  }

  for (const r of Object.values(acc)) {
    r.netSales = r.ordersSum - r.returnsSum;
  }

  const rows = Object.values(acc).filter(
    r => r.ordersCount > 0 || r.returnsCount > 0 || r.storage > 0,
  );
  return { rows, nmMap };
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

/** Build article → WBAnalyticsItem map from analytics cards. */
export function buildAnalyticsMap(
  cards: WBAnalyticsCard[],
  nmMap: Map<number, string>,
): Record<string, WBAnalyticsItem> {
  const result: Record<string, WBAnalyticsItem> = {};
  for (const card of cards) {
    // Use vendorCode first; fall back to nm_id lookup via nmMap
    const article = card.vendorCode?.trim() || nmMap.get(card.nmID) || '';
    if (!article) continue;

    const sp = card.statistics?.selectedPeriod;
    const pc = card.statistics?.periodComparison;
    result[article] = {
      openCardCount:       sp?.openCardCount ?? 0,
      addToCartConversion: pc?.addToCartConversion ?? 0,
      buyoutsPercent:      pc?.buyoutsPercent ?? 0,
    };
  }
  return result;
}

/** Merge ad spend into OzonReportRow.promotion using nmId → article map. */
export function mergeAdvertSpend(
  rows: OzonReportRow[],
  advertItems: WBAdvertItem[],
  nmMap: Map<number, string>,
): OzonReportRow[] {
  if (advertItems.length === 0) return rows;

  // Build article → spend map
  const spendByArticle: Record<string, number> = {};
  for (const item of advertItems) {
    const article = nmMap.get(item.nmId);
    if (!article) continue;
    spendByArticle[article] = (spendByArticle[article] ?? 0) + item.spend;
  }

  return rows.map(r => {
    const adSpend = spendByArticle[r.article] ?? 0;
    if (adSpend === 0) return r;
    return { ...r, promotion: r.promotion + adSpend };
  });
}
