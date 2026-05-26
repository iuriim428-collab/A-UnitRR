import { useState, useCallback } from 'react';

const LS     = (k: string) => `perf_api_${k}`;
const LS_SEL = (k: string) => `ozon_api_${k}`;

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
}

export function usePerfApi() {
  const [clientId,     setClientIdState]     = useState(() => localStorage.getItem(LS('client_id'))     ?? '');
  const [clientSecret, setClientSecretState] = useState(() => localStorage.getItem(LS('client_secret')) ?? '');
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState<string | null>(null);
  const [report,   setReport]  = useState<PerfReport | null>(null);

  const setClientId = (v: string) => {
    setClientIdState(v); localStorage.setItem(LS('client_id'), v);
  };
  const setClientSecret = (v: string) => {
    setClientSecretState(v); localStorage.setItem(LS('client_secret'), v);
  };

  const load = useCallback(async (dateFrom: string, dateTo: string) => {
    if (!clientId.trim())     { setError('Введите Client-Id (Performance API)'); return; }
    if (!clientSecret.trim()) { setError('Введите Client-Secret (Performance API)'); return; }
    setLoading(true); setError(null);
    try {
      // Read Seller API credentials to allow server to resolve product IDs → articles
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
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки Performance API');
    } finally {
      setLoading(false);
    }
  }, [clientId, clientSecret]);

  const clear = useCallback(() => { setReport(null); setError(null); }, []);

  return {
    clientId, setClientId,
    clientSecret, setClientSecret,
    loading, error, report,
    load, clear,
  };
}
