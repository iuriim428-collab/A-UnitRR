/**
 * Wildberries API clients + parsers.
 *
 * Priority for WB Statistics (IP-sensitive):
 *   1. Browser-direct  — uses the user's own IP (works if WB allows CORS)
 *   2. Local proxy     — user runs local-wb-proxy.mjs on their machine
 *   3. Server proxy    — cloud IP (likely blocked by WB, shows clear error)
 *
 * Analytics and Advertising APIs: server proxy only.
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
  vendorCode: string;
  statistics?: {
    selectedPeriod?: {
      openCardCount: number;
      addToCartCount: number;
      ordersCount: number;
      ordersSumRub: number;
      buyoutsCount: number;
      buyoutsSumRub: number;
    };
    periodComparison?: {
      addToCartConversion: number;
      cartToOrderConversion: number;
      buyoutsPercent: number;
    };
  };
}

/** Ad spend per nm_id from advert-api.wildberries.ru */
export interface WBAdvertItem {
  nmId: number;
  spend: number;
}

export interface WBAnalyticsItem {
  openCardCount: number;
  addToCartConversion: number;
  buyoutsPercent: number;
}

/** Which transport was used to load the WB report */
export type WBFetchMethod = 'browser' | 'proxy' | 'server';

// ─── Constants ────────────────────────────────────────────────────────────────

const WB_STAT_DIRECT    = 'https://statistics-api.wildberries.ru';
const LOCAL_PROXY       = 'http://localhost:3001';

// ─── Local proxy health check ─────────────────────────────────────────────────

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

// ─── WB Statistics: browser-direct (uses user's IP) ─────────────────────────

async function fetchStatPage(
  base: string,
  authHeader: Record<string, string>,
  dateFrom: string,
  dateTo: string,
  rrdid: number,
  timeoutMs?: number,
): Promise<WBDetailRow[]> {
  const qs = `?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100000${rrdid ? `&rrdid=${rrdid}` : ''}`;
  // Browser-direct calls the WB endpoint path directly; proxy/server use /api/wb/report
  const path = base === WB_STAT_DIRECT
    ? `/api/v5/supplier/reportDetailByPeriod${qs}`
    : `/api/wb/report${qs}`;
  const url = `${base}${path}`;

  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
  const resp = await fetch(url, { headers: authHeader, signal });

  if (!resp.ok) {
    const body = await resp.text().catch(() => resp.statusText);
    // Try to parse JSON error
    try {
      const json = JSON.parse(body) as { error?: string };
      if (json.error) throw new Error(json.error);
    } catch {}
    throw new Error(`WB ${resp.status}: ${body}`);
  }

  return resp.json() as Promise<WBDetailRow[]>;
}

async function fetchAllPagesFrom(
  base: string,
  authHeader: Record<string, string>,
  dateFrom: string,
  dateTo: string,
  onProgress?: (rows: number) => void,
  timeoutMs?: number,
): Promise<WBDetailRow[]> {
  const allRows: WBDetailRow[] = [];
  let rrdid = 0;

  while (true) {
    const page = await fetchStatPage(base, authHeader, dateFrom, dateTo, rrdid, timeoutMs);
    if (!Array.isArray(page) || page.length === 0) break;

    allRows.push(...page);
    onProgress?.(allRows.length);

    const last = page[page.length - 1];
    rrdid = Number(last?.rrd_id ?? 0);
    if (page.length < 100_000) break;
  }

  return allRows;
}

// ─── Detect Electron desktop environment ─────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && 'electronApp' in window;
}

// ─── Main fetch with fallback chain ──────────────────────────────────────────

export async function fetchWBReport(
  token: string,
  dateFrom: string,
  dateTo: string,
  onProgress?: (rows: number) => void,
): Promise<{ rows: WBDetailRow[]; method: WBFetchMethod }> {

  // ── Strategy 1: Browser-direct (user's own IP, 5 s timeout) ────────────
  // Always falls through on any error: WB may return 401/403 via CORS even
  // with a valid token when the request comes from a cloud/proxy origin.
  // The authoritative error comes from the server proxy (Strategy 3).
  // Skipped in Electron: desktop runs a local server already.
  if (!isElectron()) {
    try {
      const rows = await fetchAllPagesFrom(
        WB_STAT_DIRECT,
        { Authorization: token },
        dateFrom, dateTo, onProgress,
        5_000, // 5 s — give up quickly if CORS preflight hangs
      );
      return { rows, method: 'browser' };
    } catch {
      // Always fall through to local proxy / server proxy
    }
  }

  // ── Strategy 2: Local proxy (user runs local-wb-proxy.mjs) ───────────────
  try {
    const localAvailable = await isLocalProxyAvailable();
    if (localAvailable) {
      const rows = await fetchAllPagesFrom(
        LOCAL_PROXY,
        { 'X-WB-Token': token },
        dateFrom, dateTo, onProgress,
      );
      return { rows, method: 'proxy' };
    }
  } catch (err) {
    // If local proxy is up but fails (e.g. auth error), surface the error
    if (!(err instanceof TypeError)) throw err;
  }

  // ── Strategy 3: Server proxy (cloud IP, likely blocked — shows clear msg) ─
  const url = `/api/wb/report?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const resp = await fetch(url, { headers: { 'X-WB-Token': token } });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((body as { error?: string })?.error ?? `HTTP ${resp.status}`);
  }
  const rows = (await resp.json()) as WBDetailRow[];
  onProgress?.(rows.length);
  return { rows, method: 'server' };
}

// ─── Analytics fetch (server proxy) ──────────────────────────────────────────

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
    throw new Error((body as { error?: string })?.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<WBAnalyticsCard[]>;
}

// ─── Advertising fetch (server proxy) ────────────────────────────────────────

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
    throw new Error((body as { error?: string })?.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<WBAdvertItem[]>;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseWBRows(
  raw: WBDetailRow[],
): { rows: OzonReportRow[]; nmMap: Map<number, string> } {
  const acc: Record<string, OzonReportRow> = {};

  // ── Pass 1: build nm_id → article map from rows that have sa_name ──────────
  // Storage/penalty rows often arrive with sa_name="" but valid nm_id.
  // Without this map they would group under nm_id-as-string instead of the
  // seller article, so storage never merges with the corresponding product row.
  const nmMap = new Map<number, string>();
  for (const row of raw) {
    const saName = row.sa_name?.trim();
    if (row.nm_id && saName) {
      nmMap.set(row.nm_id, saName);
    }
  }

  // ── Pass 2: accumulate all financial fields ───────────────────────────────
  const resolveArticle = (row: WBDetailRow): string => {
    const saName = row.sa_name?.trim();
    if (saName) return saName;
    // Prefer nm_id lookup so storage/penalty rows merge with their product
    if (row.nm_id) return nmMap.get(row.nm_id) ?? String(row.nm_id);
    return row.barcode?.trim() || 'unknown';
  };

  for (const row of raw) {
    const article = resolveArticle(row);

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
      // Commission is charged only on sales; WB may report it as negative (a deduction),
      // so we take the absolute value to ensure it's always a positive expense.
      r.ozonCommission += Math.abs(row.ppvz_sales_commission || 0);
    }
    if (isReturn) {
      r.returnsCount += qty;
      r.returnsSum   += price * qty;
    }

    // WB reports monetary charges as negative values (deductions from payout).
    // Use Math.abs() so all expenses accumulate as positive numbers regardless of sign convention.
    r.deliveryServices += Math.abs(row.delivery_rub || 0);

    const acq = Math.abs(row.acquiring_fee || 0);
    r.acquiring     += acq;
    r.agentServices += acq;

    r.storage       += Math.abs(row.storage_fee || 0) + Math.abs(row.acceptance || 0);
    r.otherExpenses += Math.abs(row.penalty || 0) + Math.abs(row.deduction || 0);
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

export function buildAnalyticsMap(
  cards: WBAnalyticsCard[],
  nmMap: Map<number, string>,
): Record<string, WBAnalyticsItem> {
  const result: Record<string, WBAnalyticsItem> = {};
  for (const card of cards) {
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

export function mergeAdvertSpend(
  rows: OzonReportRow[],
  advertItems: WBAdvertItem[],
  nmMap: Map<number, string>,
): OzonReportRow[] {
  if (advertItems.length === 0) return rows;
  const spendByArticle: Record<string, number> = {};
  for (const item of advertItems) {
    const article = nmMap.get(item.nmId);
    if (!article) continue;
    spendByArticle[article] = (spendByArticle[article] ?? 0) + item.spend;
  }
  return rows.map(r => {
    const adSpend = spendByArticle[r.article] ?? 0;
    return adSpend > 0 ? { ...r, promotion: r.promotion + adSpend } : r;
  });
}
