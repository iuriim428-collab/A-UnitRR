import { useState, useMemo, useCallback, useEffect } from 'react';
import { OzonReportRow, SkuCost, TaxSettings, CalculatedRow, ReportSummary } from '../types';
import { fetchYMReport, parseYMOrders } from '../lib/ym-api-client';
import { calcRow, calcSummary } from '../lib/calculator';

export type FilterType = 'all' | 'profitable' | 'unprofitable';

const DEFAULT_COST: SkuCost = { costPerUnit: 0, vatRate: 0 };

const todayStr     = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const LS = (k: string) => `ym_api_${k}`;
const LS_COSTS_KEY = 'costs_ym_api';
function loadCosts(): Record<string, SkuCost> {
  try { const s = localStorage.getItem(LS_COSTS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function useYmApi(tax: TaxSettings, setTax: (t: TaxSettings) => void) {
  const [rows,        setRows]       = useState<OzonReportRow[]>([]);
  const [costs,       setCosts]      = useState<Record<string, SkuCost>>(loadCosts);
  const [filter,      setFilter]     = useState<FilterType>('all');
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [orderCount,  setOrderCount] = useState<number | null>(null);

  const [token,      setTokenState]      = useState(() => localStorage.getItem(LS('token'))       ?? '');
  const [campaignId, setCampaignIdState] = useState(() => localStorage.getItem(LS('campaign_id')) ?? '');
  const [dateFrom, setDateFrom]          = useState(firstOfMonth);
  const [dateTo,   setDateTo]            = useState(todayStr);

  useEffect(() => {
    try { localStorage.setItem(LS_COSTS_KEY, JSON.stringify(costs)); } catch {}
  }, [costs]);

  const setToken      = useCallback((v: string) => { setTokenState(v);      localStorage.setItem(LS('token'),       v); }, []);
  const setCampaignId = useCallback((v: string) => { setCampaignIdState(v); localStorage.setItem(LS('campaign_id'), v); }, []);

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
    if (!token.trim())      { setError('Введите Api-Key из кабинета продавца'); return; }
    if (!campaignId.trim()) { setError('Введите ID кампании (несколько — через запятую)'); return; }

    const ids = campaignId.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) { setError('Введите хотя бы один ID кампании'); return; }

    setLoading(true); setError(null);
    try {
      const allOrders: Awaited<ReturnType<typeof fetchYMReport>> = [];
      const errors: string[] = [];

      for (const id of ids) {
        try {
          const orders = await fetchYMReport(token.trim(), id, dateFrom, dateTo);
          allOrders.push(...orders);
        } catch (e) {
          errors.push(`[${id}]: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const parsed = parseYMOrders(allOrders);
      setOrderCount(allOrders.length);
      setRows(parsed);

      if (errors.length > 0 && parsed.length === 0) {
        setError(errors.join(' | '));
      } else if (errors.length > 0) {
        setError(`Часть кампаний загружена с ошибкой: ${errors.join(' | ')}`);
      } else if (parsed.length === 0) {
        setError('Нет данных за выбранный период');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, campaignId, dateFrom, dateTo]);

  const clear = useCallback(() => {
    setRows([]); setCosts({}); setError(null); setOrderCount(null); setFilter('all');
  }, []);

  return {
    rows, calculatedRows, summary, costs,
    tax, setTax, filter, setFilter,
    loading, error, orderCount,
    hasCosts: Object.keys(costs).length > 0,
    token,      setToken,
    campaignId, setCampaignId,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    loadReport, clear, updateCost,
  };
}
