import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Clock } from "lucide-react";


const fmt = (n: number | null | undefined, dec = 0) =>
  n == null || isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

type Marketplace = "wb" | "ozon" | "ym";
type PeriodMode = "today" | "custom";

interface Order {
  marketplace: Marketplace;
  time: string;
  price: number;
  qty: number;
  status: string;
}

const ROWS: { key: Marketplace | "all"; label: string; color: string; bg: string }[] = [
  { key: "all", label: "Все", color: "text-gray-700", bg: "bg-gray-500" },
  { key: "wb", label: "WB", color: "text-pink-700", bg: "bg-[#cb11ab]" },
  { key: "ozon", label: "Ozon", color: "text-blue-700", bg: "bg-[#005bff]" },
  { key: "ym", label: "ЯМ", color: "text-orange-700", bg: "bg-[#fc3f1d]" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function isCancelled(status: string) {
  return ["cancel", "cancelled", "cancelled_by_user", "cancelled_in_delivery"].includes(
    status?.toLowerCase()
  );
}

function getHourMoscow(iso: string): number {
  const d = new Date(iso);
  return parseInt(
    d.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Europe/Moscow" })
  ) % 24;
}

interface Cell {
  count: number;
  revenue: number;
}

function buildHeatmap(orders: Order[]): Record<string, Record<number, Cell>> {
  const map: Record<string, Record<number, Cell>> = {
    all: {},
    wb: {},
    ozon: {},
    ym: {},
  };
  for (const h of HOURS) {
    for (const key of Object.keys(map)) {
      map[key][h] = { count: 0, revenue: 0 };
    }
  }

  for (const o of orders) {
    if (isCancelled(o.status)) continue;
    const h = getHourMoscow(o.time);
    const rev = o.price * o.qty;
    map["all"][h].count += o.qty;
    map["all"][h].revenue += rev;
    if (map[o.marketplace]) {
      map[o.marketplace][h].count += o.qty;
      map[o.marketplace][h].revenue += rev;
    }
  }

  return map;
}

function cellOpacity(count: number, maxCount: number): number {
  if (maxCount === 0 || count === 0) return 0;
  return Math.max(0.08, count / maxCount);
}

function useSecondsAgo(dataUpdatedAt: number) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const tick = () => setSecs(Math.floor((Date.now() - dataUpdatedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);
  return secs;
}

interface TooltipState {
  row: string;
  hour: number;
  cell: Cell;
  x: number;
  y: number;
}

export default function OrdersHeatmap() {
  const [mode, setMode] = useState<PeriodMode>("today");
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayStr());
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(7));
  const [appliedTo, setAppliedTo] = useState(todayStr());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const effectiveFrom = mode === "today" ? todayStr() : appliedFrom;
  const effectiveTo = mode === "today" ? todayStr() : appliedTo;

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["orders-feed", effectiveFrom, effectiveTo],
    queryFn: () =>
      fetch(`/api/orders-feed?from=${effectiveFrom}&to=${effectiveTo}`).then((r) => r.json()),
    staleTime: mode === "today" ? 55_000 : 300_000,
    refetchInterval: mode === "today" ? 60_000 : false,
  });

  const secondsAgo = useSecondsAgo(dataUpdatedAt);
  const apply = () => { setAppliedFrom(from); setAppliedTo(to); };

  const allOrders: Order[] = data?.orders ?? [];
  const heatmap = buildHeatmap(allOrders);

  const maxCount = Math.max(
    1,
    ...ROWS.map(({ key }) => Math.max(...HOURS.map((h) => heatmap[key]?.[h]?.count ?? 0)))
  );

  const MP_COLORS: Record<string, string> = {
    all: "#6b7280",
    wb: "#cb11ab",
    ozon: "#005bff",
    ym: "#fc3f1d",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Тепловая карта заказов</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Распределение заказов по часам суток (московское время)
          </p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg border">
            <button
              onClick={() => setMode("today")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "today"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Сегодня
            </button>
            <button
              onClick={() => setMode("custom")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "custom"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Выбрать период
            </button>
          </div>

          {mode === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 text-sm" />
              <span className="text-muted-foreground text-sm">—</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 text-sm" />
              <Button onClick={apply} disabled={isFetching} size="sm">
                {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Показать"}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground h-5">
            {isFetching ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Обновляется…</span>
              </>
            ) : dataUpdatedAt ? (
              <>
                <Clock className="h-3 w-3" />
                <span>
                  {mode === "today"
                    ? `Обновлено ${secondsAgo < 5 ? "только что" : `${secondsAgo} сек. назад`} · авто через ${Math.max(0, 60 - secondsAgo)} сек.`
                    : `Обновлено ${secondsAgo < 5 ? "только что" : `${secondsAgo} сек. назад`}`}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Загружаем данные…</span>
        </div>
      )}

      {!isLoading && allOrders.length === 0 && data && (
        <Card className="shadow-none border">
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="font-medium">Нет заказов за выбранный период</p>
          </CardContent>
        </Card>
      )}

      {allOrders.length > 0 && (
        <Card className="shadow-none border overflow-hidden">
          <CardHeader className="py-3 px-5 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                {allOrders.filter((o) => !isCancelled(o.status)).length} заказов ·{" "}
                {effectiveFrom === effectiveTo ? effectiveFrom : `${effectiveFrom} — ${effectiveTo}`}
              </CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Мало</span>
                <div className="flex gap-0.5">
                  {[0.1, 0.25, 0.45, 0.65, 0.85, 1].map((o) => (
                    <div
                      key={o}
                      className="w-4 h-3 rounded-sm"
                      style={{ backgroundColor: `rgba(99,102,241,${o})` }}
                    />
                  ))}
                </div>
                <span>Много</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 relative" onMouseLeave={() => setTooltip(null)}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="w-16 px-4 py-2.5 text-left font-semibold text-muted-foreground sticky left-0 bg-muted/20">
                      МП
                    </th>
                    {HOURS.map((h) => (
                      <th
                        key={h}
                        className="py-2.5 text-center font-medium text-muted-foreground min-w-[36px]"
                      >
                        {String(h).padStart(2, "0")}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                      Итого
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {ROWS.map(({ key, label }) => {
                    const rowTotal = HOURS.reduce(
                      (s, h) => ({
                        count: s.count + (heatmap[key]?.[h]?.count ?? 0),
                        revenue: s.revenue + (heatmap[key]?.[h]?.revenue ?? 0),
                      }),
                      { count: 0, revenue: 0 }
                    );
                    const color = MP_COLORS[key];
                    return (
                      <tr key={key} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2 sticky left-0 bg-background font-semibold" style={{ color }}>
                          {label}
                        </td>
                        {HOURS.map((h) => {
                          const cell = heatmap[key]?.[h] ?? { count: 0, revenue: 0 };
                          const opacity = cellOpacity(cell.count, maxCount);
                          return (
                            <td
                              key={h}
                              className="py-2 text-center cursor-default relative"
                              onMouseEnter={(e) => {
                                if (cell.count > 0) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltip({ row: key, hour: h, cell, x: rect.left + rect.width / 2, y: rect.top });
                                } else {
                                  setTooltip(null);
                                }
                              }}
                            >
                              <div
                                className="mx-auto rounded-md transition-all"
                                style={{
                                  width: 28,
                                  height: 28,
                                  backgroundColor: cell.count > 0 ? color : "transparent",
                                  opacity: cell.count > 0 ? opacity : 1,
                                  border: cell.count > 0 ? `1px solid ${color}30` : "1px solid transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {cell.count > 0 && (
                                  <span
                                    className="text-[10px] font-bold"
                                    style={{ color: opacity > 0.5 ? "white" : color }}
                                  >
                                    {cell.count}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 text-right">
                          <span className="font-bold tabular-nums">{fmt(rowTotal.count)}</span>
                          <span className="text-muted-foreground ml-1.5 text-[10px]">
                            {fmt(rowTotal.revenue)} ₽
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="fixed z-50 pointer-events-none"
                style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}
              >
                <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]">
                  <p className="font-semibold mb-1">
                    {ROWS.find((r) => r.key === tooltip.row)?.label} · {String(tooltip.hour).padStart(2, "0")}:00–{String(tooltip.hour).padStart(2, "0")}:59
                  </p>
                  <p className="text-muted-foreground">
                    Заказов: <span className="font-bold text-foreground">{tooltip.cell.count}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Выручка: <span className="font-bold text-foreground">{fmt(tooltip.cell.revenue)} ₽</span>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hour totals bar chart */}
      {allOrders.length > 0 && (
        <Card className="shadow-none border">
          <CardHeader className="py-3 px-5 border-b bg-muted/30">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Всего заказов по часам
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pt-4 pb-5">
            <div className="flex items-end gap-1 h-20">
              {HOURS.map((h) => {
                const count = heatmap["all"]?.[h]?.count ?? 0;
                const maxH = Math.max(1, ...HOURS.map((hh) => heatmap["all"]?.[hh]?.count ?? 0));
                const pct = count / maxH;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(2, pct * 100)}%`,
                        backgroundColor: `rgba(99,102,241,${Math.max(0.15, pct)})`,
                      }}
                    />
                    {count > 0 && (
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover border rounded px-1.5 py-0.5 text-xs font-medium shadow-md whitespace-nowrap z-10">
                        {String(h).padStart(2, "0")}:00 — {count} зак.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {HOURS.map((h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
