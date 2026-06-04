import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { CalculatedRow } from '@/types';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/ue-utils';
import { Plus, Trash2, Search, Star, MessageSquare, AlertCircle, RefreshCw, BarChart2, ChevronDown } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface Competitor {
  id: string;
  sku: string;
  name: string;
  price: number;
  rating: number | null;
  reviews: number | null;
  fetching: boolean;
  fetchError?: string;
  fetched: boolean;
}

export interface OzonAnalyticsItem {
  itemId: string;
  name: string;
  hitsViewSearch: number;
  hitsViewPdp: number;
  hitsTocart: number;
  orderedUnits: number;
  revenue: number;
  cancellations: number;
  returns: number;
  positionCategory: number;
}

type Period = 7 | 28;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getPeriodDates(period: Period): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const dateTo = today.toISOString().split('T')[0];
  const from = new Date(today);
  from.setDate(from.getDate() - period);
  return { dateFrom: from.toISOString().split('T')[0], dateTo };
}

function normalise(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function findAnalyticsMatch(
  rowName: string,
  items: OzonAnalyticsItem[],
  overrideItemId?: string,
): OzonAnalyticsItem | null {
  if (overrideItemId) return items.find(i => i.itemId === overrideItemId) ?? null;
  if (!rowName || items.length === 0) return null;
  const n = normalise(rowName);
  let m = items.find(i => normalise(i.name) === n);
  if (m) return m;
  m = items.find(i => n.startsWith(normalise(i.name)) || normalise(i.name).startsWith(n));
  if (m) return m;
  m = items.find(i => n.includes(normalise(i.name)) || normalise(i.name).includes(n));
  return m ?? null;
}

// ─── Unit-economics at a given price ─────────────────────────────────────────
interface UnitCalc {
  price: number; profit: number; margin: number;
  commAmt: number; delivPerUnit: number; costPerUnit: number;
}
function calcAtPrice(row: CalculatedRow, price: number): UnitCalc | null {
  if (row.salesCount === 0 || row.netSales === 0) return null;
  const commRate       = row.ozonCommission / row.netSales;
  const delivPerUnit   = row.deliveryServices / row.salesCount;
  const agentPerUnit   = row.agentServices / row.salesCount;
  const storagePerUnit = (row.storage + row.fboServices) / row.salesCount;
  const promPerUnit    = row.promotion / row.salesCount;
  const costPerUnit    = row.costTotal / row.salesCount;
  const taxPerUnit     = row.taxAmount / row.salesCount;
  const commAmt  = price * commRate;
  const profit   = price - commAmt - delivPerUnit - agentPerUnit - storagePerUnit - promPerUnit - costPerUnit - taxPerUnit;
  const margin   = price > 0 ? (profit / price) * 100 : 0;
  return { price, profit, margin, commAmt, delivPerUnit, costPerUnit };
}

// ─── Price-sensitivity curve ──────────────────────────────────────────────────
function buildSensitivity(row: CalculatedRow, competitors: Competitor[], steps = 60) {
  const currentPrice = row.avgPrice || (row.netSales / Math.max(row.salesCount, 1));
  const compPrices   = competitors.filter(c => c.price > 0).map(c => c.price);
  const allPrices    = [currentPrice, ...compPrices];
  const minP = Math.max(1, Math.min(...allPrices) * 0.6);
  const maxP = Math.max(...allPrices) * 1.4;
  const step = (maxP - minP) / steps;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const price = minP + i * step;
    const calc  = calcAtPrice(row, price);
    return { price: Math.round(price), profit: calc ? Math.round(calc.profit) : 0, margin: calc ? Math.round(calc.margin * 10) / 10 : 0 };
  });
}

const COMP_COLORS = ['#f472b6', '#fb923c', '#a78bfa', '#22d3ee', '#fbbf24', '#34d399'];
const fmtY = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v);

// ─── Add-competitor form ──────────────────────────────────────────────────────
function AddForm({ onAdd, clientId, apiKey }: {
  onAdd: (c: Omit<Competitor, 'id'>) => void;
  clientId: string; apiKey: string;
}) {
  const [sku, setSku]         = useState('');
  const [name, setName]       = useState('');
  const [price, setPrice]     = useState('');
  const [rating, setRating]   = useState('');
  const [reviews, setReviews] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookErr, setLookErr] = useState('');

  const canLookup = sku.trim() && clientId && apiKey;

  const lookup = async () => {
    if (!canLookup) return;
    setLoading(true); setLookErr('');
    try {
      const resp = await fetch('/api/ozon/product-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ozon-Client-Id': clientId, 'X-Ozon-Api-Key': apiKey },
        body: JSON.stringify({ sku: parseInt(sku, 10) }),
      });
      const data = await resp.json();
      if (resp.ok) {
        if (data.name)         setName(data.name);
        if (data.price)        setPrice(String(data.price));
        if (data.rating)       setRating(String(data.rating));
        if (data.reviewsCount) setReviews(String(data.reviewsCount));
      } else { setLookErr(data.error ?? 'Ошибка поиска'); }
    } catch { setLookErr('Ошибка соединения'); }
    finally { setLoading(false); }
  };

  const add = () => {
    if (!price) return;
    onAdd({ sku: sku.trim(), name: name.trim() || 'Конкурент', price: parseFloat(price) || 0,
      rating: rating ? parseFloat(rating) : null, reviews: reviews ? parseInt(reviews, 10) : null,
      fetching: false, fetched: !!name });
    setSku(''); setName(''); setPrice(''); setRating(''); setReviews(''); setLookErr('');
  };

  const inp = 'bg-muted/30 border border-border px-2 py-1 text-[11px] outline-none focus:border-primary/60 font-mono';
  return (
    <div className="border border-border/50 bg-muted/5 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50">Добавить конкурента</p>
      <div className="flex gap-2 items-center flex-wrap">
        <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Ozon SKU / item_id"
          className={`${inp} w-44`} onKeyDown={e => e.key === 'Enter' && lookup()} />
        <button onClick={lookup} disabled={!canLookup || loading}
          title={!clientId || !apiKey ? 'Нужен API-режим Ozon' : 'Найти товар в Ozon'}
          className="flex items-center gap-1.5 px-3 py-1 border border-border text-[11px] hover:bg-muted disabled:opacity-40">
          <Search className="w-3 h-3" />{loading ? 'Ищу…' : 'Найти'}
        </button>
        {lookErr && <span className="text-[10px] text-red-400">{lookErr} — введите вручную</span>}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input value={name}    onChange={e => setName(e.target.value)}    placeholder="Название (необязательно)" className={`${inp} flex-1 min-w-[160px]`} />
        <input value={price}   onChange={e => setPrice(e.target.value)}   placeholder="Цена ₽ *" type="number" min="0" className={`${inp} w-28`} />
        <input value={rating}  onChange={e => setRating(e.target.value)}  placeholder="Рейтинг" type="number" step="0.1" min="0" max="5" className={`${inp} w-24`} />
        <input value={reviews} onChange={e => setReviews(e.target.value)} placeholder="Отзывы"  type="number" min="0" className={`${inp} w-24`} />
        <button onClick={add} disabled={!price}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[11px] disabled:opacity-40 hover:opacity-90">
          <Plus className="w-3 h-3" /> Добавить
        </button>
      </div>
    </div>
  );
}

// ─── Analytics section header ─────────────────────────────────────────────────
function SectionRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-1 bg-muted/5">
        <div className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground/40">{label}</div>
      </td>
    </tr>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────
function ComparisonTable({ myRow, competitors, analytics }: {
  myRow: CalculatedRow;
  competitors: Competitor[];
  analytics: OzonAnalyticsItem | null;
}) {
  const myPrice = myRow.avgPrice || (myRow.netSales / Math.max(myRow.salesCount, 1));
  const myCalc  = calcAtPrice(myRow, myPrice);
  const compCalcs = competitors.map((c, i) => ({
    comp: c,
    calc: calcAtPrice(myRow, c.price),
    color: COMP_COLORS[i % COMP_COLORS.length],
  }));
  const colCount = 2 + compCalcs.length;

  const td  = 'px-3 py-2 text-right tabular-nums text-[11px]';
  const th  = 'px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap';
  const nda = <span className="text-muted-foreground/30 text-[10px]">н/д</span>;

  // Conversion helper
  const conv = (tocart: number, pdp: number) =>
    pdp > 0 ? `${((tocart / pdp) * 100).toFixed(1)}%` : '—';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground w-48">Показатель</th>
            <th className={th}>
              <span className="text-green-400">● Мой товар</span>
              <div className="text-muted-foreground/50 font-normal truncate max-w-[120px]">{myRow.article}</div>
            </th>
            {compCalcs.map(({ comp, color }) => (
              <th key={comp.id} className={th}>
                <span style={{ color }}>● {comp.name}</span>
                {comp.sku && <div className="text-muted-foreground/50 font-normal">SKU {comp.sku}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>

          {/* ── Market info ── */}
          <SectionRow label="Цена и рейтинг" colSpan={colCount} />

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Цена</td>
            <td className={`${td} font-bold text-green-400`}>{formatCurrency(myPrice)}</td>
            {compCalcs.map(({ comp, color }) => (
              <td key={comp.id} className={td} style={{ color }}>
                {formatCurrency(comp.price)}
                <span className={`ml-1 text-[10px] ${comp.price < myPrice ? 'text-red-400' : 'text-muted-foreground/40'}`}>
                  {comp.price < myPrice ? `▼ ${formatCurrency(myPrice - comp.price)}` : comp.price > myPrice ? `▲ ${formatCurrency(comp.price - myPrice)}` : '='}
                </span>
              </td>
            ))}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px] flex items-center gap-1"><Star className="w-3 h-3" /> Рейтинг</td>
            <td className={td}>—</td>
            {compCalcs.map(({ comp }) => (
              <td key={comp.id} className={td}>
                {comp.rating != null
                  ? <span className={comp.rating >= 4.5 ? 'text-green-400' : comp.rating >= 4 ? 'text-yellow-400' : 'text-red-400'}>★ {comp.rating.toFixed(1)}</span>
                  : '—'}
              </td>
            ))}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px] flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Отзывы</td>
            <td className={td}>—</td>
            {compCalcs.map(({ comp }) => (
              <td key={comp.id} className={td}>{comp.reviews != null ? formatNumber(comp.reviews) : '—'}</td>
            ))}
          </tr>

          {/* ── Ozon Analytics ── */}
          <SectionRow label="Аналитика Ozon (мой товар)" colSpan={colCount} />

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Заказано на сумму</td>
            <td className={`${td} font-medium`}>{analytics ? formatCurrency(analytics.revenue) : nda}</td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Заказано товаров</td>
            <td className={td}>{analytics ? formatNumber(analytics.orderedUnits) : nda}</td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Позиция в поиске и каталоге</td>
            <td className={td}>
              {analytics ? (
                analytics.positionCategory > 0
                  ? <span className={analytics.positionCategory <= 10 ? 'text-green-400' : analytics.positionCategory <= 30 ? 'text-yellow-400' : ''}># {Math.round(analytics.positionCategory)}</span>
                  : <span className="text-muted-foreground/30 text-[10px]">нет данных</span>
              ) : nda}
            </td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Показы в поиске и каталоге</td>
            <td className={td}>{analytics ? formatNumber(analytics.hitsViewSearch) : nda}</td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Посещения карточки товара</td>
            <td className={td}>{analytics ? formatNumber(analytics.hitsViewPdp) : nda}</td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Конверсия из карточки в корзину</td>
            <td className={`${td} font-medium`}>
              {analytics ? (
                <span className={analytics.hitsViewPdp > 0 && analytics.hitsTocart / analytics.hitsViewPdp > 0.05 ? 'text-green-400' : ''}>
                  {conv(analytics.hitsTocart, analytics.hitsViewPdp)}
                </span>
              ) : nda}
            </td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Добавления в корзину</td>
            <td className={td}>{analytics ? formatNumber(analytics.hitsTocart) : nda}</td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Отменено товаров</td>
            <td className={`${td} ${analytics && analytics.cancellations > 0 ? 'text-red-400' : ''}`}>
              {analytics ? formatNumber(analytics.cancellations) : nda}
            </td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Возвращено товаров</td>
            <td className={`${td} ${analytics && analytics.returns > 0 ? 'text-orange-400' : ''}`}>
              {analytics ? formatNumber(analytics.returns) : nda}
            </td>
            {compCalcs.map(({ comp }) => <td key={comp.id} className={td}>{nda}</td>)}
          </tr>

          {/* ── Unit economics at competitor price ── */}
          <SectionRow label="Наша экономика при цене конкурента" colSpan={colCount} />

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Наша маржа</td>
            <td className={`${td} ${myCalc && myCalc.margin > 20 ? 'text-green-400' : myCalc && myCalc.margin > 10 ? 'text-yellow-400' : 'text-red-400'}`}>
              {myCalc ? formatPercent(myCalc.margin) : '—'}
            </td>
            {compCalcs.map(({ comp, calc }) => (
              <td key={comp.id} className={`${td} ${calc && calc.margin > 20 ? 'text-green-400' : calc && calc.margin > 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                {calc ? formatPercent(calc.margin) : '—'}
              </td>
            ))}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Прибыль/шт</td>
            <td className={`${td} font-bold ${myCalc && myCalc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {myCalc ? formatCurrency(myCalc.profit) : '—'}
            </td>
            {compCalcs.map(({ comp, calc }) => {
              const diff = calc && myCalc ? calc.profit - myCalc.profit : null;
              return (
                <td key={comp.id} className={`${td} ${calc && calc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {calc ? <>
                    {formatCurrency(calc.profit)}
                    {diff !== null && <span className={`ml-1 text-[10px] ${diff < 0 ? 'text-red-400' : 'text-muted-foreground/40'}`}>({diff >= 0 ? '+' : ''}{formatCurrency(diff)})</span>}
                  </> : '—'}
                </td>
              );
            })}
          </tr>

          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">В прибыли?</td>
            <td className={`${td} ${myCalc && myCalc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {myCalc ? (myCalc.profit >= 0 ? '✓ Да' : '✗ Нет') : '—'}
            </td>
            {compCalcs.map(({ comp, calc }) => (
              <td key={comp.id} className={`${td} font-medium ${calc && calc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {calc ? (calc.profit >= 0 ? '✓ Да' : '✗ Убыток') : '—'}
              </td>
            ))}
          </tr>

        </tbody>
      </table>
    </div>
  );
}

// ─── Sensitivity chart ────────────────────────────────────────────────────────
function SensitivityChart({ myRow, competitors }: { myRow: CalculatedRow; competitors: Competitor[] }) {
  const data    = useMemo(() => buildSensitivity(myRow, competitors), [myRow, competitors]);
  const myPrice = Math.round(myRow.avgPrice || myRow.netSales / Math.max(myRow.salesCount, 1));
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-3">Прибыль/шт при разных ценах</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="price" tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
            tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            formatter={(v: number, name: string) => [formatCurrency(v), name]}
            labelFormatter={(price: number) => `Цена: ${formatCurrency(price)}`}
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11, borderRadius: 0 }}
          />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
          <ReferenceLine x={myPrice} stroke="#4ade80" strokeDasharray="6 3"
            label={{ value: 'Моя', position: 'top', fill: '#4ade80', fontSize: 10 }} />
          {competitors.filter(c => c.price > 0).map((c, i) => (
            <ReferenceLine key={c.id} x={Math.round(c.price)} stroke={COMP_COLORS[i % COMP_COLORS.length]}
              strokeDasharray="4 3"
              label={{ value: c.name.split(' ')[0], position: 'top', fill: COMP_COLORS[i % COMP_COLORS.length], fontSize: 10 }} />
          ))}
          <Line type="monotone" dataKey="profit" name="Прибыль/шт" stroke="#4ade80"
            strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function CompetitorPanel({ rows, clientId, apiKey }: {
  rows: CalculatedRow[];
  clientId: string;
  apiKey: string;
}) {
  const [selectedArticle, setSelectedArticle] = useState<string>(() => rows[0]?.article ?? '');
  const [competitors, setCompetitors]         = useState<Competitor[]>([]);
  const [period, setPeriod]                   = useState<Period>(7);
  const [analyticsAll, setAnalyticsAll]       = useState<OzonAnalyticsItem[] | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError]   = useState('');
  const [overrideItemId, setOverrideItemId]   = useState('');
  const [showMatchPicker, setShowMatchPicker] = useState(false);

  const myRow = rows.find(r => r.article === selectedArticle) ?? rows[0];

  // Reset override when article changes
  useEffect(() => { setOverrideItemId(''); setShowMatchPicker(false); }, [selectedArticle]);

  // Attempt name-based match
  const matchedAnalytics = useMemo(() => {
    if (!analyticsAll || !myRow) return null;
    return findAnalyticsMatch(myRow.name ?? '', analyticsAll, overrideItemId || undefined);
  }, [analyticsAll, myRow, overrideItemId]);

  const noMatch = analyticsAll !== null && matchedAnalytics === null;

  const loadAnalytics = async () => {
    if (!clientId || !apiKey) return;
    setAnalyticsLoading(true); setAnalyticsError('');
    const { dateFrom, dateTo } = getPeriodDates(period);
    try {
      const resp = await fetch('/api/ozon/analytics-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ozon-Client-Id': clientId, 'X-Ozon-Api-Key': apiKey },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setAnalyticsAll(data.items ?? []);
        setOverrideItemId('');
      } else {
        setAnalyticsError(data.error ?? 'Ошибка загрузки аналитики');
      }
    } catch { setAnalyticsError('Ошибка соединения'); }
    finally { setAnalyticsLoading(false); }
  };

  const addCompetitor = useCallback((c: Omit<Competitor, 'id'>) => {
    setCompetitors(prev => [...prev, { ...c, id: Math.random().toString(36).slice(2, 9) }]);
  }, []);
  const removeCompetitor = useCallback((id: string) => {
    setCompetitors(prev => prev.filter(c => c.id !== id));
  }, []);

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div className="max-w-sm space-y-3">
          <div className="text-4xl opacity-20">⚔️</div>
          <p className="text-sm font-medium text-muted-foreground">Загрузите данные Ozon, затем добавьте SKU конкурентов</p>
          <p className="text-[11px] text-muted-foreground/60">ozon.ru/product/название-<strong>123456789</strong>/</p>
        </div>
      </div>
    );
  }

  const myPrice    = myRow ? (myRow.avgPrice || myRow.netSales / Math.max(myRow.salesCount, 1)) : 0;
  const canApi     = !!(clientId && apiKey);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">

      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border/50 px-4 py-2.5">
        {/* My SKU */}
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">Мой товар:</span>
        <select value={selectedArticle} onChange={e => setSelectedArticle(e.target.value)}
          className="flex-1 max-w-xs bg-muted/30 border border-border px-2 py-1 text-[11px] font-mono outline-none focus:border-primary/60">
          {rows.map(r => (
            <option key={r.article} value={r.article}>{r.article}{r.name ? ` — ${r.name.slice(0, 40)}` : ''}</option>
          ))}
        </select>

        {/* Quick stats */}
        {myRow && (
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>Цена: <strong className="text-foreground">{formatCurrency(myPrice)}</strong></span>
            <span>Маржа: <strong className={myRow.marginPercent > 20 ? 'text-green-400' : myRow.marginPercent > 10 ? 'text-yellow-400' : 'text-red-400'}>{formatPercent(myRow.marginPercent)}</strong></span>
            {myRow.salesCount > 0 && <span>Приб/шт: <strong className={myRow.netProfit / myRow.salesCount >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(myRow.netProfit / myRow.salesCount)}</strong></span>}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Period toggle */}
        <div className="flex border border-border text-[11px]">
          {([7, 28] as Period[]).map((p, i) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1 ${p === period ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${i > 0 ? 'border-l border-border' : ''}`}>
              {p} дней
            </button>
          ))}
        </div>

        {/* Load analytics */}
        <button onClick={loadAnalytics} disabled={!canApi || analyticsLoading}
          title={!canApi ? 'Нужен API-режим Ozon' : `Загрузить аналитику за ${period} дней`}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-[11px] hover:bg-muted disabled:opacity-40">
          {analyticsLoading
            ? <RefreshCw className="w-3 h-3 animate-spin" />
            : <BarChart2 className="w-3 h-3" />}
          {analyticsLoading ? 'Загрузка…' : 'Аналитика'}
        </button>
      </div>

      {/* ── Analytics status ── */}
      {analyticsError && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 border border-red-500/20 bg-red-950/10 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {analyticsError}
        </div>
      )}

      {/* No auto-match — offer manual picker */}
      {noMatch && (
        <div className="flex items-center gap-3 text-[11px] border border-yellow-500/20 bg-yellow-950/10 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400/90">Не удалось автоматически сопоставить товар с аналитикой. Выберите вручную:</span>
          <button onClick={() => setShowMatchPicker(v => !v)}
            className="flex items-center gap-1 px-2 py-0.5 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-900/20">
            Выбрать <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}

      {showMatchPicker && analyticsAll && (
        <div className="border border-border/50 bg-muted/5 px-3 py-2 space-y-1">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2">Выберите товар из аналитики Ozon:</p>
          <select className="w-full bg-muted/30 border border-border px-2 py-1.5 text-[11px] font-mono outline-none focus:border-primary/60"
            value={overrideItemId}
            onChange={e => { setOverrideItemId(e.target.value); setShowMatchPicker(false); }}>
            <option value="">— выберите —</option>
            {analyticsAll.map(item => (
              <option key={item.itemId} value={item.itemId}>{item.name} (item_id: {item.itemId})</option>
            ))}
          </select>
        </div>
      )}

      {/* Match status */}
      {matchedAnalytics && (
        <div className="flex items-center gap-2 text-[11px] text-green-400/80 border border-green-500/20 bg-green-950/10 px-3 py-2">
          ✓ Аналитика за {period} дн. загружена · {matchedAnalytics.name.slice(0, 60)}
          {overrideItemId && <span className="text-muted-foreground/50 ml-1">(выбрано вручную)</span>}
        </div>
      )}

      {/* ── Add competitor form ── */}
      <AddForm onAdd={addCompetitor} clientId={clientId} apiKey={apiKey} />

      {/* ── Competitor chips ── */}
      {competitors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {competitors.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 border text-[11px]"
              style={{ borderColor: `${COMP_COLORS[i % COMP_COLORS.length]}40`, background: `${COMP_COLORS[i % COMP_COLORS.length]}10` }}>
              <span style={{ color: COMP_COLORS[i % COMP_COLORS.length] }}>●</span>
              <span className="font-medium">{c.name}</span>
              {c.sku && <span className="text-muted-foreground/60">SKU {c.sku}</span>}
              <span className="font-mono font-bold">{formatCurrency(c.price)}</span>
              {c.rating && <span className="text-yellow-400">★ {c.rating.toFixed(1)}</span>}
              <button onClick={() => removeCompetitor(c.id)} className="text-muted-foreground/40 hover:text-red-400 ml-1">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── API hint ── */}
      {!canApi && (
        <div className="flex items-center gap-2 text-[11px] text-yellow-400/80 border border-yellow-500/20 bg-yellow-950/10 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Переключитесь в API-режим Ozon (Client-Id + API-Key), чтобы автоматически загружать аналитику и искать товары по SKU.
        </div>
      )}

      {/* ── Main content (needs at least 1 competitor) ── */}
      {myRow && competitors.length > 0 ? (
        <div className="space-y-4">
          <div className="bg-card border border-border/50 p-5">
            <ComparisonTable myRow={myRow} competitors={competitors} analytics={matchedAnalytics} />
          </div>
          <div className="bg-card border border-border/50 p-5">
            <SensitivityChart myRow={myRow} competitors={competitors} />
          </div>
        </div>
      ) : myRow ? (
        <div className="border border-dashed border-border/40 p-8 text-center text-[11px] text-muted-foreground/50">
          Добавьте хотя бы одного конкурента выше, чтобы увидеть сравнение
        </div>
      ) : null}
    </div>
  );
}
