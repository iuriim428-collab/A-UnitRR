import * as XLSX from 'xlsx';
import { OzonReportRow, ReportFormat } from '../types';

function num(v: unknown): number {
  if (v == null || v === '' || v === '-') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function s(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

// ─── "Отчёт по начислениям" parser ──────────────────────────────────────────
// Format: sheet "Начисления", row 0 = period header, row 1 = column headers,
// rows 2+ = individual accrual lines.
// Columns: 0=ID, 1=date, 2=Группа услуг, 3=Тип начисления,
//          4=Артикул, 5=SKU, 6=Название товара, 7=Количество,
//          8=Цена продавца, ..., 15=Сумма итого руб.

function isNacisleniyaSheet(rows: unknown[][]): boolean {
  // Look for the header row within first 5 rows
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i].map(s);
    if (r[2]?.toLowerCase().includes('группа услуг') &&
        r[3]?.toLowerCase().includes('тип начисления')) {
      return true;
    }
  }
  return false;
}

interface Accumulator {
  name: string;
  // Продажи
  revenueSum: number;        // Выручка
  ballsSum: number;          // Баллы за скидки (positive)
  partnerPrograms: number;   // Программы партнёров
  // Возвраты
  returnRevenue: number;     // Возврат выручки (negative)
  returnBalls: number;       // Возврат баллов (negative)
  // Вознаграждение Ozon
  commission: number;        // Вознаграждение за продажу (negative)
  commissionRefund: number;  // Возврат вознаграждения (positive)
  // Услуги доставки
  logistics: number;         // Логистика (negative)
  returnLogistics: number;   // Обратная логистика (negative)
  lastMileOzon: number;      // Доставка до места выдачи силами Ozon (negative)
  dropOff: number;           // Обработка отправления Drop-off (ПВЗ) (negative)
  // Услуги партнёров
  lastMilePartner: number;   // Доставка до места выдачи (partner) (negative)
  acquiring: number;         // Эквайринг (negative)
  returnProcessing: number;  // Обработка возвратов, отмен (negative)
  dropOffPartner: number;    // Обработка отправления Drop-off партнёрами (negative)
  tempStorage: number;       // Временное размещение партнёрами (negative)
  // Продвижение
  promotion: number;         // Продвижение и реклама total (negative)
  // Услуги FBO
  storage: number;           // Размещение на складе (negative)
  fboOther: number;          // Прочие FBO (negative)
  // Другие услуги и штрафы
  other: number;             // (negative)
  // Counters
  salesQty: number;
  returnsQty: number;
  sellerPrice: number;       // last known Цена продавца for sales
}

function parseNacisleniya(rows: unknown[][]): OzonReportRow[] {
  // Find header row
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (s(rows[i][2]).toLowerCase().includes('группа услуг')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return [];

  const acc: Record<string, Accumulator> = {};

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 16) continue;

    const art = s(row[4]);
    if (!art) continue; // skip rows without article (FBO charges not tied to SKU)

    const grp  = s(row[2]);
    const typ  = s(row[3]);
    const name = s(row[6]);
    const qty  = num(row[7]);
    const price = num(row[8]);
    const amt  = num(row[15]);

    if (!acc[art]) {
      acc[art] = {
        name, revenueSum: 0, ballsSum: 0, partnerPrograms: 0,
        returnRevenue: 0, returnBalls: 0,
        commission: 0, commissionRefund: 0,
        logistics: 0, returnLogistics: 0, lastMileOzon: 0, dropOff: 0,
        lastMilePartner: 0, acquiring: 0, returnProcessing: 0, dropOffPartner: 0, tempStorage: 0,
        promotion: 0, storage: 0, fboOther: 0, other: 0,
        salesQty: 0, returnsQty: 0, sellerPrice: 0,
      };
    }

    const a = acc[art];
    if (name && !a.name) a.name = name;

    const g = grp.toLowerCase();
    const t = typ.toLowerCase();

    if (g === 'продажи') {
      if (t === 'выручка') { a.revenueSum += amt; a.salesQty += qty; if (price > 0) a.sellerPrice = price; }
      else if (t === 'баллы за скидки') a.ballsSum += amt;
      else a.partnerPrograms += amt;
    } else if (g === 'возвраты') {
      if (t === 'возврат выручки') { a.returnRevenue += amt; a.returnsQty += 1; }
      else if (t === 'баллы за скидки') a.returnBalls += amt;
      else a.partnerPrograms += amt;
    } else if (g === 'вознаграждение ozon') {
      if (t.includes('возврат')) a.commissionRefund += amt;
      else a.commission += amt;
    } else if (g === 'услуги доставки') {
      if (t === 'логистика') a.logistics += amt;
      else if (t === 'обратная логистика') a.returnLogistics += amt;
      else if (t.includes('доставка до места выдачи')) a.lastMileOzon += amt;
      else if (t.includes('drop-off') || t.includes('обработка отправления')) a.dropOff += amt;
      else a.logistics += amt; // fallback
    } else if (g === 'услуги партнёров') {
      if (t.includes('эквайринг')) a.acquiring += amt;
      else if (t.includes('доставка до места выдачи')) a.lastMilePartner += amt;
      else if (t.includes('обработка возвратов') || t.includes('обработка отмен')) a.returnProcessing += amt;
      else if (t.includes('drop-off') || t.includes('апвз')) a.dropOffPartner += amt;
      else a.tempStorage += amt;
    } else if (g === 'продвижение и реклама') {
      a.promotion += amt;
    } else if (g === 'услуги fbo') {
      if (t.includes('размещение на складе')) a.storage += amt;
      else a.fboOther += amt;
    } else {
      // Другие услуги и штрафы, etc.
      a.other += amt;
    }
  }

  return Object.entries(acc).map(([article, a]) => {
    const ordersSum  = a.revenueSum + a.ballsSum + a.partnerPrograms;
    const returnsSum = Math.abs(a.returnRevenue + a.returnBalls);
    const netSales   = ordersSum - returnsSum;
    const commission = Math.abs(a.commission) - Math.abs(a.commissionRefund);
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
      ozonCommission:   Math.max(0, commission),
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
  }).filter(r => r.ordersCount > 0 || r.netSales !== 0);
}

// ─── Pivot-table formats (old Дешифратор / old Ozon report) ─────────────────

function detectPivotFormat(headers: string[]): 'new' | 'old' | 'unknown' {
  const j = headers.join('|').toLowerCase();
  if (j.includes('чистые продажи') && j.includes('вознаграждение ozon')) return 'new';
  if (j.includes('выкуплено') || j.includes('логистика на ед')) return 'old';
  return 'unknown';
}

function findPivotHeader(rows: unknown[][]): { rowIdx: number; colOffset: number; format: 'new' | 'old' } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i].map(s);
    for (let j = 0; j < row.length; j++) {
      if (row[j].toLowerCase() !== 'артикул') continue;
      // Skip filter rows ("Артикул | All")
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
  return (row: unknown[], name: string) => {
    const idx = colMap[name];
    return idx != null ? num(row[idx]) : 0;
  };
}

function parsePivotNew(rows: unknown[][], ri: number, co: number): OzonReportRow[] {
  const colMap = buildColMap(rows[ri].map(s));
  const at = makeAt(colMap);
  const result: OzonReportRow[] = [];

  for (let i = ri + 1; i < rows.length; i++) {
    const row = rows[i];
    const art = s(row[co]);
    if (!art || art === '(blank)' || /grand total|итого/i.test(art)) continue;
    const name = s(row[co + 1]);
    if (!name || name === '(blank)') continue;

    const netSales = at(row, 'чистые продажи, руб');
    const commission = Math.abs(at(row, 'вознаграждение ozon, руб'));
    const delivery = Math.abs(at(row, 'услуги доставки, руб'));
    const logistics = Math.abs(at(row, 'в т.ч. логистика, руб'));
    const retLog = Math.abs(at(row, 'в т.ч. обратная логистика, руб'));
    const agentSvc = Math.abs(at(row, 'услуги агентов, руб'));
    const acquiring = Math.abs(at(row, 'в т.ч. эквайриг, руб'));

    result.push({
      article: art, name,
      ordersCount:      at(row, 'заказы, шт'),
      ordersSum:        at(row, 'сумма за заказы, руб'),
      returnsCount:     at(row, 'возвраты, шт'),
      returnsSum:       at(row, 'сумма за возвраты, руб'),
      salesCount:       at(row, 'продажи, шт'),
      netSales,
      ozonCommission:   commission,
      deliveryServices: delivery,
      logistics,
      returnLogistics:  retLog,
      lastMile: 0, processing: 0,
      otherDelivery: Math.abs(at(row, 'в т.ч. прочие начисления (отмены, корректировки), руб')),
      agentServices:    agentSvc,
      acquiring,
      returnProcessing: 0,
      promotion: 0, storage: 0, fboServices: 0, otherExpenses: 0,
    });
  }
  return result;
}

function parsePivotOld(rows: unknown[][], ri: number, co: number): OzonReportRow[] {
  const colMap = buildColMap(rows[ri].map(s));
  const at = makeAt(colMap);
  const logKey = Object.keys(colMap).find(k =>
    /л.гистика, руб/.test(k) && !k.includes('ед') && !k.includes('от') && !k.includes('обратн')
  ) ?? '';
  const result: OzonReportRow[] = [];

  for (let i = ri + 1; i < rows.length; i++) {
    const row = rows[i];
    const art = s(row[co]);
    if (!art || art === '(blank)' || /grand total|итого/i.test(art)) continue;
    const name = s(row[co + 1]);
    if (!name || name === '(blank)') continue;

    const ordersSum = at(row, 'сумма за заказы, руб');
    const logVal = logKey ? num(row[colMap[logKey]]) : 0;

    result.push({
      article: art, name,
      ordersCount:  at(row, 'заказы, шт'),
      ordersSum,
      returnsCount: at(row, 'возвраты, шт'),
      returnsSum: 0,
      salesCount:   at(row, 'выкуплено, шт'),
      netSales:     ordersSum,
      ozonCommission:   Math.abs(at(row, 'вознаграждение за продажу, руб')),
      deliveryServices: Math.abs(at(row, 'обработка и доставка, руб')),
      logistics:        Math.abs(logVal),
      returnLogistics:  Math.abs(at(row, 'обратная логистика, руб')),
      lastMile:         Math.abs(at(row, 'последняя миля, руб')),
      processing:       Math.abs(at(row, 'обработка отправления, руб')),
      otherDelivery: 0,
      agentServices:    Math.abs(at(row, 'эквайринг, руб')),
      acquiring:        Math.abs(at(row, 'эквайринг, руб')),
      returnProcessing: 0,
      promotion: 0, storage: 0, fboServices: 0, otherExpenses: 0,
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const sheets = sortSheets(wb.SheetNames);

        for (const sheetName of sheets) {
          const ws = wb.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

          // Try "Начисления" format first
          if (isNacisleniyaSheet(rawRows)) {
            const rows = parseNacisleniya(rawRows);
            if (rows.length > 0) { resolve({ rows, format: 'nacisleniya' }); return; }
          }

          // Try pivot formats
          const pivot = findPivotHeader(rawRows);
          if (pivot) {
            const rows = pivot.format === 'new'
              ? parsePivotNew(rawRows, pivot.rowIdx, pivot.colOffset)
              : parsePivotOld(rawRows, pivot.rowIdx, pivot.colOffset);
            if (rows.length > 0) { resolve({ rows, format: pivot.format }); return; }
          }
        }

        reject(new Error(
          'Формат не распознан. Поддерживается «Отчёт по начислениям» из кабинета Ozon (.xlsx).'
        ));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsArrayBuffer(file);
  });
}

export function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Результат');
  XLSX.writeFile(wb, filename);
}
