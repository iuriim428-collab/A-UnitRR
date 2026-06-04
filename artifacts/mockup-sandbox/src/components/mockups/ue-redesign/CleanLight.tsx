import { TrendingUp, Package, BarChart2, ShoppingCart, Truck, Warehouse, Megaphone, ChevronDown } from 'lucide-react';

const rows = [
  { article: 'SHIRT-BLK-M', name: 'Футболка чёрная M', orders: 142, revenue: 284000, commission: 34080, logistics: 18460, storage: 4260, promo: 8520, cost: 85200, profit: 133480, margin: 47, abc: 'A' },
  { article: 'PANTS-GRY-L', name: 'Брюки серые L', orders: 89, revenue: 222500, commission: 26700, logistics: 15230, storage: 3560, promo: 6675, cost: 71200, profit: 99135, margin: 44.6, abc: 'A' },
  { article: 'HOODIE-NVY-XL', name: 'Худи тёмно-синее XL', orders: 67, revenue: 200940, commission: 24113, logistics: 14066, storage: 2815, promo: 6028, cost: 53584, profit: 100334, margin: 49.9, abc: 'B' },
  { article: 'DRESS-WHT-S', name: 'Платье белое S', orders: 34, revenue: 102000, commission: 12240, logistics: 9180, storage: 2550, promo: 3060, cost: 30600, profit: 44370, margin: 43.5, abc: 'B' },
  { article: 'JACKET-BLK-M', name: 'Куртка чёрная M', orders: 12, revenue: 71880, commission: 8626, logistics: 7188, storage: 2876, promo: 2157, cost: 28752, profit: 22281, margin: 31.0, abc: 'C' },
];

const total = { orders: 344, revenue: 881320, profit: 399600, margin: 45.3 };

const abcColor: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700',
  B: 'bg-amber-100 text-amber-700',
  C: 'bg-red-100 text-red-600',
};

function fmt(n: number) {
  return n.toLocaleString('ru') + ' ₽';
}

export function CleanLight() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">

      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 tracking-tight">Unit Economics</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
            УСН 6% <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {['Ozon', 'Яндекс Маркет', 'Wildberries', 'Сравнение'].map((tab, i) => (
            <button key={tab} className={`px-4 py-3 text-sm font-medium border-b-2 transition ${i === 2
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Settings bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-w-[200px]">
            <span className="text-xs text-gray-400">Токен WB</span>
            <span className="text-xs font-mono text-gray-300 flex-1">••••••••••••••••</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-400">С</span>
            <span className="text-xs font-mono text-gray-700">01.05.2026</span>
            <span className="text-xs text-gray-300 mx-1">—</span>
            <span className="text-xs font-mono text-gray-700">31.05.2026</span>
          </div>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Загрузить
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Продажи', value: fmt(total.revenue), icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
            { label: 'Прибыль', value: fmt(total.profit),  icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Маржа',   value: total.margin + '%', icon: BarChart2,   color: 'text-violet-600 bg-violet-50' },
            { label: 'Заказы',  value: total.orders + ' шт', icon: Package, color: 'text-amber-600 bg-amber-50' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">{label}</span>
                <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl font-bold text-gray-900">{value}</div>
            </div>
          ))}
        </div>

        {/* Cost breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Структура расходов</h3>
          <div className="grid grid-cols-4 gap-3 text-sm">
            {[
              { label: 'Комиссия', value: fmt(105759), icon: BarChart2, color: 'text-blue-500' },
              { label: 'Логистика', value: fmt(64124), icon: Truck, color: 'text-violet-500' },
              { label: 'Хранение', value: fmt(16061), icon: Warehouse, color: 'text-amber-500' },
              { label: 'Реклама', value: fmt(26440), icon: Megaphone, color: 'text-rose-500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                <div>
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="font-semibold text-gray-800">{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">SKU / Товары</h3>
            <span className="text-xs text-gray-400">{rows.length} позиций</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                {['Артикул', 'Заказы', 'Выручка', 'Комиссия', 'Логистика', 'Хранение', 'Себестоимость', 'Прибыль', 'Маржа', 'ABC'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.article} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{r.article}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[140px]">{r.name}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-700">{r.orders}</td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-gray-900">{fmt(r.revenue)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">{fmt(r.commission)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">{fmt(r.logistics)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">{fmt(r.storage)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">{fmt(r.cost)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-emerald-600">{fmt(r.profit)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.margin >= 45 ? 'bg-emerald-100 text-emerald-700' : r.margin >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                      {r.margin}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${abcColor[r.abc]}`}>{r.abc}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="text-sm font-semibold text-gray-800">
                <td className="px-3 py-2.5">Итого</td>
                <td className="px-3 py-2.5 tabular-nums">{total.orders}</td>
                <td className="px-3 py-2.5 tabular-nums">{fmt(total.revenue)}</td>
                <td colSpan={4} />
                <td className="px-3 py-2.5 tabular-nums text-emerald-600">{fmt(total.profit)}</td>
                <td className="px-3 py-2.5 tabular-nums">{total.margin}%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

      </div>
    </div>
  );
}
