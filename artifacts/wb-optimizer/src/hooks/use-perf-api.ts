import { useState, useCallback, useEffect, useRef } from 'react';

const LS     = (k: string) => `perf_api_${k}`;
const LS_SEL = (k: string) => `ozon_api_${k}`;

const REPORT_KEY  = 'perf_api_report_v2';
const RUNNING_KEY = 'perf_api_running_job';
const POLL_INTERVAL_MS  = 2_000;
const POLL_MAX_ATTEMPTS = 150; // 5 minutes

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

interface RunningJob {
  jobId: string;
  startedAt: number;
}

function loadCachedReport(): PerfReport | null {
  try {
    const raw = localStorage.getItem(REPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PerfReport;
  } catch { return null; }
}

function loadRunningJob(): RunningJob | null {
  try {
    const raw = localStorage.getItem(RUNNING_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as RunningJob;
    // Ignore if older than 5 minutes
    if (Date.now() - job.startedAt > 5 * 60 * 1000) {
      localStorage.removeItem(RUNNING_KEY);
      return null;
    }
    return job;
  } catch { return null; }
}

export function usePerfApi() {
  const [clientId,     setClientIdState]     = useState(() => localStorage.getItem(LS('client_id'))     ?? '');
  const [clientSecret, setClientSecretState] = useState(() => localStorage.getItem(LS('client_secret')) ?? '');
  const [loading,   setLoading]  = useState(false);
  const [progress,  setProgress] = useState<string | null>(null);
  const [error,     setError]    = useState<string | null>(null);
  const [report,    setReport]   = useState<PerfReport | null>(loadCachedReport);

  // Used to cancel an in-progress poll when the user manually clears or starts a new job
  const abortRef = useRef(false);

  // Persist report to localStorage — only when it contains actual spend data
  useEffect(() => {
    try {
      const hasSpend = report && Object.keys(report.spendByArticle).length > 0;
      if (hasSpend) localStorage.setItem(REPORT_KEY, JSON.stringify(report));
      else if (!report) localStorage.removeItem(REPORT_KEY);
    } catch { /* quota exceeded */ }
  }, [report]);

  const setClientId = (v: string) => {
    setClientIdState(v); localStorage.setItem(LS('client_id'), v);
  };
  const setClientSecret = (v: string) => {
    setClientSecretState(v); localStorage.setItem(LS('client_secret'), v);
  };

  /** Core polling loop — shared by load() and the resume-on-mount path. */
  const pollJob = useCallback(async (jobId: string) => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      if (abortRef.current) return;
      await sleep(POLL_INTERVAL_MS);
      if (abortRef.current) return;

      try {
        const pollResp = await fetch(`/api/ozon/performance-report/job/${jobId}`);
        const poll = await pollResp.json() as {
          status:   'running' | 'done' | 'error';
          progress: string;
          result?:  PerfReport;
          error?:   string;
        };

        if (abortRef.current) return;
        setProgress(poll.progress ?? 'Обработка…');

        if (poll.status === 'done') {
          localStorage.removeItem(RUNNING_KEY);
          const newSpend = poll.result?.spendByArticle ?? {};
          if (Object.keys(newSpend).length === 0) {
            setError('Данные о расходах не получены (Ozon не вернул данные за период). Попробуйте ещё раз.');
          } else {
            setReport({ ...poll.result!, source: 'performance' });
          }
          setLoading(false); setProgress(null);
          return;
        }

        if (poll.status === 'error') {
          localStorage.removeItem(RUNNING_KEY);
          setError(poll.error ?? 'Неизвестная ошибка');
          setLoading(false); setProgress(null);
          return;
        }
      } catch {
        // Network glitch — keep polling
      }
    }

    localStorage.removeItem(RUNNING_KEY);
    setError('Таймаут ожидания ответа Ozon (>5 мин). Ozon занят — попробуйте позже.');
    setLoading(false); setProgress(null);
  }, []);

  // On mount: resume polling if a job was running when the user switched tabs
  useEffect(() => {
    const job = loadRunningJob();
    if (!job) return;
    abortRef.current = false;
    setLoading(true);
    setProgress('Возобновление загрузки…');
    pollJob(job.jobId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Load via Ozon Performance API (async job — avoids proxy 120s timeout) */
  const load = useCallback(async (dateFrom: string, dateTo: string) => {
    if (!clientId.trim())     { setError('Введите Client-Id (Performance API)'); return; }
    if (!clientSecret.trim()) { setError('Введите Client-Secret (Performance API)'); return; }

    abortRef.current = false;
    setLoading(true); setError(null); setProgress('Запуск…');

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

      // Step 1: start background job, get jobId immediately
      const startResp = await fetch('/api/ozon/performance-report', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const startData = await startResp.json() as { jobId?: string; error?: string };
      if (!startResp.ok || !startData.jobId) {
        throw new Error(startData.error ?? `Ошибка ${startResp.status}`);
      }
      const { jobId } = startData;

      // Persist so we can resume if the user switches tabs
      localStorage.setItem(RUNNING_KEY, JSON.stringify({ jobId, startedAt: Date.now() } satisfies RunningJob));

      // Step 2: poll job status
      await pollJob(jobId);
    } catch (e) {
      localStorage.removeItem(RUNNING_KEY);
      setError(e instanceof Error ? e.message : 'Ошибка загрузки Performance API');
      setLoading(false); setProgress(null);
    }
  }, [clientId, clientSecret, pollJob]);

  /**
   * Load via Ozon Seller Analytics API — no extra credentials needed.
   * Uses /api/ozon/adv-spend-by-sku which queries adv_sum per SKU.
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
    abortRef.current = false;
    setLoading(true); setError(null); setProgress(null);
    try {
      const resp = await fetch('/api/ozon/adv-spend-by-sku', {
        method: 'POST',
        headers: {
          'Content-Type':     'application/json',
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
        return;
      }

      setReport({ campaigns: [], spendByArticle, source: 'analytics', totalSpend });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки рекламы из Analytics API');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current = true;
    localStorage.removeItem(RUNNING_KEY);
    setReport(null); setError(null); setProgress(null); setLoading(false);
  }, []);

  return {
    clientId, setClientId,
    clientSecret, setClientSecret,
    loading, progress, error, report,
    load, loadFromAnalytics, clear,
  };
}
