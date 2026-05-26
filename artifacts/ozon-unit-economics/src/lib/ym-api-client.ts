/**
 * Yandex Market Partner API client + parser.
 * Fetches order statistics via /api/ym/report proxy and converts to OzonReportRow[].
 *
 * Uses the POST /v2/campaigns/{id}/stats/orders endpoint.
 * Commission is taken from each order's commission.actual percentage.
 * Delivery/logistics costs are not available from this endpoint (use xlsx for full detail).
 */
import { OzonReportRow } from '../types';

// ─── Raw YM order shape ───────────────────────────────────────────────────────
interface YMItem {
  offerId: string;       // seller article
  offerName: string;
  price: number;         // seller price
  buyerPrice: number;    // price paid by buyer
  count: number;
  initialCount: number;
  shopSku: string;
}

interface YMOrder {
  id: number;
  creationDate: string;   // DD-MM-YYYY
  statusUpdateDate: string;
  status: string;         // DELIVERED | RETURNED | CANCELLED_* | PICKUP | etc.
  paymentType: string;
  itemsTotal: number;
  commission: {
    actual: number;       // 0.13 = 13%
    max: number;
    min: number;
  };
  initialItems: YMItem[];
}

const DELIVERED_STATUSES = new Set([
  'DELIVERED', 'PICKUP',
]);

const RETURN_STATUSES = new Set([
  'RETURNED', 'PARTIALLY_RETURNED',
  'CANCELLED_IN_DELIVERY',
  'CANCELLED_BY_USER_AFTER_CONFIRMATION',
]);

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
    const items = order.initialItems ?? [];
    if (items.length === 0) continue;

    const isDelivered = DELIVERED_STATUSES.has(order.status);
    const isReturn    = RETURN_STATUSES.has(order.status);
    if (!isDelivered && !isReturn) continue;

    const commissionRate = order.commission?.actual ?? 0;

    for (const item of items) {
      const article = (item.offerId || item.shopSku || 'unknown').trim();

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

      const r   = acc[article];
      const qty = item.count || 0;
      const price = item.buyerPrice || item.price || 0;
      const lineRevenue = price * qty;

      if (isDelivered) {
        r.salesCount  += qty;
        r.ordersCount += qty;
        r.ordersSum   += lineRevenue;
        r.ozonCommission += lineRevenue * commissionRate;
      }

      if (isReturn) {
        r.returnsCount += qty;
        r.returnsSum   += lineRevenue;
        // Refund commission on returns
        r.ozonCommission -= lineRevenue * commissionRate;
      }
    }
  }

  // Compute netSales; floor commission at 0 (edge case: full return)
  for (const r of Object.values(acc)) {
    r.netSales = r.ordersSum - r.returnsSum;
    if (r.ozonCommission < 0) r.ozonCommission = 0;
  }

  return Object.values(acc).filter(r => r.ordersCount > 0 || r.returnsCount > 0);
}
