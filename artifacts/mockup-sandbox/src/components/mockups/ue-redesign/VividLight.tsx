import { TrendingUp, Package, BarChart2, ShoppingCart, Truck, Warehouse, Megaphone, ChevronDown, ArrowUpRight } from 'lucide-react';

const rows = [
  { article: 'SHIRT-BLK-M', name: 'Футболка чёрная M', orders: 142, revenue: 284000, commission: 34080, logistics: 18460, storage: 4260, promo: 8520, cost: 85200, profit: 133480, margin: 47, abc: 'A' },
  { article: 'PANTS-GRY-L', name: 'Брюки серые L', orders: 89, revenue: 222500, commission: 26700, logistics: 15230, storage: 3560, promo: 6675, cost: 71200, profit: 99135, margin: 44.6, abc: 'A' },
  { article: 'HOODIE-NVY-XL', name: 'Худи тёмно-синее XL', orders: 67, revenue: 200940, commission: 24113, logistics: 14066, storage: 2815, promo: 6028, cost: 53584, profit: 100334, margin: 49.9, abc: 'B' },
  { article: 'DRESS-WHT-S', name: 'Платье белое S', orders: 34, revenue: 102000, commission: 12240, logistics: 9180, storage: 2550, promo: 3060, cost: 30600, profit: 44370, margin: 43.5, abc: 'B' },
  { article: 'JACKET-BLK-M', name: 'Куртка чёрная M', orders: 12, revenue: 71880, commission: 8626, logistics: 7188, storage: 2876, promo: 2157, cost: 28752, profit: 22281, margin: 31.0, abc: 'C' },
];

const total = { orders: 344, revenue: 881320, profit: 399600, margin: 45.3 };

const abcColor: Record<string, string> = {
  A: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
  B: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  C: 'bg-rose-100 text-rose-600 ring-1 ring-rose-200',
};

function fmt(n: number) {
  return n.toLocaleString('ru') + ' ₽';
}

export function VividLight() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">

      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900 tracking-tight">Unit Economics</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition font-medium">
            УСН 6% (доходы) <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex gap-0.5">
          {[
            { name: 'Ozon', color: 'text-blue-600 border-blue-500', active: false },
            { name: 'Яндекс Маркет', color: 'text-yellow-600 border-yellow-500', active: false },
            { name: 'Wildberries', color: 'text-violet-600 border-violet-500', active: true },
            { name: 'Сравнение', color: 'text-slate-600 border-slate-400', active: false },
          ].map(tab => (
            <button key={tab.name} className={`px-5 py-3 text-sm font-medium border-b-2 transition ${tab.active
              ? tab.color
              : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* Settings bar */}
      <div className="bg-white/70 backdrop-blur border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2 min-w-[200px]">
            <span className="text-xs text-slate-400">Токен WB</span>
            <span className="text-xs font-mono text-slate-300 flex-1">••••••••••••••••</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <span className="text-xs text-slate-400">Период</span>
            <span className="text-xs font-medium text-slate-700">01 мая — 31 мая 2026</span>
          </div>
          <button className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-sm rounded-xl font-semibold transition shadow-sm shadow-indigo-200 flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Загрузить
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Выручка', value: fmt(total.revenue), sub: '+12% к прошлому мес.', icon: ShoppingCart, gradient: 'from-blue-500 to-indigo-600', light: 'bg-blue-50 text-blue-600' },
            { label: 'Прибыль', value: fmt(total.profit),  sub: '+8% к прошлому мес.',  icon: TrendingUp,   gradient: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50 text-emerald-600' },
            { label: 'Маржа',   value: total.margin + '%', sub: 'Средняя по SKU',        icon: BarChart2,    gradient: 'from-violet-500 to-purple-600', light: 'bg-violet-50 text-violet-600' },
            { label: 'Заказов', value: total.orders + ' шт', sub: '5 активных SKU',      icon: Package,      gradient: 'from-amber-400 to-orange-500',  light: 'bg-amber-50 text-amber-600' },
          ].map(({ label, value, sub, icon: Icon, gradient, light }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <ArrowUpRight className={`w-4 h-4 ${light.split(' ')[1]} opacity-60`} />
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{value}</div>
              <div className="text-xs text-slate-400">{label} · {sub}</div>
            </div>
          ))}
        </div>

        {/* Cost breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Расходы по категориям</h3>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Комиссия WB', value: fmt(105759), pct: 21.8, icon: BarChart2, color: 'indigo' },
              { label: 'Логистика',   value: fmt(64124),  pct: 13.2, icon: Truck,     color: 'violet' },
              { label: 'Хранение',    value: fmt(16061),  pct: 3.3,  icon: Warehouse, color: 'amber' },
              { label: 'Реклама',     value: fmt(26440),  pct: 5.4,  icon: Megaphone, color: 'rose' },
            ].map(({ label, value, pct, icon: Icon, color }) => (
              <div key={label} className={`rounded-xl p-4 bg-${color}-50 border border-${color}-100`}>
                <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 text-${color}-500`} />
                </div>
                <div className="text-xs text-slate-500 mb-1">{label}</div>
                <div className="font-bold text-slate-800 text-sm">{value}</div>
                <div className={`text-xs text-${color}-500 font-medium mt-1`}>{pct}% выручки</div>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Детализация по SKU</h3>
            <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">{rows.length} позиций</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-xs text-slate-500 uppercase tracking-wide">
                {['Товар', 'Заказы', 'Выручка', 'Комиссия', 'Логистика', 'Себест.', 'Прибыль', 'Маржа', 'ABC'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, idx) => (
                <tr key={r.article} className={`hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 text-xs">{r.article}</div>
                    <div className="text-xs text-slate-400 truncate max-w-[140px]">{r.name}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{r.orders}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{fmt(r.revenue)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500 text-xs">{fmt(r.commission)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500 text-xs">{fmt(r.logistics)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500 text-xs">{fmt(r.cost)}</td>
                  <td className="px-4 py-3 tabular-nums font-bold text-emerald-600">{fmt(r.profit)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-12 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${r.margin >= 45 ? 'bg-emerald-500' : r.margin >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${Math.min(r.margin * 1.5, 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium text-slate-700">{r.margin}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold ${abcColor[r.abc]}`}>{r.abc}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gradient-to-r from-indigo-50 to-violet-50 border-t-2 border-indigo-100">
              <tr className="text-sm font-bold text-slate-800">
                <td className="px-4 py-3">Итого</td>
                <td className="px-4 py-3 tabular-nums">{total.orders}</td>
                <td className="px-4 py-3 tabular-nums">{fmt(total.revenue)}</td>
                <td colSpan={3} />
                <td className="px-4 py-3 tabular-nums text-emerald-600">{fmt(total.profit)}</td>
                <td className="px-4 py-3 tabular-nums">{total.margin}%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

      </div>
    </div>
  );
}
