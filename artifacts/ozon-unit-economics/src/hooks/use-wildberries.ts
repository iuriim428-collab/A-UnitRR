import { useState, useMemo, useCallback, useEffect } from 'react';
import { OzonReportRow, SkuCost, TaxSettings, CalculatedRow, ReportSummary } from '../types';
import {
  fetchWBReport, parseWBRows,
  fetchWBAnalytics, fetchWBAdvert,
  buildAnalyticsMap,
  WBAnalyticsItem, WBFetchMethod,
} from '../lib/wb-api';
import { calcRow, calcSummary } from '../lib/calculator';

export type FilterType = 'all' | 'profitable' | 'unprofitable';

const DEFAULT_COST: SkuCost = { costPerUnit: 0, vatRate: 0 };

function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfLastMonthStr() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function lastOfLastMonthStr() {
  const d = new Date();
  d.setDate(0); // last day of previous month
  return d.toISOString().slice(0, 10);
}

const LS_TOKEN_KEY     = 'wb_api_token';
const LS_ANALYTICS_KEY = 'wb_analytics_token';
const LS_ADVERT_KEY    = 'wb_advert_token';
const LS_COSTS_KEY     = 'costs_wb_api';

function loadCosts(): Record<string, SkuCost> {
  try { const s = localStorage.getItem(LS_COSTS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function useWildberries(tax: TaxSettings, setTax: (t: TaxSettings) => void) {
  const [baseRows, setBaseRows]   = useState<OzonReportRow[]>([]);
  const [nmMap, setNmMap]         = useState<Map<number, string>>(new Map());
  const [costs, setCosts]         = useState<Record<string, SkuCost>>(loadCosts);
  const [filter, setFilter]       = useState<FilterType>('all');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [rowCount, setRowCount]   = useState<number | null>(null);

  // Which transport was used for the main report
  const [fetchMethod, setFetchMethod] = useState<WBFetchMethod | null>(null);

  // Analytics state
  const [analytics, setAnalytics]                   = useState<Record<string, WBAnalyticsItem>>({});
  const [analyticsLoading, setAnalyticsLoading]     = useState(false);
  const [analyticsError, setAnalyticsError]         = useState<string | null>(null);

  // Advert state
  const [advertSpendByArticle, setAdvertSpendByArticle] = useState<Record<string, number>>({});
  const [advertLoading, setAdvertLoading]               = useState(false);
  const [advertError, setAdvertError]                   = useState<string | null>(null);

  // Tokens
  const [token, setTokenState] = useState<string>(
    () => localStorage.getItem(LS_TOKEN_KEY) ?? ''
  );
  const [analyticsToken, setAnalyticsTokenState] = useState<string>(
    () => localStorage.getItem(LS_ANALYTICS_KEY) ?? ''
  );
  const [advertToken, setAdvertTokenState] = useState<string>(
    () => localStorage.getItem(LS_ADVERT_KEY) ?? ''
  );

  // Date range — default to last month: WB settlement data has ~1-2 week delay
  const [dateFrom, setDateFrom] = useState(firstOfLastMonthStr);
  const [dateTo,   setDateTo]   = useState(lastOfLastMonthStr);

  useEffect(() => {
    try { localStorage.setItem(LS_COSTS_KEY, JSON.stringify(costs)); } catch {}
  }, [costs]);

  const setToken = useCallback((t: string) => {
    setTokenState(t); localStorage.setItem(LS_TOKEN_KEY, t);
  }, []);
  const setAnalyticsToken = useCallback((t: string) => {
    setAnalyticsTokenState(t); localStorage.setItem(LS_ANALYTICS_KEY, t);
  }, []);
  const setAdvertToken = useCallback((t: string) => {
    setAdvertTokenState(t); localStorage.setItem(LS_ADVERT_KEY, t);
  }, []);

  // Rows with advert spend merged into promotion field
  const rows = useMemo((): OzonReportRow[] => {
    if (Object.keys(advertSpendByArticle).length === 0) return baseRows;
    return baseRows.map(r => {
      const spend = advertSpendByArticle[r.article] ?? 0;
      return spend > 0 ? { ...r, promotion: r.promotion + spend } : r;
    });
  }, [baseRows, advertSpendByArticle]);

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

  // ── Fetch analytics ──────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async (
    tok: string,
    currentNmMap: Map<number, string>,
    df: string,
    dt: string,
  ) => {
    if (!tok.trim()) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const cards = await fetchWBAnalytics(tok.trim(), df, dt);
      setAnalytics(buildAnalyticsMap(cards, currentNmMap));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка аналитики';
      setAnalyticsError(
        msg.includes('ENOTFOUND') || msg.includes('fetch failed')
          ? 'недоступно с сервера (запустите десктопное приложение)'
          : msg,
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // ── Fetch advert ─────────────────────────────────────────────────────────────
  const loadAdvert = useCallback(async (
    tok: string,
    currentNmMap: Map<number, string>,
    df: string,
    dt: string,
  ) => {
    if (!tok.trim()) return;
    setAdvertLoading(true);
    setAdvertError(null);
    try {
      const items = await fetchWBAdvert(tok.trim(), df, dt);
      const spendByArticle: Record<string, number> = {};
      for (const item of items) {
        const article = currentNmMap.get(item.nmId);
        if (!article) continue;
        spendByArticle[article] = (spendByArticle[article] ?? 0) + item.spend;
      }
      setAdvertSpendByArticle(spendByArticle);
    } catch (e) {
      setAdvertError(e instanceof Error ? e.message : 'Ошибка рекламы');
    } finally {
      setAdvertLoading(false);
    }
  }, []);

  // ── Main report load ──────────────────────────────────────────────────────────
  const loadReport = useCallback(async () => {
    if (!token.trim()) { setError('Введите API-токен'); return; }
    setLoading(true);
    setError(null);
    setFetchMethod(null);
    setAnalytics({});
    setAdvertSpendByArticle({});
    setAnalyticsError(null);
    setAdvertError(null);

    try {
      const { rows: raw, method } = await fetchWBReport(
        token.trim(), dateFrom, dateTo,
        count => setRowCount(count),
      );

      setFetchMethod(method);
      const { rows: parsed, nmMap: newNmMap } = parseWBRows(raw);

      setBaseRows(parsed);
      setNmMap(newNmMap);
      setRowCount(raw.length);

      if (parsed.length === 0) {
        setError('Нет данных за выбранный период. WB публикует отчёт о расчётах с задержкой ~1–2 недели — попробуйте выбрать прошлый месяц.');
      } else {
        const analyticsTok = analyticsToken.trim() || token.trim();
        const advertTok    = advertToken.trim()    || token.trim();

        await Promise.all([
          loadAnalytics(analyticsTok, newNmMap, dateFrom, dateTo),
          loadAdvert(advertTok, newNmMap, dateFrom, dateTo),
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setBaseRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, analyticsToken, advertToken, dateFrom, dateTo, loadAnalytics, loadAdvert]);

  const clear = useCallback(() => {
    setBaseRows([]);
    setNmMap(new Map());
    setCosts({});
    setError(null);
    setRowCount(null);
    setFilter('all');
    setFetchMethod(null);
    setAnalytics({});
    setAdvertSpendByArticle({});
    setAnalyticsError(null);
    setAdvertError(null);
  }, []);

  const hasAnalytics = Object.keys(analytics).length > 0;
  const hasAdvert    = Object.keys(advertSpendByArticle).length > 0;

  // Human-readable connection method label
  const methodLabel: string | null = fetchMethod === 'browser'
    ? '🌐 Прямое соединение (ваш IP)'
    : fetchMethod === 'proxy'
    ? '🟢 Локальный прокси'
    : fetchMethod === 'server'
    ? '☁️ Через облако'
    : null;

  return {
    rows, calculatedRows, summary, costs,
    tax, setTax,
    filter, setFilter,
    loading, error,
    hasCosts: Object.keys(costs).length > 0,
    token, setToken,
    analyticsToken, setAnalyticsToken,
    advertToken,    setAdvertToken,
    analyticsLoading, analyticsError,
    advertLoading,    advertError,
    hasAnalytics, analytics,
    hasAdvert,    advertSpendByArticle,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    rowCount,
    fetchMethod, methodLabel,
    loadReport, clear, updateCost,
  };
}
