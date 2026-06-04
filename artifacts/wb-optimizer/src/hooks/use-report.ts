import { useState, useMemo } from 'react';
import { OzonReportRow, SkuCost, TaxSettings, ReportFormat, CalculatedRow, ReportSummary } from '@/types';
import { calcRow, calcSummary } from '@/lib/ue-calculator';

const DEFAULT_TAX: TaxSettings = { type: 'usn_income', rate: 0.06 };

export function useReport() {
  const [rows, setRows] = useState<OzonReportRow[]>([]);
  const [format, setFormat] = useState<ReportFormat>('unknown');
  const [costs, setCosts] = useState<Record<string, SkuCost>>({});
  const [tax, setTax] = useState<TaxSettings>(DEFAULT_TAX);
  const [filter, setFilter] = useState<'all' | 'profitable' | 'unprofitable'>('all');

  const defaultCost: SkuCost = { costPerUnit: 0, vatRate: 0 };

  const calculatedRows = useMemo((): CalculatedRow[] => {
    return rows
      .map(row => calcRow(row, costs[row.article] ?? defaultCost, tax))
      .filter(r => {
        if (filter === 'profitable') return r.netProfit > 0;
        if (filter === 'unprofitable') return r.netProfit <= 0;
        return true;
      });
  }, [rows, costs, tax, filter]);

  const summary = useMemo((): ReportSummary => calcSummary(calculatedRows), [calculatedRows]);

  const updateCost = (article: string, field: keyof SkuCost, value: number) => {
    setCosts(prev => ({
      ...prev,
      [article]: { ...(prev[article] ?? defaultCost), [field]: value },
    }));
  };

  const setCostsBulk = (bulk: Record<string, SkuCost>) => setCosts(bulk);

  const loadReport = (newRows: OzonReportRow[], fmt: ReportFormat) => {
    setRows(newRows);
    setFormat(fmt);
    setCosts({});
  };

  const clear = () => {
    setRows([]);
    setFormat('unknown');
    setCosts({});
  };

  return {
    rows,
    format,
    calculatedRows,
    summary,
    costs,
    tax,
    setTax,
    filter,
    setFilter,
    loadReport,
    updateCost,
    setCostsBulk,
    clear,
    hasCosts: Object.keys(costs).length > 0,
  };
}
