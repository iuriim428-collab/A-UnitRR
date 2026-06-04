import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronDown, ChevronRight, Package, Warehouse } from "lucide-react";


const fmt = (n: number | null | undefined, dec = 0) => {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

function colorRate(v: number) {
  if (v === 0) return "text-green-600";
  if (v < 10) return "text-amber-600";
  return "text-destructive";
}

function RowDetail({ row, stocks }: { row: any; stocks: any[] }) {
  const stock = stocks.find((s) => s.nmId === row.nmId);
  const delivered = row.orders - row.cancels;

  return (
    <div className="space-y-4 pt-2 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Выручка</p>
          <p className="text-xl font-bold">{fmt(row.revenue)} ₽</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">К выплате (WB)</p>
          <p className="text-xl font-bold text-green-700">{fmt(row.forPay)} ₽</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Выкупов</p>
          <p className="text-xl font-bold">{fmt(delivered)}</p>
          <p className="text-xs text-muted-foreground">{fmt(row.sales)} продаж</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Средний СПП</p>
          <p className="text-xl font-bold">{fmt(row.avgSpp, 1)}%</p>
        </div>
      </div>

      {stock && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Остатки · {fmt(stock.total)} шт
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stock.warehouses as Record<string, number>)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .slice(0, 10)
              .map(([wh, qty]) => (
                <span
                  key={wh}
                  className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${(qty as number) === 0 ? "bg-muted text-muted-foreground" : "bg-blue-50 text-blue-800 dark:bg-blue-950/30"}`}
                >
                  <Warehouse className="h-2.5 w-2.5" />
                  {wh}: <span className="font-semibold">{qty as number}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="pt-1">
        <a href={`/sku-card?q=${row.article}`} className="text-xs text-[#cb11ab] hover:underline">
          Открыть карточку товара →
        </a>
      </div>
    </div>
  );
}

function thisMonthRange(): [string, string] {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = today();
  return [from, to];
}

function lastMonthRange(): [string, string] {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return [from, to];
}

export default function WbLive() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(30));
  const [appliedTo, setAppliedTo] = useState(today());
  const [openNm, setOpenNm] = useState<number | null>(null);

  const applyRange = (f: string, t: string) => {
    setFrom(f); setTo(t);
    setAppliedFrom(f); setAppliedTo(t);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["wb-live-products", appliedFrom, appliedTo],
    queryFn: async () => {
      const r = await fetch(`/api/wb-live/products?from=${appliedFrom}&to=${appliedTo}`);
      const json = await r.json();
      if (!r.ok || json?.error) throw new Error(json?.error ?? `HTTP ${r.status}`);
      return json;
    },
    staleTime: 120_000,
    retry: false,
  });

  const { data: stockData } = useQuery({
    queryKey: ["wb-live-stocks"],
    queryFn: () => fetch(`/api/wb-live/stocks`).then((r) => r.json()),
    staleTime: 300_000,
  });

  const apply = () => { setAppliedFrom(from); setAppliedTo(to); };
  const rows: any[] = data?.rows ?? [];
  const totals = data?.totals;
  const stocks: any[] = stockData?.stocks ?? [];
  const rawOrderCount: number | undefined = data?.rawOrderCount;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">WB — Живая аналитика</h1>
            <span className="bg-pink-100 text-pink-700 text-xs font-medium px-2 py-0.5 rounded-full">Live API</span>
          </div>
          <p className="text-muted-foreground mt-1">Заказы и продажи напрямую из Statistics API</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => applyRange(...thisMonthRange())}>
              Этот месяц
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => applyRange(...lastMonthRange())}>
              Прошлый месяц
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => applyRange(daysAgo(30), today())}>
              30 дней
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 text-sm" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 text-sm" />
            <Button onClick={apply} disabled={isLoading} className="bg-[#cb11ab] hover:bg-[#a50d8e]">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
            </Button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Запрос к WB Statistics API...</span>
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <strong>Ошибка:</strong>{" "}
          {(data as any)?.error ?? "Не удалось загрузить данные."}
          {" "}
          <a href="/settings" className="underline font-medium">Проверьте настройки API</a>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && rawOrderCount === 0 && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          WB Statistics API не вернул заказов за этот период. Данные статистики обновляются с задержкой 1–2 дня — попробуйте выбрать период на 2 дня раньше, или используйте кнопку <strong>«Прошлый месяц»</strong>.
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && rawOrderCount != null && rawOrderCount > 0 && (
        <div className="rounded-lg border bg-amber-50 border-amber-200 px-4 py-3 text-sm text-amber-800">
          API вернул {rawOrderCount} заказов, но ни один не попал в выбранный период ({appliedFrom} — {appliedTo}). Попробуйте расширить диапазон дат.
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Выручка (заказы)", value: `${fmt(totals.revenue)} ₽` },
            { label: "К выплате", value: `${fmt(totals.forPay)} ₽`, good: true },
            { label: "Заказов", value: fmt(totals.orders) },
            { label: "Отмен", value: fmt(totals.cancels), bad: totals.cancels > 0 },
          ].map(({ label, value, good, bad }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${good ? "text-green-700" : bad ? "text-destructive" : ""}`}>
                  {value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {rows.length} артикулов · {appliedFrom} — {appliedTo}
            </CardTitle>
            <span className="text-xs text-muted-foreground">Нажмите на строку для детализации</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {["", "Товар", "Артикул", "Остаток", "Выручка", "К выплате", "Заказы", "Отмены", "% отмен"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const isOpen = openNm === row.nmId;
                    const stock = stocks.find((s) => s.nmId === row.nmId);
                    return [
                      <tr
                        key={row.nmId}
                        className={`border-b cursor-pointer transition-colors hover:bg-muted/20 ${isOpen ? "bg-pink-50/60 dark:bg-pink-950/10" : ""}`}
                        onClick={() => setOpenNm(isOpen ? null : row.nmId)}
                      >
                        <td className="px-3 py-2.5 w-6">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <span className="line-clamp-2 leading-tight">{row.name}</span>
                          <span className="text-xs text-muted-foreground">{row.category}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.article}</td>
                        <td className="px-3 py-2.5">
                          {stock ? (
                            <span className={`text-xs font-medium ${stock.total === 0 ? "text-destructive" : stock.total < 10 ? "text-amber-600" : "text-green-600"}`}>
                              {fmt(stock.total)} шт
                            </span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-semibold">{fmt(row.revenue)} ₽</td>
                        <td className="px-3 py-2.5 font-semibold text-green-700">{fmt(row.forPay)} ₽</td>
                        <td className="px-3 py-2.5">{fmt(row.orders)}</td>
                        <td className={`px-3 py-2.5 font-medium ${row.cancels > 0 ? "text-destructive" : "text-green-600"}`}>
                          {fmt(row.cancels)}
                        </td>
                        <td className={`px-3 py-2.5 font-medium ${colorRate(row.cancelRate)}`}>
                          {fmt(row.cancelRate, 1)}%
                        </td>
                      </tr>,
                      isOpen && (
                        <tr key={`${row.nmId}-detail`}>
                          <td colSpan={9} className="px-6 pb-4 bg-pink-50/20 dark:bg-pink-950/10">
                            <RowDetail row={row} stocks={stocks} />
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
