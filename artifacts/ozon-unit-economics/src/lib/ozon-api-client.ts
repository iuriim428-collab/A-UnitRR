/**
 * Ozon Seller API client + parser.
 * Fetches transactions via /api/ozon/report proxy and converts to OzonReportRow[].
 */
import { OzonReportRow } from '../types';

// ─── Raw Ozon operation shape ─────────────────────────────────────────────────
export interface OzonOperation {
  operation_id: number;
  operation_type: string;
  operation_type_name: string;
  operation_date: string;
  amount: number;
  accruals_for_sale: number;   // gross revenue (positive=sale, negative=return)
  sale_commission: number;     // WB-style commission (negative=charged to seller)
  posting: { posting_number?: string; delivery_schema?: string } | null;
  items: Array<{
    name: string;
    sku: number;
    offer_id: string;    // seller article
    count: number;
    price: number;
  }>;
  services: Array<{
    name: string;
    price: number;      // negative = cost to seller
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

  if (n.includes('commission') || n.includes('комиссия'))    return 'ozonCommission';
  if (n.includes('marketing') || n.includes('promo') ||
      n.includes('boost') || n.includes('advert') ||
      n.includes('review'))                                   return 'promotion';
  if (n.includes('acquiring') || n.includes('installment'))  return 'acquiring';
  if (n.includes('storage') && n.includes('fbo'))            return 'storage';
  if (n.includes('storage') || n.includes('хранение'))       return 'storage';
  if (n.includes('acceptance') || n.includes('dropoff') ||
      n.includes('accept'))                                   return 'processing';
  if (n.includes('return') &&
     (n.includes('trans') || n.includes('logist') ||
      n.includes('cargo') || n.includes('delivery')))        return 'returnLogistics';
  if (n.includes('lastmile') || n.includes('last_mile') ||
      n.includes('pvz') || n.includes('postamat'))           return 'lastMile';
  if (n.includes('trans') || n.includes('logist') ||
      n.includes('cargo') || n.includes('delivery') ||
      n.includes('доставка'))                                 return 'logistics';
  if (n.includes('fbo') || n.includes('fbs') ||
      n.includes('wms') || n.includes('fulfil'))             return 'fboServices';

  return 'otherExpenses';
}

// ─── Parser ───────────────────────────────────────────────────────────────────
export function parseOzonOperations(ops: OzonOperation[]): OzonReportRow[] {
  const acc: Record<string, OzonReportRow> = {};

  for (const op of ops) {
    if (!op.items || op.items.length === 0) continue;

    const isSale   = op.accruals_for_sale > 0;
    const isReturn = op.accruals_for_sale < 0;

    // Total revenue for this operation (for proration of fees across items)
    const totalRevenue = op.items.reduce((s, i) => s + Math.abs(i.price * i.count), 0);

    for (const item of op.items) {
      const article = (item.offer_id || String(item.sku) || 'unknown').trim();

      if (!acc[article]) {
        acc[article] = {
          article,
          name: item.name || '',
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
      if (!acc[article].name && item.name) acc[article].name = item.name;

      const r = acc[article];
      const itemRevShare = totalRevenue > 0 ? (Math.abs(item.price * item.count) / totalRevenue) : (1 / op.items.length);

      if (isSale) {
        r.salesCount  += item.count;
        r.ordersCount += item.count;
        r.ordersSum   += item.price * item.count;
      }
      if (isReturn) {
        r.returnsCount += item.count;
        r.returnsSum   += Math.abs(item.price * item.count);
      }

      // Commission: use sale_commission field (negative = deducted from seller, sum = net cost)
      r.ozonCommission += Math.abs(op.sale_commission) * itemRevShare;

      // Services: prorate by item revenue share
      for (const svc of op.services) {
        if (svc.price === 0) continue;
        const cost = Math.abs(svc.price) * itemRevShare;
        const field = classifyService(svc.name);

        if (field === 'logistics' || field === 'returnLogistics' || field === 'lastMile' || field === 'processing') {
          r.deliveryServices += cost;
          r[field]           += cost;
        } else if (field === 'acquiring') {
          r.agentServices += cost;
          r.acquiring     += cost;
        } else {
          r[field] += cost;
        }
      }
    }
  }

  // Compute netSales
  for (const r of Object.values(acc)) {
    r.netSales = r.ordersSum - r.returnsSum;
  }

  return Object.values(acc).filter(r => r.ordersCount > 0 || r.returnsCount > 0);
}
