/**
 * Ozon Seller API client + parser.
 * Fetches transactions via /api/ozon/report proxy and converts to OzonReportRow[].
 *
 * Real Ozon v3 API structure (confirmed from live responses):
 *  - items[]: only { name, sku } — NO offer_id, count, or price per item!
 *  - accruals_for_sale: total gross revenue for the whole operation (>0 sale, <0 return, 0 service)
 *  - sale_commission: total commission (<0 charged, 0 for service ops)
 *  - services[]: individual fee breakdown with signed prices
 *
 * Strategy: use sku as article key; distribute amounts equally across items in
 * the same operation (no per-item prices available in v3).
 */
import { OzonReportRow } from '../types';

// ─── Raw Ozon operation shape (v3) ────────────────────────────────────────────
export interface OzonOperation {
  operation_id?: number;
  operation_type?: string;
  operation_type_name?: string;
  operation_date?: string;
  amount?: number;              // net (after all deductions)
  accruals_for_sale?: number;   // gross sale revenue (>0 sale, <0 return, 0 service)
  sale_commission?: number;     // commission (<0 cost to seller, 0 service ops)
  delivery_charge?: number;
  return_delivery_charge?: number;
  type?: string;
  posting?: { delivery_schema?: string; posting_number?: string; order_date?: string; warehouse_id?: number } | null;
  items?: Array<{
    name?: string;
    sku?: number;
    // offer_id, count, price are NOT returned in v3 transactions API
  }>;
  services?: Array<{
    name?: string;
    price?: number;   // <0 cost to seller, >0 income
  }>;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
export async function fetchOzonReport(
  clientId: string,
  apiKey: string,
  dateFrom: string,
  dateTo: string,
): Promise<OzonOperation[]> {
  const resp = await fetch('/api/ozon/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ozon-Client-Id': clientId,
      'X-Ozon-Api-Key':   apiKey,
    },
    body: JSON.stringify({ dateFrom, dateTo }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body?.error ?? `HTTP ${resp.status}`);
  }

  return resp.json() as Promise<OzonOperation[]>;
}

// ─── Service name → OzonReportRow field ──────────────────────────────────────
type ServiceField = keyof Pick<
  OzonReportRow,
  'ozonCommission' | 'logistics' | 'returnLogistics' | 'lastMile' |
  'processing' | 'agentServices' | 'acquiring' | 'storage' | 'promotion' |
  'fboServices' | 'otherExpenses' | 'deliveryServices'
>;

function classifyService(name: string): ServiceField {
  const n = name.toLowerCase();
  if (n.includes('commission') || n.includes('itemcommission'))           return 'ozonCommission';
  if (n.includes('marketing') || n.includes('promo') ||
      n.includes('boost')     || n.includes('advert') ||
      n.includes('review'))                                               return 'promotion';
  if (n.includes('acquiring') || n.includes('installment') ||
      n.includes('credit'))                                               return 'acquiring';
  if (n.includes('storage') || n.includes('хранение'))                   return 'storage';
  if (n.includes('accept') || n.includes('dropoff') ||
      n.includes('handover'))                                             return 'processing';
  if ((n.includes('return') || n.includes('возврат')) &&
      (n.includes('logistic') || n.includes('cargo') ||
       n.includes('delivery') || n.includes('trans')))                   return 'returnLogistics';
  if (n.includes('lastmile') || n.includes('last_mile') ||
      n.includes('pvz')       || n.includes('postamat'))                 return 'lastMile';
  if (n.includes('logistic') || n.includes('cargo') ||
      n.includes('delivery')  || n.includes('trans'))                    return 'logistics';
  if (n.includes('fbo') || n.includes('fbs') ||
      n.includes('wms')  || n.includes('fulfil'))                        return 'fboServices';
  return 'otherExpenses';
}

function blankRow(article: string, name: string): OzonReportRow {
  return {
    article, name,
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

// ─── Parser ───────────────────────────────────────────────────────────────────
export function parseOzonOperations(ops: OzonOperation[]): OzonReportRow[] {
  const acc: Record<string, OzonReportRow> = {};

  for (const op of ops) {
    const items    = op.items ?? [];
    const services = op.services ?? [];
    if (items.length === 0) continue;

    const accrual    = op.accruals_for_sale ?? 0;  // gross revenue (signed)
    const commission = op.sale_commission   ?? 0;  // commission (negative = cost)

    // Classify operation from accruals_for_sale — the clearest signal in v3:
    //   > 0 → sale, < 0 → return, = 0 → service charge
    const isSale   = accrual > 0;
    const isReturn = accrual < 0;

    // Equal split across all items in this operation (no per-item prices in v3)
    const n = items.length;

    for (const item of items) {
      const article = String(item.sku ?? 'unknown');
      if (!acc[article]) acc[article] = blankRow(article, item.name ?? '');
      const r = acc[article];
      if (!r.name && item.name) r.name = item.name;

      if (isSale) {
        r.ordersCount    += 1;               // count as 1 posting per SKU
        r.salesCount     += 1;
        r.ordersSum      += accrual / n;
        r.ozonCommission += Math.abs(commission) / n;
      } else if (isReturn) {
        r.returnsCount   += 1;
        r.returnsSum     += Math.abs(accrual) / n;
        // Commission is refunded on returns (sale_commission may be 0 or positive here)
        r.ozonCommission -= Math.abs(commission) / n;
      }
      // Service operations (accrual = 0): only services[] matter below

      // Attribute service costs (only negative prices = charged to seller)
      for (const svc of services) {
        const p = svc.price ?? 0;
        if (p >= 0) continue;                  // positive = seller income, skip
        const cost  = Math.abs(p) / n;
        const field = classifyService(svc.name ?? '');

        if (field === 'ozonCommission') {
          r.ozonCommission += cost;
        } else if (field === 'logistics' || field === 'returnLogistics' ||
                   field === 'lastMile'  || field === 'processing') {
          r.deliveryServices += cost;
          r[field]           += cost;
        } else if (field === 'acquiring') {
          r.agentServices += cost;
          r.acquiring     += cost;
        } else {
          // storage, fboServices, promotion, otherExpenses
          r[field] += cost;
        }
      }
    }
  }

  // Finalize
  for (const r of Object.values(acc)) {
    r.netSales = r.ordersSum - r.returnsSum;
    if (r.ozonCommission < 0) r.ozonCommission = 0;  // edge-case: refunded more than charged
  }

  // Include any row with meaningful data (sales, returns, OR any expense)
  return Object.values(acc).filter(r =>
    r.ordersCount  > 0 || r.returnsCount   > 0 ||
    r.ozonCommission > 0 || r.deliveryServices > 0 ||
    r.storage      > 0 || r.agentServices   > 0 ||
    r.promotion    > 0 || r.fboServices     > 0 ||
    r.otherExpenses > 0
  );
}
