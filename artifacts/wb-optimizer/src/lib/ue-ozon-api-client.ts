/**
 * Ozon Seller API client + parser.
 * Fetches transactions via /api/ozon/report proxy and converts to OzonReportRow[].
 *
 * Real Ozon v3 API structure (confirmed from live responses):
 *  - items[]: only { name, sku } — NO offer_id, count, or price per item!
 *  - accruals_for_sale: "Выручка" — what the buyer actually paid (>0 sale, <0 return, 0 service)
 *  - sale_commission: Вознаграждение за продажу (<0 charged, 0 for service ops)
 *  - services[]: individual fee/income breakdown with signed prices
 *    • Negative price = cost to seller (Логистика, Эквайринг, etc.)
 *    • Positive price = income from Ozon (Баллы за скидки, Программы партнёров, etc.)
 *
 * Strategy: use sku as article key; distribute amounts equally across items in
 * the same operation (no per-item prices available in v3).
 *
 * Account-level operations (no items[], e.g. рекламные расходы, Подписка) are
 * collected into OzonAccountTotals and must be included in the summary separately.
 */
import { OzonReportRow } from '../types';

// ─── Raw Ozon operation shape (v3) ────────────────────────────────────────────
export interface OzonOperation {
  operation_id?: number;
  operation_type?: string;
  operation_type_name?: string;
  operation_date?: string;
  amount?: number;              // net (after all deductions)
  accruals_for_sale?: number;   // "Выручка" — buyer payment (>0 sale, <0 return, 0 service)
  sale_commission?: number;     // Вознаграждение за продажу (<0 cost, positive on return refund)
  delivery_charge?: number;
  return_delivery_charge?: number;
  type?: string;
  posting?: { delivery_schema?: string; posting_number?: string; order_date?: string; warehouse_id?: number } | null;
  items?: Array<{
    name?: string;
    sku?: number;
  }>;
  services?: Array<{
    name?: string;
    price?: number;   // <0 cost to seller, >0 income (Баллы за скидки, etc.)
  }>;
}

// ─── Account-level totals (operations without items[]) ───────────────────────
export interface OzonAccountTotals {
  promotion: number;        // Продвижение и реклама (Оплата за клик, Подписка Premium Lite, etc.)
  deliveryServices: number; // Услуги доставки total
  logistics: number;        // sub-total of deliveryServices
  returnLogistics: number;
  lastMile: number;
  processing: number;       // Обработка отправления, Агентское вознаграждение Агрегатор
  storage: number;          // unused after reclassification (kept for type compat)
  fboServices: number;      // Услуги FBO: Кросс-докинг, Перемещения, Размещение, Вывоз, etc.
  agentServices: number;    // Услуги партнёров: Эквайринг, Услуги Партнёров realFBS, etc.
  acquiring: number;
  otherExpenses: number;    // Другие услуги и штрафы: Временное размещение в СЦ, Нерекомендованный
  otherRevenue: number;     // Компенсации: Начисление по спору и иные кредиты
}

export function emptyAccountTotals(): OzonAccountTotals {
  return {
    promotion: 0, deliveryServices: 0, logistics: 0, returnLogistics: 0,
    lastMile: 0, processing: 0, storage: 0, fboServices: 0,
    agentServices: 0, acquiring: 0, otherExpenses: 0, otherRevenue: 0,
  };
}

// ─── Parse result ─────────────────────────────────────────────────────────────
export interface ParsedOzonResult {
  rows: OzonReportRow[];
  accountTotals: OzonAccountTotals;
}

// ─── Raw Ozon realization report shape (v1) ───────────────────────────────────
export interface OzonRealizationResult {
  // Known fields from Ozon docs; actual response may include more
  period?:                   { begin?: string; end?: string };
  vendor_name?:              string;
  accruals_for_sale?:        number;
  refunds_and_cancellations?: number;
  processing_and_delivery?:  number;
  compensation?:             number;
  money_transfer?:           number;
  others_amount?:            number;
  penalty?:                  number;
  [key: string]: unknown;  // capture any extra fields
}

export async function fetchOzonRealization(
  clientId: string,
  apiKey: string,
  month: number,
  year: number,
): Promise<OzonRealizationResult> {
  const resp = await fetch('/api/ozon/realization', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ozon-Client-Id': clientId,
      'X-Ozon-Api-Key':   apiKey,
    },
    body: JSON.stringify({ month, year }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(`Realization: ${body?.error ?? `HTTP ${resp.status}`}`);
  }

  return resp.json() as Promise<OzonRealizationResult>;
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

  // ① Агентское вознаграждение Ozon Агрегатор realFBS → Услуги доставки (as processing)
  //    Must be checked BEFORE commission — name contains "вознаграждение ozon"
  if (n.includes('агентское вознаграждение'))
    return 'processing';

  // ② Ozon commission
  if (n.includes('commission') || n.includes('itemcommission') ||
      n.includes('вознаграждение за продажу') || n.includes('вознаграждение ozon'))
    return 'ozonCommission';

  // ③ Продвижение и реклама — INCLUDING Подписка Premium Lite
  if (n.includes('marketing') || n.includes('promo') || n.includes('boost') ||
      n.includes('advert') || n.includes('review') ||
      n.includes('оплата за клик') || n.includes('продвижение') ||
      n.includes('подписка'))
    return 'promotion';

  // ④ Acquiring / payments
  if (n.includes('acquiring') || n.includes('installment') || n.includes('credit') ||
      n.includes('эквайринг'))
    return 'acquiring';

  // ⑤ Услуги партнёров — check BEFORE processing/fbo to catch:
  //    "Обработка возвратов партнёрами", "Drop-off партнёрами",
  //    "Упаковка партнёрами", "Временное размещение партнерами",
  //    "Услуги Партнёров Ozon realFBS"
  if (n.includes('партнёр') || n.includes('партнер') || n.includes('realfbs'))
    return 'agentServices';

  // ⑥ Услуги FBO (Ozon warehouse ops, NOT delivery):
  //    Кросс-докинг, Перемещение складов, Вывоз товара, Размещение на складе,
  //    Бронирование места, Подготовка товара к вывозу
  if (n.includes('кросс') || n.includes('перемещение') || n.includes('вывоз товара') ||
      n.includes('размещение на складе') || n.includes('брониров') || n.includes('подготовк') ||
      n.includes('fbo') || n.includes('wms') || n.includes('fulfil'))
    return 'fboServices';

  // ⑦ Другие услуги и штрафы:
  //    Временное размещение в СЦ/ПВЗ, Обеспечение материалами, Нерекомендованный слот
  if (n.includes('хранение') || n.includes('временное размещение') ||
      n.includes('обеспечение материалами') || n.includes('отгрузка в нерекомендованный'))
    return 'otherExpenses';

  // ⑧ Processing / drop-off at PVZ (Ozon-operated → Услуги доставки)
  if (n.includes('accept') || n.includes('dropoff') || n.includes('handover') ||
      n.includes('drop-off') || n.includes('обработка отправления') ||
      n.includes('обработка') || n.includes('упаковк'))
    return 'processing';

  // ⑨ Return logistics — BEFORE general logistics
  if ((n.includes('return') || n.includes('обратная') || n.includes('возврат')) &&
      (n.includes('logistic') || n.includes('cargo') || n.includes('delivery') ||
       n.includes('trans') || n.includes('логистик')))
    return 'returnLogistics';

  // ⑩ Last mile / pickup point
  if (n.includes('lastmile') || n.includes('last_mile') ||
      n.includes('pvz') || n.includes('postamat') ||
      n.includes('доставка до места выдачи'))
    return 'lastMile';

  // ⑪ General logistics (Логистика FBO/FBS)
  if (n.includes('logistic') || n.includes('cargo') || n.includes('delivery') ||
      n.includes('trans') || n.includes('логистика'))
    return 'logistics';

  return 'otherExpenses';
}

// ─── Revenue service names (positive services that increase seller revenue) ───
// NOTE: 'возврат вознаграждения' is NOT here — commission refunds are handled via
// sale_commission on regular returns. On combined ops (accruals=0, commission=0)
// we reduce ozonCommission directly in the services loop below.
const REVENUE_SERVICE_KEYWORDS = [
  'баллы за скидки',
  'программы партнёров',
  'программы партнеров',
  'начисление по спору',
];

function isRevenueService(name: string): boolean {
  const n = name.toLowerCase();
  return REVENUE_SERVICE_KEYWORDS.some(kw => n.includes(kw));
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
export function parseOzonOperations(ops: OzonOperation[]): ParsedOzonResult {
  const acc: Record<string, OzonReportRow> = {};
  const at = emptyAccountTotals();

  // DEBUG — collect unique service names to diagnose classification
  const svcNames = new Map<string, { count: number; totalCost: number; hasItems: boolean }>();

  for (const op of ops) {
    const items    = op.items ?? [];
    const services = op.services ?? [];

    const accrual    = op.accruals_for_sale ?? 0;  // "Выручка" — buyer payment (signed)
    const commission = op.sale_commission   ?? 0;  // Вознаграждение (negative = cost)

    // ── Operations WITHOUT items → account-level costs ──────────────────────
    if (items.length === 0) {
      // Commission at account level (rare but possible)
      if (commission < 0) at.otherExpenses += Math.abs(commission);

      for (const svc of services) {
        const p = svc.price ?? 0;
        if (p === 0) continue;

        if (p > 0) {
          // Positive account-level entries: dispute credits, bonuses, etc.
          // These are real revenue credited to seller — capture as otherRevenue
          if (isRevenueService(svc.name ?? '')) {
            at.otherRevenue += p;
          }
          continue;
        }

        const cost  = Math.abs(p);
        const field = classifyService(svc.name ?? '');

        if (field === 'logistics' || field === 'returnLogistics' ||
            field === 'lastMile'  || field === 'processing') {
          at.deliveryServices += cost;
          at[field]           += cost;
        } else if (field === 'acquiring') {
          at.agentServices += cost;
          at.acquiring     += cost;
        } else if (field === 'promotion') {
          at.promotion += cost;
        } else if (field === 'storage') {
          at.storage += cost;
        } else if (field === 'fboServices') {
          at.fboServices += cost;
        } else if (field === 'agentServices') {
          at.agentServices += cost;
        } else {
          // ozonCommission, otherExpenses
          at.otherExpenses += cost;
        }
      }
      continue;
    }

    // ── Operations WITH items → per-SKU attribution ─────────────────────────
    const isSale   = accrual > 0;
    const isReturn = accrual < 0;
    const n = items.length;

    for (const item of items) {
      const article = String(item.sku ?? 'unknown');
      if (!acc[article]) acc[article] = blankRow(article, item.name ?? '');
      const r = acc[article];
      if (!r.name && item.name) r.name = item.name;

      // ── Revenue / returns ────────────────────────────────────────────────
      if (isSale) {
        r.ordersCount    += 1;
        r.salesCount     += 1;
        r.ordersSum      += accrual / n;         // "Выручка" portion
        r.ozonCommission += Math.abs(commission) / n;
      } else if (isReturn) {
        r.returnsCount   += 1;
        r.returnsSum     += Math.abs(accrual) / n;
        // Commission refunded on returns (commission will be 0 or positive here)
        r.ozonCommission -= Math.abs(commission) / n;
      }

      // ── Services ─────────────────────────────────────────────────────────
      for (const svc of services) {
        const p = svc.price ?? 0;
        if (p === 0) continue;

        const svcName = svc.name ?? '';

        // DEBUG — track service names
        const dbgKey = svcName || '(empty)';
        const existing = svcNames.get(dbgKey) ?? { count: 0, totalCost: 0, hasItems: true };
        existing.count++;
        existing.totalCost += Math.abs(p);
        existing.hasItems = true;
        svcNames.set(dbgKey, existing);

        if (p > 0) {
          // Positive services:
          //   • Revenue services (Баллы за скидки, Программы партнёров, Начисление по спору)
          //     → add to ordersSum
          //   • "Возврат вознаграждения" — commission refund:
          //     - On regular returns: already handled via sale_commission → skip to avoid double-count
          //     - On combined ops (sale+return in one op, commission=0): reduce ozonCommission
          //   • All other positive entries: skip
          if (isRevenueService(svcName)) {
            r.ordersSum += p / n;
          } else if (svcName.toLowerCase().includes('возврат вознаграждения') && commission === 0) {
            // Combined op: "Вознаграждение за продажу" charged via services, refund also via services
            r.ozonCommission = Math.max(0, r.ozonCommission - p / n);
          }
          continue;
        }

        const cost  = Math.abs(p) / n;
        const field = classifyService(svcName);

        if (field === 'ozonCommission') {
          r.ozonCommission += cost;
        } else if (field === 'logistics' || field === 'returnLogistics' ||
                   field === 'lastMile'  || field === 'processing') {
          r.deliveryServices += cost;
          r[field]           += cost;
        } else if (field === 'acquiring') {
          r.agentServices += cost;
          r.acquiring     += cost;
        } else if (field === 'agentServices') {
          r.agentServices += cost;
        } else {
          // storage, fboServices, promotion, otherExpenses
          r[field] += cost;
        }
      }
    }
  }

  // ── Finalize per-SKU rows ─────────────────────────────────────────────────
  for (const r of Object.values(acc)) {
    r.netSales = r.ordersSum - r.returnsSum;
    if (r.ozonCommission < 0) r.ozonCommission = 0;
  }

  const rows = Object.values(acc).filter(r =>
    r.ordersCount  > 0 || r.returnsCount   > 0 ||
    r.ozonCommission > 0 || r.deliveryServices > 0 ||
    r.storage      > 0 || r.agentServices   > 0 ||
    r.promotion    > 0 || r.fboServices     > 0 ||
    r.otherExpenses > 0
  );

  // DEBUG — log each service name individually so none get truncated
  console.log('[SvcNames] Total unique service names:', svcNames.size);
  Array.from(svcNames.entries())
    .sort((a, b) => b[1].totalCost - a[1].totalCost)
    .forEach(([name, d]) => {
      console.log(`[SVC] ${d.totalCost.toFixed(0).padStart(8)} | ${d.count}x | [${classifyService(name)}] ${name}`);
    });

  return { rows, accountTotals: at };
}
