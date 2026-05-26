import { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import type { CalculatedRow } from '../types';
import { formatCurrency, formatPercent, formatNumber } from '../lib/utils';
import { Plus, Trash2, Search, Star, MessageSquare, AlertCircle } from 'lucide-react';

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

// ─── Unit-economics at a given price ────────────────────────────────────────
interface UnitCalc {
  price: number;
  profit: number;
  margin: number;
  commAmt: number;
  delivPerUnit: number;
  costPerUnit: number;
}

function calcAtPrice(row: CalculatedRow, price: number): UnitCalc | null {
  if (row.salesCount === 0 || row.netSales === 0) return null;
  const commRate      = row.ozonCommission / row.netSales;
  const delivPerUnit  = row.deliveryServices / row.salesCount;
  const agentPerUnit  = row.agentServices / row.salesCount;
  const storagePerUnit = (row.storage + row.fboServices) / row.salesCount;
  const promPerUnit   = row.promotion / row.salesCount;
  const costPerUnit   = row.costTotal / row.salesCount;
  const taxPerUnit    = row.taxAmount / row.salesCount;
  const commAmt       = price * commRate;
  const profit        = price - commAmt - delivPerUnit - agentPerUnit - storagePerUnit - promPerUnit - costPerUnit - taxPerUnit;
  const margin        = price > 0 ? (profit / price) * 100 : 0;
  return { price, profit, margin, commAmt, delivPerUnit, costPerUnit };
}

// ─── Price-sensitivity curve ──────────────────────────────────────────────────
function buildSensitivity(row: CalculatedRow, competitors: Competitor[], steps = 60) {
  const currentPrice = row.avgPrice || (row.netSales / Math.max(row.salesCount, 1));
  const compPrices = competitors.filter(c => c.price > 0).map(c => c.price);
  const allPrices  = [currentPrice, ...compPrices];
  const minP = Math.max(1, Math.min(...allPrices) * 0.6);
  const maxP = Math.max(...allPrices) * 1.4;
  const step = (maxP - minP) / steps;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const price = minP + i * step;
    const calc  = calcAtPrice(row, price);
    return {
      price:  Math.round(price),
      profit: calc ? Math.round(calc.profit) : 0,
      margin: calc ? Math.round(calc.margin * 10) / 10 : 0,
    };
  });
}

// ─── Colour palette for competitors ─────────────────────────────────────────
const COMP_COLORS = ['#f472b6', '#fb923c', '#a78bfa', '#22d3ee', '#fbbf24', '#34d399'];

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmtY = (v: number) => {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return String(v);
};

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="max-w-sm space-y-3">
        <div className="text-4xl opacity-20">⚔️</div>
        <p className="text-sm font-medium text-muted-foreground">
          Загрузите данные Ozon, затем добавьте SKU конкурентов
        </p>
        <p className="text-[11px] text-muted-foreground/60">
          Введите Ozon item_id из URL страницы товара:<br />
          ozon.ru/product/название-<strong>123456789</strong>/
        </p>
      </div>
    </div>
  );
}

// ─── Competitor row in the add-form ──────────────────────────────────────────
function AddForm({
  onAdd, clientId, apiKey,
}: {
  onAdd: (c: Omit<Competitor, 'id'>) => void;
  clientId: string;
  apiKey: string;
}) {
  const [sku,     setSku]     = useState('');
  const [name,    setName]    = useState('');
  const [price,   setPrice]   = useState('');
  const [rating,  setRating]  = useState('');
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
        headers: {
          'Content-Type': 'application/json',
          'X-Ozon-Client-Id': clientId,
          'X-Ozon-Api-Key':   apiKey,
        },
        body: JSON.stringify({ sku: parseInt(sku, 10) }),
      });
      const data = await resp.json();
      if (resp.ok) {
        if (data.name)        setName(data.name);
        if (data.price)       setPrice(String(data.price));
        if (data.rating)      setRating(String(data.rating));
        if (data.reviewsCount) setReviews(String(data.reviewsCount));
      } else {
        setLookErr(data.error ?? 'Ошибка поиска');
      }
    } catch {
      setLookErr('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const add = () => {
    if (!price) return;
    onAdd({
      sku:      sku.trim(),
      name:     name.trim() || `Конкурент`,
      price:    parseFloat(price) || 0,
      rating:   rating ? parseFloat(rating) : null,
      reviews:  reviews ? parseInt(reviews, 10) : null,
      fetching: false,
      fetched:  !!name,
    });
    setSku(''); setName(''); setPrice(''); setRating(''); setReviews(''); setLookErr('');
  };

  const inp = "bg-muted/30 border border-border px-2 py-1 text-[11px] outline-none focus:border-primary/60 font-mono";

  return (
    <div className="border border-border/50 bg-muted/5 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50">Добавить конкурента</p>

      {/* SKU + lookup */}
      <div className="flex gap-2 items-center">
        <input
          value={sku} onChange={e => setSku(e.target.value)}
          placeholder="Ozon SKU / item_id"
          className={`${inp} w-44`}
          onKeyDown={e => e.key === 'Enter' && lookup()}
        />
        <button
          onClick={lookup}
          disabled={!canLookup || loading}
          title={!clientId || !apiKey ? 'Нужен API-режим Ozon (Client-Id + API-Key)' : 'Найти товар в Ozon'}
          className="flex items-center gap-1.5 px-3 py-1 border border-border text-[11px] hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
          <Search className="w-3 h-3" />
          {loading ? 'Ищу…' : 'Найти'}
        </button>
        {lookErr && <span className="text-[10px] text-red-400">{lookErr} — введите вручную</span>}
      </div>

      {/* Manual fields */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={name}    onChange={e => setName(e.target.value)}    placeholder="Название (необязательно)" className={`${inp} flex-1 min-w-[160px]`} />
        <input value={price}   onChange={e => setPrice(e.target.value)}   placeholder="Цена ₽ *" type="number" min="0" className={`${inp} w-28`} />
        <input value={rating}  onChange={e => setRating(e.target.value)}  placeholder="Рейтинг" type="number" step="0.1" min="0" max="5" className={`${inp} w-24`} />
        <input value={reviews} onChange={e => setReviews(e.target.value)} placeholder="Отзывы" type="number" min="0" className={`${inp} w-24`} />
        <button
          onClick={add}
          disabled={!price}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[11px] disabled:opacity-40 hover:opacity-90">
          <Plus className="w-3 h-3" /> Добавить
        </button>
      </div>
    </div>
  );
}

// ─── Comparison table card ────────────────────────────────────────────────────
function ComparisonTable({
  myRow,
  competitors,
}: {
  myRow: CalculatedRow;
  competitors: Competitor[];
}) {
  const myPrice = myRow.avgPrice || (myRow.netSales / Math.max(myRow.salesCount, 1));
  const myCalc  = calcAtPrice(myRow, myPrice);

  const compCalcs = competitors.map(c => ({
    comp: c,
    calc: calcAtPrice(myRow, c.price),
    color: COMP_COLORS[competitors.indexOf(c) % COMP_COLORS.length],
  }));

  const td = "px-3 py-2 text-right tabular-nums text-[11px]";
  const th = "px-3 py-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Показатель</th>
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
          {/* Price */}
          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Цена</td>
            <td className={`${td} font-bold text-green-400`}>{formatCurrency(myPrice)}</td>
            {compCalcs.map(({ comp, color }) => (
              <td key={comp.id} className={td} style={{ color }}>
                {formatCurrency(comp.price)}
                <span className={`ml-1 text-[10px] ${comp.price < myPrice ? 'text-red-400' : 'text-muted-foreground/50'}`}>
                  {comp.price < myPrice ? `▼ ${formatCurrency(myPrice - comp.price)}` : comp.price > myPrice ? `▲ ${formatCurrency(comp.price - myPrice)}` : '='}
                </span>
              </td>
            ))}
          </tr>

          {/* Rating */}
          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px] flex items-center gap-1">
              <Star className="w-3 h-3" /> Рейтинг
            </td>
            <td className={td}>—</td>
            {compCalcs.map(({ comp }) => (
              <td key={comp.id} className={td}>
                {comp.rating != null ? (
                  <span className={comp.rating >= 4.5 ? 'text-green-400' : comp.rating >= 4 ? 'text-yellow-400' : 'text-red-400'}>
                    ★ {comp.rating.toFixed(1)}
                  </span>
                ) : '—'}
              </td>
            ))}
          </tr>

          {/* Reviews */}
          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px] flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Отзывы
            </td>
            <td className={td}>—</td>
            {compCalcs.map(({ comp }) => (
              <td key={comp.id} className={td}>
                {comp.reviews != null ? formatNumber(comp.reviews) : '—'}
              </td>
            ))}
          </tr>

          <tr><td colSpan={2 + compCalcs.length} className="py-1 bg-muted/5">
            <div className="px-3 text-[10px] uppercase tracking-widest text-muted-foreground/40">Наша экономика при цене конкурента</div>
          </td></tr>

          {/* Our margin at their price */}
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

          {/* Our profit/unit at their price */}
          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">Прибыль/шт</td>
            <td className={`${td} font-bold ${myCalc && myCalc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {myCalc ? formatCurrency(myCalc.profit) : '—'}
            </td>
            {compCalcs.map(({ comp, calc }) => {
              const diff = calc && myCalc ? calc.profit - myCalc.profit : null;
              return (
                <td key={comp.id} className={`${td} ${calc && calc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {calc ? (
                    <>
                      {formatCurrency(calc.profit)}
                      {diff !== null && (
                        <span className={`ml-1 text-[10px] ${diff < 0 ? 'text-red-400' : 'text-muted-foreground/50'}`}>
                          ({diff >= 0 ? '+' : ''}{formatCurrency(diff)})
                        </span>
                      )}
                    </>
                  ) : '—'}
                </td>
              );
            })}
          </tr>

          {/* Break-even */}
          <tr className="border-b border-border/20 hover:bg-muted/10">
            <td className="px-3 py-2 text-muted-foreground text-[11px]">В прибыли?</td>
            <td className={`${td} ${myCalc && myCalc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {myCalc ? (myCalc.profit >= 0 ? '✓ Да' : '✗ Нет') : '—'}
            </td>
            {compCalcs.map(({ comp, calc }) => (
              <td key={comp.id} className={`${td} ${calc && calc.profit >= 0 ? 'text-green-400' : 'text-red-400'} font-medium`}>
                {calc ? (calc.profit >= 0 ? '✓ Да' : '✗ Убыток') : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Price sensitivity chart ──────────────────────────────────────────────────
function SensitivityChart({
  myRow,
  competitors,
}: {
  myRow: CalculatedRow;
  competitors: Competitor[];
}) {
  const data = useMemo(() => buildSensitivity(myRow, competitors), [myRow, competitors]);
  const myPrice = Math.round(myRow.avgPrice || myRow.netSales / Math.max(myRow.salesCount, 1));

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-3">
        Прибыль/шт при разных ценах
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="price"
            tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={fmtY}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false} tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(v: number, name: string) => [formatCurrency(v), name]}
            labelFormatter={(price: number) => `Цена: ${formatCurrency(price)}`}
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11, borderRadius: 0 }}
          />
          <ReferenceLine x={0} stroke="#334155" />
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />

          {/* My current price */}
          <ReferenceLine
            x={myPrice}
            stroke="#4ade80"
            strokeDasharray="6 3"
            label={{ value: 'Моя', position: 'top', fill: '#4ade80', fontSize: 10 }}
          />

          {/* Competitor prices */}
          {competitors.filter(c => c.price > 0).map((c, i) => (
            <ReferenceLine
              key={c.id}
              x={Math.round(c.price)}
              stroke={COMP_COLORS[i % COMP_COLORS.length]}
              strokeDasharray="4 3"
              label={{ value: c.name.split(' ')[0], position: 'top', fill: COMP_COLORS[i % COMP_COLORS.length], fontSize: 10 }}
            />
          ))}

          <Line
            type="monotone"
            dataKey="profit"
            name="Прибыль/шт"
            stroke="#4ade80"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function CompetitorPanel({
  rows,
  clientId,
  apiKey,
}: {
  rows: CalculatedRow[];
  clientId: string;
  apiKey: string;
}) {
  const [selectedArticle, setSelectedArticle] = useState<string>(() => rows[0]?.article ?? '');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);

  const myRow = rows.find(r => r.article === selectedArticle) ?? rows[0];

  const addCompetitor = useCallback((c: Omit<Competitor, 'id'>) => {
    setCompetitors(prev => [...prev, { ...c, id: Math.random().toString(36).slice(2, 9) }]);
  }, []);

  const removeCompetitor = useCallback((id: string) => {
    setCompetitors(prev => prev.filter(c => c.id !== id));
  }, []);

  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">

      {/* Header: own SKU selector */}
      <div className="flex items-center gap-3 bg-card border border-border/50 px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">Мой товар:</span>
        <select
          value={selectedArticle}
          onChange={e => setSelectedArticle(e.target.value)}
          className="flex-1 max-w-xs bg-muted/30 border border-border px-2 py-1 text-[11px] font-mono outline-none focus:border-primary/60">
          {rows.map(r => (
            <option key={r.article} value={r.article}>
              {r.article}{r.name ? ` — ${r.name.slice(0, 40)}` : ''}
            </option>
          ))}
        </select>
        {myRow && (
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground ml-auto">
            <span>Цена: <strong className="text-foreground">{formatCurrency(myRow.avgPrice || myRow.netSales / Math.max(myRow.salesCount, 1))}</strong></span>
            <span>Маржа: <strong className={myRow.marginPercent > 20 ? 'text-green-400' : myRow.marginPercent > 10 ? 'text-yellow-400' : 'text-red-400'}>{formatPercent(myRow.marginPercent)}</strong></span>
            <span>Прибыль/шт: <strong className={myRow.salesCount > 0 && myRow.netProfit / myRow.salesCount >= 0 ? 'text-green-400' : 'text-red-400'}>{myRow.salesCount > 0 ? formatCurrency(myRow.netProfit / myRow.salesCount) : '—'}</strong></span>
          </div>
        )}
      </div>

      {/* Add competitor form */}
      <AddForm onAdd={addCompetitor} clientId={clientId} apiKey={apiKey} />

      {/* Competitor chips */}
      {competitors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {competitors.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-2 px-3 py-1.5 border text-[11px]"
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

      {/* API info */}
      {(!clientId || !apiKey) && (
        <div className="flex items-center gap-2 text-[11px] text-yellow-400/80 border border-yellow-500/20 bg-yellow-950/10 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Переключитесь в API-режим Ozon, чтобы автоматически искать товары по SKU. Без этого вводите данные вручную.
        </div>
      )}

      {/* Charts + table (only when competitor added) */}
      {myRow && competitors.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-card border border-border/50 p-5 xl:col-span-2">
            <ComparisonTable myRow={myRow} competitors={competitors} />
          </div>
          <div className="bg-card border border-border/50 p-5 xl:col-span-2">
            <SensitivityChart myRow={myRow} competitors={competitors} />
          </div>
        </div>
      ) : myRow && competitors.length === 0 ? (
        <div className="border border-dashed border-border/40 rounded p-8 text-center text-[11px] text-muted-foreground/50">
          Добавьте хотя бы одного конкурента выше, чтобы увидеть сравнение
        </div>
      ) : null}
    </div>
  );
}
