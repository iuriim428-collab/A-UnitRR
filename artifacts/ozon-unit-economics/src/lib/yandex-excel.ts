/**
 * Yandex Market report parser.
 * Source: "Отчёт о заказах" (united_orders_*.xlsx)
 *
 * Uses two sheets:
 *  - "Транзакции по заказам и товарам"  → SKU, qty, price, status per order line
 *  - "Услуги и маржа по заказам"        → fee breakdown per order (joined by order number)
 *
 * Fees are prorated across SKUs within the same order by revenue share.
 */
import * as XLSX from 'xlsx';
import { OzonReportRow } from '../types';

type RawRow = unknown[];

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

// ─── Find header row by scanning for a sentinel column value ─────────────────
function findHeaderRow(rows: RawRow[], sentinel: string): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i].some(c => str(c).includes(sentinel))) return i;
  }
  return -1;
}

// ─── Build col-name → index map from a header row ────────────────────────────
function buildColMap(row: RawRow): Record<string, number> {
  const m: Record<string, number> = {};
  row.forEach((h, i) => { const k = str(h); if (k) m[k] = i; });
  return m;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function isSale(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes('доставлен') && !s.includes('не');
}
function isReturn(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s.includes('невыкуп') || s.includes('возвращён') ||
    s.includes('возвращен') || s.includes('возврат')
  );
}
// Cancelled orders (до обработки, в доставке) → exclude from P&L

// ─── Order-level fee record ───────────────────────────────────────────────────
interface OrderFees {
  orderRevenue: number;   // total order revenue (all SKUs combined)
  totalFees: number;
  listing: number;       // Размещение товаров на витрине
  warehouse: number;     // Складская обработка
  loyalty: number;       // Участие в программе лояльности
  boost: number;         // Буст продаж
  delivery: number;      // Доставка покупателю
  expressDelivery: number;
  paymentIn: number;     // Приём платежа
  paymentOut: number;    // Перевод платежа
  pickupOrg: number;     // Организация забора
  orderProcessing: number; // Обработка заказа
  returnStorage: number;   // Хранение невыкупов
  returnShipping: number;  // Возврат невыкупленных товаров
  commission: number;      // Вознаграждение за продажу товара
  installments: number;    // Рассрочка
}

function parseServicesSheet(rows: RawRow[]): Map<string, OrderFees> {
  const map = new Map<string, OrderFees>();
  const hdrIdx = findHeaderRow(rows, 'Все услуги Маркета');
  if (hdrIdx === -1) return map;

  const cm = buildColMap(rows[hdrIdx]);
  const g = (row: RawRow, col: string) => Math.abs(num(row[cm[col] ?? -1]));

  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const orderNum = str(row[cm['Номер заказа'] ?? 7]);
    if (!orderNum) continue;

    // Revenue: col "Цена продажи (за шт.), ₽" is actually ORDER total despite name
    const orderRevenue = num(row[cm['Цена продажи (за шт.), ₽'] ?? 13]);

    map.set(orderNum, {
      orderRevenue,
      totalFees:       g(row, 'Все услуги Маркета за заказы, ₽'),
      listing:         g(row, 'Размещение товаров на витрине, ₽'),
      warehouse:       g(row, 'Складская обработка, ₽'),
      loyalty:         g(row, 'Участие в программе лояльности, ₽'),
      boost:           g(row, 'Буст продаж, ₽'),
      delivery:        g(row, 'Доставка покупателю, ₽'),
      expressDelivery: g(row, 'Экспресс-доставка покупателю, ₽'),
      paymentIn:       g(row, 'Приём платежа покупателя, ₽'),
      paymentOut:      g(row, 'Перевод платежа покупателя, ₽'),
      pickupOrg:       g(row, 'Организация забора заказов, ₽'),
      orderProcessing: g(row, 'Обработка заказа, ₽'),
      returnStorage:   g(row, 'Хранение невыкупов и возвратов, ₽'),
      returnShipping:  g(row, 'Возврат невыкупленных товаров, ₽'),
      commission:      g(row, 'Вознаграждение за продажу товара, ₽'),
      installments:    g(row, 'Рассрочка, ₽'),
    });
  }
  return map;
}

// ─── Transaction line ─────────────────────────────────────────────────────────
interface TxLine {
  orderNum: string;
  sku: string;
  name: string;
  salePrice: number;   // per unit
  qty: number;         // delivered/returned qty
  lineRevenue: number; // salePrice × qty (>0 = sale, <0 = return)
  isSale: boolean;
  isReturn: boolean;
}

function parseTransactionsSheet(rows: RawRow[]): TxLine[] {
  const hdrIdx = findHeaderRow(rows, 'Ваш SKU');
  if (hdrIdx === -1) return [];

  const cm = buildColMap(rows[hdrIdx]);

  // Fallback indices from known schema
  const skuCol   = cm['Ваш SKU']                         ?? 11;
  const nameCol  = cm['Название товара']                   ?? 12;
  const priceCol = cm['Цена продажи (за шт.), ₽']          ?? 14;
  const qtyCol   = cm['Доставлено или возвращено']          ?? 22;
  const statCol  = cm['Статус товара']                     ?? 24;
  const ordCol   = cm['Номер заказа']                      ?? 7;

  const lines: TxLine[] = [];
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = str(row[skuCol]);
    if (!sku) continue;

    const status     = str(row[statCol]);
    const sale       = isSale(status);
    const ret        = isReturn(status);
    if (!sale && !ret) continue; // skip cancelled

    const salePrice  = num(row[priceCol]);
    const qty        = num(row[qtyCol]);
    const orderNum   = str(row[ordCol]);
    const lineRevenue = (sale ? 1 : -1) * salePrice * qty;

    lines.push({
      orderNum,
      sku,
      name: str(row[nameCol]),
      salePrice,
      qty,
      lineRevenue,
      isSale: sale,
      isReturn: ret,
    });
  }
  return lines;
}

// ─── Prorate helper: scale fees by revenue share ──────────────────────────────
function prorate(feeTotal: number, skuRevShare: number): number {
  return feeTotal * skuRevShare;
}

// ─── Main aggregator ──────────────────────────────────────────────────────────
export function parseYandexMarket(wb: XLSX.WorkBook): OzonReportRow[] {
  const servSheet = wb.Sheets['Услуги и маржа по заказам'];
  const transSheet = wb.Sheets['Транзакции по заказам и товарам'];
  if (!transSheet) return [];

  const transRows: RawRow[] = XLSX.utils.sheet_to_json(transSheet, { header: 1, defval: '' });
  const servRows: RawRow[] = servSheet
    ? XLSX.utils.sheet_to_json(servSheet, { header: 1, defval: '' })
    : [];

  const feesMap = parseServicesSheet(servRows);
  const lines   = parseTransactionsSheet(transRows);

  // Group lines by order → compute per-order revenue totals (for prorating)
  const orderRevByLine = new Map<string, number>(); // orderNum → sum |lineRevenue|
  for (const ln of lines) {
    orderRevByLine.set(ln.orderNum, (orderRevByLine.get(ln.orderNum) ?? 0) + Math.abs(ln.lineRevenue));
  }

  // Per-SKU accumulator
  interface SkuAcc {
    name: string;
    salesCount: number; returnsCount: number;
    netSales: number;   returnsSum: number;
    // fees
    listing: number; warehouse: number; loyalty: number; boost: number;
    delivery: number; expressDelivery: number;
    paymentIn: number; paymentOut: number;
    pickupOrg: number; orderProcessing: number;
    returnStorage: number; returnShipping: number;
    commission: number; installments: number;
  }
  const acc = new Map<string, SkuAcc>();

  const empty = (): SkuAcc => ({
    name: '', salesCount: 0, returnsCount: 0, netSales: 0, returnsSum: 0,
    listing: 0, warehouse: 0, loyalty: 0, boost: 0,
    delivery: 0, expressDelivery: 0, paymentIn: 0, paymentOut: 0,
    pickupOrg: 0, orderProcessing: 0, returnStorage: 0, returnShipping: 0,
    commission: 0, installments: 0,
  });

  for (const ln of lines) {
    const a = acc.get(ln.sku) ?? empty();
    if (!a.name && ln.name) a.name = ln.name;

    if (ln.isSale) {
      a.salesCount += ln.qty;
      a.netSales   += ln.lineRevenue;
    } else {
      a.returnsCount += ln.qty;
      a.returnsSum   += Math.abs(ln.lineRevenue);
      a.netSales     += ln.lineRevenue; // negative
    }

    // Prorate fees from order-level fees map
    const fees = feesMap.get(ln.orderNum);
    if (fees) {
      const orderTotalRev = orderRevByLine.get(ln.orderNum) ?? 1;
      const share = orderTotalRev > 0 ? Math.abs(ln.lineRevenue) / orderTotalRev : 1;
      const p = (f: number) => prorate(f, share);

      a.listing         += p(fees.listing);
      a.warehouse       += p(fees.warehouse);
      a.loyalty         += p(fees.loyalty);
      a.boost           += p(fees.boost);
      a.delivery        += p(fees.delivery);
      a.expressDelivery += p(fees.expressDelivery);
      a.paymentIn       += p(fees.paymentIn);
      a.paymentOut      += p(fees.paymentOut);
      a.pickupOrg       += p(fees.pickupOrg);
      a.orderProcessing += p(fees.orderProcessing);
      a.returnStorage   += p(fees.returnStorage);
      a.returnShipping  += p(fees.returnShipping);
      a.commission      += p(fees.commission);
      a.installments    += p(fees.installments);
    }

    acc.set(ln.sku, a);
  }

  const result: OzonReportRow[] = [];
  for (const [article, a] of acc) {
    const commission   = a.commission + a.listing;  // Вознаграждение + Размещение на витрине
    const agentSvcs    = a.paymentIn + a.paymentOut; // Приём + перевод платежа
    const delivTotal   = a.delivery + a.expressDelivery;
    const retLogistic  = a.returnShipping + a.returnStorage;
    const promotion    = a.boost + a.loyalty;
    const otherExp     = a.installments + a.pickupOrg + a.orderProcessing + a.warehouse;
    const grossSales   = a.netSales + a.returnsSum;

    result.push({
      article,
      name: a.name,
      ordersCount:      a.salesCount + a.returnsCount,
      ordersSum:        grossSales > 0 ? grossSales : a.netSales,
      returnsCount:     a.returnsCount,
      returnsSum:       a.returnsSum,
      salesCount:       a.salesCount,
      netSales:         a.netSales,
      ozonCommission:   commission,
      deliveryServices: delivTotal + retLogistic,
      logistics:        delivTotal,
      returnLogistics:  retLogistic,
      lastMile:         0,
      processing:       0,
      otherDelivery:    0,
      agentServices:    agentSvcs,
      acquiring:        agentSvcs,
      returnProcessing: 0,
      promotion,
      storage:          a.returnStorage,
      fboServices:      a.warehouse,
      otherExpenses:    otherExp,
    });
  }

  return result.filter(r => r.ordersCount > 0 || Math.abs(r.netSales) > 0.01);
}

// ─── Detection ─────────────────────────────────────────────────────────────────
export function isYandexMarketWorkbook(sheetNames: string[]): boolean {
  return sheetNames.some(n => n.includes('Транзакции') || n.includes('Услуги и маржа'));
}
