import { useState, useCallback, useEffect } from 'react';

const LS     = (k: string) => `perf_api_${k}`;
const LS_SEL = (k: string) => `ozon_api_${k}`;

const REPORT_KEY = 'perf_api_report_v2';

export interface PerfCampaign {
  id: string;
  title: string;
  state: string;
  type: string;
  budget: number;
  moneySpent: number;
  views: number;
  clicks: number;
  orders: number;
  revenue: number;
  drr: number;
  productsCount: number;
}

export interface PerfReport {
  campaigns: PerfCampaign[];
  spendByArticle: Record<string, number>;
  source?: 'performance' | 'analytics';
  totalSpend?: number;
}

function loadCachedReport(): PerfReport | null {
  try {
    const raw = localStorage.getItem(REPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PerfReport;
  } catch { return null; }
}

export function usePerfApi() {
  const [clientId,     setClientIdState]     = useState(() => localStorage.getItem(LS('client_id'))     ?? '');
  const [clientSecret, setClientSecretState] = useState(() => localStorage.getItem(LS('client_secret')) ?? '');
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState<string | null>(null);
  const [report,   setReport]  = useState<PerfReport | null>(loadCachedReport);

  // Persist report to localStorage — only when it contains actual spend data
  useEffect(() => {
    try {
      const hasSpend = report && Object.keys(report.spendByArticle).length > 0;
      if (hasSpend) localStorage.setItem(REPORT_KEY, JSON.stringify(report));
      else if (!report) localStorage.removeItem(REPORT_KEY);
      // if report exists but spendByArticle is empty — leave localStorage unchanged
    } catch { /* quota exceeded — ignore */ }
  }, [report]);

  const setClientId = (v: string) => {
    setClientIdState(v); localStorage.setItem(LS('client_id'), v);
  };
  const setClientSecret = (v: string) => {
    setClientSecretState(v); localStorage.setItem(LS('client_secret'), v);
  };

  /** Load via Ozon Performance API (separate credentials) */
  const load = useCallback(async (dateFrom: string, dateTo: string) => {
    if (!clientId.trim())     { setError('Введите Client-Id (Performance API)'); return; }
    if (!clientSecret.trim()) { setError('Введите Client-Secret (Performance API)'); return; }
    setLoading(true); setError(null);
    try {
      const sellerClientId = localStorage.getItem(LS_SEL('client_id')) ?? '';
      const sellerApiKey   = localStorage.getItem(LS_SEL('api_key'))   ?? '';

      const headers: Record<string, string> = {
        'Content-Type':         'application/json',
        'X-Perf-Client-Id':     clientId.trim(),
        'X-Perf-Client-Secret': clientSecret.trim(),
      };
      if (sellerClientId) headers['X-Ozon-Client-Id'] = sellerClientId;
      if (sellerApiKey)   headers['X-Ozon-Api-Key']   = sellerApiKey;

      const resp = await fetch('/api/ozon/performance-report', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await resp.json() as PerfReport & { error?: string };
      if (!resp.ok) throw new Error(data.error ?? `Ошибка ${resp.status}`);
      const newSpend = data.spendByArticle ?? {};
      // Don't overwrite good cached data with an empty result (e.g. stats timed out on Ozon side)
      if (Object.keys(newSpend).length === 0) {
        setError('Данные о расходах не получены (Ozon ещё формирует отчёт). Попробуйте ещё раз.');
        return;
      }
      setReport({ ...data, source: 'performance' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки Performance API');
    } finally {
      setLoading(false);
    }
  }, [clientId, clientSecret]);

  /**
   * Load via Ozon Seller Analytics API — no extra credentials needed.
   * Uses /api/ozon/adv-spend-by-sku which queries adv_sum_all per SKU.
   */
  const loadFromAnalytics = useCallback(async (
    sellerClientId: string,
    sellerApiKey: string,
    dateFrom: string,
    dateTo: string,
  ) => {
    if (!sellerClientId.trim() || !sellerApiKey.trim()) {
      setError('Нужны Seller API credentials — введите Client-Id и API-Key выше');
      return;
    }
    setLoading(true); setError(null);
    try {
      const resp = await fetch('/api/ozon/adv-spend-by-sku', {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-Ozon-Client-Id': sellerClientId.trim(),
          'X-Ozon-Api-Key':   sellerApiKey.trim(),
        },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await resp.json() as {
        spendByArticle?: Record<string, number>;
        totalSpend?: number;
        skuCount?: number;
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error ?? `Ошибка ${resp.status}`);

      const spendByArticle = data.spendByArticle ?? {};
      const totalSpend     = data.totalSpend ?? 0;
      const skuCount       = data.skuCount   ?? 0;

      if (skuCount === 0) {
        setError('Данные о рекламных расходах не найдены за указанный период (метрика adv_sum_all = 0 для всех товаров)');
        setLoading(false);
        return;
      }

      setReport({ campaigns: [], spendByArticle, source: 'analytics', totalSpend });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки рекламы из Analytics API');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { setReport(null); setError(null); }, []);

  return {
    clientId, setClientId,
    clientSecret, setClientSecret,
    loading, error, report,
    load, loadFromAnalytics, clear,
  };
}
