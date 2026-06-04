import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, AlertTriangle, Package, TrendingUp, ShoppingCart, Eye, Store } from "lucide-react";
import { useQuery } from "@tanstack/react-query";


interface OzonSalesRow {
  period: string | null; productName: string; sku: string; article: string | null;
  fulfillment: string | null; cat1: string | null; cat2: string | null;
  abcRevenue: string | null; abcOrders: string | null;
  ordersRevenue: string; revenDynamic: string | null;
  searchPosition: string | null; searchPosDynamic: string | null;
  impressions: number; cardVisits: number; cartAdds: number;
  cartConversion: string | null; ordersQty: number;
  cancellations: number; returns: number;
  supplyRecommendation: string | null; supplyQty: number | null;
}

interface OzonAdRow {
  period: string | null; spend: number; orders: number; sales: number;
  impressions: number; clicks: number;
  cpo: number | null; drr: number | null; ctr: number | null;
}

interface YmCpmRow {
  period: string | null; impressions: number; clicks: number;
  cartAdds: number; orders: number; calcSpend: string; revenue: string;
  campaignNames: string | null;
  cpo: number | null; drr: number | null; ctr: number | null;
}

interface YmCpcRow {
  period: string | null; impressionsBoost: number; clicksBoost: number;
  cartBoost: number; ordersBoost: number; spendBoost: string; revenueBoost: string;
  cpo: number | null; drr: number | null;
}

interface SkuCardData {
  article: string; productName: string | null; found: boolean;
  ozonSales: OzonSalesRow[]; ozonAd: OzonAdRow[];
  ymCpm: YmCpmRow[]; ymCpc: YmCpcRow[];
}

const fmt = (n: number | string | null | undefined, dec = 0) => {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const dyn = (v: string | null) => {
  if (!v) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  const pct = Math.abs(Math.round(n * 100));
  if (n > 0.02) return <span className="text-green-600 text-xs font-medium">↑{pct}%</span>;
  if (n < -0.02) return <span className="text-red-500 text-xs font-medium">↓{pct}%</span>;
  return null;
};

function MetricBox({ label, value, sub, highlight }: { label: string; value: string; sub?: React.ReactNode; highlight?: "good" | "warn" | "bad" }) {
  const cls = highlight === "good" ? "text-green-600" : highlight === "warn" ? "text-amber-600" : highlight === "bad" ? "text-destructive" : "";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold leading-tight ${cls}`}>{value}</span>
      {sub && <span className="text-xs">{sub}</span>}
    </div>
  );
}

function AbcBadge({ val, label }: { val: string | null; label?: string }) {
  if (!val || val === "–") return null;
  const cls = val === "A" ? "bg-green-600" : val === "B" ? "bg-amber-500" : "bg-gray-400";
  return <Badge className={`${cls} text-white text-xs px-1.5`}>{label ? `${label}: ${val}` : val}</Badge>;
}

function SectionHeader({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-t-lg ${color}`}>
      <Icon className="h-4 w-4 text-white" />
      <span className="text-sm font-semibold text-white">{title}</span>
    </div>
  );
}

export default function SkuCard() {
  const initialQ = new URLSearchParams(window.location.search).get("q") ?? "";
  const [input, setInput] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);

  const { data, isLoading, isFetched } = useQuery<SkuCardData>({
    queryKey: ["sku-card", query],
    queryFn: async () => {
      const r = await fetch(`/api/sku-card?article=${encodeURIComponent(query)}`);
      return r.json();
    },
    enabled: query.trim().length > 0,
    staleTime: 0,
  });

  const handleSearch = () => {
    const v = input.trim();
    if (v) setQuery(v);
  };

  const s = data?.ozonSales?.[0];
  const ad = data?.ozonAd?.[0];
  const ymCpm = data?.ymCpm?.[0];
  const ymCpc = data?.ymCpc?.[0];

  const cartConvPct = s ? Number(s.cartConversion ?? 0) * 100 : null;
  const visitToOrder = s && s.cardVisits > 0 ? (s.ordersQty / s.cardVisits) * 100 : null;
  const ctr = s && s.impressions > 0 ? (s.cardVisits / s.impressions) * 100 : null;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Карточка товара</h1>
        <p className="text-muted-foreground mt-1">Все данные по артикулу из всех загруженных отчётов</p>
      </div>

      {/* Search */}
      <div className="flex gap-2 max-w-md">
        <Input
          placeholder="Артикул или SKU (напр. hang10gr, 3587524508)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="font-mono"
        />
        <Button onClick={handleSearch} disabled={isLoading || !input.trim()}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Поиск...</div>
      )}

      {isFetched && data && !data.found && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Артикул «{query}» не найден ни в одном отчёте</p>
            <p className="text-sm mt-1">Убедитесь, что соответствующие отчёты загружены</p>
          </CardContent>
        </Card>
      )}

      {isFetched && data?.found && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <h2 className="text-xl font-bold">{data.productName ?? query}</h2>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm bg-muted px-2 py-0.5 rounded">{query}</code>
                {s?.fulfillment && <Badge variant="outline" className="text-xs">{s.fulfillment}</Badge>}
                {s?.cat2 && <span className="text-sm text-muted-foreground">{s.cat2}</span>}
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {s?.abcRevenue && <AbcBadge val={s.abcRevenue} label="Выручка" />}
              {s?.abcOrders && <AbcBadge val={s.abcOrders} label="Кол-во" />}
              {s?.supplyRecommendation?.includes("Срочно") && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Срочная поставка: {s.supplyQty} шт
                </Badge>
              )}
            </div>
          </div>

          {/* Ozon Sales */}
          {s && (
            <div className="rounded-lg border overflow-hidden">
              <SectionHeader icon={Store} title={`Ozon — Аналитика по товарам · ${s.period ?? "период неизвестен"}`} color="bg-[#005bff]" />
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                <MetricBox
                  label="Выручка (заказы)"
                  value={`${fmt(s.ordersRevenue)} ₽`}
                  sub={dyn(s.revenDynamic)}
                />
                <MetricBox
                  label="Заказов (чистых)"
                  value={`${s.ordersQty - s.cancellations - s.returns}`}
                  sub={<span className="text-muted-foreground text-xs">Всего: {s.ordersQty} · Отм: {s.cancellations} · Возвр: {s.returns}</span>}
                />
                <MetricBox
                  label="Позиция в поиске"
                  value={s.searchPosition ? fmt(s.searchPosition, 0) : "—"}
                  sub={dyn(s.searchPosDynamic)}
                  highlight={
                    s.searchPosition
                      ? Number(s.searchPosition) <= 50 ? "good" : Number(s.searchPosition) <= 100 ? "warn" : "bad"
                      : undefined
                  }
                />
                <MetricBox
                  label="Показы в поиске"
                  value={fmt(s.impressions)}
                  sub={dyn(s.impressionsDynamic)}
                />
              </div>

              {/* Funnel */}
              <div className="border-t mx-4 pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3 font-medium">Воронка</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: "Показы", value: fmt(s.impressions) },
                    { label: "Посещения карточки", value: fmt(s.cardVisits), note: ctr !== null ? `CTR ${fmt(ctr, 1)}%` : undefined },
                    { label: "В корзину", value: fmt(s.cartAdds), note: cartConvPct !== null ? `${fmt(cartConvPct, 1)}% от посещений` : undefined, highlight: cartConvPct !== null ? (cartConvPct >= 10 ? "good" : cartConvPct >= 5 ? "warn" : "bad") : undefined },
                    { label: "Заказы", value: String(s.ordersQty), note: visitToOrder !== null ? `${fmt(visitToOrder, 1)}% из посещений` : undefined },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {i > 0 && <span className="text-muted-foreground text-lg">→</span>}
                      <div className="text-center min-w-[80px]">
                        <div className={`text-base font-bold ${step.highlight === "good" ? "text-green-600" : step.highlight === "bad" ? "text-destructive" : step.highlight === "warn" ? "text-amber-600" : ""}`}>{step.value}</div>
                        <div className="text-xs text-muted-foreground">{step.label}</div>
                        {step.note && <div className="text-xs text-muted-foreground">{step.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Ozon Ad */}
          {ad ? (
            <div className="rounded-lg border overflow-hidden">
              <SectionHeader icon={TrendingUp} title={`Ozon — Аналитика продвижения · ${ad.period ?? "период неизвестен"}`} color="bg-[#005bff]" />
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                <MetricBox label="Расход на рекламу" value={`${fmt(ad.spend, 0)} ₽`} />
                <MetricBox label="Заказы из рекламы" value={String(ad.orders)} />
                <MetricBox
                  label="CPO рекл."
                  value={ad.cpo !== null ? `${fmt(ad.cpo, 0)} ₽` : "—"}
                  highlight={ad.cpo !== null ? (ad.cpo < 200 ? "good" : ad.cpo < 500 ? "warn" : "bad") : undefined}
                />
                <MetricBox
                  label="ДРР"
                  value={ad.drr !== null ? `${fmt(ad.drr, 1)}%` : "—"}
                  highlight={ad.drr !== null ? (ad.drr < 15 ? "good" : ad.drr < 30 ? "warn" : "bad") : undefined}
                />
                <MetricBox label="Показы (реклама)" value={fmt(ad.impressions)} />
                <MetricBox label="Клики (реклама)" value={fmt(ad.clicks)} />
                <MetricBox label="CTR рекл." value={ad.ctr !== null ? `${fmt(ad.ctr, 2)}%` : "—"} />
                <MetricBox label="Выручка рекл." value={`${fmt(ad.sales, 0)} ₽`} />
              </div>
              {s && ad.orders > 0 && (
                <div className="border-t mx-4 pt-3 pb-4">
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Реклама vs Органика</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-3 w-48 rounded overflow-hidden">
                      <div className="bg-[#005bff]" style={{ width: `${Math.min((ad.orders / s.ordersQty) * 100, 100)}%` }} />
                      <div className="bg-green-300" style={{ width: `${Math.max(100 - (ad.orders / s.ordersQty) * 100, 0)}%` }} />
                    </div>
                    <span className="text-sm text-[#005bff] font-medium">{fmt((ad.orders / s.ordersQty) * 100, 0)}% реклама</span>
                    <span className="text-sm text-green-600 font-medium">{fmt(Math.max(100 - (ad.orders / s.ordersQty) * 100, 0), 0)}% органика</span>
                  </div>
                </div>
              )}
            </div>
          ) : data.ozonSales.length > 0 && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Данных из рекламного отчёта Ozon нет — товар не продвигался или отчёт не загружен
            </div>
          )}

          {/* YM CPM */}
          {ymCpm && (
            <div className="rounded-lg border overflow-hidden">
              <SectionHeader icon={Eye} title={`ЯМ — Буст продаж (CPM) · ${ymCpm.period ?? "период неизвестен"}`} color="bg-[#fc3f1d]" />
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                <MetricBox label="Расход (расч.)" value={`${fmt(ymCpm.calcSpend, 0)} ₽`} />
                <MetricBox label="Заказы" value={String(ymCpm.orders)} />
                <MetricBox
                  label="CPO"
                  value={ymCpm.cpo !== null ? `${fmt(ymCpm.cpo, 0)} ₽` : "—"}
                  highlight={ymCpm.cpo !== null ? (ymCpm.cpo < 200 ? "good" : ymCpm.cpo < 500 ? "warn" : "bad") : undefined}
                />
                <MetricBox
                  label="ДРР"
                  value={ymCpm.drr !== null ? `${fmt(ymCpm.drr, 1)}%` : "—"}
                  highlight={ymCpm.drr !== null ? (ymCpm.drr < 15 ? "good" : ymCpm.drr < 30 ? "warn" : "bad") : undefined}
                />
                <MetricBox label="Показы" value={fmt(ymCpm.impressions)} />
                <MetricBox label="Клики" value={fmt(ymCpm.clicks)} />
                <MetricBox label="CTR" value={ymCpm.ctr !== null ? `${fmt(ymCpm.ctr, 2)}%` : "—"} />
                <MetricBox label="Выручка" value={`${fmt(ymCpm.revenue, 0)} ₽`} />
              </div>
              {ymCpm.campaignNames && (
                <div className="border-t mx-4 pt-2 pb-3 text-xs text-muted-foreground">Кампании: {ymCpm.campaignNames}</div>
              )}
            </div>
          )}

          {/* YM CPC */}
          {ymCpc && (
            <div className="rounded-lg border overflow-hidden">
              <SectionHeader icon={ShoppingCart} title={`ЯМ — Буст продаж (CPC) · ${ymCpc.period ?? "период неизвестен"}`} color="bg-[#fc3f1d]" />
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
                <MetricBox label="Расход" value={`${fmt(ymCpc.spendBoost, 0)} ₽`} />
                <MetricBox label="Заказы (буст)" value={String(ymCpc.ordersBoost)} />
                <MetricBox label="CPO" value={ymCpc.cpo !== null ? `${fmt(ymCpc.cpo, 0)} ₽` : "—"}
                  highlight={ymCpc.cpo !== null ? (ymCpc.cpo < 200 ? "good" : ymCpc.cpo < 500 ? "warn" : "bad") : undefined} />
                <MetricBox label="ДРР" value={ymCpc.drr !== null ? `${fmt(ymCpc.drr, 1)}%` : "—"}
                  highlight={ymCpc.drr !== null ? (ymCpc.drr < 15 ? "good" : ymCpc.drr < 30 ? "warn" : "bad") : undefined} />
              </div>
            </div>
          )}

          {/* History: multiple periods */}
          {data.ozonSales.length > 1 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted px-4 py-2">
                <span className="text-sm font-semibold">История по периодам — Ozon продажи</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      {["Период", "Выручка", "Заказы", "Позиция", "Конв. в корзину", "Поставка"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.ozonSales.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2 text-muted-foreground">{row.period ?? "—"}</td>
                        <td className="px-4 py-2 font-medium">{fmt(row.ordersRevenue)} ₽</td>
                        <td className="px-4 py-2">{row.ordersQty}</td>
                        <td className="px-4 py-2">{row.searchPosition ? fmt(row.searchPosition, 0) : "—"}</td>
                        <td className="px-4 py-2">{fmt(Number(row.cartConversion ?? 0) * 100, 1)}%</td>
                        <td className="px-4 py-2 text-xs">{row.supplyRecommendation ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
