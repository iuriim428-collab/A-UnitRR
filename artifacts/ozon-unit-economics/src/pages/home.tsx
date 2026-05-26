import { useState, useRef, useCallback } from 'react';
import { useMarketplace, FilterType, MarketplaceKind } from '../hooks/use-marketplace';
import { useWildberries } from '../hooks/use-wildberries';
import { supportsFolderPicker, pickFolder } from '../lib/folder-reader';
import { exportToExcel } from '../lib/excel';
import { formatCurrency, formatPercent, formatNumber } from '../lib/utils';
import { TaxSettings, TaxType, CalculatedRow, ReportSummary } from '../types';
import {
  Upload, Download, Trash2, FolderOpen, FileSpreadsheet,
  Pencil, CheckCircle, AlertCircle, RefreshCw, Key, Calendar,
  Eye, EyeOff,
} from 'lucide-react';

// ─── Tax options ──────────────────────────────────────────────────────────────
const TAX_OPTIONS: { label: string; type: TaxType; rate: number }[] = [
  { label: 'УСН 6% (доходы)',   type: 'usn_income',         rate: 0.06 },
  { label: 'УСН 15% (д-р)',     type: 'usn_income_expense',  rate: 0.15 },
  { label: 'ОСНО 20%',          type: 'osno',               rate: 0.20 },
  { label: 'Без налога',        type: 'none',               rate: 0    },
];

// ─── Small shared components ──────────────────────────────────────────────────
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
function CostEditor({ article, costPerUnit, vatRate, onChangeCost, onChangeVat, onClose }: {
  article: string; costPerUnit: number; vatRate: number;
  onChangeCost: (v: number) => void; onChangeVat: (v: number) => void; onClose: () => void;
}) {
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
      {s.ordersSum  > 0 && <MetricRow label="Сумма заказов"   value={formatCurrency(s.ordersSum)} />}
      {s.returnsSum > 0 && <MetricRow label="Сумма возвратов" value={`-${formatCurrency(s.returnsSum)}`} />}
      <MetricRow label="Чистая выручка" value={formatCurrency(s.netSales)} />

      <SectionHeader>Расходы площадки</SectionHeader>
      <MetricRow label="Комиссия"       value={`-${formatCurrency(s.ozonCommission)}`} />
      {s.deliveryServices > 0 && <MetricRow label="Доставка итого"  value={`-${formatCurrency(s.deliveryServices)}`} />}
      {s.logistics        > 0 && <MetricRow label="└ Логистика"      value={`-${formatCurrency(s.logistics)}`}        sub />}
      {s.returnLogistics  > 0 && <MetricRow label="└ Обрат. лог."    value={`-${formatCurrency(s.returnLogistics)}`}  sub />}
      {s.lastMile         > 0 && <MetricRow label="└ Последняя миля" value={`-${formatCurrency(s.lastMile)}`}         sub />}
      {s.agentServices    > 0 && <MetricRow label="Услуги партнёров" value={`-${formatCurrency(s.agentServices)}`} />}
      {s.acquiring        > 0 && <MetricRow label="└ Эквайринг"      value={`-${formatCurrency(s.acquiring)}`}        sub />}
      {s.promotion        > 0 && <MetricRow label="Продвижение"      value={`-${formatCurrency(s.promotion)}`} />}
      {s.storage          > 0 && <MetricRow label="Хранение"          value={`-${formatCurrency(s.storage)}`} />}
      {s.fboServices      > 0 && <MetricRow label="Прочие услуги"    value={`-${formatCurrency(s.fboServices)}`} />}
      {s.otherExpenses    > 0 && <MetricRow label="Штрафы/прочее"    value={`-${formatCurrency(s.otherExpenses)}`} />}

      <SectionHeader>До себестоимости</SectionHeader>
      <MetricRow label="Прибыль" value={formatCurrency(s.profitBeforeCosts)} accent={s.profitBeforeCosts > 0} />

      <SectionHeader>Себестоимость и налоги</SectionHeader>
      <MetricRow label="Себестоимость" value={s.costTotal > 0 ? `-${formatCurrency(s.costTotal)}` : 'не указана'} />
      {s.vatAmount > 0 && <MetricRow label="НДС"   value={`-${formatCurrency(s.vatAmount)}`} />}
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

// ─── SKU table ────────────────────────────────────────────────────────────────
function SkuTable({ rows, costs, editingArticle, setEditing, updateCost }: {
  rows: CalculatedRow[];
  costs: Record<string, { costPerUnit: number; vatRate: number }>;
  editingArticle: string | null;
  setEditing: (a: string | null) => void;
  updateCost: (article: string, field: 'costPerUnit' | 'vatRate', value: number) => void;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-[33px] z-10 bg-card">
        <tr className="border-b border-border">
          {['Артикул','Название','Прод.','Возвр.','Ср. цена','Выручка','Комиссия','Доставка','Партнёры','Реклама','Хранение'].map(h => (
            <th key={h} className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap ${h === 'Артикул' || h === 'Название' ? 'text-left' : 'text-right'}`}>{h}</th>
          ))}
          <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
            <span className="flex items-center justify-end gap-1">Себест. <Pencil className="w-2.5 h-2.5 text-primary/60" /></span>
          </th>
          {['Налог','Прибыль','Маржа'].map(h => (
            <th key={h} className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const isEditing = editingArticle === row.article;
          const c = costs[row.article] ?? { costPerUnit: 0, vatRate: 0 };
          return (
            <tr key={row.article}
              className={`border-b border-border/30 hover:bg-muted/20 ${idx % 2 ? 'bg-muted/5' : ''}`}>
              <td className="px-3 py-1.5 font-medium text-primary/80 whitespace-nowrap">{row.article}</td>
              <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate" title={row.name}>{row.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.salesCount)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-red-400/70">{row.returnsCount > 0 ? formatNumber(row.returnsCount) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.avgPrice > 0 ? formatCurrency(row.avgPrice) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(row.netSales)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-orange-400/80">{row.ozonCommission > 0 ? `-${formatCurrency(row.ozonCommission)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-blue-400/80">{row.deliveryServices > 0 ? `-${formatCurrency(row.deliveryServices)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-purple-400/80">{row.agentServices > 0 ? `-${formatCurrency(row.agentServices)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-pink-400/80">{row.promotion > 0 ? `-${formatCurrency(row.promotion)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-cyan-400/80">{(row.storage + row.fboServices) > 0 ? `-${formatCurrency(row.storage + row.fboServices)}` : '—'}</td>
              <td className="px-1 py-0.5 text-right" onClick={e => { e.stopPropagation(); setEditing(row.article); }}>
                {isEditing ? (
                  <CostEditor article={row.article} costPerUnit={c.costPerUnit} vatRate={c.vatRate}
                    onChangeCost={v => updateCost(row.article, 'costPerUnit', v)}
                    onChangeVat={v  => updateCost(row.article, 'vatRate', v)}
                    onClose={() => setEditing(null)} />
                ) : (
                  <span className={`group flex items-center justify-end gap-1 cursor-pointer rounded px-2 py-1 hover:bg-primary/10 hover:text-primary transition-colors tabular-nums ${row.costTotal > 0 ? 'text-muted-foreground' : 'text-yellow-400/50'}`}>
                    {row.costTotal > 0 ? `-${formatCurrency(row.costTotal)}` : '—'}
                    <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 flex-shrink-0" />
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.taxAmount > 0 ? `-${formatCurrency(row.taxAmount)}` : '—'}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${row.netProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(row.netProfit)}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${row.marginPercent > 20 ? 'text-green-400' : row.marginPercent > 10 ? 'text-yellow-400' : 'text-red-400'}`}>{formatPercent(row.marginPercent)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── File drop zone (Ozon / YM tabs) ─────────────────────────────────────────
const MARKETPLACE_INFO = {
  ozon: {
    formats: '«Отчёт по начислениям» (Финансы → Начисления)\nОтчёт о реализации (новый и старый форматы)',
  },
  yandex: {
    formats: '«Отчёт о заказах» (united_orders_*.xlsx)',
  },
};

function LoadZone({ kind, loading, error, onSelectFolder, onDropFiles }: {
  kind: MarketplaceKind; loading: boolean; error: string | null;
  onSelectFolder: () => void; onDropFiles: (files: File[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const info = MARKETPLACE_INFO[kind];
  const label = kind === 'ozon' ? 'Ozon' : 'Яндекс Маркет';

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

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        className="border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors rounded-sm p-10 text-center max-w-md w-full cursor-pointer"
        onDrop={e => { e.preventDefault(); const f = Array.from(e.dataTransfer.files).filter(f => /\.xlsx?$/i.test(f.name)); if (f.length) onDropFiles(f); }}
        onDragOver={e => e.preventDefault()}
        onClick={() => supportsFolderPicker() ? onSelectFolder() : fileRef.current?.click()}
      >
        <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
        {supportsFolderPicker() ? (
          <>
            <p className="text-base font-medium mb-1">Выберите папку {label}</p>
            <p className="text-xs text-muted-foreground mb-3">Все .xlsx файлы в папке будут загружены и объединены</p>
            <button onClick={e => { e.stopPropagation(); onSelectFolder(); }}
              className="px-4 py-1.5 text-xs border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors mb-3">
              <FolderOpen className="w-3.5 h-3.5 inline mr-1.5" />Выбрать папку
            </button>
            <p className="text-[10px] text-muted-foreground/50">или перетащите файлы сюда</p>
          </>
        ) : (
          <>
            <p className="text-base font-medium mb-1">Перетащите файлы {label}</p>
            <p className="text-xs text-muted-foreground mb-3">Можно несколько .xlsx файлов сразу</p>
            <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
              className="px-4 py-1.5 text-xs border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors">
              <Upload className="w-3.5 h-3.5 inline mr-1.5" />Выбрать файлы
            </button>
          </>
        )}
        <div className="mt-4 text-[10px] text-muted-foreground/50 whitespace-pre-line leading-relaxed">{info.formats}</div>
        {error && <p className="mt-3 text-xs text-red-400 border border-red-400/20 bg-red-400/5 px-3 py-2">{error}</p>}
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
        onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) onDropFiles(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── Loaded-files bar (Ozon / YM tabs) ───────────────────────────────────────
function FileBar({ folderName, loadedFiles, onSelectFolder, onClear }: {
  folderName: string | null;
  loadedFiles: { name: string; rowCount: number; format: string; error?: string }[];
  onSelectFolder: () => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const good = loadedFiles.filter(f => !f.error);
  const bad  = loadedFiles.filter(f =>  f.error);

  return (
    <div className="sticky top-0 z-10 bg-card border-b border-border/50 text-[11px]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-muted-foreground truncate max-w-[200px]">{folderName ?? 'Файлы'}</span>
        <span className="text-green-400/70">
          · {good.length} {good.length === 1 ? 'файл' : good.length < 5 ? 'файла' : 'файлов'}
          {bad.length > 0 && <span className="text-red-400/70 ml-1">· {bad.length} ошибок</span>}
        </span>
        <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground/60 hover:text-foreground">{expanded ? '▲' : '▼'}</button>
        <div className="flex-1" />
        {supportsFolderPicker() && (
          <button onClick={onSelectFolder} className="flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-0.5 border border-border/50">
            <RefreshCw className="w-3 h-3" /> Сменить папку
          </button>
        )}
        <button onClick={onClear} className="flex items-center gap-1 text-muted-foreground hover:text-red-400 px-2 py-0.5 border border-border/50">
          <Trash2 className="w-3 h-3" /> Очистить
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 bg-muted/5 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
          {loadedFiles.map(f => (
            <div key={f.name} title={f.error ?? `${f.rowCount} SKU`}
              className={`flex items-center gap-1 px-2 py-0.5 border text-[10px] ${f.error ? 'border-red-400/30 text-red-400/70 bg-red-400/5' : 'border-border/50 text-muted-foreground bg-muted/10'}`}>
              {f.error ? <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" /> : <CheckCircle className="w-2.5 h-2.5 flex-shrink-0 text-green-400/60" />}
              <span className="truncate max-w-[180px]">{f.name}</span>
              {!f.error && <span className="text-muted-foreground/50">({f.rowCount})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Filter + export bar (shared) ────────────────────────────────────────────
function ActionBar({ filter, setFilter, hasCosts, costsCount, onExport }: {
  filter: FilterType; setFilter: (f: FilterType) => void;
  hasCosts: boolean; costsCount: number;
  onExport: () => void;
}) {
  return (
    <div className="flex-none flex items-center gap-2 px-3 py-1 border-b border-border/30 bg-card text-[11px]">
      <Pencil className="w-3 h-3 text-muted-foreground/40" />
      <span className="text-muted-foreground/50">Нажмите «Себест.» для редактирования</span>
      {hasCosts && <span className="text-green-400/60">· указана для {costsCount} SKU</span>}
      <div className="flex-1" />
      <div className="flex border border-border">
        {(['all', 'profitable', 'unprofitable'] as FilterType[]).map((f, i) => (
          <button key={f} onClick={e => { e.stopPropagation(); setFilter(f); }}
            className={`px-3 py-1 ${filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${i > 0 ? 'border-l border-border' : ''}`}>
            {f === 'all' ? 'Все' : f === 'profitable' ? 'Прибыльные' : 'Убыточные'}
          </button>
        ))}
      </div>
      <button onClick={e => { e.stopPropagation(); onExport(); }}
        className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground hover:opacity-90">
        <Download className="w-3 h-3" /> Экспорт
      </button>
    </div>
  );
}

// ─── Ozon / YM tab content ────────────────────────────────────────────────────
function MarketplaceTabContent({ kind, mp }: { kind: MarketplaceKind; mp: ReturnType<typeof useMarketplace> }) {
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const hasData = mp.rows.length > 0;

  const handleSelectFolder = async () => {
    try { const h = await pickFolder(); if (h) await mp.loadFolder(h); } catch {}
  };

  const handleExport = () => exportToExcel(
    mp.calculatedRows.map(r => ({
      'Артикул': r.article, 'Название': r.name,
      'Продажи, шт': r.salesCount, 'Возвраты, шт': r.returnsCount,
      'Выручка, руб': r.netSales, 'Комиссия, руб': r.ozonCommission,
      'Доставка, руб': r.deliveryServices, 'Партнёры, руб': r.agentServices,
      'Продвижение, руб': r.promotion, 'Хранение, руб': r.storage,
      'Себестоимость, руб': r.costTotal, 'Налог, руб': r.taxAmount,
      'Прибыль, руб': r.netProfit, 'Маржа, %': r.marginPercent.toFixed(1),
    })),
    `${kind}_unit_economics.xlsx`
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasData && <SummarySidebar s={mp.summary} hasCosts={mp.hasCosts} />}
      <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setEditingArticle(null)}>
        {hasData ? (
          <>
            <FileBar folderName={mp.folderName} loadedFiles={mp.loadedFiles}
              onSelectFolder={handleSelectFolder} onClear={mp.clear} />
            <ActionBar filter={mp.filter} setFilter={mp.setFilter} hasCosts={mp.hasCosts}
              costsCount={Object.keys(mp.costs).length} onExport={handleExport} />
            <div className="flex-1 overflow-auto">
              <SkuTable rows={mp.calculatedRows} costs={mp.costs}
                editingArticle={editingArticle} setEditing={setEditingArticle} updateCost={mp.updateCost} />
            </div>
          </>
        ) : (
          <LoadZone kind={kind} loading={mp.loading} error={mp.error}
            onSelectFolder={handleSelectFolder} onDropFiles={mp.addFiles} />
        )}
      </div>
    </div>
  );
}

// ─── Wildberries tab content ──────────────────────────────────────────────────
function WildberriesTabContent({ wb }: { wb: ReturnType<typeof useWildberries> }) {
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const hasData = wb.rows.length > 0;

  // Quick date presets
  const setThisMonth = () => {
    const d = new Date();
    wb.setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    wb.setDateTo(new Date().toISOString().slice(0, 10));
  };
  const setLastMonth = () => {
    const d = new Date();
    d.setDate(1); d.setMonth(d.getMonth() - 1);
    const from = d.toISOString().slice(0, 10);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    wb.setDateFrom(from);
    wb.setDateTo(last.toISOString().slice(0, 10));
  };

  const handleExport = () => exportToExcel(
    wb.calculatedRows.map(r => ({
      'Артикул': r.article, 'Название': r.name,
      'Продажи, шт': r.salesCount, 'Возвраты, шт': r.returnsCount,
      'Выручка, руб': r.netSales, 'Комиссия WB, руб': r.ozonCommission,
      'Логистика, руб': r.deliveryServices, 'Эквайринг, руб': r.acquiring,
      'Хранение, руб': r.storage, 'Штрафы, руб': r.otherExpenses,
      'Себестоимость, руб': r.costTotal, 'Налог, руб': r.taxAmount,
      'Прибыль, руб': r.netProfit, 'Маржа, %': r.marginPercent.toFixed(1),
    })),
    'wildberries_unit_economics.xlsx'
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasData && <SummarySidebar s={wb.summary} hasCosts={wb.hasCosts} />}

      <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setEditingArticle(null)}>
        {/* API settings bar — always visible */}
        <div className="flex-none border-b border-border/50 bg-card px-4 py-2.5 text-[11px]">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Token input */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
              <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground whitespace-nowrap">API-токен:</span>
              <div className="relative flex-1">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={wb.token}
                  onChange={e => wb.setToken(e.target.value)}
                  placeholder="Вставьте токен из личного кабинета WB"
                  className="w-full bg-muted/30 border border-border px-2 py-1 pr-7 text-[11px] font-mono outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
                />
                <button
                  onClick={e => { e.stopPropagation(); setShowToken(v => !v); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
                  {showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input type="date" value={wb.dateFrom} onChange={e => wb.setDateFrom(e.target.value)}
                className="bg-muted/30 border border-border px-2 py-1 text-[11px] outline-none focus:border-primary/60" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={wb.dateTo} onChange={e => wb.setDateTo(e.target.value)}
                className="bg-muted/30 border border-border px-2 py-1 text-[11px] outline-none focus:border-primary/60" />
            </div>

            {/* Presets */}
            <div className="flex gap-1">
              <button onClick={e => { e.stopPropagation(); setThisMonth(); }}
                className="px-2 py-1 border border-border/60 text-muted-foreground hover:text-foreground hover:border-border">
                Этот месяц
              </button>
              <button onClick={e => { e.stopPropagation(); setLastMonth(); }}
                className="px-2 py-1 border border-border/60 text-muted-foreground hover:text-foreground hover:border-border">
                Прошлый месяц
              </button>
            </div>

            {/* Load button */}
            <button
              onClick={e => { e.stopPropagation(); wb.loadReport(); }}
              disabled={wb.loading}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
              {wb.loading
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Загружаю…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Загрузить</>}
            </button>

            {hasData && (
              <button onClick={e => { e.stopPropagation(); wb.clear(); }}
                className="flex items-center gap-1 text-muted-foreground hover:text-red-400 px-2 py-1 border border-border/50">
                <Trash2 className="w-3 h-3" /> Очистить
              </button>
            )}
          </div>

          {/* Status / error */}
          {wb.error && (
            <div className="mt-2 flex items-center gap-2 text-red-400 border border-red-400/20 bg-red-400/5 px-3 py-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{wb.error}</span>
            </div>
          )}
          {wb.rowCount !== null && !wb.error && (
            <div className="mt-1.5 text-muted-foreground/60">
              Загружено {wb.rowCount.toLocaleString('ru')} строк из WB API · {wb.rows.length} SKU
            </div>
          )}
        </div>

        {hasData ? (
          <>
            <ActionBar filter={wb.filter} setFilter={wb.setFilter} hasCosts={wb.hasCosts}
              costsCount={Object.keys(wb.costs).length} onExport={handleExport} />
            <div className="flex-1 overflow-auto">
              <SkuTable rows={wb.calculatedRows} costs={wb.costs}
                editingArticle={editingArticle} setEditing={setEditingArticle} updateCost={wb.updateCost} />
            </div>
          </>
        ) : (
          !wb.loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm space-y-4">
                <div className="w-14 h-14 mx-auto bg-violet-600/10 border border-violet-600/30 flex items-center justify-center">
                  <Key className="w-6 h-6 text-violet-400" />
                </div>
                <div>
                  <p className="text-base font-medium">Подключение к Wildberries API</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Вставьте API-токен в поле выше и нажмите «Загрузить»
                  </p>
                </div>
                <div className="text-[11px] text-left border border-border/40 bg-muted/10 px-4 py-3 space-y-1.5 text-muted-foreground">
                  <p className="font-medium text-foreground mb-2">Где взять токен:</p>
                  <p>1. Войдите в Личный кабинет WB (seller.wildberries.ru)</p>
                  <p>2. Настройки → Доступ к API</p>
                  <p>3. Создайте токен с правом «Статистика»</p>
                  <p>4. Скопируйте и вставьте сюда</p>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
type TabId = MarketplaceKind | 'wildberries';

const TABS: { id: TabId; label: string; badgeClass: string }[] = [
  { id: 'ozon',        label: 'Ozon',          badgeClass: 'text-blue-400'   },
  { id: 'yandex',      label: 'Яндекс Маркет', badgeClass: 'text-yellow-400' },
  { id: 'wildberries', label: 'Wildberries',   badgeClass: 'text-violet-400' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('ozon');
  const [tax, setTax] = useState<TaxSettings>({ type: 'usn_income', rate: 0.06 });

  const ozon   = useMarketplace('ozon',   tax, setTax);
  const yandex = useMarketplace('yandex', tax, setTax);
  const wb     = useWildberries(tax, setTax);

  const skuCounts: Record<TabId, number> = {
    ozon:        ozon.rows.length,
    yandex:      yandex.rows.length,
    wildberries: wb.rows.length,
  };

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
          {TABS.map((t, i) => (
            <button key={t.id}
              className={`flex items-center gap-1.5 px-4 py-1.5 transition-colors ${i > 0 ? 'border-l border-border' : ''} ${activeTab === t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setActiveTab(t.id)}>
              <span>{t.label}</span>
              {skuCounts[t.id] > 0 && (
                <span className={`text-[10px] font-bold ${activeTab === t.id ? 'text-primary-foreground/70' : t.badgeClass}`}>
                  {skuCounts[t.id]} SKU
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

      {/* CONTENT */}
      {activeTab === 'wildberries'
        ? <WildberriesTabContent wb={wb} />
        : <MarketplaceTabContent
            key={activeTab}
            kind={activeTab as MarketplaceKind}
            mp={activeTab === 'ozon' ? ozon : yandex}
          />
      }
    </div>
  );
}
