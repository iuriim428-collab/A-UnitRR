/**
 * Wildberries Statistics API client + parser.
 * Requests are made directly from the browser (user's IP) to avoid cloud-IP blocks.
 * WB Statistics API requires a token from dev.wildberries.ru with "Статистика" permission.
 */
import { OzonReportRow } from '../types';

// ─── Raw WB row shape ─────────────────────────────────────────────────────────
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
  ppvz_for_pay: number;          // net payout to seller
  ppvz_sales_commission: number; // WB commission (positive = cost, negative = refund)
  delivery_rub: number;          // logistics cost
  acquiring_fee: number;         // acquiring fee
  storage_fee: number;           // storage
  penalty: number;               // penalty
  deduction: number;             // other deductions
  acceptance: number;            // acceptance fee
  retail_amount: number;
}

const WB_BASE = 'https://statistics-api.wildberries.ru';

// ─── Fetch ────────────────────────────────────────────────────────────────────
/**
 * Fetches all pages of WB reportDetailByPeriod directly from the browser.
 * This bypasses any cloud-IP blocks on the server proxy.
 */
export async function fetchWBReport(
  token: string,
  dateFrom: string,
  dateTo: string,
  onProgress?: (rows: number) => void,
): Promise<WBDetailRow[]> {
  const allRows: WBDetailRow[] = [];
  let rrdid = 0;

  while (true) {
    const url =
      `${WB_BASE}/api/v5/supplier/reportDetailByPeriod` +
      `?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100000&rrdid=${rrdid}`;

    const resp = await fetch(url, {
      headers: { Authorization: token },
    });

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try {
        const body = await resp.json();
        if (resp.status === 429 && (body?.origin === 's2s-api-auth-stat' || body?.detail?.includes('dev.wildberries.ru'))) {
          errMsg =
            'WB изменили аутентификацию Statistics API (новость #281). ' +
            'Создайте новый токен на dev.wildberries.ru → API-ключи → Статистика.';
        } else if (resp.status === 429) {
          errMsg = 'Превышен лимит запросов WB. Подождите 1 минуту и повторите.';
        } else if (resp.status === 401 || resp.status === 403) {
          errMsg = `Неверный токен WB (${resp.status}). Проверьте токен на dev.wildberries.ru.`;
        } else {
          errMsg = body?.message ?? body?.error ?? errMsg;
        }
      } catch {
        // ignore json parse error
      }
      throw new Error(errMsg);
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

// ─── Parser ───────────────────────────────────────────────────────────────────
/** Convert raw WB detail rows into the shared OzonReportRow format (aggregated per article). */
export function parseWBRows(raw: WBDetailRow[]): OzonReportRow[] {
  const acc: Record<string, OzonReportRow> = {};

  for (const row of raw) {
    const article = (row.sa_name || row.barcode || String(row.nm_id) || 'unknown').trim();

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

    // Commission: positive for sales (WB charges), negative for returns (WB refunds) → nets correctly
    r.ozonCommission += row.ppvz_sales_commission || 0;

    // Logistics
    r.deliveryServices += row.delivery_rub || 0;

    // Acquiring / partner services
    const acq = row.acquiring_fee || 0;
    r.acquiring      += acq;
    r.agentServices  += acq;

    // Storage + acceptance
    r.storage    += (row.storage_fee || 0) + (row.acceptance || 0);

    // Penalties and other deductions
    r.otherExpenses += (row.penalty || 0) + (row.deduction || 0);
  }

  for (const r of Object.values(acc)) {
    r.netSales = r.ordersSum - r.returnsSum;
  }

  return Object.values(acc).filter(r => r.ordersCount > 0 || r.returnsCount > 0 || r.storage > 0);
}
