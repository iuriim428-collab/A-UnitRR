import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronDown, ChevronRight, Package } from "lucide-react";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

const fmt = (n: number | null | undefined, dec = 0) => {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

export default function YmLive() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(30));
  const [appliedTo, setAppliedTo] = useState(today());
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ym-live-products", appliedFrom, appliedTo],
    queryFn: () =>
      fetch(`${BASE()}/api/ym-live/products?from=${appliedFrom}&to=${appliedTo}`).then((r) => r.json()),
    staleTime: 120_000,
  });

  const apply = () => { setAppliedFrom(from); setAppliedTo(to); };
  const rows: any[] = data?.rows ?? [];
  const totals = data?.totals;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">ЯМ — Живая аналитика</h1>
            <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">Live API</span>
          </div>
          <p className="text-muted-foreground mt-1">
            Заказы напрямую из Partner API · FBY + FBS · {data?.totalOffers ? `${data.totalOffers} товаров в каталоге` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 text-sm" />
          <span className="text-muted-foreground">—</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 text-sm" />
          <Button onClick={apply} disabled={isLoading} className="bg-[#fc3f1d] hover:bg-[#d93318]">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Запрос к Яндекс Маркет Partner API...</span>
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Выручка (заказы)", value: `${fmt(totals.revenue)} ₽` },
            { label: "Заказов", value: fmt(totals.orders) },
            { label: "Отмен", value: fmt(totals.cancels), bad: totals.cancels > 0 },
            { label: "FBY / FBS", value: `${fmt(totals.fbyOrders)} / ${fmt(totals.fbsOrders)}` },
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

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {rows.length} SKU с заказами · {appliedFrom} — {appliedTo}
            </CardTitle>
            <span className="text-xs text-muted-foreground">Нажмите на строку для деталей</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {["", "Товар", "Offer ID", "Категория", "Выручка", "Заказы", "Отмены", "% отмен", "FBY", "FBS"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const isOpen = openId === row.offerId;
                    return [
                      <tr
                        key={row.offerId}
                        className={`border-b cursor-pointer transition-colors hover:bg-muted/20 ${isOpen ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}
                        onClick={() => setOpenId(isOpen ? null : row.offerId)}
                      >
                        <td className="px-3 py-2.5 w-6">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <span className="line-clamp-2 leading-tight">{row.name}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.offerId}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.category}</td>
                        <td className="px-3 py-2.5 font-semibold">{fmt(row.revenue)} ₽</td>
                        <td className="px-3 py-2.5">{fmt(row.orders)}</td>
                        <td className={`px-3 py-2.5 font-medium ${row.cancels > 0 ? "text-destructive" : "text-green-600"}`}>
                          {fmt(row.cancels)}
                        </td>
                        <td className={`px-3 py-2.5 font-medium ${row.cancelRate > 10 ? "text-destructive" : row.cancelRate > 0 ? "text-amber-600" : "text-green-600"}`}>
                          {fmt(row.cancelRate, 1)}%
                        </td>
                        <td className="px-3 py-2.5 text-xs">{row.fby > 0 ? <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{row.fby}</span> : "—"}</td>
                        <td className="px-3 py-2.5 text-xs">{row.fbs > 0 ? <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{row.fbs}</span> : "—"}</td>
                      </tr>,
                      isOpen && (
                        <tr key={`${row.offerId}-detail`}>
                          <td colSpan={10} className="px-6 pb-4 bg-red-50/20 dark:bg-red-950/10">
                            <div className="pt-2 space-y-2 text-sm">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div><p className="text-xs text-muted-foreground">Выручка</p><p className="text-xl font-bold">{fmt(row.revenue)} ₽</p></div>
                                <div><p className="text-xs text-muted-foreground">Всего заказов</p><p className="text-xl font-bold">{fmt(row.orders)}</p></div>
                                <div><p className="text-xs text-muted-foreground">FBY заказов</p><p className="text-xl font-bold text-blue-600">{fmt(row.fby)}</p></div>
                                <div><p className="text-xs text-muted-foreground">FBS заказов</p><p className="text-xl font-bold text-orange-600">{fmt(row.fbs)}</p></div>
                              </div>
                              <a href={`/sku-card?q=${row.offerId}`} className="text-xs text-[#fc3f1d] hover:underline">
                                Открыть карточку товара →
                              </a>
                            </div>
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

      {!isLoading && rows.length === 0 && data && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Нет заказов за выбранный период</p>
            {data.totalOffers > 0 && (
              <p className="text-sm mt-2">В каталоге {data.totalOffers} товаров</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
