import { useMemo } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import type { ReportSummary, CalculatedRow } from '../types';
import { formatCurrency } from '../lib/utils';

// ─── Colour tokens ─────────────────────────────────────────────────────────────
const CLR = {
  green:      '#4ade80',
  red:        '#f87171',
  commission: '#fb923c',
  delivery:   '#60a5fa',
  storage:    '#22d3ee',
  partners:   '#a78bfa',
  promo:      '#f472b6',
  cost:       '#94a3b8',
  tax:        '#64748b',
  other:      '#475569',
};

const TOOLTIP_STYLE = {
  background: '#1e293b',
  border: '1px solid #334155',
  fontSize: 11,
  borderRadius: 0,
  color: '#e2e8f0',
};

function fmtAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// ─── Waterfall ─────────────────────────────────────────────────────────────────
interface WfPoint {
  name: string;
  base: number;
  pos:  number;
  neg:  number;
  isTotal?: boolean;
}

function buildWaterfall(s: ReportSummary): WfPoint[] {
  const steps = [
    { name: 'Выручка',      delta:  s.netSales },
    { name: 'Комиссия',     delta: -s.ozonCommission },
    { name: 'Доставка',     delta: -s.deliveryServices },
    { name: 'Хранение',     delta: -(s.storage + s.fboServices) },
    { name: 'Партнёры',     delta: -s.agentServices },
    { name: 'Продвижение',  delta: -s.promotion },
    { name: 'Прочее',       delta: -s.otherExpenses },
    { name: 'Себест.',      delta: -s.costTotal },
    { name: 'Налог',        delta: -s.taxAmount },
  ].filter(st => st.delta !== 0);

  const pts: WfPoint[] = [];
  let run = 0;
  for (const st of steps) {
    const prev = run;
    run += st.delta;
    if (st.delta >= 0) {
      pts.push({ name: st.name, base: prev, pos: st.delta, neg: 0 });
    } else {
      pts.push({ name: st.name, base: Math.min(prev, run), pos: 0, neg: Math.abs(st.delta) });
    }
  }
  if (run >= 0) {
    pts.push({ name: 'Прибыль', base: 0, pos: run, neg: 0, isTotal: true });
  } else {
    pts.push({ name: 'Убыток', base: run, pos: 0, neg: -run, isTotal: true });
  }
  return pts;
}

export function WaterfallChart({ summary }: { summary: ReportSummary }) {
  const data = useMemo(() => buildWaterfall(summary), [summary]);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-3">
        Водопад: куда уходит выручка
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false} tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: '#e2e8f0', marginBottom: 4 }}
            formatter={(value: number, name: string) => {
              if (name === 'base') return null;
              return [formatCurrency(value as number), name === 'pos' ? 'Приход' : 'Расход'];
            }}
          />
          <Bar dataKey="base" stackId="wf" fill="transparent" legendType="none" />
          <Bar dataKey="pos"  stackId="wf" fill={CLR.green} radius={[2, 2, 0, 0]} name="pos" />
          <Bar dataKey="neg"  stackId="wf" fill={CLR.red}   radius={[2, 2, 0, 0]} name="neg" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Cost structure pie ─────────────────────────────────────────────────────────
function buildPieData(s: ReportSummary) {
  return [
    { name: 'Комиссия',     value: s.ozonCommission,            color: CLR.commission },
    { name: 'Доставка',     value: s.deliveryServices,          color: CLR.delivery   },
    { name: 'Хранение',     value: s.storage + s.fboServices,   color: CLR.storage    },
    { name: 'Партнёры',     value: s.agentServices,             color: CLR.partners   },
    { name: 'Продвижение',  value: s.promotion,                 color: CLR.promo      },
    { name: 'Себестоимость',value: s.costTotal,                  color: CLR.cost       },
    { name: 'Налог',        value: s.taxAmount,                  color: CLR.tax        },
    { name: 'Прочее',       value: s.otherExpenses,              color: CLR.other      },
  ].filter(d => d.value > 0);
}

export function CostPieChart({ summary }: { summary: ReportSummary }) {
  const data   = useMemo(() => buildPieData(summary), [summary]);
  const total  = data.reduce((s, d) => s + d.value, 0);

  const renderPct = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: {
    cx: number; cy: number; midAngle: number;
    innerRadius: number; outerRadius: number; value: number;
  }) => {
    if (total === 0 || value / total < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const r  = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x  = cx + r * Math.cos(-midAngle * RADIAN);
    const y  = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10}>
        {`${((value / total) * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-3">
        Структура расходов
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={95}
            dataKey="value"
            labelLine={false}
            label={renderPct as any}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => formatCurrency(v)}
            contentStyle={TOOLTIP_STYLE}
          />
          <Legend
            iconSize={8}
            iconType="circle"
            wrapperStyle={{ fontSize: 10, color: '#94a3b8', paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Top SKU bar ───────────────────────────────────────────────────────────────
export function TopSkuChart({ rows }: { rows: CalculatedRow[] }) {
  const data = useMemo(() => {
    return [...rows]
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 12)
      .map(r => ({
        label:    r.article.length > 16 ? r.article.slice(0, 16) + '…' : r.article,
        fullName: r.name || r.article,
        profit:   r.netProfit,
        margin:   r.marginPercent,
      }));
  }, [rows]);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-3">
        Топ-12 SKU по прибыли
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          layout="vertical"
          data={data}
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tickFormatter={fmtAxis}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            width={88}
            axisLine={false} tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [formatCurrency(v), 'Прибыль']}
            labelFormatter={(_label: string, payload: any[]) =>
              payload?.[0]?.payload?.fullName ?? _label
            }
          />
          <Bar dataKey="profit" radius={[0, 2, 2, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.profit >= 0 ? CLR.green : CLR.red} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Combined panel ───────────────────────────────────────────────────────────
export function AnalyticsPanel({
  summary,
  rows,
}: {
  summary: ReportSummary;
  rows: CalculatedRow[];
}) {
  return (
    <div className="flex-1 overflow-auto p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="bg-card border border-border/50 p-5 xl:col-span-2">
        <WaterfallChart summary={summary} />
      </div>
      <div className="bg-card border border-border/50 p-5">
        <CostPieChart summary={summary} />
      </div>
      <div className="bg-card border border-border/50 p-5">
        <TopSkuChart rows={rows} />
      </div>
    </div>
  );
}
