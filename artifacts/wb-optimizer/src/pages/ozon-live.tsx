import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronDown, ChevronRight, Package, TrendingUp, TrendingDown, Minus, Megaphone, BarChart2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

const fmt = (n: number | null | undefined, dec = 0) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

function colorClass(val: number | null | undefined, good: number, bad: number, reverse = false) {
  if (val === null || val === undefined) return "";
  if (reverse) return val <= good ? "text-green-600" : val >= bad ? "text-destructive" : "text-amber-600";
  return val >= good ? "text-green-600" : val <= bad ? "text-destructive" : "text-amber-600";
}

function DynArrow({ val }: { val: number }) {
  if (val > 0) return <TrendingUp className="h-3 w-3 text-green-500 inline" />;
  if (val < 0) return <TrendingDown className="h-3 w-3 text-destructive inline" />;
  return <Minus className="h-3 w-3 text-muted-foreground inline" />;
}

function SkuDetail({ sku, from, to }: { sku: string; from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ozon-live-sku", sku, from, to],
    queryFn: () => fetch(`${BASE()}/api/ozon-live/sku/${sku}?from=${from}&to=${to}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4 text-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка...
      </div>
    );
  }

  if (!data?.summary) {
    return <div className="text-muted-foreground py-4 text-sm">Нет данных за период</div>;
  }

  const s = data.summary;
  const hasData = data.daily?.some((d: any) => d.revenue > 0 || d.orders > 0);
  const ds = data.dbSales;
  const da = data.dbAd;

  return (
    <div className="space-y-5 pt-2">
      {/* Live API stats */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Продажи · Live API ({from} — {to})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Выручка</p>
            <p className="text-xl font-bold">{fmt(s.revenue)} ₽</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Заказы</p>
            <p className="text-xl font-bold">{fmt(s.orders)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Отмены</p>
            <p className={`text-xl font-bold ${s.cancelled > 0 ? "text-destructive" : "text-green-600"}`}>
              {fmt(s.cancelled)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">% отмен</p>
            <p className={`text-xl font-bold ${colorClass(s.cancellationRate, 0, 10, true)}`}>
              {fmt(s.cancellationRate, 1)}%
            </p>
          </div>
        </div>
      </div>

      {/* DB Sales report stats */}
      {ds && (
        <div className="border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Видимость · из отчёта ({ds.period ?? "—"})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Показы</p>
              <p className="text-lg font-semibold">{fmt(ds.impressions)}</p>
              {ds.impressionsDynamic !== 0 && (
                <p className={`text-xs ${ds.impressionsDynamic > 0 ? "text-green-600" : "text-destructive"}`}>
                  <DynArrow val={ds.impressionsDynamic} /> {fmt(Math.abs(ds.impressionsDynamic * 100), 1)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Переходы в карточку</p>
              <p className="text-lg font-semibold">{fmt(ds.cardVisits)}</p>
              {ds.impressions > 0 && (
                <p className="text-xs text-muted-foreground">
                  CTR {fmt((ds.cardVisits / ds.impressions) * 100, 2)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Позиция в поиске</p>
              <p className="text-lg font-semibold">{fmt(ds.searchPosition, 0)}</p>
              {ds.searchPosDynamic !== 0 && (
                <p className={`text-xs ${ds.searchPosDynamic < 0 ? "text-green-600" : "text-destructive"}`}>
                  <DynArrow val={-ds.searchPosDynamic} /> {fmt(Math.abs(ds.searchPosDynamic), 1)}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Конверсия в корзину</p>
              <p className="text-lg font-semibold">{fmt(ds.cartConversion * 100, 2)}%</p>
              <p className="text-xs text-muted-foreground">{fmt(ds.cartAdds)} добавлений</p>
            </div>
          </div>
          {(ds.abcRevenue || ds.abcOrders) && (
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              {ds.abcRevenue && <span>ABC по выручке: <span className="font-semibold text-foreground">{ds.abcRevenue}</span></span>}
              {ds.abcOrders && <span>ABC по заказам: <span className="font-semibold text-foreground">{ds.abcOrders}</span></span>}
            </div>
          )}
        </div>
      )}

      {/* DB Ad report stats */}
      {da && (
        <div className="border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Реклама · из отчёта ({da.period ?? "—"})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Расход</p>
              <p className="text-lg font-semibold">{fmt(da.spend)} ₽</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CPO</p>
              <p className={`text-lg font-semibold ${colorClass(da.cpo ?? 0, 0, 500, true)}`}>
                {da.cpo != null ? `${fmt(da.cpo)} ₽` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CTR (реклама)</p>
              <p className="text-lg font-semibold">{da.ctr != null ? `${fmt(da.ctr, 2)}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">{fmt(da.clicks)} кликов</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ДРР</p>
              <p className={`text-lg font-semibold ${colorClass(da.drr ?? 0, 0, 30, true)}`}>
                {da.drr != null ? `${fmt(da.drr, 1)}%` : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Daily chart */}
      {hasData && data.daily?.length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Динамика по дням</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis yAxisId="l" tick={{ fontSize: 10 }} width={60} tickFormatter={(v) => `${fmt(v)} ₽`} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} width={25} />
              <Tooltip
                formatter={(v: number, name: string) => [
                  name === "revenue" ? `${fmt(v)} ₽` : fmt(v),
                  name === "revenue" ? "Выручка" : "Заказы",
                ]}
                labelFormatter={(l) => `Дата: ${l}`}
              />
              <Line yAxisId="l" type="monotone" dataKey="revenue" stroke="#005bff" strokeWidth={2} dot={false} name="revenue" />
              <Line yAxisId="r" type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} dot={false} name="orders" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="pt-1">
        <a
          href={`/sku-card?q=${sku}`}
          className="text-xs text-[#005bff] hover:underline"
        >
          Открыть полную карточку товара →
        </a>
      </div>
    </div>
  );
}

export default function OzonLive() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(30));
  const [appliedTo, setAppliedTo] = useState(today());
  const [openSku, setOpenSku] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ozon-live-products", appliedFrom, appliedTo],
    queryFn: () =>
      fetch(`${BASE()}/api/ozon-live/products?from=${appliedFrom}&to=${appliedTo}`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const apply = () => { setAppliedFrom(from); setAppliedTo(to); };

  const rows: any[] = data?.rows ?? [];
  const totalRevenue = rows.reduce((s: number, r: any) => s + r.revenue, 0);
  const totalOrders = rows.reduce((s: number, r: any) => s + r.orders, 0);
  const totalCancelled = rows.reduce((s: number, r: any) => s + r.cancelled, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Ozon — Живая аналитика</h1>
            <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">Live API</span>
          </div>
          <p className="text-muted-foreground mt-1">Данные напрямую из Seller API · без выгрузки Excel</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 text-sm" />
          <span className="text-muted-foreground">—</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 text-sm" />
          <Button onClick={apply} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Запрос к Ozon API...</span>
        </div>
      )}

      {/* Summary KPIs */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Итого выручка", value: `${fmt(totalRevenue)} ₽` },
            { label: "Итого заказы", value: fmt(totalOrders) },
            { label: "Итого отмены", value: fmt(totalCancelled), bad: totalCancelled > 0 },
          ].map(({ label, value, bad }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${bad ? "text-destructive" : ""}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Products table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {rows.length} товаров · {appliedFrom} — {appliedTo}
            </CardTitle>
            <span className="text-xs text-muted-foreground">Нажмите на строку для детализации</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {["", "Товар", "SKU", "Данные", "Выручка", "Заказы", "Отмены", "% отмен"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const isOpen = openSku === row.sku;
                    return [
                      <tr
                        key={row.sku}
                        className={`border-b cursor-pointer transition-colors hover:bg-muted/20 ${isOpen ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                        onClick={() => setOpenSku(isOpen ? null : row.sku)}
                      >
                        <td className="px-3 py-2.5 w-6">
                          {isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <span className="line-clamp-2 leading-tight">{row.name}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.sku}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            {row.hasAdData && (
                              <span title="Есть данные рекламы (Excel)">
                                <Megaphone className="h-3.5 w-3.5 text-[#005bff]" />
                              </span>
                            )}
                            {row.hasSalesData && (
                              <span title="Есть данные аналитики (Excel)">
                                <BarChart2 className="h-3.5 w-3.5 text-violet-500" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{fmt(row.revenue)} ₽</td>
                        <td className="px-3 py-2.5">{fmt(row.orders)}</td>
                        <td className={`px-3 py-2.5 font-medium ${row.cancelled > 0 ? "text-destructive" : "text-green-600"}`}>
                          {fmt(row.cancelled)}
                        </td>
                        <td className={`px-3 py-2.5 font-medium ${row.cancellationRate > 10 ? "text-destructive" : row.cancellationRate > 0 ? "text-amber-600" : "text-green-600"}`}>
                          {fmt(row.cancellationRate, 1)}%
                        </td>
                      </tr>,
                      isOpen && (
                        <tr key={`${row.sku}-detail`}>
                          <td colSpan={8} className="px-6 pb-4 bg-blue-50/30 dark:bg-blue-950/10">
                            <SkuDetail sku={row.sku} from={appliedFrom} to={appliedTo} />
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Нет данных за выбранный период</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
