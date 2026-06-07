import { useState, useMemo, useCallback, useEffect } from 'react';
import { OzonReportRow, SkuCost, TaxSettings, ReportFormat, CalculatedRow, ReportSummary } from '@/types';
import { parseOzonReport } from '@/lib/ue-excel';
import { mergeOzonRows } from '@/lib/ue-merge';
import { getXlsxFiles, FolderEntry } from '@/lib/ue-folder-reader';
import { calcRow, calcSummary } from '@/lib/ue-calculator';

export type MarketplaceKind = 'ozon' | 'yandex';
export type FilterType = 'all' | 'profitable' | 'unprofitable';

export interface LoadedFile {
  name: string;
  rowCount: number;
  format: ReportFormat;
  error?: string;
}

const DEFAULT_TAX: TaxSettings = { type: 'usn_income', rate: 0.06 };
const DEFAULT_COST: SkuCost = { costPerUnit: 0, vatRate: 0 };

/** Returns true if a report format belongs to the given marketplace tab */
function formatBelongsTo(fmt: ReportFormat, kind: MarketplaceKind): boolean {
  if (kind === 'yandex') return fmt === 'yandex';
  return fmt === 'nacisleniya' || fmt === 'new' || fmt === 'old';
}

const costsKey = (kind: MarketplaceKind) => `costs_${kind}_file`;

function loadCosts(key: string): Record<string, SkuCost> {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function useMarketplace(kind: MarketplaceKind, sharedTax: TaxSettings, setSharedTax: (t: TaxSettings) => void) {
  const [rows, setRows] = useState<OzonReportRow[]>([]);
  const [costs, setCosts] = useState<Record<string, SkuCost>>(() => loadCosts(costsKey(kind)));
  const [filter, setFilter] = useState<FilterType>('all');
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(costsKey(kind), JSON.stringify(costs)); } catch {}
  }, [costs, kind]);

  const calculatedRows = useMemo((): CalculatedRow[] => {
    return rows
      .map(r => calcRow(r, costs[r.article] ?? DEFAULT_COST, sharedTax))
      .filter(r => {
        if (filter === 'profitable')   return r.netProfit > 0;
        if (filter === 'unprofitable') return r.netProfit <= 0;
        return true;
      });
  }, [rows, costs, sharedTax, filter]);

  const summary = useMemo((): ReportSummary => calcSummary(calculatedRows), [calculatedRows]);

  const updateCost = useCallback((article: string, field: keyof SkuCost, value: number) => {
    setCosts(prev => ({ ...prev, [article]: { ...(prev[article] ?? DEFAULT_COST), [field]: value } }));
  }, []);

  /** Parse an array of File objects and merge into this tab's rows */
  const processFiles = useCallback(async (entries: (FolderEntry | { name: string; file: File })[]) => {
    setLoading(true);
    setError(null);

    const newFiles: LoadedFile[] = [];
    const batches: OzonReportRow[][] = [];

    for (const { name, file } of entries) {
      try {
        const { rows: parsed, format } = await parseOzonReport(file);
        if (!formatBelongsTo(format, kind)) {
          newFiles.push({ name, rowCount: 0, format, error: 'Неверный маркетплейс — файл пропущен' });
          continue;
        }
        batches.push(parsed);
        newFiles.push({ name, rowCount: parsed.length, format });
      } catch (e) {
        newFiles.push({ name, rowCount: 0, format: 'unknown', error: e instanceof Error ? e.message : 'Ошибка чтения' });
      }
    }

    setLoadedFiles(newFiles);
    // Do NOT reset costs — they persist across reloads

    if (batches.length > 0) {
      setRows(mergeOzonRows(batches));
    } else {
      setRows([]);
      if (newFiles.every(f => f.error)) {
        setError('Ни один файл не удалось загрузить');
      }
    }

    setLoading(false);
  }, [kind]);

  const loadFolder = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setFolderName(handle.name);
    const entries = await getXlsxFiles(handle);
    if (entries.length === 0) {
      setError('В папке не найдено файлов .xlsx');
      setLoadedFiles([]);
      setRows([]);
      return;
    }
    await processFiles(entries);
  }, [processFiles]);

  const addFiles = useCallback(async (files: File[]) => {
    setFolderName(null);
    await processFiles(files.map(f => ({ name: f.name, file: f })));
  }, [processFiles]);

  /** Like addFiles but also records the folder name (for webkitdirectory fallback). */
  const addFilesWithFolderName = useCallback(async (files: File[], name: string) => {
    setFolderName(name);
    await processFiles(files.map(f => ({ name: f.name, file: f })));
  }, [processFiles]);

  const clear = useCallback(() => {
    setRows([]);
    setCosts({});
    setLoadedFiles([]);
    setFolderName(null);
    setError(null);
    setFilter('all');
  }, []);

  return {
    rows,
    calculatedRows,
    summary,
    costs,
    tax: sharedTax,
    setTax: setSharedTax,
    filter,
    setFilter,
    loadedFiles,
    folderName,
    loading,
    error,
    hasCosts: Object.keys(costs).length > 0,
    loadFolder,
    addFiles,
    addFilesWithFolderName,
    clear,
    updateCost,
  };
}
