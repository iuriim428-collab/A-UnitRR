import * as XLSX from 'xlsx';
import { preprocessXlsx } from './xlsx-reader';
import { parseYandexMarket, isYandexMarketWorkbook } from './yandex-excel';
import { OzonReportRow, ReportFormat } from '../types';

function num(v: unknown): number {
  if (v == null || v === '' || v === '-') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

type RawRow = unknown[];

// ─── "Отчёт по начислениям" parser ──────────────────────────────────────────
// Sheet "Начисления": row 0 = period header, row 1 = column headers, rows 2+ = data.
// Columns: 0=ID, 1=date, 2=Группа услуг, 3=Тип начисления,
//          4=Артикул, 5=SKU, 6=Название товара, 7=Количество,
//          8=Цена продавца, ..., 15=Сумма итого руб.

function isNacisleniyaSheet(rows: RawRow[]): boolean {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const c2 = str(rows[i][2]).toLowerCase();
    const c3 = str(rows[i][3]).toLowerCase();
    if (c2.includes('группа') && c3.includes('тип')) return true;
  }
  return false;
}

interface Acc {
  name: string;
  revenueSum: number; ballsSum: number; partnerPrograms: number;
  returnRevenue: number; returnBalls: number;
  commission: number; commissionRefund: number;
  logistics: number; returnLogistics: number; lastMileOzon: number; dropOff: number;
  lastMilePartner: number; acquiring: number; returnProcessing: number;
  dropOffPartner: number; tempStorage: number;
  promotion: number; storage: number; fboOther: number; other: number;
  salesQty: number; returnsQty: number;
}

function parseNacisleniya(rows: RawRow[]): OzonReportRow[] {
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (str(rows[i][2]).toLowerCase().includes('группа')) { headerRow = i; break; }
  }
  if (headerRow === -1) return [];

  const acc: Record<string, Acc> = {};

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const art = str(row[4]);
    if (!art) continue;

    const grp  = str(row[2]);
    const typ  = str(row[3]);
    const name = str(row[6]);
    const qty  = num(row[7]);
    const amt  = num(row[15]);

    if (!acc[art]) {
      acc[art] = {
        name, revenueSum: 0, ballsSum: 0, partnerPrograms: 0,
        returnRevenue: 0, returnBalls: 0,
        commission: 0, commissionRefund: 0,
        logistics: 0, returnLogistics: 0, lastMileOzon: 0, dropOff: 0,
        lastMilePartner: 0, acquiring: 0, returnProcessing: 0, dropOffPartner: 0, tempStorage: 0,
        promotion: 0, storage: 0, fboOther: 0, other: 0,
        salesQty: 0, returnsQty: 0,
      };
    }

    const a = acc[art];
    if (name && !a.name) a.name = name;

    const g = grp.toLowerCase();
    const t = typ.toLowerCase();

    if (g === 'продажи') {
      if (t === 'выручка')          { a.revenueSum += amt; a.salesQty += qty; }
      else if (t === 'баллы за скидки') a.ballsSum += amt;
      else                              a.partnerPrograms += amt;
    } else if (g === 'возвраты') {
      if (t === 'возврат выручки')  { a.returnRevenue += amt; a.returnsQty += 1; }
      else if (t === 'баллы за скидки') a.returnBalls += amt;
      else                              a.partnerPrograms += amt;
    } else if (g === 'вознаграждение ozon') {
      if (t.includes('возврат')) a.commissionRefund += amt;
      else                       a.commission += amt;
    } else if (g === 'услуги доставки') {
      if (t === 'логистика')                        a.logistics += amt;
      else if (t === 'обратная логистика')           a.returnLogistics += amt;
      else if (t.includes('доставка до места'))      a.lastMileOzon += amt;
      else if (t.includes('drop-off') || t.includes('обработка отправления')) a.dropOff += amt;
      else                                           a.logistics += amt;
    } else if (g === 'услуги партнёров') {
      if (t.includes('эквайринг'))                  a.acquiring += amt;
      else if (t.includes('доставка до места'))      a.lastMilePartner += amt;
      else if (t.includes('обработка возвратов') || t.includes('обработка отмен')) a.returnProcessing += amt;
      else if (t.includes('drop-off'))               a.dropOffPartner += amt;
      else                                           a.tempStorage += amt;
    } else if (g === 'продвижение и реклама') {
      a.promotion += amt;
    } else if (g === 'услуги fbo') {
      if (t.includes('размещение на складе')) a.storage += amt;
      else                                     a.fboOther += amt;
    } else {
      a.other += amt;
    }
  }

  return Object.entries(acc).map(([article, a]) => {
    const ordersSum  = a.revenueSum + a.ballsSum + a.partnerPrograms;
    const returnsSum = Math.abs(a.returnRevenue + a.returnBalls);
    const netSales   = ordersSum - returnsSum;
    const commission = Math.max(0, Math.abs(a.commission) - Math.abs(a.commissionRefund));
    const logistics  = Math.abs(a.logistics);
    const retLog     = Math.abs(a.returnLogistics);
    const lastMile   = Math.abs(a.lastMileOzon) + Math.abs(a.lastMilePartner);
    const processing = Math.abs(a.dropOff) + Math.abs(a.dropOffPartner);
    const agentTotal = Math.abs(a.acquiring) + Math.abs(a.lastMilePartner) +
                       Math.abs(a.returnProcessing) + Math.abs(a.dropOffPartner) + Math.abs(a.tempStorage);
    const delivTotal = logistics + retLog + Math.abs(a.lastMileOzon) + Math.abs(a.dropOff);

    return {
      article,
      name: a.name,
      ordersCount:      a.salesQty + a.returnsQty,
      ordersSum,
      returnsCount:     a.returnsQty,
      returnsSum,
      salesCount:       a.salesQty,
      netSales,
      ozonCommission:   commission,
      deliveryServices: delivTotal,
      logistics,
      returnLogistics:  retLog,
      lastMile,
      processing,
      otherDelivery:    0,
      agentServices:    agentTotal,
      acquiring:        Math.abs(a.acquiring),
      returnProcessing: Math.abs(a.returnProcessing),
      promotion:        Math.abs(a.promotion),
      storage:          Math.abs(a.storage),
      fboServices:      Math.abs(a.fboOther),
      otherExpenses:    Math.abs(a.other),
    };
  }).filter(r => r.ordersCount > 0 || Math.abs(r.netSales) > 0.01);
}

// ─── Pivot-table formats ─────────────────────────────────────────────────────

function detectPivotFormat(headers: string[]): 'new' | 'old' | 'unknown' {
  const j = headers.join('|').toLowerCase();
  if (j.includes('чистые продажи') && j.includes('вознаграждение ozon')) return 'new';
  if (j.includes('выкуплено') || j.includes('логистика на ед')) return 'old';
  return 'unknown';
}

function findPivotHeader(rows: RawRow[]): { rowIdx: number; colOffset: number; format: 'new' | 'old' } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i].map(str);
    for (let j = 0; j < row.length; j++) {
      if (row[j].toLowerCase() !== 'артикул') continue;
      const next = row.slice(j + 1).find(v => v !== '') ?? '';
      if (/^(all|все|sku)$/i.test(next)) continue;
      const fmt = detectPivotFormat(row.slice(j));
      if (fmt !== 'unknown') return { rowIdx: i, colOffset: j, format: fmt };
    }
  }
  return null;
}

function buildColMap(hdr: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  hdr.forEach((h, i) => { const k = h.toLowerCase().trim(); if (k) map[k] = i; });
  return map;
}

function makeAt(colMap: Record<string, number>) {
  return (row: RawRow, name: string) => {
    const idx = colMap[name];
    return idx != null ? num(row[idx]) : 0;
  };
}

function parsePivotNew(rows: RawRow[], ri: number, co: number): OzonReportRow[] {
  const colMap = buildColMap(rows[ri].map(str));
  const at = makeAt(colMap);
  const result: OzonReportRow[] = [];
  for (let i = ri + 1; i < rows.length; i++) {
    const row = rows[i];
    const art = str(row[co]);
    if (!art || art === '(blank)' || /grand total|итого/i.test(art)) continue;
    const name = str(row[co + 1]);
    if (!name || name === '(blank)') continue;
    result.push({
      article: art, name,
      ordersCount: at(row, 'заказы, шт'), ordersSum: at(row, 'сумма за заказы, руб'),
      returnsCount: at(row, 'возвраты, шт'), returnsSum: at(row, 'сумма за возвраты, руб'),
      salesCount: at(row, 'продажи, шт'), netSales: at(row, 'чистые продажи, руб'),
      ozonCommission: Math.abs(at(row, 'вознаграждение ozon, руб')),
      deliveryServices: Math.abs(at(row, 'услуги доставки, руб')),
      logistics: Math.abs(at(row, 'в т.ч. логистика, руб')),
      returnLogistics: Math.abs(at(row, 'в т.ч. обратная логистика, руб')),
      lastMile: 0, processing: 0,
      otherDelivery: Math.abs(at(row, 'в т.ч. прочие начисления (отмены, корректировки), руб')),
      agentServices: Math.abs(at(row, 'услуги агентов, руб')),
      acquiring: Math.abs(at(row, 'в т.ч. эквайриг, руб')),
      returnProcessing: 0, promotion: 0, storage: 0, fboServices: 0, otherExpenses: 0,
    });
  }
  return result;
}

function parsePivotOld(rows: RawRow[], ri: number, co: number): OzonReportRow[] {
  const colMap = buildColMap(rows[ri].map(str));
  const at = makeAt(colMap);
  const logKey = Object.keys(colMap).find(k =>
    /л.гистика, руб/.test(k) && !k.includes('ед') && !k.includes('от') && !k.includes('обратн')
  ) ?? '';
  const result: OzonReportRow[] = [];
  for (let i = ri + 1; i < rows.length; i++) {
    const row = rows[i];
    const art = str(row[co]);
    if (!art || art === '(blank)' || /grand total|итого/i.test(art)) continue;
    const name = str(row[co + 1]);
    if (!name || name === '(blank)') continue;
    const ordersSum = at(row, 'сумма за заказы, руб');
    const logVal = logKey ? num(row[colMap[logKey]]) : 0;
    result.push({
      article: art, name,
      ordersCount: at(row, 'заказы, шт'), ordersSum,
      returnsCount: at(row, 'возвраты, шт'), returnsSum: 0,
      salesCount: at(row, 'выкуплено, шт'), netSales: ordersSum,
      ozonCommission: Math.abs(at(row, 'вознаграждение за продажу, руб')),
      deliveryServices: Math.abs(at(row, 'обработка и доставка, руб')),
      logistics: Math.abs(logVal),
      returnLogistics: Math.abs(at(row, 'обратная логистика, руб')),
      lastMile: Math.abs(at(row, 'последняя миля, руб')),
      processing: Math.abs(at(row, 'обработка отправления, руб')),
      otherDelivery: 0,
      agentServices: Math.abs(at(row, 'эквайринг, руб')),
      acquiring: Math.abs(at(row, 'эквайринг, руб')),
      returnProcessing: 0, promotion: 0, storage: 0, fboServices: 0, otherExpenses: 0,
    });
  }
  return result;
}

// ─── Sheet prioritization ────────────────────────────────────────────────────

function sortSheets(names: string[]): string[] {
  const p = (n: string) => {
    const l = n.toLowerCase();
    if (l.includes('начислени')) return 0;
    if (l.includes('ozon') && l.includes('нов')) return 1;
    if (l.includes('ozon') && l.includes('стар')) return 2;
    if (l.includes('ozon')) return 3;
    return 4;
  };
  return [...names].sort((a, b) => p(a) - p(b));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function parseOzonReport(file: File): Promise<{ rows: OzonReportRow[]; format: ReportFormat }> {
  const rawBuffer = await file.arrayBuffer();

  // Fix encoding bug in xlsx@0.18.x: XML entities &#xNNN; are decoded incorrectly
  // for characters > U+00FF. We preprocess the zip to decode them first.
  const buffer = preprocessXlsx(rawBuffer);

  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  // Detect Yandex Market report by sheet names
  if (isYandexMarketWorkbook(wb.SheetNames)) {
    const rows = parseYandexMarket(wb);
    if (rows.length > 0) return { rows, format: 'yandex' };
  }

  const sheets = sortSheets(wb.SheetNames);

  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    const rawRows: RawRow[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (isNacisleniyaSheet(rawRows)) {
      const rows = parseNacisleniya(rawRows);
      if (rows.length > 0) return { rows, format: 'nacisleniya' };
    }

    const pivot = findPivotHeader(rawRows);
    if (pivot) {
      const rows = pivot.format === 'new'
        ? parsePivotNew(rawRows, pivot.rowIdx, pivot.colOffset)
        : parsePivotOld(rawRows, pivot.rowIdx, pivot.colOffset);
      if (rows.length > 0) return { rows, format: pivot.format };
    }
  }

  throw new Error(
    'Формат не распознан. Поддерживается «Отчёт по начислениям» из кабинета Ozon (.xlsx).'
  );
}

export function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Результат');
  XLSX.writeFile(wb, filename);
}
