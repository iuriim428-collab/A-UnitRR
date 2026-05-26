import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useMarketplace, FilterType, MarketplaceKind } from '../hooks/use-marketplace';
import { useOzonApi } from '../hooks/use-ozon-api';
import { useYmApi } from '../hooks/use-ym-api';
import { useWildberries } from '../hooks/use-wildberries';
import { supportsFolderPicker, pickFolder } from '../lib/folder-reader';
import { exportToExcel } from '../lib/excel';
import { isLocalProxyAvailable } from '../lib/wb-api';
import { formatCurrency, formatPercent, formatNumber } from '../lib/utils';
import { TaxSettings, TaxType, CalculatedRow, ReportSummary } from '../types';
import {
  Upload, Download, Trash2, FolderOpen, FileSpreadsheet,
  Pencil, CheckCircle, AlertCircle, RefreshCw, Key, Calendar,
  Eye, EyeOff, Folder, Globe,
} from 'lucide-react';

// ─── ABC analysis ──────────────────────────────────────────────────────────────
type AbcClass = 'A' | 'B' | 'C';

function computeAbcMap(rows: CalculatedRow[]): Map<string, AbcClass> {
  const sorted = [...rows].sort((a, b) => b.netSales - a.netSales);
  const total  = sorted.reduce((s, r) => s + Math.max(r.netSales, 0), 0);
  if (total === 0) return new Map();
  let cum = 0;
  const map = new Map<string, AbcClass>();
  for (const r of sorted) {
    cum += Math.max(r.netSales, 0);
    const pct = cum / total;
    map.set(r.article, pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C');
  }
  return map;
}

const ABC_STYLE: Record<AbcClass, string> = {
  A: 'bg-green-500/20 text-green-400 border border-green-500/30',
  B: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  C: 'bg-red-500/20 text-red-400/80 border border-red-500/20',
};

// ─── Tax options ──────────────────────────────────────────────────────────────
const TAX_OPTIONS: { label: string; type: TaxType; rate: number }[] = [
  { label: 'УСН 6% (доходы)',  type: 'usn_income',        rate: 0.06 },
  { label: 'УСН 15% (д-р)',    type: 'usn_income_expense', rate: 0.15 },
  { label: 'ОСНО 20%',         type: 'osno',              rate: 0.20 },
  { label: 'Без налога',       type: 'none',              rate: 0    },
];

// ─── Tiny reusable components ─────────────────────────────────────────────────
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

function SectionHdr({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-3 mb-1 border-b border-border/30 pb-0.5">
      {children}
    </div>
  );
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange }: { mode: 'files' | 'api'; onChange: (m: 'files' | 'api') => void }) {
  return (
    <div className="flex border border-border text-[11px]">
      <button
        onClick={() => onChange('files')}
        className={`flex items-center gap-1.5 px-3 py-1 transition-colors ${mode === 'files' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
        <Folder className="w-3 h-3" />Файлы
      </button>
      <button
        onClick={() => onChange('api')}
        className={`flex items-center gap-1.5 px-3 py-1 border-l border-border transition-colors ${mode === 'api' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
        <Globe className="w-3 h-3" />API
      </button>
    </div>
  );
}

// ─── Summary sidebar ──────────────────────────────────────────────────────────
function SummarySidebar({ s, hasCosts, adSpend, setAdSpend }: {
  s: ReportSummary; hasCosts: boolean; adSpend: number; setAdSpend: (v: number) => void;
}) {
  const [adInput, setAdInput] = useState(adSpend > 0 ? String(adSpend) : '');
  const adjProfit = s.netProfit - adSpend;
  const adjMargin = s.netSales > 0 ? (adjProfit / s.netSales) * 100 : 0;

  const commitAd = (raw: string) => {
    const v = parseFloat(raw) || 0;
    setAdSpend(v);
    setAdInput(v > 0 ? String(v) : '');
  };

  return (
    <aside className="flex-none w-52 bg-card border-r overflow-y-auto p-3 text-xs space-y-0.5">
      <SectionHdr>Ключевые показатели</SectionHdr>
      <MetricRow label="Продажи, шт"   value={formatNumber(s.salesCount)} />
      <MetricRow label="Возвраты, шт"  value={s.returnsCount > 0 ? `-${formatNumber(s.returnsCount)}` : '—'} />
      {s.ordersSum  > 0 && <MetricRow label="Сумма заказов"   value={formatCurrency(s.ordersSum)} />}
      {s.returnsSum > 0 && <MetricRow label="Сумма возвратов" value={`-${formatCurrency(s.returnsSum)}`} />}
      <MetricRow label="Чистая выручка" value={formatCurrency(s.netSales)} />

      <SectionHdr>Расходы площадки</SectionHdr>
      <MetricRow label="Комиссия"       value={`-${formatCurrency(s.ozonCommission)}`} />
      {s.deliveryServices > 0 && <MetricRow label="Доставка итого"  value={`-${formatCurrency(s.deliveryServices)}`} />}
      {s.logistics        > 0 && <MetricRow label="└ Логистика"      value={`-${formatCurrency(s.logistics)}`}        sub />}
      {s.returnLogistics  > 0 && <MetricRow label="└ Обрат. лог."    value={`-${formatCurrency(s.returnLogistics)}`}  sub />}
      {s.lastMile         > 0 && <MetricRow label="└ Последняя миля" value={`-${formatCurrency(s.lastMile)}`}         sub />}
      {s.agentServices    > 0 && <MetricRow label="Услуги партнёров" value={`-${formatCurrency(s.agentServices)}`} />}
      {s.acquiring        > 0 && <MetricRow label="└ Эквайринг"      value={`-${formatCurrency(s.acquiring)}`}        sub />}
      {s.promotion        > 0 && <MetricRow label="Прод. на платформе" value={`-${formatCurrency(s.promotion)}`} />}
      {s.storage          > 0 && <MetricRow label="Хранение"          value={`-${formatCurrency(s.storage)}`} />}
      {s.fboServices      > 0 && <MetricRow label="Прочие услуги"    value={`-${formatCurrency(s.fboServices)}`} />}
      {s.otherExpenses    > 0 && <MetricRow label="Штрафы/прочее"    value={`-${formatCurrency(s.otherExpenses)}`} />}

      <SectionHdr>До себестоимости</SectionHdr>
      <MetricRow label="Прибыль" value={formatCurrency(s.profitBeforeCosts)} accent={s.profitBeforeCosts > 0} />

      <SectionHdr>Себестоимость и налоги</SectionHdr>
      <MetricRow label="Себестоимость" value={s.costTotal > 0 ? `-${formatCurrency(s.costTotal)}` : 'не указана'} />
      {s.vatAmount > 0 && <MetricRow label="НДС"  value={`-${formatCurrency(s.vatAmount)}`} />}
      <MetricRow label="Налог" value={s.taxAmount > 0 ? `-${formatCurrency(s.taxAmount)}` : '—'} />

      {/* Ad spend — editable total */}
      <SectionHdr>Реклама (общие)</SectionHdr>
      <div className="flex items-center gap-1">
        <input
          type="number" min="0" step="any"
          value={adInput}
          onChange={e => setAdInput(e.target.value)}
          onBlur={e => commitAd(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { commitAd(adInput); (e.target as HTMLInputElement).blur(); } }}
          placeholder="0 ₽"
          className="flex-1 bg-muted/30 border border-border px-2 py-1 text-[11px] tabular-nums font-mono outline-none focus:border-primary/60 placeholder:text-muted-foreground/30"
        />
        <span className="text-muted-foreground text-[10px]">₽</span>
      </div>
      {adSpend > 0 && (
        <div className="text-[10px] text-red-400/70 tabular-nums">
          -{formatCurrency(adSpend)} из прибыли
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-border">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">
          {adSpend > 0 ? 'Прибыль с рекламой' : 'Чистая прибыль'}
        </div>
        <div className={`text-2xl font-bold tabular-nums ${adjProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {formatCurrency(adjProfit)}
        </div>
        <div className={`text-xs mt-0.5 ${adjMargin >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
          Маржа {formatPercent(adjMargin)}
        </div>
        {adSpend > 0 && (
          <div className="text-[10px] text-muted-foreground/50 mt-1">
            До рекламы: {formatCurrency(s.netProfit)}
          </div>
        )}
      </div>

      {!hasCosts && (
        <p className="text-[10px] text-yellow-400/70 border border-yellow-400/20 bg-yellow-400/5 px-2 py-1.5 mt-2">
          Нажмите ячейку «Себест.» для ввода
        </p>
      )}
    </aside>
  );
}

// ─── Inline cost editor ───────────────────────────────────────────────────────
function CostEditor({ article, costPerUnit, vatRate, onChangeCost, onChangeVat, onClose }: {
  article: string; costPerUnit: number; vatRate: number;
  onChangeCost: (v: number) => void; onChangeVat: (v: number) => void; onClose: () => void;
}) {
  const [lc, setLc] = useState(costPerUnit > 0 ? String(costPerUnit) : '');
  const [lv, setLv] = useState(vatRate > 0 ? String(vatRate) : '');
  const commit = () => { onChangeCost(parseFloat(lc) || 0); onChangeVat(parseFloat(lv) || 0); onClose(); };
  const onKey  = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') onClose(); };

  return (
    <div className="flex items-center gap-1 bg-card border border-primary/50 px-2 py-1 shadow-lg z-50 min-w-[220px]"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) commit(); }}>
      <span className="text-muted-foreground text-[10px] whitespace-nowrap">{article}</span>
      <span className="text-border mx-1">|</span>
      <input autoFocus type="number" min="0" step="any" value={lc} placeholder="0"
        onChange={e => setLc(e.target.value)} onKeyDown={onKey}
        className="w-20 bg-transparent border-b border-primary outline-none text-right px-1 tabular-nums text-xs" />
      <span className="text-muted-foreground text-[10px]">₽/шт</span>
      <span className="text-border mx-1">|</span>
      <span className="text-muted-foreground text-[10px]">НДС</span>
      <input type="number" min="0" max="20" step="any" value={lv} placeholder="0"
        onChange={e => setLv(e.target.value)} onKeyDown={onKey}
        className="w-10 bg-transparent border-b border-primary/60 outline-none text-right px-1 tabular-nums text-xs" />
      <span className="text-muted-foreground text-[10px]">%</span>
      <button onMouseDown={e => { e.preventDefault(); commit(); }} className="ml-1 text-[10px] text-primary hover:text-primary/80 font-medium">✓</button>
    </div>
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
  const abcMap = useMemo(() => computeAbcMap(rows), [rows]);

  const cols = ['ABC','Артикул','Название','Прод.','Возвр.','Ср. цена','Выручка','Комиссия','Доставка','Партнёры','Хранение'];
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-[33px] z-10 bg-card">
        <tr className="border-b border-border">
          {cols.map(h => (
            <th key={h} className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap ${h === 'Артикул' || h === 'Название' ? 'text-left' : h === 'ABC' ? 'text-center' : 'text-right'}`}>{h}</th>
          ))}
          <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
            <span className="flex items-center justify-end gap-1">Себест. <Pencil className="w-2.5 h-2.5 text-primary/60" /></span>
          </th>
          {['Налог','Прибыль','Маржа','Приб./шт'].map(h => (
            <th key={h} className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const isEditing = editingArticle === row.article;
          const c   = costs[row.article] ?? { costPerUnit: 0, vatRate: 0 };
          const abc = abcMap.get(row.article);
          return (
            <tr key={row.article} className={`border-b border-border/30 hover:bg-muted/20 ${idx % 2 ? 'bg-muted/5' : ''}`}>
              <td className="px-2 py-1.5 text-center">
                {abc && (
                  <span className={`inline-block w-5 text-center text-[10px] font-bold leading-5 ${ABC_STYLE[abc]}`}>
                    {abc}
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5 font-medium text-primary/80 whitespace-nowrap">{row.article}</td>
              <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate" title={row.name}>{row.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.salesCount)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-red-400/70">{row.returnsCount > 0 ? formatNumber(row.returnsCount) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.avgPrice > 0 ? formatCurrency(row.avgPrice) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(row.netSales)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-orange-400/80">{row.ozonCommission > 0 ? `-${formatCurrency(row.ozonCommission)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-blue-400/80">{row.deliveryServices > 0 ? `-${formatCurrency(row.deliveryServices)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-purple-400/80">{row.agentServices > 0 ? `-${formatCurrency(row.agentServices)}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-cyan-400/80">{(row.storage + row.fboServices) > 0 ? `-${formatCurrency(row.storage + row.fboServices)}` : '—'}</td>
              <td className="px-1 py-0.5 text-right" onClick={e => { e.stopPropagation(); setEditing(row.article); }}>
                {isEditing ? (
                  <CostEditor article={row.article} costPerUnit={c.costPerUnit} vatRate={c.vatRate}
                    onChangeCost={v => updateCost(row.article, 'costPerUnit', v)}
                    onChangeVat={v  => updateCost(row.article, 'vatRate',    v)}
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
              <td className={`px-3 py-1.5 text-right tabular-nums ${row.netProfit >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
                {row.salesCount > 0 ? formatCurrency(row.netProfit / row.salesCount) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Filter + export bar ──────────────────────────────────────────────────────
function ActionBar({ filter, setFilter, hasCosts, costsCount, onExport }: {
  filter: FilterType; setFilter: (f: FilterType) => void;
  hasCosts: boolean; costsCount: number; onExport: () => void;
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

// ─── File bar (for file mode) ─────────────────────────────────────────────────
function FileBar({ folderName, loadedFiles, onSelectFolder, onClear }: {
  folderName: string | null;
  loadedFiles: { name: string; rowCount: number; format: string; error?: string }[];
  onSelectFolder: () => void; onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const good = loadedFiles.filter(f => !f.error);
  const bad  = loadedFiles.filter(f =>  f.error);
  return (
    <div className="sticky top-0 z-10 bg-card border-b border-border/50 text-[11px]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-muted-foreground truncate max-w-[200px]">{folderName ?? 'Файлы'}</span>
        <span className="text-green-400/70">· {good.length} {good.length === 1 ? 'файл' : good.length < 5 ? 'файла' : 'файлов'}
          {bad.length > 0 && <span className="text-red-400/70 ml-1">· {bad.length} ошибок</span>}
        </span>
        <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground/60 hover:text-foreground">{expanded ? '▲' : '▼'}</button>
        <div className="flex-1" />
        {supportsFolderPicker() && (
          <button onClick={onSelectFolder} className="flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-0.5 border border-border/50">
            <RefreshCw className="w-3 h-3" /> Сменить
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

// ─── Drop zone (for file mode, empty state) ───────────────────────────────────
function DropZone({ kind, loading, error, onSelectFolder, onDropFiles }: {
  kind: MarketplaceKind; loading: boolean; error: string | null;
  onSelectFolder: () => void; onDropFiles: (files: File[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const label   = kind === 'ozon' ? 'Ozon' : 'Яндекс Маркет';
  const fmts    = kind === 'ozon'
    ? '«Отчёт по начислениям» (Финансы → Начисления)\nОтчёт о реализации (новый и старый форматы)'
    : '«Отчёт о заказах» (united_orders_*.xlsx)';

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3"><RefreshCw className="w-8 h-8 mx-auto text-primary animate-spin" /><p className="text-sm text-muted-foreground">Читаю файлы…</p></div>
    </div>
  );

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors rounded-sm p-10 text-center max-w-md w-full cursor-pointer"
        onDrop={e => { e.preventDefault(); const f = Array.from(e.dataTransfer.files).filter(f => /\.xlsx?$/i.test(f.name)); if (f.length) onDropFiles(f); }}
        onDragOver={e => e.preventDefault()}
        onClick={() => supportsFolderPicker() ? onSelectFolder() : fileRef.current?.click()}>
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
            <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
              className="px-4 py-1.5 text-xs border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors">
              <Upload className="w-3.5 h-3.5 inline mr-1.5" />Выбрать файлы
            </button>
          </>
        )}
        <div className="mt-4 text-[10px] text-muted-foreground/50 whitespace-pre-line leading-relaxed">{fmts}</div>
        {error && <p className="mt-3 text-xs text-red-400 border border-red-400/20 bg-red-400/5 px-3 py-2">{error}</p>}
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
        onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) onDropFiles(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── Generic API settings bar ─────────────────────────────────────────────────
interface ApiBarField { label: string; value: string; onChange: (v: string) => void; secret?: boolean; placeholder?: string; }

function ApiSettingsBar({ fields, dateFrom, setDateFrom, dateTo, setDateTo, loading, error, statusLine, onLoad, onClear, hasData, accentColor }: {
  fields: ApiBarField[];
  dateFrom: string; setDateFrom: (d: string) => void;
  dateTo: string;   setDateTo:   (d: string) => void;
  loading: boolean; error: string | null; statusLine?: string;
  onLoad: () => void; onClear?: () => void; hasData: boolean;
  accentColor: string;
}) {
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});

  const setThisMonth = () => {
    const d = new Date();
    setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    setDateTo(new Date().toISOString().slice(0, 10));
  };
  const setLastMonth = () => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    setDateFrom(d.toISOString().slice(0, 10));
    setDateTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
  };

  return (
    <div className="flex-none border-b border-border/50 bg-card px-4 py-2.5 text-[11px]" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-3 flex-wrap">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-1 min-w-[220px]">
            <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground whitespace-nowrap">{f.label}:</span>
            <div className="relative flex-1">
              <input
                type={f.secret && !showSecrets[i] ? 'password' : 'text'}
                value={f.value} onChange={e => f.onChange(e.target.value)}
                placeholder={f.placeholder ?? ''}
                className="w-full bg-muted/30 border border-border px-2 py-1 pr-7 text-[11px] font-mono outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
              />
              {f.secret && (
                <button onClick={() => setShowSecrets(p => ({ ...p, [i]: !p[i] }))}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
                  {showSecrets[i] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-muted/30 border border-border px-2 py-1 text-[11px] outline-none focus:border-primary/60" />
          <span className="text-muted-foreground">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-muted/30 border border-border px-2 py-1 text-[11px] outline-none focus:border-primary/60" />
        </div>

        <div className="flex gap-1">
          <button onClick={setThisMonth} className="px-2 py-1 border border-border/60 text-muted-foreground hover:text-foreground hover:border-border">Этот мес.</button>
          <button onClick={setLastMonth} className="px-2 py-1 border border-border/60 text-muted-foreground hover:text-foreground hover:border-border">Прошлый</button>
        </div>

        <button onClick={onLoad} disabled={loading}
          className={`flex items-center gap-1.5 px-4 py-1.5 ${accentColor} text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium`}>
          {loading ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Загружаю…</> : <><RefreshCw className="w-3.5 h-3.5" />Загрузить</>}
        </button>

        {hasData && onClear && (
          <button onClick={onClear} className="flex items-center gap-1 text-muted-foreground hover:text-red-400 px-2 py-1 border border-border/50">
            <Trash2 className="w-3 h-3" /> Очистить
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-red-400 border border-red-400/20 bg-red-400/5 px-3 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}
      {statusLine && !error && (
        <div className="mt-1.5 text-muted-foreground/60">{statusLine}</div>
      )}
    </div>
  );
}

// ─── API empty state ──────────────────────────────────────────────────────────
function ApiEmptyState({ icon, title, hint, steps }: {
  icon: React.ReactNode; title: string; hint: string; steps: string[];
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm space-y-4">
        <div className="w-14 h-14 mx-auto bg-muted/20 border border-border/50 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-base font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        </div>
        <div className="text-[11px] text-left border border-border/40 bg-muted/10 px-4 py-3 space-y-1.5 text-muted-foreground">
          <p className="font-medium text-foreground mb-2">Как подключить:</p>
          {steps.map((s, i) => <p key={i}>{s}</p>)}
        </div>
      </div>
    </div>
  );
}

// ─── Ozon tab ─────────────────────────────────────────────────────────────────
function OzonTabContent({ mp, api }: {
  mp: ReturnType<typeof useMarketplace>;
  api: ReturnType<typeof useOzonApi>;
}) {
  const [mode, setMode] = useState<'files' | 'api'>(() =>
    (localStorage.getItem('ozon_tab_mode') as 'files' | 'api') ?? 'files'
  );
  const changeMode = (m: 'files' | 'api') => {
    setMode(m); localStorage.setItem('ozon_tab_mode', m);
  };

  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const [adSpend, setAdSpendState] = useState<number>(() => parseFloat(localStorage.getItem('ozon_ad_spend') ?? '0') || 0);
  const setAdSpend = (v: number) => { setAdSpendState(v); localStorage.setItem('ozon_ad_spend', String(v)); };

  // Active data source
  const active   = mode === 'files' ? mp  : api;
  const hasData  = active.rows.length > 0;

  const handleSelectFolder = async () => {
    try { const h = await pickFolder(); if (h) await mp.loadFolder(h); } catch {}
  };

  const mkExport = (prefix: string) => () => exportToExcel(
    active.calculatedRows.map(r => ({
      'Артикул': r.article, 'Название': r.name,
      'Продажи, шт': r.salesCount, 'Возвраты, шт': r.returnsCount,
      'Выручка, руб': r.netSales, 'Комиссия, руб': r.ozonCommission,
      'Доставка, руб': r.deliveryServices, 'Партнёры, руб': r.agentServices,
      'Продвижение, руб': r.promotion, 'Хранение, руб': r.storage,
      'Себестоимость, руб': r.costTotal, 'Налог, руб': r.taxAmount,
      'Прибыль, руб': r.netProfit, 'Маржа, %': r.marginPercent.toFixed(1),
    })),
    `${prefix}_unit_economics.xlsx`
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasData && <SummarySidebar s={active.summary} hasCosts={active.hasCosts} adSpend={adSpend} setAdSpend={setAdSpend} />}
      <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setEditingArticle(null)}>

        {/* Mode toggle always visible */}
        {!hasData && (
          <div className="flex-none flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-card">
            <span className="text-[11px] text-muted-foreground">Источник данных:</span>
            <ModeToggle mode={mode} onChange={changeMode} />
          </div>
        )}

        {/* API mode */}
        {mode === 'api' && (
          <ApiSettingsBar
            accentColor="bg-blue-600 hover:bg-blue-500"
            fields={[
              { label: 'Client-Id', value: api.clientId, onChange: api.setClientId, placeholder: '12345' },
              { label: 'API-Key',   value: api.apiKey,   onChange: api.setApiKey,   placeholder: 'xxxxxxxx-xxxx-…', secret: true },
            ]}
            dateFrom={api.dateFrom} setDateFrom={api.setDateFrom}
            dateTo={api.dateTo}     setDateTo={api.setDateTo}
            loading={api.loading}   error={api.error}
            statusLine={api.opCount !== null ? `Загружено ${api.opCount.toLocaleString('ru')} операций · ${api.rows.length} SKU` : undefined}
            onLoad={api.loadReport}
            onClear={api.rows.length > 0 ? api.clear : undefined}
            hasData={api.rows.length > 0}
          />
        )}

        {hasData ? (
          <>
            {/* Mode toggle in data mode */}
            <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-card text-[11px]">
              <ModeToggle mode={mode} onChange={m => { changeMode(m); }} />
              <div className="flex-1" />
            </div>

            {mode === 'files' && (
              <FileBar folderName={mp.folderName} loadedFiles={mp.loadedFiles}
                onSelectFolder={handleSelectFolder} onClear={mp.clear} />
            )}

            <ActionBar filter={active.filter} setFilter={active.setFilter}
              hasCosts={active.hasCosts} costsCount={Object.keys(active.costs).length}
              onExport={mkExport('ozon')} />

            <div className="flex-1 overflow-auto">
              <SkuTable rows={active.calculatedRows} costs={active.costs}
                editingArticle={editingArticle} setEditing={setEditingArticle}
                updateCost={active.updateCost} />
            </div>
          </>
        ) : (
          mode === 'files'
            ? <DropZone kind="ozon" loading={mp.loading} error={mp.error}
                onSelectFolder={handleSelectFolder} onDropFiles={mp.addFiles} />
            : !api.loading && (
              <ApiEmptyState
                icon={<Key className="w-6 h-6 text-blue-400" />}
                title="Подключение через Ozon Seller API"
                hint="Введите Client-Id и API-Key выше и нажмите «Загрузить»"
                steps={[
                  '1. seller.ozon.ru → Настройки → API-ключи',
                  '2. Создайте ключ с правами «Finance: read»',
                  '3. Скопируйте Client-Id и Api-Key',
                  '4. Вставьте в поля выше и нажмите «Загрузить»',
                  '⚠ Данные берутся из раздела «Транзакции»',
                ]}
              />
            )
        )}
      </div>
    </div>
  );
}

// ─── YM tab ───────────────────────────────────────────────────────────────────
function YmTabContent({ mp, api }: {
  mp:  ReturnType<typeof useMarketplace>;
  api: ReturnType<typeof useYmApi>;
}) {
  const [mode, setMode] = useState<'files' | 'api'>(() =>
    (localStorage.getItem('ym_tab_mode') as 'files' | 'api') ?? 'files'
  );
  const changeMode = (m: 'files' | 'api') => {
    setMode(m); localStorage.setItem('ym_tab_mode', m);
  };

  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const [adSpend, setAdSpendState] = useState<number>(() => parseFloat(localStorage.getItem('ym_ad_spend') ?? '0') || 0);
  const setAdSpend = (v: number) => { setAdSpendState(v); localStorage.setItem('ym_ad_spend', String(v)); };

  const active  = mode === 'files' ? mp  : api;
  const hasData = active.rows.length > 0;

  const handleSelectFolder = async () => {
    try { const h = await pickFolder(); if (h) await mp.loadFolder(h); } catch {}
  };

  const mkExport = () => exportToExcel(
    active.calculatedRows.map(r => ({
      'Артикул': r.article, 'Название': r.name,
      'Продажи, шт': r.salesCount, 'Возвраты, шт': r.returnsCount,
      'Выручка, руб': r.netSales, 'Комиссия ЯМ, руб': r.ozonCommission,
      'Себестоимость, руб': r.costTotal, 'Налог, руб': r.taxAmount,
      'Прибыль, руб': r.netProfit, 'Маржа, %': r.marginPercent.toFixed(1),
    })),
    'yandex_unit_economics.xlsx'
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasData && <SummarySidebar s={active.summary} hasCosts={active.hasCosts} adSpend={adSpend} setAdSpend={setAdSpend} />}
      <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setEditingArticle(null)}>

        {!hasData && (
          <div className="flex-none flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-card">
            <span className="text-[11px] text-muted-foreground">Источник данных:</span>
            <ModeToggle mode={mode} onChange={changeMode} />
          </div>
        )}

        {mode === 'api' && (
          <ApiSettingsBar
            accentColor="bg-yellow-600 hover:bg-yellow-500"
            fields={[
              { label: 'OAuth-токен', value: api.token,      onChange: api.setToken,      placeholder: 'AQAAAA…', secret: true },
              { label: 'ID кампании', value: api.campaignId, onChange: api.setCampaignId, placeholder: '12345678' },
            ]}
            dateFrom={api.dateFrom} setDateFrom={api.setDateFrom}
            dateTo={api.dateTo}     setDateTo={api.setDateTo}
            loading={api.loading}   error={api.error}
            statusLine={api.orderCount !== null ? `Загружено ${api.orderCount.toLocaleString('ru')} заказов · ${api.rows.length} SKU` : undefined}
            onLoad={api.loadReport}
            onClear={api.rows.length > 0 ? api.clear : undefined}
            hasData={api.rows.length > 0}
          />
        )}

        {hasData ? (
          <>
            <div className="flex-none flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-card text-[11px]">
              <ModeToggle mode={mode} onChange={changeMode} />
              <div className="flex-1" />
            </div>
            {mode === 'files' && (
              <FileBar folderName={mp.folderName} loadedFiles={mp.loadedFiles}
                onSelectFolder={handleSelectFolder} onClear={mp.clear} />
            )}
            <ActionBar filter={active.filter} setFilter={active.setFilter}
              hasCosts={active.hasCosts} costsCount={Object.keys(active.costs).length}
              onExport={mkExport} />
            <div className="flex-1 overflow-auto">
              <SkuTable rows={active.calculatedRows} costs={active.costs}
                editingArticle={editingArticle} setEditing={setEditingArticle}
                updateCost={active.updateCost} />
            </div>
          </>
        ) : (
          mode === 'files'
            ? <DropZone kind="yandex" loading={mp.loading} error={mp.error}
                onSelectFolder={handleSelectFolder} onDropFiles={mp.addFiles} />
            : !api.loading && (
              <ApiEmptyState
                icon={<Key className="w-6 h-6 text-yellow-400" />}
                title="Подключение через Яндекс Маркет API"
                hint="Введите OAuth-токен и ID кампании выше, затем нажмите «Загрузить»"
                steps={[
                  '1. partner.market.yandex.ru → Настройки → API',
                  '2. Получите OAuth-токен (oauth.yandex.ru)',
                  '3. ID кампании — в URL личного кабинета',
                  '4. Вставьте данные выше и нажмите «Загрузить»',
                  '⚠ Доступны продажи и комиссия; логистика из xlsx',
                ]}
              />
            )
        )}
      </div>
    </div>
  );
}

// ─── WB tab ───────────────────────────────────────────────────────────────────
function WbTabContent({ wb }: { wb: ReturnType<typeof useWildberries> }) {
  const [editingArticle, setEditingArticle] = useState<string | null>(null);
  const [adSpend, setAdSpendState] = useState<number>(() => parseFloat(localStorage.getItem('wb_ad_spend') ?? '0') || 0);
  const setAdSpend = (v: number) => { setAdSpendState(v); localStorage.setItem('wb_ad_spend', String(v)); };
  const [localProxy, setLocalProxy] = useState<boolean | null>(null);
  const hasData = wb.rows.length > 0;

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await isLocalProxyAvailable();
      if (!cancelled) setLocalProxy(ok);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const setThisMonth = () => {
    const d = new Date();
    wb.setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    wb.setDateTo(new Date().toISOString().slice(0, 10));
  };
  const setLastMonth = () => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    wb.setDateFrom(d.toISOString().slice(0, 10));
    wb.setDateTo(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
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
      {hasData && <SummarySidebar s={wb.summary} hasCosts={wb.hasCosts} adSpend={adSpend} setAdSpend={setAdSpend} />}
      <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setEditingArticle(null)}>

        <ApiSettingsBar
          accentColor="bg-violet-600 hover:bg-violet-500"
          fields={[{ label: 'API-токен', value: wb.token, onChange: wb.setToken, placeholder: 'eyJ...', secret: true }]}
          dateFrom={wb.dateFrom} setDateFrom={wb.setDateFrom}
          dateTo={wb.dateTo}     setDateTo={wb.setDateTo}
          loading={wb.loading}   error={wb.error}
          statusLine={wb.rowCount !== null
            ? `Загружено ${wb.rowCount.toLocaleString('ru')} строк · ${wb.rows.length} SKU`
            : localProxy === true
              ? '🟢 Локальный прокси подключён — запросы идут с вашего IP'
              : localProxy === false
                ? '🔴 Локальный прокси не запущен — запросы идут через облако (может блокироваться WB)'
                : undefined}
          onLoad={wb.loadReport}
          onClear={hasData ? wb.clear : undefined}
          hasData={hasData}
        />

        {hasData ? (
          <>
            <ActionBar filter={wb.filter} setFilter={wb.setFilter}
              hasCosts={wb.hasCosts} costsCount={Object.keys(wb.costs).length}
              onExport={handleExport} />
            <div className="flex-1 overflow-auto">
              <SkuTable rows={wb.calculatedRows} costs={wb.costs}
                editingArticle={editingArticle} setEditing={setEditingArticle}
                updateCost={wb.updateCost} />
            </div>
          </>
        ) : (
          !wb.loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <div className="w-14 h-14 mx-auto bg-muted/20 border border-border/50 flex items-center justify-center">
                  <Key className="w-6 h-6 text-violet-400" />
                </div>
                <div>
                  <p className="text-base font-medium">Подключение к Wildberries API</p>
                  <p className="text-xs text-muted-foreground mt-1">Вставьте API-токен в поле выше и нажмите «Загрузить»</p>
                </div>

                {/* Local proxy status */}
                <div className={`text-[11px] border px-4 py-2 text-left ${localProxy ? 'border-green-500/40 bg-green-950/20 text-green-400' : 'border-yellow-500/40 bg-yellow-950/20 text-yellow-400'}`}>
                  {localProxy
                    ? '🟢 Локальный прокси работает — запросы идут с вашего IP'
                    : '🔴 Локальный прокси не запущен. WB блокирует облачные IP.'}
                </div>

                <div className="text-[11px] text-left border border-border/40 bg-muted/10 px-4 py-3 space-y-1.5 text-muted-foreground">
                  <p className="font-medium text-foreground mb-2">Шаг 1 — токен:</p>
                  <p>1. Откройте dev.wildberries.ru</p>
                  <p>2. Создайте API-ключ с правом «Статистика»</p>
                  <p>3. Вставьте в поле «API-токен» выше</p>
                </div>

                <div className="text-[11px] text-left border border-violet-500/30 bg-violet-950/10 px-4 py-3 space-y-1.5 text-muted-foreground">
                  <p className="font-medium text-foreground mb-2">Шаг 2 — локальный прокси (обязательно):</p>
                  <p>WB блокирует облачные сервера. Запустите прокси на своём компьютере:</p>
                  <p className="mt-2 font-mono text-[10px] bg-muted/20 px-2 py-1 rounded text-foreground select-all">
                    node local-wb-proxy.mjs
                  </p>
                  <p className="mt-1">Файл <span className="font-mono">local-wb-proxy.mjs</span> — в корне проекта.</p>
                  <p>После запуска статус выше изменится на 🟢.</p>
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
type TabId = 'ozon' | 'yandex' | 'wildberries';

const TABS: { id: TabId; label: string; badgeClass: string }[] = [
  { id: 'ozon',        label: 'Ozon',          badgeClass: 'text-blue-400'   },
  { id: 'yandex',      label: 'Яндекс Маркет', badgeClass: 'text-yellow-400' },
  { id: 'wildberries', label: 'Wildberries',   badgeClass: 'text-violet-400' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('ozon');
  const [tax, setTax] = useState<TaxSettings>({ type: 'usn_income', rate: 0.06 });

  // File-based hooks (Ozon + YM)
  const ozonFile   = useMarketplace('ozon',   tax, setTax);
  const yandexFile = useMarketplace('yandex', tax, setTax);
  // API-based hooks
  const ozonApi    = useOzonApi(tax, setTax);
  const ymApi      = useYmApi(tax, setTax);
  const wb         = useWildberries(tax, setTax);

  // SKU counts from whichever source has data
  const skuCounts: Record<TabId, number> = {
    ozon:        ozonFile.rows.length  || ozonApi.rows.length,
    yandex:      yandexFile.rows.length || ymApi.rows.length,
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

        <select className="h-7 text-xs bg-muted border border-border rounded-none px-2 text-foreground"
          value={tax.type}
          onChange={e => {
            const opt = TAX_OPTIONS.find(o => o.type === e.target.value);
            if (opt) setTax({ type: opt.type, rate: opt.rate });
          }}>
          {TAX_OPTIONS.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
      </header>

      {/* CONTENT */}
      {activeTab === 'ozon'        && <OzonTabContent  mp={ozonFile}   api={ozonApi} />}
      {activeTab === 'yandex'      && <YmTabContent    mp={yandexFile} api={ymApi}   />}
      {activeTab === 'wildberries' && <WbTabContent    wb={wb} />}
    </div>
  );
}
