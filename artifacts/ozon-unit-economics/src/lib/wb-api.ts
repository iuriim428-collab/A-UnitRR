/**
 * Wildberries Statistics API client + parser.
 * Data is fetched via the /api/wb/report proxy on our own server.
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

// ─── Fetch ────────────────────────────────────────────────────────────────────
export async function fetchWBReport(
  token: string,
  dateFrom: string,
  dateTo: string,
  onProgress?: (rows: number) => void,
): Promise<WBDetailRow[]> {
  const url = `/api/wb/report?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const resp = await fetch(url, {
    headers: { 'X-WB-Token': token },
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body?.error ?? `HTTP ${resp.status}`);
  }

  const rows = (await resp.json()) as WBDetailRow[];
  onProgress?.(rows.length);
  return rows;
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

  return Object.values(acc).filter(r => r.ordersCount > 0 || r.returnsCount > 0 || r.storage > 0);
}
