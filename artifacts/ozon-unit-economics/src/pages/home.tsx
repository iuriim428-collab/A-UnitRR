import { useState, useRef, useCallback } from 'react';
import { useMarketplace, FilterType, MarketplaceKind } from '../hooks/use-marketplace';
import { supportsFolderPicker, pickFolder } from '../lib/folder-reader';
import { exportToExcel } from '../lib/excel';
import { formatCurrency, formatPercent, formatNumber } from '../lib/utils';
import { TaxSettings, TaxType, CalculatedRow, ReportSummary } from '../types';
import {
  Upload, Download, Trash2, FolderOpen, FileSpreadsheet,
  Pencil, CheckCircle, AlertCircle, RefreshCw,
} from 'lucide-react';

// ─── Tax options ──────────────────────────────────────────────────────────────
const TAX_OPTIONS: { label: string; type: TaxType; rate: number }[] = [
  { label: 'УСН 6% (доходы)',   type: 'usn_income',         rate: 0.06 },
  { label: 'УСН 15% (д-р)',     type: 'usn_income_expense',  rate: 0.15 },
  { label: 'ОСНО 20%',          type: 'osno',               rate: 0.20 },
  { label: 'Без налога',        type: 'none',               rate: 0    },
];

// ─── Shared small components ──────────────────────────────────────────────────
function MetricRow({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline gap-2 ${sub ? 'pl-3 text-[11px]' : 'text-xs'}`}>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={`tabular-nums whitespace-nowrap font-mono ${accent ? 'font-bold text-base' : 'font-medium'} ${value.startsWith('-') ? 'text-red-400' : accent ? 'text-green-400' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-3 mb-1 border-b border-border/30 pb-0.5">
      {children}
    </div>
  );
}

// ─── Inline cost editor ───────────────────────────────────────────────────────
interface CostEditorProps {
  article: string;
  costPerUnit: number;
  vatRate: number;
  onChangeCost: (v: number) => void;
  onChangeVat: (v: number) => void;
  onClose: () => void;
}
function CostEditor({ article, costPerUnit, vatRate, onChangeCost, onChangeVat, onClose }: CostEditorProps) {
  const [localCost, setLocalCost] = useState(costPerUnit > 0 ? String(costPerUnit) : '');
  const [localVat,  setLocalVat]  = useState(vatRate   > 0 ? String(vatRate)  : '');

  const commit = () => {
    onChangeCost(parseFloat(localCost) || 0);
    onChangeVat(parseFloat(localVat) || 0);
    onClose();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="flex items-center gap-1 bg-card border border-primary/50 px-2 py-1 shadow-lg z-50 min-w-[220px]"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) commit(); }}
    >
      <span className="text-muted-foreground text-[10px] whitespace-nowrap">{article}</span>
      <span className="text-border mx-1">|</span>
      <input autoFocus type="number" min="0" step="any" value={localCost} placeholder="0"
        onChange={e => setLocalCost(e.target.value)} onKeyDown={onKey}
        className="w-20 bg-transparent border-b border-primary outline-none text-right px-1 tabular-nums text-xs" />
      <span className="text-muted-foreground text-[10px]">₽/шт</span>
      <span className="text-border mx-1">|</span>
      <span className="text-muted-foreground text-[10px]">НДС</span>
      <input type="number" min="0" max="20" step="any" value={localVat} placeholder="0"
        onChange={e => setLocalVat(e.target.value)} onKeyDown={onKey}
        className="w-10 bg-transparent border-b border-primary/60 outline-none text-right px-1 tabular-nums text-xs" />
      <span className="text-muted-foreground text-[10px]">%</span>
      <button onMouseDown={e => { e.preventDefault(); commit(); }}
        className="ml-1 text-[10px] text-primary hover:text-primary/80 font-medium">✓</button>
    </div>
  );
}

// ─── Summary sidebar ──────────────────────────────────────────────────────────
function SummarySidebar({ s, hasCosts }: { s: ReportSummary; hasCosts: boolean }) {
  return (
    <aside className="flex-none w-52 bg-card border-r overflow-y-auto p-3 text-xs space-y-0.5">
      <SectionHeader>Ключевые показатели</SectionHeader>
      <MetricRow label="Продажи, шт"   value={formatNumber(s.salesCount)} />
      <MetricRow label="Возвраты, шт"  value={s.returnsCount > 0 ? `-${formatNumber(s.returnsCount)}` : '—'} />
      {s.ordersSum  > 0 && <MetricRow label="Сумма заказов"    value={formatCurrency(s.ordersSum)} />}
      {s.returnsSum > 0 && <MetricRow label="Сумма возвратов"  value={`-${formatCurrency(s.returnsSum)}`} />}
      <MetricRow label="Чистая выручка" value={formatCurrency(s.netSales)} />

      <SectionHeader>Расходы площадки</SectionHeader>
      <MetricRow label="Комиссия"       value={`-${formatCurrency(s.ozonCommission)}`} />
      {s.deliveryServices > 0 && <MetricRow label="Доставка итого"   value={`-${formatCurrency(s.deliveryServices)}`} />}
      {s.logistics        > 0 && <MetricRow label="└ Логистика"       value={`-${formatCurrency(s.logistics)}`}        sub />}
      {s.returnLogistics  > 0 && <MetricRow label="└ Обрат. лог."     value={`-${formatCurrency(s.returnLogistics)}`}  sub />}
      {s.lastMile         > 0 && <MetricRow label="└ Последняя миля"  value={`-${formatCurrency(s.lastMile)}`}         sub />}
      {s.agentServices    > 0 && <MetricRow label="Услуги агентов"    value={`-${formatCurrency(s.agentServices)}`} />}
      {s.acquiring        > 0 && <MetricRow label="└ Эквайринг"       value={`-${formatCurrency(s.acquiring)}`}        sub />}
      {s.returnProcessing > 0 && <MetricRow label="└ Обраб. возвратов" value={`-${formatCurrency(s.returnProcessing)}`} sub />}
      {s.promotion        > 0 && <MetricRow label="Продвижение"       value={`-${formatCurrency(s.promotion)}`} />}
      {s.storage          > 0 && <MetricRow label="Хранение"           value={`-${formatCurrency(s.storage)}`} />}
      {s.fboServices      > 0 && <MetricRow label="Прочие услуги"      value={`-${formatCurrency(s.fboServices)}`} />}
      {s.otherExpenses    > 0 && <MetricRow label="Штрафы/прочее"     value={`-${formatCurrency(s.otherExpenses)}`} />}

      <SectionHeader>До себестоимости</SectionHeader>
      <MetricRow label="Прибыль" value={formatCurrency(s.profitBeforeCosts)} accent={s.profitBeforeCosts > 0} />

      <SectionHeader>Себестоимость и налоги</SectionHeader>
      <MetricRow label="Себестоимость" value={s.costTotal > 0 ? `-${formatCurrency(s.costTotal)}` : 'не указана'} />
      {s.vatAmount  > 0 && <MetricRow label="НДС"   value={`-${formatCurrency(s.vatAmount)}`} />}
      <MetricRow label="Налог" value={s.taxAmount > 0 ? `-${formatCurrency(s.taxAmount)}` : '—'} />

      <div className="mt-3 pt-2 border-t border-border">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">Чистая прибыль</div>
        <div className={`text-2xl font-bold tabular-nums ${s.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {formatCurrency(s.netProfit)}
        </div>
        <div className={`text-xs mt-0.5 ${s.marginPercent >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
          Маржа {formatPercent(s.marginPercent)}
        </div>
      </div>

      {!hasCosts && (
        <p className="text-[10px] text-yellow-400/70 border border-yellow-400/20 bg-yellow-400/5 px-2 py-1.5 mt-2">
          Нажмите ячейку «Себест.» для ввода
        </p>
      )}
    </aside>
  );
}

// ─── SKU Table ────────────────────────────────────────────────────────────────
interface SkuTableProps {
  rows: CalculatedRow[];
  costs: Record<string, { costPerUnit: number; vatRate: number }>;
  editingArticle: string | null;
  setEditing: (a: string | null) => void;
  updateCost: (article: string, field: 'costPerUnit' | 'vatRate', value: number) => void;
  showExtra: boolean; // nacisleniya / yandex columns
}

function SkuTable({ rows, costs, editingArticle, setEditing, updateCost, showExtra }: SkuTableProps) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-[33px] z-10 bg-card">
        <tr className="border-b border-border">
          <th className="text-left   px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Артикул</th>
          <th className="text-left   px-3 py-2 font-medium text-muted-foreground">Название</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Прод.</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Возвр.</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Ср. цена</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Выручка</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Комиссия</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Доставка</th>
          {showExtra && <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Партнёры</th>}
          {showExtra && <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Реклама</th>}
          {showExtra && <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Хранение</th>}
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
            <span className="flex items-center justify-end gap-1">Себест. <Pencil className="w-2.5 h-2.5 text-primary/60" /></span>
          </th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Налог</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Прибыль</th>
          <th className="text-right  px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Маржа</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const isEditing = editingArticle === row.article;
          const c = costs[row.article] ?? { costPerUnit: 0, vatRate: 0 };
          return (
            <tr key={row.article}
              className={`border-b border-border/30 hover:bg-muted/20 ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}>
              <td className="px-3 py-1.5 font-medium text-primary/80 whitespace-nowrap">{row.article}</td>
              <td className="px-3 py-1.5 text-muted-foreground max-w-[180px] truncate" title={row.name}>{row.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.salesCount)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-red-400/70">{row.returnsCount > 0 ? formatNumber(row.returnsCount) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.avgPrice > 0 ? formatCurrency(row.avgPrice) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(row.netSales)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-orange-400/80">{row.ozonCommission > 0 ? `-${formatCurrency(row.ozonCommission)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-blue-400/80">{row.deliveryServices > 0 ? `-${formatCurrency(row.deliveryServices)}` : '—'}</td>
              {showExtra && <td className="px-3 py-1.5 text-right tabular-nums text-purple-400/80">{row.agentServices > 0 ? `-${formatCurrency(row.agentServices)}` : '—'}</td>}
              {showExtra && <td className="px-3 py-1.5 text-right tabular-nums text-pink-400/80">{row.promotion > 0 ? `-${formatCurrency(row.promotion)}` : '—'}</td>}
              {showExtra && <td className="px-3 py-1.5 text-right tabular-nums text-cyan-400/80">{(row.storage + row.fboServices) > 0 ? `-${formatCurrency(row.storage + row.fboServices)}` : '—'}</td>}

              {/* Inline cost editor */}
              <td className="px-1 py-0.5 text-right" onClick={e => { e.stopPropagation(); setEditing(row.article); }}>
                {isEditing ? (
                  <CostEditor
                    article={row.article}
                    costPerUnit={c.costPerUnit} vatRate={c.vatRate}
                    onChangeCost={v => updateCost(row.article, 'costPerUnit', v)}
                    onChangeVat={v  => updateCost(row.article, 'vatRate', v)}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  <span className={`group relative flex items-center justify-end gap-1 cursor-pointer rounded px-2 py-1 hover:bg-primary/10 hover:text-primary transition-colors tabular-nums ${row.costTotal > 0 ? 'text-muted-foreground' : 'text-yellow-400/50'}`}>
                    {row.costTotal > 0 ? `-${formatCurrency(row.costTotal)}` : '—'}
                    <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 flex-shrink-0" />
                  </span>
                )}
              </td>

              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.taxAmount > 0 ? `-${formatCurrency(row.taxAmount)}` : '—'}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${row.netProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(row.netProfit)}
              </td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${row.marginPercent > 20 ? 'text-green-400' : row.marginPercent > 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                {formatPercent(row.marginPercent)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Drop zone / folder picker panel ─────────────────────────────────────────
const MARKETPLACE_INFO = {
  ozon: {
    label: 'Ozon',
    color: 'text-blue-400',
    formats: '«Отчёт по начислениям» (Финансы → Начисления)\nОтчёт о реализации (новый и старый форматы)',
  },
  yandex: {
    label: 'Яндекс Маркет',
    color: 'text-yellow-400',
    formats: '«Отчёт о заказах» (united_orders_*.xlsx)',
  },
};

interface LoadZoneProps {
  kind: MarketplaceKind;
  loading: boolean;
  error: string | null;
  folderName: string | null;
  loadedFiles: { name: string; rowCount: number; format: string; error?: string }[];
  onSelectFolder: () => void;
  onDropFiles: (files: File[]) => void;
  onClear: () => void;
}

function LoadZone({ kind, loading, error, folderName, loadedFiles, onSelectFolder, onDropFiles, onClear }: LoadZoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const info = MARKETPLACE_INFO[kind];
  const hasFiles = loadedFiles.length > 0;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => /\.xlsx?$/i.test(f.name));
    if (files.length) onDropFiles(files);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 mx-auto text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Читаю файлы…</p>
        </div>
      </div>
    );
  }

  if (!hasFiles) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div
          className="border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors rounded-sm p-10 text-center max-w-md w-full cursor-pointer"
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          onClick={() => supportsFolderPicker() ? onSelectFolder() : fileRef.current?.click()}
        >
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          {supportsFolderPicker() ? (
            <>
              <p className="text-base font-medium mb-1">Выберите папку {info.label}</p>
              <p className="text-xs text-muted-foreground mb-3">
                Все .xlsx файлы в папке будут загружены и объединены
              </p>
              <button
                onClick={e => { e.stopPropagation(); onSelectFolder(); }}
                className="px-4 py-1.5 text-xs border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors mb-3"
              >
                <FolderOpen className="w-3.5 h-3.5 inline mr-1.5" />Выбрать папку
              </button>
              <p className="text-[10px] text-muted-foreground/50">
                или перетащите файлы сюда
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-medium mb-1">Перетащите файлы {info.label}</p>
              <p className="text-xs text-muted-foreground mb-3">Можно несколько .xlsx файлов сразу</p>
              <button
                onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                className="px-4 py-1.5 text-xs border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <Upload className="w-3.5 h-3.5 inline mr-1.5" />Выбрать файлы
              </button>
            </>
          )}
          <div className="mt-4 text-[10px] text-muted-foreground/50 whitespace-pre-line leading-relaxed">
            {info.formats}
          </div>
          {error && (
            <p className="mt-3 text-xs text-red-400 border border-red-400/20 bg-red-400/5 px-3 py-2">{error}</p>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) onDropFiles(files); e.target.value = ''; }} />
      </div>
    );
  }

  return null; // has files → render table instead
}

// ─── File list bar ────────────────────────────────────────────────────────────
interface FileBarProps {
  folderName: string | null;
  loadedFiles: { name: string; rowCount: number; format: string; error?: string }[];
  onSelectFolder: () => void;
  onClear: () => void;
  kind: MarketplaceKind;
}

function FileBar({ folderName, loadedFiles, onSelectFolder, onClear, kind }: FileBarProps) {
  const [expanded, setExpanded] = useState(false);
  const goodFiles  = loadedFiles.filter(f => !f.error);
  const errorFiles = loadedFiles.filter(f =>  f.error);

  return (
    <div className="sticky top-0 z-10 bg-card border-b border-border/50 text-[11px]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-muted-foreground truncate max-w-[200px]" title={folderName ?? ''}>
          {folderName ?? 'Файлы'}
        </span>
        <span className="text-green-400/70">
          · {goodFiles.length} {goodFiles.length === 1 ? 'файл' : goodFiles.length < 5 ? 'файла' : 'файлов'}
          {errorFiles.length > 0 && <span className="text-red-400/70 ml-1">· {errorFiles.length} ошибок</span>}
        </span>
        <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground/60 hover:text-foreground ml-1">
          {expanded ? '▲' : '▼'}
        </button>
        <div className="flex-1" />
        {supportsFolderPicker() && (
          <button onClick={onSelectFolder}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-0.5 border border-border/50 hover:border-border">
            <RefreshCw className="w-3 h-3" /> Сменить папку
          </button>
        )}
        <button onClick={onClear}
          className="flex items-center gap-1 text-muted-foreground hover:text-red-400 px-2 py-0.5 border border-border/50">
          <Trash2 className="w-3 h-3" /> Очистить
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 bg-muted/5 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
          {loadedFiles.map(f => (
            <div key={f.name}
              className={`flex items-center gap-1 px-2 py-0.5 border text-[10px] ${f.error ? 'border-red-400/30 text-red-400/70 bg-red-400/5' : 'border-border/50 text-muted-foreground bg-muted/10'}`}
              title={f.error ?? `${f.rowCount} SKU`}>
              {f.error
                ? <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />
                : <CheckCircle  className="w-2.5 h-2.5 flex-shrink-0 text-green-400/60" />}
              <span className="truncate max-w-[180px]">{f.name}</span>
              {!f.error && <span className="text-muted-foreground/50">({f.rowCount} SKU)</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Marketplace tab content ──────────────────────────────────────────────────
interface TabContentProps {
  kind: MarketplaceKind;
  mp: ReturnType<typeof useMarketplace>;
}

function TabContent({ kind, mp }: TabContentProps) {
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const hasData = mp.rows.length > 0;
  const showExtra = true; // show promotion/storage/partners columns always

  const handleSelectFolder = async () => {
    try {
      const handle = await pickFolder();
      if (handle) await mp.loadFolder(handle);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = () => {
    exportToExcel(
      mp.calculatedRows.map(r => ({
        'Артикул': r.article, 'Название': r.name,
        'Продажи, шт': r.salesCount, 'Возвраты, шт': r.returnsCount,
        'Выручка, руб': r.netSales, 'Комиссия, руб': r.ozonCommission,
        'Доставка, руб': r.deliveryServices, 'Партнёры, руб': r.agentServices,
        'Продвижение, руб': r.promotion, 'Хранение, руб': r.storage,
        'Себестоимость, руб': r.costTotal, 'НДС, руб': r.vatAmount,
        'Налог, руб': r.taxAmount, 'Прибыль, руб': r.netProfit,
        'Маржа, %': r.marginPercent.toFixed(1),
      })),
      `${kind}_unit_economics.xlsx`
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasData && <SummarySidebar s={mp.summary} hasCosts={mp.hasCosts} />}

      <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setEditingArticle(null)}>
        {hasData ? (
          <>
            <FileBar
              folderName={mp.folderName}
              loadedFiles={mp.loadedFiles}
              onSelectFolder={handleSelectFolder}
              onClear={mp.clear}
              kind={kind}
            />

            {/* Filter + export bar */}
            <div className="flex-none flex items-center gap-2 px-3 py-1 border-b border-border/30 bg-card text-[11px]">
              <Pencil className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-muted-foreground/50">Нажмите «Себест.» для редактирования</span>
              {mp.hasCosts && <span className="text-green-400/60">· указана для {Object.keys(mp.costs).length} SKU</span>}
              <div className="flex-1" />
              <div className="flex border border-border">
                {(['all', 'profitable', 'unprofitable'] as FilterType[]).map(f => (
                  <button key={f}
                    className={`px-3 py-1 ${mp.filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${f !== 'all' ? 'border-l border-border' : ''}`}
                    onClick={e => { e.stopPropagation(); mp.setFilter(f); }}>
                    {f === 'all' ? 'Все' : f === 'profitable' ? 'Прибыльные' : 'Убыточные'}
                  </button>
                ))}
              </div>
              <button onClick={e => { e.stopPropagation(); handleExport(); }}
                className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                <Download className="w-3 h-3" /> Экспорт
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <SkuTable
                rows={mp.calculatedRows}
                costs={mp.costs}
                editingArticle={editingArticle}
                setEditing={setEditingArticle}
                updateCost={mp.updateCost}
                showExtra={showExtra}
              />
            </div>
          </>
        ) : (
          <LoadZone
            kind={kind}
            loading={mp.loading}
            error={mp.error}
            folderName={mp.folderName}
            loadedFiles={mp.loadedFiles}
            onSelectFolder={handleSelectFolder}
            onDropFiles={mp.addFiles}
            onClear={mp.clear}
          />
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
const TABS: { kind: MarketplaceKind; label: string; badge: string }[] = [
  { kind: 'ozon',   label: 'Ozon',           badge: 'text-blue-400' },
  { kind: 'yandex', label: 'Яндекс Маркет',  badge: 'text-yellow-400' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<MarketplaceKind>('ozon');
  const [tax, setTax] = useState<TaxSettings>({ type: 'usn_income', rate: 0.06 });

  const ozon   = useMarketplace('ozon',   tax, setTax);
  const yandex = useMarketplace('yandex', tax, setTax);

  const mp = activeTab === 'ozon' ? ozon : yandex;
  const skuCounts = { ozon: ozon.rows.length, yandex: yandex.rows.length };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-mono text-sm dark select-none">
      {/* HEADER */}
      <header className="flex-none flex items-center gap-4 px-5 py-2.5 border-b bg-card z-20">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-5 h-5 text-primary flex-shrink-0" />
          <h1 className="text-base font-bold uppercase tracking-tight whitespace-nowrap">Unit Economics</h1>
        </div>

        {/* Tabs */}
        <div className="flex border border-border text-[11px]">
          {TABS.map(t => (
            <button key={t.kind}
              className={`flex items-center gap-1.5 px-4 py-1.5 transition-colors ${t.kind !== 'ozon' ? 'border-l border-border' : ''} ${activeTab === t.kind ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setActiveTab(t.kind)}>
              <span>{t.label}</span>
              {skuCounts[t.kind] > 0 && (
                <span className={`text-[10px] font-bold ${activeTab === t.kind ? 'text-primary-foreground/70' : t.badge}`}>
                  {skuCounts[t.kind]} SKU
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Shared tax selector */}
        <select
          className="h-7 text-xs bg-muted border border-border rounded-none px-2 text-foreground"
          value={tax.type}
          onChange={e => {
            const opt = TAX_OPTIONS.find(o => o.type === e.target.value);
            if (opt) setTax({ type: opt.type, rate: opt.rate });
          }}>
          {TAX_OPTIONS.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
      </header>

      {/* ACTIVE TAB */}
      <TabContent key={activeTab} kind={activeTab} mp={mp} />
    </div>
  );
}
