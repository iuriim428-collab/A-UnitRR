import { useState, useMemo, useCallback } from 'react';
import { OzonReportRow, SkuCost, TaxSettings, CalculatedRow, ReportSummary } from '../types';
import { fetchOzonReport, parseOzonOperations } from '../lib/ozon-api-client';
import { calcRow, calcSummary } from '../lib/calculator';

export type FilterType = 'all' | 'profitable' | 'unprofitable';

const DEFAULT_COST: SkuCost  = { costPerUnit: 0, vatRate: 0 };

const todayStr      = () => new Date().toISOString().slice(0, 10);
const firstOfMonth  = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const LS = (k: string) => `ozon_api_${k}`;

export function useOzonApi(tax: TaxSettings, setTax: (t: TaxSettings) => void) {
  const [rows,    setRows]    = useState<OzonReportRow[]>([]);
  const [costs,   setCosts]   = useState<Record<string, SkuCost>>({});
  const [filter,  setFilter]  = useState<FilterType>('all');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [opCount, setOpCount] = useState<number | null>(null);

  const [clientId, setClientIdState] = useState(() => localStorage.getItem(LS('client_id')) ?? '');
  const [apiKey,   setApiKeyState]   = useState(() => localStorage.getItem(LS('api_key'))   ?? '');
  const setClientId = useCallback((v: string) => { setClientIdState(v); localStorage.setItem(LS('client_id'), v); }, []);
  const setApiKey   = useCallback((v: string) => { setApiKeyState(v);   localStorage.setItem(LS('api_key'),   v); }, []);

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo,   setDateTo]   = useState(todayStr);

  const calculatedRows = useMemo((): CalculatedRow[] =>
    rows
      .map(r => calcRow(r, costs[r.article] ?? DEFAULT_COST, tax))
      .filter(r => {
        if (filter === 'profitable')   return r.netProfit > 0;
        if (filter === 'unprofitable') return r.netProfit <= 0;
        return true;
      }),
  [rows, costs, tax, filter]);

  const summary = useMemo((): ReportSummary => calcSummary(calculatedRows), [calculatedRows]);

  const updateCost = useCallback((article: string, field: keyof SkuCost, value: number) => {
    setCosts(prev => ({ ...prev, [article]: { ...(prev[article] ?? DEFAULT_COST), [field]: value } }));
  }, []);

  const loadReport = useCallback(async () => {
    if (!clientId.trim()) { setError('Введите Client-Id'); return; }
    if (!apiKey.trim())   { setError('Введите API-Key');   return; }
    setLoading(true); setError(null);
    try {
      const ops    = await fetchOzonReport(clientId.trim(), apiKey.trim(), dateFrom, dateTo);
      const parsed = parseOzonOperations(ops);
      setRows(parsed);
      setCosts({});
      setOpCount(ops.length);
      if (parsed.length === 0) setError('Нет данных за выбранный период');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, apiKey, dateFrom, dateTo]);

  const clear = useCallback(() => {
    setRows([]); setCosts({}); setError(null); setOpCount(null); setFilter('all');
  }, []);

  return {
    rows, calculatedRows, summary, costs,
    tax, setTax, filter, setFilter,
    loading, error, opCount,
    hasCosts: Object.keys(costs).length > 0,
    clientId, setClientId,
    apiKey,   setApiKey,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    loadReport, clear, updateCost,
  };
}
