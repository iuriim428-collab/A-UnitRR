import { useState, useMemo, useCallback, useEffect } from 'react';
import { OzonReportRow, SkuCost, TaxSettings, CalculatedRow, ReportSummary } from '../types';
import { fetchWBReport, parseWBRows } from '../lib/wb-api';
import { calcRow, calcSummary } from '../lib/calculator';

export type FilterType = 'all' | 'profitable' | 'unprofitable';

const DEFAULT_COST: SkuCost = { costPerUnit: 0, vatRate: 0 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const LS_TOKEN_KEY = 'wb_api_token';
const LS_COSTS_KEY = 'costs_wb_api';
function loadCosts(): Record<string, SkuCost> {
  try { const s = localStorage.getItem(LS_COSTS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function useWildberries(tax: TaxSettings, setTax: (t: TaxSettings) => void) {
  const [rows, setRows]         = useState<OzonReportRow[]>([]);
  const [costs, setCosts]       = useState<Record<string, SkuCost>>(loadCosts);
  const [filter, setFilter]     = useState<FilterType>('all');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);

  // API token — persisted in localStorage
  const [token, setTokenState] = useState<string>(
    () => localStorage.getItem(LS_TOKEN_KEY) ?? ''
  );
  // Date range — default to current month
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr);
  const [dateTo,   setDateTo]   = useState(todayStr);

  useEffect(() => {
    try { localStorage.setItem(LS_COSTS_KEY, JSON.stringify(costs)); } catch {}
  }, [costs]);

  const setToken = useCallback((t: string) => {
    setTokenState(t);
    localStorage.setItem(LS_TOKEN_KEY, t);
  }, []);

  const calculatedRows = useMemo((): CalculatedRow[] => {
    return rows
      .map(r => calcRow(r, costs[r.article] ?? DEFAULT_COST, tax))
      .filter(r => {
        if (filter === 'profitable')   return r.netProfit > 0;
        if (filter === 'unprofitable') return r.netProfit <= 0;
        return true;
      });
  }, [rows, costs, tax, filter]);

  const summary = useMemo((): ReportSummary => calcSummary(calculatedRows), [calculatedRows]);

  const updateCost = useCallback((article: string, field: keyof SkuCost, value: number) => {
    setCosts(prev => ({ ...prev, [article]: { ...(prev[article] ?? DEFAULT_COST), [field]: value } }));
  }, []);

  const loadReport = useCallback(async () => {
    if (!token.trim()) { setError('Введите API-токен'); return; }
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchWBReport(token.trim(), dateFrom, dateTo, count => setRowCount(count));
      const parsed = parseWBRows(raw);
      setRows(parsed);
      // Do NOT reset costs — they persist across reloads
      setRowCount(raw.length);
      if (parsed.length === 0) setError('Нет данных за выбранный период');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo]);

  const clear = useCallback(() => {
    setRows([]);
    setCosts({});
    setError(null);
    setRowCount(null);
    setFilter('all');
  }, []);

  return {
    rows, calculatedRows, summary, costs,
    tax, setTax,
    filter, setFilter,
    loading, error,
    hasCosts: Object.keys(costs).length > 0,
    token, setToken,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    rowCount,
    loadReport, clear, updateCost,
  };
}
