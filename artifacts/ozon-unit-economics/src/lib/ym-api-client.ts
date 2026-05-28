/**
 * Yandex Market Partner API client + parser.
 * Fetches order statistics via /api/ym/report proxy and converts to OzonReportRow[].
 *
 * Uses POST /v2/campaigns/{id}/stats/orders (Api-Key auth, v2 schema as of 2024+).
 *
 * Real response structure (confirmed from live API):
 *  order.items[]          — array of items (NOT initialItems)
 *  item.prices[]          — [{type:'MARKETPLACE'|'BUYER'|..., costPerItem, total}]
 *  order.commissions[]    — [{type:'AUCTION_PROMOTION'|'MARKETPLACE_OFFER'|..., actual}]
 *                           actual is a monetary AMOUNT in rubles (not a rate/percentage)
 *  item.shopSku           — seller article
 *
 * Commission type mapping:
 *  MARKETPLACE_OFFER                              → ozonCommission
 *  AUCTION_PROMOTION                              → promotion
 *  DELIVERY_TO_CUSTOMER, DELIVERY, DELIVERY_SUBSIDY,
 *  EXPRESS_DELIVERY_RECIPIENT, EXPRESS_DELIVERY   → deliveryServices
 *  RETURN_PROCESSING, CANCELLED_RETURN_PROCESSING → returnProcessing
 *  everything else                                → otherExpenses
 */
import { OzonReportRow } from '../types';

// ─── Raw YM order shape (v2 live API) ──────────────────────────────────────
interface YMItemPrice {
  type: string;       // 'MARKETPLACE' | 'BUYER' | 'SUBSIDY' | etc.
  costPerItem: number;
  total: number;
}

interface YMItem {
  shopSku: string;        // seller article
  offerName?: string;
  marketSku?: number;
  count: number;
  prices: YMItemPrice[];
}

interface YMCommission {
  type: string;   // 'MARKETPLACE_OFFER' | 'AUCTION_PROMOTION' | 'DELIVERY_TO_CUSTOMER' | etc.
  actual: number; // monetary amount in RUB (not a percentage)
}

interface YMOrder {
  id: number;
  creationDate: string;
  statusUpdateDate: string;
  status: string;
  paymentType: string;
  items: YMItem[];
  commissions?: YMCommission[];
}

const DELIVERED_STATUSES = new Set(['DELIVERED', 'PICKUP']);

const RETURN_STATUSES = new Set([
  'RETURNED', 'PARTIALLY_RETURNED', 'CANCELLED_IN_DELIVERY',
]);

// ─── Commission type classification ───────────────────────────────────────────
type CommField = 'ozonCommission' | 'promotion' | 'deliveryServices' | 'returnProcessing' | 'otherExpenses';

function classifyCommission(type: string): CommField {
  switch (type) {
    case 'MARKETPLACE_OFFER':
      return 'ozonCommission';
    case 'AUCTION_PROMOTION':
      return 'promotion';
    case 'DELIVERY_TO_CUSTOMER':
    case 'DELIVERY':
    case 'DELIVERY_SUBSIDY':
    case 'EXPRESS_DELIVERY_RECIPIENT':
    case 'EXPRESS_DELIVERY':
      return 'deliveryServices';
    case 'RETURN_PROCESSING':
    case 'CANCELLED_RETURN_PROCESSING':
      return 'returnProcessing';
    default:
      return 'otherExpenses';
  }
}

interface CommBreakdown {
  ozonCommission: number;
  promotion: number;
  deliveryServices: number;
  returnProcessing: number;
  otherExpenses: number;
}

function orderCommissionBreakdown(order: YMOrder): CommBreakdown {
  const result: CommBreakdown = {
    ozonCommission: 0, promotion: 0, deliveryServices: 0,
    returnProcessing: 0, otherExpenses: 0,
  };
  if (!order.commissions?.length) return result;
  for (const c of order.commissions) {
    result[classifyCommission(c.type)] += c.actual ?? 0;
  }
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Revenue per item: prefer MARKETPLACE (what seller receives), fall back to BUYER. */
function itemRevenue(item: YMItem): number {
  const mp = item.prices?.find(p => p.type === 'MARKETPLACE');
  if (mp) return mp.total;
  const buyer = item.prices?.find(p => p.type === 'BUYER');
  if (buyer) return buyer.total;
  return 0;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
export async function fetchYMReport(
  token: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<YMOrder[]> {
  const resp = await fetch('/api/ym/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ym-Token': token,
    },
    body: JSON.stringify({ campaignId, dateFrom, dateTo }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body?.error ?? `HTTP ${resp.status}`);
  }

  return resp.json() as Promise<YMOrder[]>;
}

// ─── Parser ───────────────────────────────────────────────────────────────────
export function parseYMOrders(orders: YMOrder[]): OzonReportRow[] {
  const acc: Record<string, OzonReportRow> = {};

  for (const order of orders) {
    const items = order.items ?? [];
    if (items.length === 0) continue;

    const isDelivered = DELIVERED_STATUSES.has(order.status);
    const isReturn    = RETURN_STATUSES.has(order.status);
    if (!isDelivered && !isReturn) continue;

    // Break down order-level commissions by type
    const breakdown = orderCommissionBreakdown(order);

    // Distribute order-level amounts proportionally by item revenue share
    const orderTotalRevenue = items.reduce((s, it) => s + itemRevenue(it), 0);

    for (const item of items) {
      const article = (item.shopSku || 'unknown').trim();

      if (!acc[article]) {
        acc[article] = {
          article,
          name: item.offerName || '',
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
      if (!acc[article].name && item.offerName) acc[article].name = item.offerName;

      const r       = acc[article];
      const qty     = item.count || 0;
      const lineRev = itemRevenue(item);

      // Proportional share of this item vs order total
      const lineShare = orderTotalRevenue > 0 ? lineRev / orderTotalRevenue : 1 / items.length;

      if (isDelivered) {
        r.salesCount    += qty;
        r.ordersCount   += qty;
        r.ordersSum     += lineRev;
        r.ozonCommission    += breakdown.ozonCommission    * lineShare;
        r.promotion         += breakdown.promotion         * lineShare;
        r.deliveryServices  += breakdown.deliveryServices  * lineShare;
        r.returnProcessing  += breakdown.returnProcessing  * lineShare;
        r.otherExpenses     += breakdown.otherExpenses     * lineShare;
      }

      if (isReturn) {
        r.returnsCount  += qty;
        r.returnsSum    += lineRev;
        r.ozonCommission    -= breakdown.ozonCommission    * lineShare;
        r.promotion         -= breakdown.promotion         * lineShare;
        r.deliveryServices  -= breakdown.deliveryServices  * lineShare;
        r.returnProcessing  -= breakdown.returnProcessing  * lineShare;
        r.otherExpenses     -= breakdown.otherExpenses     * lineShare;
      }
    }
  }

  // Compute netSales; floor negative fields at 0
  for (const r of Object.values(acc)) {
    r.netSales = r.ordersSum - r.returnsSum;
    if (r.ozonCommission  < 0) r.ozonCommission  = 0;
    if (r.promotion       < 0) r.promotion       = 0;
    if (r.deliveryServices < 0) r.deliveryServices = 0;
    if (r.returnProcessing < 0) r.returnProcessing = 0;
    if (r.otherExpenses   < 0) r.otherExpenses   = 0;
  }

  return Object.values(acc).filter(r => r.ordersCount > 0 || r.returnsCount > 0);
}
