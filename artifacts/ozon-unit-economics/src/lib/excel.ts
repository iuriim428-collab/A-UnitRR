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

function detectFormat(headers: string[]): ReportFormat {
  const j = headers.join('|').toLowerCase();
  if (j.includes('чистые продажи') && j.includes('вознаграждение ozon')) return 'new';
  if (j.includes('выкуплено') || j.includes('логистика на ед')) return 'old';
  return 'unknown';
}

function findHeader(rows: unknown[][]): { rowIdx: number; colOffset: number; format: ReportFormat } {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i].map(s);
    for (let j = 0; j < row.length; j++) {
      if (row[j].toLowerCase() !== 'артикул') continue;

      // Skip pivot-table filter rows like "Артикул | All | …"
      // The real header row has "Название товара" (or similar) right after Артикул
      const nextNonEmpty = row.slice(j + 1).find(v => v !== '') ?? '';
      if (/^(all|все|sku)$/i.test(nextNonEmpty)) continue;

      const headers = row.slice(j);
      const fmt = detectFormat(headers);
      if (fmt !== 'unknown') return { rowIdx: i, colOffset: j, format: fmt };
    }
  }
  return { rowIdx: -1, colOffset: 0, format: 'unknown' };
}

function buildColMap(headerRow: string[]): Record<string, number> {
  // headerRow is the FULL row as strings (absolute indices).
  // colMap maps lowercase header name → absolute column index.
  const map: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    const key = h.toLowerCase().trim();
    if (key) map[key] = i;
  });
  return map;
}

// at() looks up a column by name and returns the numeric value at that absolute index.
function makeAt(colMap: Record<string, number>) {
  return (row: unknown[], name: string): number => {
    const idx = colMap[name];
    return idx != null ? num(row[idx]) : 0;
  };
}

function parseNew(rows: unknown[][], ri: number, co: number): OzonReportRow[] {
  const hdr = rows[ri].map(s);
  const colMap = buildColMap(hdr);
  const at = makeAt(colMap);

  const result: OzonReportRow[] = [];
  for (let i = ri + 1; i < rows.length; i++) {
    const row = rows[i];
    const art = s(row[co]);
    if (!art || art === '(blank)' || /grand total|итого/i.test(art)) continue;
    const name = s(row[co + 1]);
    if (!name || name === '(blank)') continue;

    result.push({
      article: art,
      name,
      ordersCount:      at(row, 'заказы, шт'),
      ordersSum:        at(row, 'сумма за заказы, руб'),
      returnsCount:     at(row, 'возвраты, шт'),
      returnsSum:       at(row, 'сумма за возвраты, руб'),
      salesCount:       at(row, 'продажи, шт'),
      netSales:         at(row, 'чистые продажи, руб'),
      ozonCommission:   Math.abs(at(row, 'вознаграждение ozon, руб')),
      deliveryServices: Math.abs(at(row, 'услуги доставки, руб')),
      logistics:        Math.abs(at(row, 'в т.ч. логистика, руб')),
      returnLogistics:  Math.abs(at(row, 'в т.ч. обратная логистика, руб')),
      otherDelivery:    Math.abs(at(row, 'в т.ч. прочие начисления (отмены, корректировки), руб')),
      agentServices:    Math.abs(at(row, 'услуги агентов, руб')),
      acquiring:        Math.abs(at(row, 'в т.ч. эквайриг, руб')),
      lastMile: 0,
      processing: 0,
      promotion: 0,
      otherExpenses: 0,
    });
  }
  return result;
}

function parseOld(rows: unknown[][], ri: number, co: number): OzonReportRow[] {
  const hdr = rows[ri].map(s);
  const colMap = buildColMap(hdr);
  const at = makeAt(colMap);

  // "Лoгистика" in old format uses a special Cyrillic 'о' (U+043E) in place of Latin 'o'
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
      article: art,
      name,
      ordersCount:      at(row, 'заказы, шт'),
      ordersSum,
      returnsCount:     at(row, 'возвраты, шт'),
      returnsSum:       0,
      salesCount:       at(row, 'выкуплено, шт'),
      netSales:         ordersSum,
      ozonCommission:   Math.abs(at(row, 'вознаграждение за продажу, руб')),
      deliveryServices: Math.abs(at(row, 'обработка и доставка, руб')),
      logistics:        Math.abs(logVal),
      returnLogistics:  Math.abs(at(row, 'обратная логистика, руб')),
      otherDelivery:    0,
      agentServices:    Math.abs(at(row, 'эквайринг, руб')),
      acquiring:        Math.abs(at(row, 'эквайринг, руб')),
      lastMile:         Math.abs(at(row, 'последняя миля, руб')),
      processing:       Math.abs(at(row, 'обработка отправления, руб')),
      promotion:        0,
      otherExpenses:    0,
    });
  }
  return result;
}

// Prefer sheets that look like Ozon reports by name
function sortSheets(names: string[]): string[] {
  const priority = (n: string) => {
    const l = n.toLowerCase();
    if (l.includes('ozon') && l.includes('нов')) return 0;
    if (l.includes('ozon') && l.includes('стар')) return 1;
    if (l.includes('ozon')) return 2;
    return 3;
  };
  return [...names].sort((a, b) => priority(a) - priority(b));
}

export async function parseOzonReport(file: File): Promise<{ rows: OzonReportRow[]; format: ReportFormat }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const sheetsToTry = sortSheets(wb.SheetNames);

        for (const sheetName of sheetsToTry) {
          const ws = wb.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
          const { rowIdx, colOffset, format } = findHeader(rawRows);
          if (rowIdx === -1 || format === 'unknown') continue;

          const rows = format === 'new'
            ? parseNew(rawRows, rowIdx, colOffset)
            : parseOld(rawRows, rowIdx, colOffset);

          if (rows.length > 0) {
            resolve({ rows, format });
            return;
          }
        }

        reject(new Error(
          'Формат не распознан. Загрузите отчёт о реализации из кабинета Ozon ' +
          '(поддерживаются новый и старый форматы).'
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
