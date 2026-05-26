import { useState, useCallback } from 'react';

const LS = (k: string) => `perf_api_${k}`;

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
      const resp = await fetch('/api/ozon/performance-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Perf-Client-Id':     clientId.trim(),
          'X-Perf-Client-Secret': clientSecret.trim(),
        },
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
