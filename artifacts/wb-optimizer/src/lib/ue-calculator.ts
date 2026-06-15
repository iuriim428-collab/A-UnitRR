import { OzonReportRow, CalculatedRow, ReportSummary, TaxSettings, SkuCost } from '../types';

export function calcTax(netSales: number, totalCosts: number, tax: TaxSettings): number {
  if (tax.type === 'none') return 0;
  if (tax.type === 'usn_income') return netSales * tax.rate;
  if (tax.type === 'usn_income_expense') return Math.max(0, (netSales - totalCosts) * tax.rate);
  if (tax.type === 'osno') return netSales * tax.rate;
  return 0;
}

export function calcRow(row: OzonReportRow, cost: SkuCost, tax: TaxSettings): CalculatedRow {
  const costTotal = cost.costPerUnit * row.salesCount;
  const vatAmount = row.netSales * (cost.vatRate / 100);

  const totalOzonExpenses =
    row.ozonCommission +
    row.deliveryServices +
    row.agentServices +
    row.promotion +
    row.storage +
    row.fboServices +
    row.otherExpenses;

  const profitBeforeCosts = row.netSales - totalOzonExpenses;
  const taxAmount = calcTax(row.netSales, costTotal + totalOzonExpenses, tax);
  const netProfit = profitBeforeCosts - costTotal - vatAmount - taxAmount;
  const marginPercent = row.netSales > 0 ? (netProfit / row.netSales) * 100 : 0;
  const avgPrice = row.salesCount > 0 ? row.netSales / row.salesCount : 0;

  return { ...row, costTotal, vatAmount, taxAmount, profitBeforeCosts, netProfit, marginPercent, avgPrice };
}

export function calcSummary(rows: CalculatedRow[]): ReportSummary {
  const sum = <K extends keyof CalculatedRow>(key: K) =>
    rows.reduce((acc, r) => acc + (r[key] as number), 0);

  const netSales = sum('netSales');
  const netProfit = sum('netProfit');

  return {
    ordersCount:      sum('ordersCount'),
    returnsCount:     sum('returnsCount'),
    salesCount:       sum('salesCount'),
    ordersSum:        sum('ordersSum'),
    returnsSum:       sum('returnsSum'),
    netSales,
    ozonCommission:   sum('ozonCommission'),
    deliveryServices: sum('deliveryServices'),
    logistics:        sum('logistics'),
    returnLogistics:  sum('returnLogistics'),
    lastMile:         sum('lastMile'),
    processing:       sum('processing'),
    agentServices:    sum('agentServices'),
    acquiring:        sum('acquiring'),
    returnProcessing: sum('returnProcessing'),
    promotion:        sum('promotion'),
    storage:          sum('storage'),
    fboServices:      sum('fboServices'),
    otherExpenses:    sum('otherExpenses'),
    compensations:    0,  // account-level only; filled in by use-ozon-api summary
    profitBeforeCosts: sum('profitBeforeCosts'),
    costTotal:        sum('costTotal'),
    vatAmount:        sum('vatAmount'),
    taxAmount:        sum('taxAmount'),
    netProfit,
    marginPercent:    netSales > 0 ? (netProfit / netSales) * 100 : 0,
  };
}
