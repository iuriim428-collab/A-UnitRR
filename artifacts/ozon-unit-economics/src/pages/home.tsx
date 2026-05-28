import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useMarketplace, FilterType, MarketplaceKind } from '../hooks/use-marketplace';
import { useOzonApi } from '../hooks/use-ozon-api';
import { useYmApi } from '../hooks/use-ym-api';
import { useWildberries } from '../hooks/use-wildberries';
import { usePerfApi, type PerfCampaign } from '../hooks/use-perf-api';
import { supportsFolderPicker, pickFolder } from '../lib/folder-reader';
import { exportToExcel } from '../lib/excel';
import { isLocalProxyAvailable, WBAnalyticsItem } from '../lib/wb-api';
import { formatCurrency, formatPercent, formatNumber } from '../lib/utils';
import { TaxSettings, TaxType, CalculatedRow, ReportSummary } from '../types';
import {
  Upload, Download, Trash2, FolderOpen, FileSpreadsheet,
  Pencil, CheckCircle, AlertCircle, RefreshCw, Key, Calendar,
  Eye, EyeOff, Folder, Globe, Megaphone, TrendingUp, ChevronDown, ChevronUp,
  Search, X, ChevronsUpDown, BarChart2,
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
function SummarySidebar({ s, hasCosts, adSpend, setAdSpend, perfTotal, promotionLabel }: {
  s: ReportSummary; hasCosts: boolean; adSpend: number; setAdSpend: (v: number) => void;
  perfTotal?: number; promotionLabel?: string;
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
      <MetricRow label={promotionLabel ?? 'Прод. на платформе'} value={s.promotion > 0 ? `-${formatCurrency(s.promotion)}` : '—'} />
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
      <SectionHdr>Реклама {perfTotal !== undefined && perfTotal > 0 ? <span className="text-yellow-400/70 normal-case">· Performance API</span> : '(общие)'}</SectionHdr>
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
function SkuTable({ rows, costs, editingArticle, setEditing, updateCost, spendByArticle, analyticsByArticle, selectedArticles, onToggleSelect }: {
  rows: CalculatedRow[];
  costs: Record<string, { costPerUnit: number; vatRate: number }>;
  editingArticle: string | null;
  setEditing: (a: string | null) => void;
  updateCost: (article: string, field: 'costPerUnit' | 'vatRate', value: number) => void;
  spendByArticle?: Record<string, number>;
  analyticsByArticle?: Record<string, WBAnalyticsItem>;
  selectedArticles?: Set<string>;
  onToggleSelect?: (row: CalculatedRow) => void;
}) {
  type SortKey = 'article' | 'name' | 'salesCount' | 'returnsCount' | 'avgPrice' | 'netSales'
    | 'ozonCommission' | 'deliveryServices' | 'agentServices' | 'storage' | 'drr'
    | 'views' | 'cartPct' | 'buyoutPct'
    | 'costTotal' | 'taxAmount' | 'netProfit' | 'marginPercent' | 'costMargin' | 'profitPerUnit';

  const [nameFilter, setNameFilter] = useState('');
  const [sortKey, setSortKey]       = useState<SortKey | null>(null);
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');

  const abcMap = useMemo(() => computeAbcMap(rows), [rows]);
  const hasPerfData  = spendByArticle !== undefined;
  const hasDrrData   = hasPerfData || rows.some(r => (r.promotion ?? 0) > 0);
  const hasAnalytics = analyticsByArticle !== undefined && Object.keys(analyticsByArticle).length > 0;

  const filteredRows = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) || r.article.toLowerCase().includes(q)
    );
  }, [rows, nameFilter]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...filteredRows].sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      const spend = (r: CalculatedRow) => spendByArticle?.[r.article] ?? (r.promotion ?? 0);
      switch (sortKey) {
        case 'article':        va = a.article;                                  vb = b.article; break;
        case 'name':           va = a.name;                                     vb = b.name; break;
        case 'salesCount':     va = a.salesCount;                               vb = b.salesCount; break;
        case 'returnsCount':   va = a.returnsCount;                             vb = b.returnsCount; break;
        case 'avgPrice':       va = a.avgPrice;                                 vb = b.avgPrice; break;
        case 'netSales':       va = a.netSales;                                 vb = b.netSales; break;
        case 'ozonCommission': va = a.ozonCommission;                           vb = b.ozonCommission; break;
        case 'deliveryServices': va = a.deliveryServices;                       vb = b.deliveryServices; break;
        case 'agentServices':  va = a.agentServices;                            vb = b.agentServices; break;
        case 'storage':        va = a.storage + a.fboServices;                  vb = b.storage + b.fboServices; break;
        case 'drr':            va = a.netSales > 0 ? spend(a) / a.netSales * 100 : 0; vb = b.netSales > 0 ? spend(b) / b.netSales * 100 : 0; break;
        case 'views':          va = analyticsByArticle?.[a.article]?.openCardCount ?? 0;   vb = analyticsByArticle?.[b.article]?.openCardCount ?? 0; break;
        case 'cartPct':        va = analyticsByArticle?.[a.article]?.addToCartConversion ?? 0; vb = analyticsByArticle?.[b.article]?.addToCartConversion ?? 0; break;
        case 'buyoutPct':      va = analyticsByArticle?.[a.article]?.buyoutsPercent ?? 0;  vb = analyticsByArticle?.[b.article]?.buyoutsPercent ?? 0; break;
        case 'costTotal':      va = a.costTotal;                                vb = b.costTotal; break;
        case 'taxAmount':      va = a.taxAmount;                                vb = b.taxAmount; break;
        case 'netProfit':      va = a.netProfit;                                vb = b.netProfit; break;
        case 'marginPercent':  va = a.marginPercent;                            vb = b.marginPercent; break;
        case 'costMargin':     va = a.costTotal > 0 ? a.netProfit / a.costTotal * 100 : -1e9; vb = b.costTotal > 0 ? b.netProfit / b.costTotal * 100 : -1e9; break;
        case 'profitPerUnit':  va = a.salesCount > 0 ? a.netProfit / a.salesCount : -1e9;     vb = b.salesCount > 0 ? b.netProfit / b.salesCount : -1e9; break;
      }
      if (typeof va === 'string') return dir * va.localeCompare(vb as string, 'ru');
      return dir * ((va as number) - (vb as number));
    });
  }, [filteredRows, sortKey, sortDir, spendByArticle, analyticsByArticle]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const totalRevenue    = useMemo(() => filteredRows.reduce((s, r) => s + r.netSales,         0), [filteredRows]);
  const totalProfit     = useMemo(() => filteredRows.reduce((s, r) => s + r.netProfit,        0), [filteredRows]);
  const totalSales      = useMemo(() => filteredRows.reduce((s, r) => s + r.salesCount,       0), [filteredRows]);
  const totalReturns    = useMemo(() => filteredRows.reduce((s, r) => s + r.returnsCount,     0), [filteredRows]);
  const totalCommission = useMemo(() => filteredRows.reduce((s, r) => s + r.ozonCommission,   0), [filteredRows]);
  const totalDelivery   = useMemo(() => filteredRows.reduce((s, r) => s + r.deliveryServices, 0), [filteredRows]);
  const totalAgent      = useMemo(() => filteredRows.reduce((s, r) => s + r.agentServices,    0), [filteredRows]);
  const totalStorage    = useMemo(() => filteredRows.reduce((s, r) => s + r.storage + r.fboServices, 0), [filteredRows]);
  const totalCost       = useMemo(() => filteredRows.reduce((s, r) => s + r.costTotal,        0), [filteredRows]);
  const totalTax        = useMemo(() => filteredRows.reduce((s, r) => s + r.taxAmount,        0), [filteredRows]);

  const SortIcon = ({ sk }: { sk: SortKey }) => sortKey === sk
    ? (sortDir === 'desc' ? <ChevronDown className="w-2.5 h-2.5 text-primary ml-0.5" /> : <ChevronUp className="w-2.5 h-2.5 text-primary ml-0.5" />)
    : <ChevronsUpDown className="w-2.5 h-2.5 opacity-20 ml-0.5" />;

  const Th = ({ sk, label, className, title }: { sk: SortKey; label: React.ReactNode; className?: string; title?: string }) => (
    <th title={title} onClick={() => toggleSort(sk)}
      className={`px-3 py-2 font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${className ?? 'text-right'} ${sortKey === sk ? 'text-foreground' : ''}`}>
      <span className={`flex items-center gap-0 ${(className ?? 'text-right').includes('text-left') ? '' : 'justify-end'}`}>
        {label}<SortIcon sk={sk} />
      </span>
    </th>
  );

  return (
    <>
      {/* ── Name filter bar ── */}
      <div className="sticky top-0 z-20 bg-card border-b border-border/50 px-3 py-1.5 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
        <input
          type="text"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          placeholder="Фильтр по названию или артикулу…"
          className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40"
        />
        {nameFilter && (
          <button
            onClick={() => setNameFilter('')}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" />
            {filteredRows.length} из {rows.length}
          </button>
        )}
        {!nameFilter && rows.length > 0 && (
          <span className="text-[10px] text-muted-foreground/40">{rows.length} SKU</span>
        )}
      </div>

      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-[33px] z-10 bg-card">
          <tr className="border-b border-border">
            {onToggleSelect && (
              <th className="w-8 px-2 py-2 text-center text-[9px] text-muted-foreground/40 font-normal">
                {(selectedArticles?.size ?? 0) > 0 ? selectedArticles!.size : ''}
              </th>
            )}
            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap text-center">ABC</th>
            <Th sk="article"          label="Артикул"    className="text-left" />
            <Th sk="name"             label="Название"   className="text-left" />
            <Th sk="salesCount"       label="Прод." />
            <Th sk="returnsCount"     label="Возвр." />
            <Th sk="avgPrice"         label="Ср. цена" />
            <Th sk="netSales"         label="Выручка" />
            <Th sk="ozonCommission"   label="Комиссия" />
            <Th sk="deliveryServices" label="Доставка" />
            <Th sk="agentServices"    label="Партнёры" />
            <Th sk="storage"          label="Хранение" />
            {hasDrrData && (
              <Th sk="drr" label={
                <span className="text-yellow-400/80 flex items-center gap-1">
                  <Megaphone className="w-2.5 h-2.5" />ДРР%
                  {!hasPerfData && <span className="text-[9px] text-muted-foreground/50">(транз.)</span>}
                </span>
              } />
            )}
            {hasAnalytics && (
              <>
                <Th sk="views"    label={<span className="text-sky-400/80 flex items-center gap-1"><Eye className="w-2.5 h-2.5" />Просм.</span>} />
                <Th sk="cartPct"  label={<span className="text-sky-400/80">В корз.%</span>} />
                <Th sk="buyoutPct" label={<span className="text-sky-400/80">Выкуп%</span>} />
              </>
            )}
            <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
              <span className="flex items-center justify-end gap-1">Себест. <Pencil className="w-2.5 h-2.5 text-primary/60" /></span>
            </th>
            <Th sk="taxAmount"    label="Налог" />
            <Th sk="netProfit"    label="Прибыль" />
            <Th sk="marginPercent" label="Маржа" />
            <Th sk="costMargin"   label={<span className="text-emerald-400/80">М/закуп.</span>} title="Прибыль / Себестоимость × 100%" />
            <Th sk="profitPerUnit" label="Приб./шт" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => {
            const isEditing = editingArticle === row.article;
            const c   = costs[row.article] ?? { costPerUnit: 0, vatRate: 0 };
            const abc = abcMap.get(row.article);
            // Use Performance API spend if available, otherwise fall back to transaction-level promotion
            const perfSpend = spendByArticle?.[row.article] ?? (row.promotion ?? 0);
            const perfDrr   = (perfSpend > 0 && row.netSales > 0) ? (perfSpend / row.netSales) * 100 : 0;
            const costMargin = row.costTotal > 0 ? (row.netProfit / row.costTotal) * 100 : null;
            const isSelected = selectedArticles?.has(row.article) ?? false;
            return (
              <tr key={row.article} className={`border-b border-border/30 hover:bg-muted/20 ${isSelected ? 'bg-emerald-500/5' : idx % 2 ? 'bg-muted/5' : ''}`}>
                {onToggleSelect && (
                  <td className="w-8 px-2 py-1.5 text-center">
                    <input type="checkbox" checked={isSelected}
                      onChange={() => onToggleSelect(row)}
                      onClick={e => e.stopPropagation()}
                      className="w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                    />
                  </td>
                )}
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
                {hasDrrData && (
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {perfDrr > 0
                      ? <span className={perfDrr > 30 ? 'text-red-400' : perfDrr > 15 ? 'text-yellow-400' : 'text-green-400/80'}>
                          {perfDrr.toFixed(1)}%
                        </span>
                      : <span className="text-muted-foreground/30">—</span>
                    }
                  </td>
                )}
                {hasAnalytics && (() => {
                  const an = analyticsByArticle?.[row.article];
                  return (
                    <>
                      <td className="px-3 py-1.5 text-right tabular-nums text-sky-400/70">
                        {an?.openCardCount ? formatNumber(an.openCardCount) : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-sky-400/70">
                        {an?.addToCartConversion ? `${an.addToCartConversion.toFixed(1)}%` : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-sky-400/70">
                        {an?.buyoutsPercent ? `${an.buyoutsPercent.toFixed(1)}%` : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    </>
                  );
                })()}
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
                <td className={`px-3 py-1.5 text-right tabular-nums ${costMargin === null ? 'text-muted-foreground/30' : costMargin > 30 ? 'text-emerald-400' : costMargin > 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {costMargin !== null ? `${costMargin.toFixed(1)}%` : '—'}
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${row.netProfit >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
                  {row.salesCount > 0 ? formatCurrency(row.netProfit / row.salesCount) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 z-10 bg-card border-t-2 border-border/60">
          <tr>
            <td colSpan={onToggleSelect ? 4 : 3} className="px-3 py-1.5 text-[10px] text-muted-foreground/60 font-medium">
              {nameFilter ? `Итого (фильтр): ${filteredRows.length} SKU` : `Итого: ${rows.length} SKU`}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-foreground">
              {formatNumber(totalSales)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-red-400/70">
              {totalReturns > 0 ? formatNumber(totalReturns) : '—'}
            </td>
            <td />
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-foreground">
              {formatCurrency(totalRevenue)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-orange-400/80">
              {totalCommission > 0 ? `-${formatCurrency(totalCommission)}` : '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-blue-400/80">
              {totalDelivery > 0 ? `-${formatCurrency(totalDelivery)}` : '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-purple-400/80">
              {totalAgent > 0 ? `-${formatCurrency(totalAgent)}` : '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-cyan-400/80">
              {totalStorage > 0 ? `-${formatCurrency(totalStorage)}` : '—'}
            </td>
            {hasDrrData && <td />}
            {hasAnalytics && <td colSpan={3} />}
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-muted-foreground">
              {totalCost > 0 ? `-${formatCurrency(totalCost)}` : '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-muted-foreground">
              {totalTax > 0 ? `-${formatCurrency(totalTax)}` : '—'}
            </td>
            <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(totalProfit)}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </>
  );
}

// ─── Performance API bar ──────────────────────────────────────────────────────
function PerfApiBar({ clientId, setClientId, clientSecret, setClientSecret,
  loading, progress, error, hasData, onLoad, onClear, onLoadFromAnalytics, canLoadFromAnalytics }: {
  clientId: string; setClientId: (v: string) => void;
  clientSecret: string; setClientSecret: (v: string) => void;
  loading: boolean; progress: string | null; error: string | null; hasData: boolean;
  onLoad: () => void; onClear: () => void;
  onLoadFromAnalytics?: () => void;
  canLoadFromAnalytics?: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex-none border-b border-yellow-500/20 bg-yellow-500/5 text-[11px]" onClick={e => e.stopPropagation()}>
      {/* Primary row: Analytics API button (simpler, no extra creds) */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-2">
        <Megaphone className="w-3.5 h-3.5 text-yellow-400/80 flex-shrink-0" />
        <span className="text-yellow-400/80 font-medium whitespace-nowrap">Реклама:</span>

        {/* Analytics API — uses existing Seller credentials */}
        {onLoadFromAnalytics && (
          <button onClick={onLoadFromAnalytics} disabled={loading || !canLoadFromAnalytics}
            title={!canLoadFromAnalytics ? 'Сначала введите Seller API credentials выше' : 'Загрузить рекламные расходы из Ozon Analytics (adv_sum_all per SKU)'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">
            {loading
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Загружаю…</>
              : <><TrendingUp className="w-3.5 h-3.5" />Из Analytics API</>
            }
          </button>
        )}

        {/* Performance API toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-muted-foreground hover:text-yellow-400/80 px-2 py-1 border border-yellow-500/20 transition-colors">
          Performance API
          {expanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
        </button>

        {hasData && (
          <button onClick={onClear} className="flex items-center gap-1 text-muted-foreground hover:text-red-400 px-2 py-1 border border-border/50">
            <Trash2 className="w-3 h-3" /> Сбросить
          </button>
        )}
      </div>

      {/* Performance API credentials — collapsed by default */}
      {expanded && (
        <div className="flex items-center gap-3 flex-wrap px-4 pb-2 border-t border-yellow-500/10 pt-2">
          <span className="text-muted-foreground whitespace-nowrap">Отдельный аккаунт Performance:</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
            <span className="text-muted-foreground whitespace-nowrap">Client-Id:</span>
            <input type="text" value={clientId} onChange={e => setClientId(e.target.value)}
              placeholder="12345"
              className="flex-1 bg-muted/30 border border-yellow-500/30 px-2 py-1 text-[11px] font-mono outline-none focus:border-yellow-500/60 placeholder:text-muted-foreground/40" />
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <span className="text-muted-foreground whitespace-nowrap">Client-Secret:</span>
            <div className="relative flex-1">
              <input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                placeholder="xxxxxxxx-xxxx-…"
                className="w-full bg-muted/30 border border-yellow-500/30 px-2 py-1 pr-7 text-[11px] font-mono outline-none focus:border-yellow-500/60 placeholder:text-muted-foreground/40" />
              <button onClick={() => setShowSecret(v => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
                {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
          </div>
          <button onClick={onLoad} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white disabled:opacity-50 transition-colors font-medium">
            {loading
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />{progress ?? 'Загружаю…'}</>
              : <><TrendingUp className="w-3.5 h-3.5" />Загрузить</>
            }
          </button>
        </div>
      )}

      {/* Progress indicator for Analytics API load */}
      {loading && progress && !expanded && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-yellow-400/80 text-[10px]">
          <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0" />
          <span>{progress}</span>
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-red-400 border border-red-400/20 bg-red-400/5 px-3 py-1">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /><span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── Campaigns panel ──────────────────────────────────────────────────────────
function CampaignsPanel({ campaigns, spendByArticle, source, totalSpend: totalSpendProp, onClear }: {
  campaigns: PerfCampaign[];
  spendByArticle: Record<string, number>;
  source?: 'performance' | 'analytics';
  totalSpend?: number;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isAnalytics  = source === 'analytics' || campaigns.length === 0;
  const totalSpend   = isAnalytics
    ? (totalSpendProp ?? Object.values(spendByArticle).reduce((s, v) => s + v, 0))
    : campaigns.reduce((s, c) => s + c.moneySpent, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const totalOrders  = campaigns.reduce((s, c) => s + c.orders, 0);
  const totalDrr     = totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : 0;
  const skuCount     = Object.keys(spendByArticle).length;

  return (
    <div className="flex-none border-b border-yellow-500/20 bg-yellow-500/5">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] cursor-pointer hover:bg-yellow-500/10"
        onClick={() => !isAnalytics && setExpanded(v => !v)}>
        <Megaphone className="w-3.5 h-3.5 text-yellow-400/80 flex-shrink-0" />
        <span className="font-medium text-yellow-400/80">
          {isAnalytics ? 'Реклама (Analytics API)' : 'Performance API'}
        </span>
        <span className="text-muted-foreground">
          {isAnalytics
            ? <>
                {skuCount > 0 && `${skuCount} SKU`}
                {totalSpend > 0 && ` · -${formatCurrency(totalSpend)}`}
                {' · '}расходы на рекламу
              </>
            : <>
                {campaigns.length} {campaigns.length === 1 ? 'кампания' : campaigns.length < 5 ? 'кампании' : 'кампаний'}
                {' · '}-{formatCurrency(totalSpend)}
                {' · '}ДРР {totalDrr > 0 ? `${totalDrr.toFixed(1)}%` : '—'}
                {totalOrders > 0 && ` · ${formatNumber(totalOrders)} заказов`}
                {skuCount > 0 && ` · ${skuCount} SKU`}
              </>
          }
        </span>
        <div className="flex-1" />
        <button onClick={e => { e.stopPropagation(); onClear(); }}
          className="text-muted-foreground/40 hover:text-red-400 px-1 text-xs" title="Сбросить рекламные данные">✕</button>
        {!isAnalytics && (expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </div>

      {!isAnalytics && expanded && (
        <div className="border-t border-yellow-500/20 overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border/30 bg-card/50">
                {['Кампания','Тип','Статус','Товаров','Расход','Показы','Клики','CTR','Заказы','Выручка с рекл.','ДРР'].map((h, i) => (
                  <th key={h} className={`px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap ${i < 3 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => {
                const ctr = (c.clicks > 0 && c.views > 0) ? (c.clicks / c.views * 100) : 0;
                return (
                  <tr key={c.id} className="border-b border-border/20 hover:bg-muted/10">
                    <td className="px-3 py-1.5 max-w-[200px] truncate font-medium" title={c.title}>{c.title || c.id}</td>
                    <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{c.type}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 ${c.state.includes('RUNNING') ? 'bg-green-500/20 text-green-400' : 'bg-muted/30 text-muted-foreground'}`}>
                        {c.state.replace('CAMPAIGN_STATE_', '')}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{c.productsCount || '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-400/80">{c.moneySpent > 0 ? `-${formatCurrency(c.moneySpent)}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{c.views > 0 ? formatNumber(c.views) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{c.clicks > 0 ? formatNumber(c.clicks) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{ctr > 0 ? `${ctr.toFixed(2)}%` : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{c.orders > 0 ? formatNumber(c.orders) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{c.revenue > 0 ? formatCurrency(c.revenue) : '—'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${c.drr > 30 ? 'text-red-400' : c.drr > 15 ? 'text-yellow-400' : c.drr > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {c.drr > 0 ? `${c.drr.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
function OzonTabContent({ mp, api, selectedArticles, onToggleSelect }: {
  mp: ReturnType<typeof useMarketplace>;
  api: ReturnType<typeof useOzonApi>;
  selectedArticles?: Set<string>;
  onToggleSelect?: (row: CalculatedRow) => void;
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

  const perfApi = usePerfApi();

  // Auto-apply Performance API total spend when report loads
  useEffect(() => {
    if (perfApi.report) {
      const total = Object.values(perfApi.report.spendByArticle).reduce((s, v) => s + v, 0);
      if (total > 0) setAdSpend(Math.round(total));
    }
  }, [perfApi.report]);

  // Active data source
  const active  = mode === 'files' ? mp  : api;
  const hasData = active.rows.length > 0;

  // Date range used for Performance API (from api or today-range)
  const perfDateFrom = api.dateFrom;
  const perfDateTo   = api.dateTo;

  const handleSelectFolder = async () => {
    try { const h = await pickFolder(); if (h) await mp.loadFolder(h); } catch {}
  };

  const perfTotal = useMemo(() => {
    if (!perfApi.report) return undefined;
    return Object.values(perfApi.report.spendByArticle).reduce((s, v) => s + v, 0);
  }, [perfApi.report]);

  const mkExport = (prefix: string) => () => exportToExcel(
    active.calculatedRows.map(r => ({
      'Артикул': r.article, 'Название': r.name,
      'Продажи, шт': r.salesCount, 'Возвраты, шт': r.returnsCount,
      'Выручка, руб': r.netSales, 'Комиссия, руб': r.ozonCommission,
      'Доставка, руб': r.deliveryServices, 'Партнёры, руб': r.agentServices,
      'Продвижение, руб': r.promotion, 'Хранение, руб': r.storage,
      'Себестоимость, руб': r.costTotal, 'Налог, руб': r.taxAmount,
      'Прибыль, руб': r.netProfit, 'Маржа, %': r.marginPercent.toFixed(1),
      ...(perfApi.report ? { 'ДРР, %': ((perfApi.report.spendByArticle[r.article] ?? 0) / (r.netSales || 1) * 100).toFixed(1) } : {}),
    })),
    `${prefix}_unit_economics.xlsx`
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasData && (
        <SummarySidebar s={active.summary} hasCosts={active.hasCosts}
          adSpend={adSpend} setAdSpend={setAdSpend} perfTotal={perfTotal} />
      )}
      <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setEditingArticle(null)}>

        {/* Mode toggle always visible when no data */}
        {!hasData && (
          <div className="flex-none flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-card">
            <span className="text-[11px] text-muted-foreground">Источник данных:</span>
            <ModeToggle mode={mode} onChange={changeMode} />
          </div>
        )}

        {/* Seller API settings */}
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

        {/* Performance API bar — always shown in API mode, or in any mode when data is loaded */}
        {(mode === 'api' || hasData) && (
          <PerfApiBar
            clientId={perfApi.clientId}       setClientId={perfApi.setClientId}
            clientSecret={perfApi.clientSecret} setClientSecret={perfApi.setClientSecret}
            loading={perfApi.loading} progress={perfApi.progress} error={perfApi.error}
            hasData={!!perfApi.report}
            onLoad={() => perfApi.load(perfDateFrom, perfDateTo)}
            onClear={perfApi.clear}
            onLoadFromAnalytics={() => perfApi.loadFromAnalytics(api.clientId, api.apiKey, perfDateFrom, perfDateTo)}
            canLoadFromAnalytics={!!(api.clientId.trim() && api.apiKey.trim())}
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

            {perfApi.report && (
              <CampaignsPanel
                campaigns={perfApi.report.campaigns}
                spendByArticle={perfApi.report.spendByArticle}
                source={perfApi.report.source}
                totalSpend={perfApi.report.totalSpend}
                onClear={perfApi.clear}
              />
            )}

            <div className="flex-1 overflow-auto">
              <SkuTable rows={active.calculatedRows} costs={active.costs}
                editingArticle={editingArticle} setEditing={setEditingArticle}
                updateCost={active.updateCost}
                spendByArticle={perfApi.report?.spendByArticle}
                selectedArticles={selectedArticles} onToggleSelect={onToggleSelect} />
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
function YmTabContent({ mp, api, selectedArticles, onToggleSelect }: {
  mp:  ReturnType<typeof useMarketplace>;
  api: ReturnType<typeof useYmApi>;
  selectedArticles?: Set<string>;
  onToggleSelect?: (row: CalculatedRow) => void;
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

  // spendByArticle = API auction promotion + manual adSpend distributed by revenue share
  const ymSpendByArticle = useMemo(() => {
    const rows = active.calculatedRows;
    const hasApiSpend = rows.some(r => (r.promotion ?? 0) > 0);
    if (!hasApiSpend && adSpend === 0) return undefined;
    const totalRevenue = rows.reduce((s, r) => s + r.netSales, 0);
    return Object.fromEntries(
      rows.map(r => [
        r.article,
        (r.promotion ?? 0) +
        (adSpend > 0 && totalRevenue > 0 ? adSpend * (r.netSales / totalRevenue) : 0),
      ])
    );
  }, [active.calculatedRows, adSpend]);

  const handleSelectFolder = async () => {
    try { const h = await pickFolder(); if (h) await mp.loadFolder(h); } catch {}
  };

  const mkExport = () => exportToExcel(
    active.calculatedRows.map(r => ({
      'Артикул': r.article, 'Название': r.name,
      'Продажи, шт': r.salesCount, 'Возвраты, шт': r.returnsCount,
      'Выручка, руб': r.netSales,
      'Комиссия ЯМ, руб': r.ozonCommission,
      'Доставка, руб': r.deliveryServices,
      'Реклама (аукцион), руб': r.promotion,
      'Себестоимость, руб': r.costTotal, 'Налог, руб': r.taxAmount,
      'Прибыль, руб': r.netProfit, 'Маржа, %': r.marginPercent.toFixed(1),
    })),
    'yandex_unit_economics.xlsx'
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasData && (
        <SummarySidebar
          s={active.summary} hasCosts={active.hasCosts}
          adSpend={adSpend} setAdSpend={setAdSpend}
          promotionLabel="Реклама (аукцион)"
        />
      )}
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
              { label: 'Api-Key', value: api.token,      onChange: api.setToken,      placeholder: 'ЯНДЕКС_АПИ_КЛЮЧ…', secret: true },
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
                updateCost={active.updateCost}
                spendByArticle={ymSpendByArticle}
                selectedArticles={selectedArticles} onToggleSelect={onToggleSelect} />
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
                hint="Введите Api-Key и ID кампании выше, затем нажмите «Загрузить»"
                steps={[
                  '1. Откройте partner.market.yandex.ru',
                  '2. Настройки → Доступ по API → «Создать токен»',
                  '3. Скопируйте Api-Key и вставьте выше',
                  '4. ID кампании — в URL кабинета:',
                  '   .../business/.../campaigns/{ID}/...',
                  '5. Доступны: продажи, комиссия, возвраты',
                ]}
              />
            )
        )}
      </div>
    </div>
  );
}

// ─── WB tab ───────────────────────────────────────────────────────────────────
function WbTabContent({ wb, selectedArticles, onToggleSelect }: {
  wb: ReturnType<typeof useWildberries>;
  selectedArticles?: Set<string>;
  onToggleSelect?: (row: CalculatedRow) => void;
}) {
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
          fields={[
            { label: 'API-токен', value: wb.token, onChange: wb.setToken, placeholder: 'eyJ...', secret: true },
            { label: 'Аналитика', value: wb.analyticsToken, onChange: wb.setAnalyticsToken, placeholder: 'если отличается', secret: true },
            { label: 'Реклама', value: wb.advertToken, onChange: wb.setAdvertToken, placeholder: 'если отличается', secret: true },
          ]}
          dateFrom={wb.dateFrom} setDateFrom={wb.setDateFrom}
          dateTo={wb.dateTo}     setDateTo={wb.setDateTo}
          loading={wb.loading}   error={wb.error}
          statusLine={wb.rowCount !== null
            ? [
                `Загружено ${wb.rowCount.toLocaleString('ru')} строк · ${wb.rows.length} SKU`,
                wb.methodLabel ?? '',
                wb.analyticsLoading ? '⏳ аналитика…'
                  : wb.analyticsError ? `⚠ аналитика: ${wb.analyticsError}`
                  : wb.hasAnalytics ? `📊 аналитика: ${Object.keys(wb.analytics).length} SKU`
                  : '',
                wb.advertLoading ? '⏳ реклама…'
                  : wb.advertError ? `⚠ реклама: ${wb.advertError}`
                  : wb.hasAdvert ? `📣 реклама: ${Object.keys(wb.advertSpendByArticle).length} SKU`
                  : '',
              ].filter(Boolean).join(' · ')
            : localProxy === true
              ? '🟢 Локальный прокси доступен · автоматически будет использован если нужно'
              : localProxy === false
                ? '🌐 Попробуем прямое соединение с WB (с вашего IP браузера)'
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
                updateCost={wb.updateCost}
                spendByArticle={wb.hasAdvert ? wb.advertSpendByArticle : undefined}
                analyticsByArticle={wb.hasAnalytics ? wb.analytics : undefined}
                selectedArticles={selectedArticles} onToggleSelect={onToggleSelect} />
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

// ─── Settings export / import ─────────────────────────────────────────────────
const SETTINGS_KEYS = [
  'ozon_api_client_id', 'ozon_api_api_key', 'costs_ozon_api',
  'perf_api_client_id', 'perf_api_client_secret',
  'costs_ozon_file',
  'ym_api_token', 'ym_api_campaign_id', 'costs_ym_api', 'costs_yandex_file',
  'wb_api_token', 'wb_analytics_token', 'wb_advert_token', 'costs_wb_api',
  'ozon_ad_spend', 'ym_ad_spend', 'wb_ad_spend',
];

function exportSettings() {
  const data: Record<string, string> = {};
  for (const k of SETTINGS_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'unit-economics-settings.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importSettings(file: File, onDone: () => void) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target?.result as string) as Record<string, string>;
      for (const [k, v] of Object.entries(data)) {
        if (SETTINGS_KEYS.includes(k) && typeof v === 'string') {
          localStorage.setItem(k, v);
        }
      }
      onDone();
    } catch { alert('Не удалось прочитать файл настроек'); }
  };
  reader.readAsText(file);
}

// ─── Root ─────────────────────────────────────────────────────────────────────
type TabId = 'ozon' | 'yandex' | 'wildberries' | 'compare';

const TABS: { id: TabId; label: string; badgeClass: string }[] = [
  { id: 'ozon',        label: 'Ozon',          badgeClass: 'text-blue-400'   },
  { id: 'yandex',      label: 'Яндекс Маркет', badgeClass: 'text-yellow-400' },
  { id: 'wildberries', label: 'Wildberries',   badgeClass: 'text-violet-400' },
  { id: 'compare',     label: 'Сравнение',     badgeClass: 'text-emerald-400' },
];

// ─── Compare Tab ──────────────────────────────────────────────────────────────

type MpKey = 'ozon' | 'ym' | 'wb';

interface SelectedItem {
  mp: MpKey;
  row: CalculatedRow;
}

const MP_META: Record<MpKey, { label: string; headerBg: string; borderLeft: string; badge: string }> = {
  ozon: {
    label: 'Ozon',
    headerBg: 'bg-blue-500/10 text-blue-400',
    borderLeft: 'border-l border-blue-500/25',
    badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  },
  ym: {
    label: 'Яндекс Маркет',
    headerBg: 'bg-yellow-500/10 text-yellow-400',
    borderLeft: 'border-l border-yellow-500/25',
    badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
  },
  wb: {
    label: 'Wildberries',
    headerBg: 'bg-violet-500/10 text-violet-400',
    borderLeft: 'border-l border-violet-500/25',
    badge: 'bg-violet-500/20 text-violet-300 border border-violet-500/40',
  },
};

const COMPARE_MPS: MpKey[] = ['ozon', 'ym', 'wb'];

function CompareTabContent({ items, onClear }: {
  items: SelectedItem[];
  onClear: () => void;
}) {
  type SortKey = 'margin' | 'profit' | 'sales' | 'mp';
  const [sortKey, setSortKey] = useState<SortKey>('margin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      switch (sortKey) {
        case 'margin': return dir * (a.row.marginPercent - b.row.marginPercent);
        case 'profit': return dir * (a.row.netProfit - b.row.netProfit);
        case 'sales':  return dir * (a.row.salesCount - b.row.salesCount);
        case 'mp':     return dir * COMPARE_MPS.indexOf(a.mp) - COMPARE_MPS.indexOf(b.mp);
        default:       return 0;
      }
    });
  }, [items, sortKey, sortDir]);

  const perMp = useMemo(() => {
    const m = new Map<MpKey, number>();
    for (const { mp } of items) m.set(mp, (m.get(mp) ?? 0) + 1);
    return m;
  }, [items]);

  const allMargins = items.map(i => i.row.marginPercent);
  const maxMargin = allMargins.length > 1 ? Math.max(...allMargins) : null;
  const minMargin = allMargins.length > 1 ? Math.min(...allMargins) : null;

  const SortIcon = ({ sk }: { sk: SortKey }) => sortKey === sk
    ? (sortDir === 'desc' ? <ChevronDown className="w-2.5 h-2.5 text-primary ml-0.5" /> : <ChevronUp className="w-2.5 h-2.5 text-primary ml-0.5" />)
    : <ChevronsUpDown className="w-2.5 h-2.5 opacity-20 ml-0.5" />;

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-4 max-w-sm px-6">
          <BarChart2 className="w-10 h-10 mx-auto opacity-20" />
          <p className="text-sm font-medium">Выберите товары для сравнения</p>
          <p className="text-xs opacity-50 leading-relaxed">
            Отметьте чекбоксы у нужных SKU на вкладках Ozon, Яндекс Маркет или Wildberries —
            внизу появится панель с кнопкой «Сравнить»
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Header strip ── */}
      <div className="flex-none flex items-center gap-3 px-4 py-2 border-b border-border/40 bg-card text-[11px]">
        {COMPARE_MPS.map(mp => {
          const count = perMp.get(mp) ?? 0;
          if (!count) return null;
          return (
            <div key={mp} className={`flex items-center gap-2 px-3 py-1 border ${MP_META[mp].badge}`}>
              <span className="font-semibold">{MP_META[mp].label}</span>
              <span className="opacity-70">{count} SKU</span>
            </div>
          );
        })}
        <div className="flex-1" />
        <button onClick={onClear}
          className="flex items-center gap-1.5 px-2.5 py-1 text-muted-foreground hover:text-red-400 border border-border hover:border-red-500/30 transition-colors text-[10px]">
          <Trash2 className="w-3 h-3" />Очистить выбор
        </button>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('mp')}>
                <span className="flex items-center">МП<SortIcon sk="mp" /></span>
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground whitespace-nowrap">Артикул</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground whitespace-nowrap">Название</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('sales')}>
                <span className="flex items-center justify-end">Прод.<SortIcon sk="sales" /></span>
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">Выручка</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">Комиссия</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">Доставка</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">Хранение</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">Себест.</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">Налог</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('profit')}>
                <span className="flex items-center justify-end">Прибыль<SortIcon sk="profit" /></span>
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort('margin')}>
                <span className="flex items-center justify-end">Маржа%<SortIcon sk="margin" /></span>
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">Приб./шт</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ mp, row }, idx) => {
              const isBest  = maxMargin !== null && row.marginPercent === maxMargin;
              const isWorst = minMargin !== null && row.marginPercent === minMargin && minMargin < maxMargin!;
              const marginCls = isBest
                ? 'text-green-400 font-bold'
                : isWorst
                  ? 'text-red-400'
                  : row.marginPercent > 20 ? 'text-green-400/70'
                    : row.marginPercent > 5  ? 'text-yellow-400/80'
                    : 'text-red-400/70';
              const profitPerUnit = row.salesCount > 0 ? row.netProfit / row.salesCount : 0;
              return (
                <tr key={`${mp}:${row.article}`}
                  className={`border-b border-border/20 hover:bg-muted/20 ${idx % 2 ? 'bg-muted/5' : ''}`}>
                  <td className="px-3 py-1.5">
                    <span className={`inline-block px-2 py-0.5 text-[9px] font-bold ${MP_META[mp].badge}`}>
                      {MP_META[mp].label}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-medium text-primary/80 whitespace-nowrap">{row.article}</td>
                  <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={row.name}>{row.name || '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.salesCount)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(row.netSales)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-orange-400/80">{row.ozonCommission > 0 ? `-${formatCurrency(row.ozonCommission)}` : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-blue-400/80">{row.deliveryServices > 0 ? `-${formatCurrency(row.deliveryServices)}` : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-cyan-400/80">{(row.storage + (row.fboServices ?? 0)) > 0 ? `-${formatCurrency(row.storage + (row.fboServices ?? 0))}` : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.costTotal > 0 ? `-${formatCurrency(row.costTotal)}` : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.taxAmount > 0 ? `-${formatCurrency(row.taxAmount)}` : '—'}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${row.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(row.netProfit)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${marginCls}`}>{formatPercent(row.marginPercent)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${profitPerUnit >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>{formatCurrency(profitPerUnit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('ozon');
  const [tax, setTax] = useState<TaxSettings>({ type: 'usn_income', rate: 0.06 });
  const importRef = useRef<HTMLInputElement>(null);

  // File-based hooks (Ozon + YM)
  const ozonFile   = useMarketplace('ozon',   tax, setTax);
  const yandexFile = useMarketplace('yandex', tax, setTax);
  // API-based hooks
  const ozonApi    = useOzonApi(tax, setTax);
  const ymApi      = useYmApi(tax, setTax);
  const wb         = useWildberries(tax, setTax);

  // ── Compare selection state ──────────────────────────────────────────────────
  // Store only identifiers; live row data is resolved at render time so compare
  // tab always reflects the current calculated values (not a stale snapshot).
  const [compareSelection, setCompareSelection] = useState<Map<string, { mp: MpKey; article: string }>>(new Map());

  const toggleCompareItem = useCallback((mp: MpKey, row: CalculatedRow) => {
    const key = `${mp}:${row.article}`;
    setCompareSelection(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { mp, article: row.article });
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => setCompareSelection(new Map()), []);
  const openCompare  = useCallback(() => setActiveTab('compare'), []);

  const ozonSelectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const v of compareSelection.values()) if (v.mp === 'ozon') s.add(v.article);
    return s;
  }, [compareSelection]);
  const ymSelectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const v of compareSelection.values()) if (v.mp === 'ym') s.add(v.article);
    return s;
  }, [compareSelection]);
  const wbSelectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const v of compareSelection.values()) if (v.mp === 'wb') s.add(v.article);
    return s;
  }, [compareSelection]);

  // Live row lookups — resolve identifiers against current calculatedRows
  const liveOzonRows = ozonFile.calculatedRows.length > 0 ? ozonFile.calculatedRows : ozonApi.calculatedRows;
  const liveYmRows   = yandexFile.calculatedRows.length > 0 ? yandexFile.calculatedRows : ymApi.calculatedRows;
  const liveWbRows   = wb.calculatedRows;

  const compareItems = useMemo((): SelectedItem[] => {
    const byMp: Record<MpKey, Map<string, CalculatedRow>> = {
      ozon: new Map(liveOzonRows.map(r => [r.article, r])),
      ym:   new Map(liveYmRows.map(r => [r.article, r])),
      wb:   new Map(liveWbRows.map(r => [r.article, r])),
    };
    const result: SelectedItem[] = [];
    for (const { mp, article } of compareSelection.values()) {
      const row = byMp[mp].get(article);
      if (row) result.push({ mp, row });
    }
    return result;
  }, [compareSelection, liveOzonRows, liveYmRows, liveWbRows]);

  // SKU counts from whichever source has data
  const skuCounts: Record<TabId, number> = {
    ozon:        ozonFile.rows.length  || ozonApi.rows.length,
    yandex:      yandexFile.rows.length || ymApi.rows.length,
    wildberries: wb.rows.length,
    compare:     compareItems.length,
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

        {/* Desktop download */}
        <a
          href="/UnitEconomics-win-x64-v2.zip"
          download
          title="Скачать десктопную версию (Windows x64)"
          className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors text-primary whitespace-nowrap">
          <Download className="w-3.5 h-3.5" />
          <span>Скачать .exe</span>
        </a>

        {/* Settings export / import */}
        <div className="flex items-center gap-1">
          <button
            title="Экспортировать настройки (ключи API, себестоимость)"
            onClick={exportSettings}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] border border-border bg-muted hover:bg-muted/70 transition-colors text-muted-foreground hover:text-foreground">
            <Download className="w-3.5 h-3.5" />
            <span>Настройки</span>
          </button>
          <button
            title="Импортировать настройки из файла"
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] border border-border bg-muted hover:bg-muted/70 transition-colors text-muted-foreground hover:text-foreground">
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input
            ref={importRef} type="file" accept=".json" className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) importSettings(file, () => { window.location.reload(); });
              e.target.value = '';
            }}
          />
        </div>

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
      {activeTab === 'ozon'        && <OzonTabContent  mp={ozonFile}   api={ozonApi}
        selectedArticles={ozonSelectedSet} onToggleSelect={r => toggleCompareItem('ozon', r)} />}
      {activeTab === 'yandex'      && <YmTabContent    mp={yandexFile} api={ymApi}
        selectedArticles={ymSelectedSet}   onToggleSelect={r => toggleCompareItem('ym', r)} />}
      {activeTab === 'wildberries' && <WbTabContent    wb={wb}
        selectedArticles={wbSelectedSet}   onToggleSelect={r => toggleCompareItem('wb', r)} />}
      {activeTab === 'compare'     && <CompareTabContent items={compareItems} onClear={clearCompare} />}

      {/* ── Floating compare bar ── */}
      {compareSelection.size > 0 && activeTab !== 'compare' && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 bg-card border border-primary/40 shadow-xl text-xs">
          <BarChart2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-medium">
            Выбрано {compareSelection.size} SKU
          </span>
          <div className="flex gap-1.5">
            {COMPARE_MPS.map(mp => {
              const c = mp === 'ozon' ? ozonSelectedSet.size : mp === 'ym' ? ymSelectedSet.size : wbSelectedSet.size;
              if (!c) return null;
              return (
                <span key={mp} className={`px-2 py-0.5 text-[9px] font-bold ${MP_META[mp].badge}`}>
                  {MP_META[mp].label} {c}
                </span>
              );
            })}
          </div>
          <button onClick={openCompare}
            className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold">
            Сравнить →
          </button>
          <button onClick={clearCompare} title="Сбросить выбор"
            className="p-1 text-muted-foreground hover:text-red-400 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
