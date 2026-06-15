import { useState, useMemo, useCallback, useEffect } from 'react';
import { OzonReportRow, SkuCost, TaxSettings, CalculatedRow, ReportSummary } from '@/types';
import { fetchOzonReport, fetchOzonRealization, parseOzonOperations, OzonAccountTotals, emptyAccountTotals } from '@/lib/ue-ozon-api-client';
import { calcRow, calcSummary } from '@/lib/ue-calculator';

export type FilterType = 'all' | 'profitable' | 'unprofitable';

const DEFAULT_COST: SkuCost  = { costPerUnit: 0, vatRate: 0 };

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => localDate(new Date());
const firstOfMonth  = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const LS = (k: string) => `ozon_api_${k}`;
const LS_COSTS_KEY = 'costs_ozon_api';
function loadCosts(): Record<string, SkuCost> {
  try { const s = localStorage.getItem(LS_COSTS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function useOzonApi(tax: TaxSettings, setTax: (t: TaxSettings) => void) {
  const [rows,          setRows]          = useState<OzonReportRow[]>([]);
  const [accountTotals, setAccountTotals] = useState<OzonAccountTotals>(emptyAccountTotals);
  const [costs,         setCosts]         = useState<Record<string, SkuCost>>(loadCosts);
  const [filter,        setFilter]        = useState<FilterType>('all');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [opCount,       setOpCount]       = useState<number | null>(null);

  const [clientId, setClientIdState] = useState(() => localStorage.getItem(LS('client_id')) ?? '');
  const [apiKey,   setApiKeyState]   = useState(() => localStorage.getItem(LS('api_key'))   ?? '');
  const [dateFrom, setDateFrom]      = useState(firstOfMonth);
  const [dateTo,   setDateTo]        = useState(todayStr);

  useEffect(() => {
    try { localStorage.setItem(LS_COSTS_KEY, JSON.stringify(costs)); } catch {}
  }, [costs]);

  const setClientId = useCallback((v: string) => { setClientIdState(v); localStorage.setItem(LS('client_id'), v); }, []);
  const setApiKey   = useCallback((v: string) => { setApiKeyState(v);   localStorage.setItem(LS('api_key'),   v); }, []);

  const calculatedRows = useMemo((): CalculatedRow[] =>
    rows
      .map(r => calcRow(r, costs[r.article] ?? DEFAULT_COST, tax))
      .filter(r => {
        if (filter === 'profitable')   return r.netProfit > 0;
        if (filter === 'unprofitable') return r.netProfit <= 0;
        return true;
      }),
  [rows, costs, tax, filter]);

  // Summary = per-SKU totals + account-level costs (ads, subscription, cross-docking, etc.)
  const summary = useMemo((): ReportSummary => {
    const base = calcSummary(calculatedRows);

    const at = accountTotals;
    const accountCostTotal =
      at.promotion + at.deliveryServices + at.storage +
      at.fboServices + at.otherExpenses +
      // agentServices already includes acquiring as sub-item, so add non-acquiring part separately
      (at.agentServices - at.acquiring) + at.acquiring;

    // otherRevenue: account-level credits (Начисление по спору, etc.) — increase profit
    const accountRevenue = at.otherRevenue;
    const netAccountAdjustment = accountCostTotal - accountRevenue;

    // DEBUG — remove after diagnosis
    console.log('[OzonDebug] base.netSales', base.netSales.toFixed(2));
    console.log('[OzonDebug] base.ozonCommission', base.ozonCommission.toFixed(2));
    console.log('[OzonDebug] base.deliveryServices', base.deliveryServices.toFixed(2));
    console.log('[OzonDebug] base.promotion', base.promotion.toFixed(2));
    console.log('[OzonDebug] base.fboServices', base.fboServices.toFixed(2));
    console.log('[OzonDebug] base.agentServices', base.agentServices.toFixed(2));
    console.log('[OzonDebug] base.otherExpenses', base.otherExpenses.toFixed(2));
    console.log('[OzonDebug] base.profitBeforeCosts', base.profitBeforeCosts.toFixed(2));
    console.log('[OzonDebug] at.promotion', at.promotion.toFixed(2));
    console.log('[OzonDebug] at.deliveryServices', at.deliveryServices.toFixed(2));
    console.log('[OzonDebug] at.processing (sub)', at.processing.toFixed(2));
    console.log('[OzonDebug] at.fboServices', at.fboServices.toFixed(2));
    console.log('[OzonDebug] at.agentServices', at.agentServices.toFixed(2));
    console.log('[OzonDebug] at.storage', at.storage.toFixed(2));
    console.log('[OzonDebug] at.otherExpenses', at.otherExpenses.toFixed(2));
    console.log('[OzonDebug] at.otherRevenue', at.otherRevenue.toFixed(2));
    console.log('[OzonDebug] accountCostTotal', accountCostTotal.toFixed(2));
    console.log('[OzonDebug] netAccountAdjustment', netAccountAdjustment.toFixed(2));

    return {
      ...base,
      promotion:        base.promotion        + at.promotion,
      deliveryServices: base.deliveryServices + at.deliveryServices,
      logistics:        base.logistics        + at.logistics,
      returnLogistics:  base.returnLogistics  + at.returnLogistics,
      lastMile:         base.lastMile         + at.lastMile,
      processing:       base.processing       + at.processing,
      storage:          base.storage          + at.storage,
      fboServices:      base.fboServices      + at.fboServices,
      agentServices:    base.agentServices    + at.agentServices,
      acquiring:        base.acquiring        + at.acquiring,
      otherExpenses:    base.otherExpenses    + at.otherExpenses,
      compensations:    at.otherRevenue,   // Начисление по спору, etc. (shown as positive)
      // Account-level costs reduce profit; account-level credits increase it
      profitBeforeCosts: base.profitBeforeCosts - netAccountAdjustment,
      netProfit:         base.netProfit         - netAccountAdjustment,
      marginPercent:     base.netSales > 0
        ? ((base.netProfit - netAccountAdjustment) / base.netSales) * 100
        : 0,
    };
  }, [calculatedRows, accountTotals]);

  const updateCost = useCallback((article: string, field: keyof SkuCost, value: number) => {
    setCosts(prev => ({ ...prev, [article]: { ...(prev[article] ?? DEFAULT_COST), [field]: value } }));
  }, []);

  const loadReport = useCallback(async () => {
    if (!clientId.trim()) { setError('Введите Client-Id'); return; }
    if (!apiKey.trim())   { setError('Введите API-Key');   return; }
    setLoading(true); setError(null);
    try {
      // Parse dateFrom to get month/year for realization report
      const [yearStr, monthStr] = dateFrom.split('-');
      const realizMonth = parseInt(monthStr, 10);
      const realizYear  = parseInt(yearStr,  10);

      // Fetch both transaction list and realization report in parallel
      const [ops, realiz] = await Promise.all([
        fetchOzonReport(clientId.trim(), apiKey.trim(), dateFrom, dateTo),
        fetchOzonRealization(clientId.trim(), apiKey.trim(), realizMonth, realizYear)
          .catch(e => { console.warn('[Realization] fetch failed:', e); return null; }),
      ]);

      // DEBUG — log ALL realization fields
      console.log('[Realization] raw response:', JSON.stringify(realiz, null, 2));

      const { rows: parsed, accountTotals: at } = parseOzonOperations(ops);
      setRows(parsed);
      setAccountTotals(at);
      setOpCount(ops.length);
      if (parsed.length === 0) setError('Нет данных за выбранный период');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setRows([]);
      setAccountTotals(emptyAccountTotals());
    } finally {
      setLoading(false);
    }
  }, [clientId, apiKey, dateFrom, dateTo]);

  const clear = useCallback(() => {
    setRows([]); setCosts({}); setError(null); setOpCount(null); setFilter('all');
    setAccountTotals(emptyAccountTotals());
  }, []);

  return {
    rows, calculatedRows, summary, costs, accountTotals,
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
