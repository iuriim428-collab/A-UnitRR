/**
 * Merges multiple OzonReportRow arrays into one, summing numeric fields per article.
 * Used when loading several monthly reports from the same folder.
 */
import { OzonReportRow } from '../types';

const NUMERIC_KEYS: ReadonlyArray<keyof OzonReportRow> = [
  'ordersCount', 'ordersSum', 'returnsCount', 'returnsSum', 'salesCount', 'netSales',
  'ozonCommission', 'deliveryServices', 'logistics', 'returnLogistics', 'lastMile',
  'processing', 'otherDelivery', 'agentServices', 'acquiring', 'returnProcessing',
  'promotion', 'storage', 'fboServices', 'otherExpenses',
];

export function mergeOzonRows(batches: OzonReportRow[][]): OzonReportRow[] {
  const acc: Record<string, OzonReportRow> = {};
  for (const batch of batches) {
    for (const row of batch) {
      if (!acc[row.article]) {
        acc[row.article] = { ...row };
      } else {
        for (const k of NUMERIC_KEYS) {
          (acc[row.article][k] as number) += (row[k] as number);
        }
        if (!acc[row.article].name && row.name) acc[row.article].name = row.name;
      }
    }
  }
  return Object.values(acc);
}
