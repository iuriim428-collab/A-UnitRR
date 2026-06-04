import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ShoppingBag, Clock, Bell, BellOff, MonitorSpeaker } from "lucide-react";
import { useNewOrders } from "@/contexts/new-orders-context";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

const fmt = (n: number | null | undefined, dec = 0) =>
  n == null || isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

type Marketplace = "wb" | "ozon" | "ym";
type PeriodMode = "today" | "custom";

interface Order {
  id: string | number;
  marketplace: Marketplace;
  time: string;
  article: string;
  name: string;
  price: number;
  qty: number;
  status: string;
  region: string;
  warehouse: string;
}

const MP_LABELS: Record<Marketplace, string> = { wb: "WB", ozon: "Ozon", ym: "ЯМ" };
const MP_COLORS: Record<Marketplace, string> = {
  wb: "bg-pink-100 text-pink-700 border-pink-200",
  ozon: "bg-blue-100 text-blue-700 border-blue-200",
  ym: "bg-orange-100 text-orange-700 border-orange-200",
};
const MP_DOT: Record<Marketplace, string> = {
  wb: "bg-[#cb11ab]",
  ozon: "bg-[#005bff]",
  ym: "bg-[#fc3f1d]",
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  new: { label: "Новый", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  cancel: { label: "Отмена", cls: "bg-red-50 text-red-600 border-red-200 line-through" },
  delivered: { label: "Доставлен", cls: "bg-green-50 text-green-700 border-green-200" },
  cancelled: { label: "Отменён", cls: "bg-red-50 text-red-600 border-red-200 line-through" },
  cancelled_by_user: { label: "Отм. покупателем", cls: "bg-red-50 text-red-600 border-red-200 line-through" },
  cancelled_in_delivery: { label: "Отм. в доставке", cls: "bg-red-50 text-red-600 border-red-200 line-through" },
  awaiting_packaging: { label: "Упаковка", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  awaiting_deliver: { label: "Ожид. отгрузки", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  processing: { label: "Обработка", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  delivery: { label: "В доставке", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  partially_returned: { label: "Частичный возврат", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function statusInfo(s: string) {
  return STATUS_MAP[s?.toLowerCase()] ?? { label: s ?? "—", cls: "bg-muted text-muted-foreground border-border" };
}

function isCancelled(status: string) {
  return ["cancel", "cancelled", "cancelled_by_user", "cancelled_in_delivery"].includes(status?.toLowerCase());
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" }),
    time: d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }),
  };
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

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    // AudioContext not available — ignore
  }
}

export default function OrdersFeed() {
  const { addNewOrders, clearNewOrders } = useNewOrders();

  const [mode, setMode] = useState<PeriodMode>("today");
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayStr());
  const [appliedFrom, setAppliedFrom] = useState(daysAgo(7));
  const [appliedTo, setAppliedTo] = useState(todayStr());
  const [mpFilter, setMpFilter] = useState<Marketplace | "all">("all");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem("orders-sound") !== "off"; } catch { return true; }
  });
  const [notifyEnabled, setNotifyEnabled] = useState(() => {
    try { return localStorage.getItem("orders-notify") === "on"; } catch { return false; }
  });

  const prevOrderIdsRef = useRef<Set<string> | null>(null);
  const isFirstLoadRef = useRef(true);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    clearNewOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveFrom = mode === "today" ? todayStr() : appliedFrom;
  const effectiveTo = mode === "today" ? todayStr() : appliedTo;

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["orders-feed", effectiveFrom, effectiveTo],
    queryFn: () =>
      fetch(`${BASE()}/api/orders-feed?from=${effectiveFrom}&to=${effectiveTo}`).then((r) => r.json()),
    staleTime: mode === "today" ? 55_000 : 300_000,
    refetchInterval: mode === "today" ? 60_000 : false,
  });

  const secondsAgo = useSecondsAgo(dataUpdatedAt);

  const allOrders: Order[] = data?.orders ?? [];

  useEffect(() => {
    if (!dataUpdatedAt || mode !== "today") return;

    const currentIds = new Set(allOrders.map((o) => `${o.marketplace}-${o.id}`));

    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      prevOrderIdsRef.current = currentIds;
      return;
    }

    const prev = prevOrderIdsRef.current;
    prevOrderIdsRef.current = currentIds;

    if (!prev) return;

    const newOrders = allOrders.filter((o) => !prev.has(`${o.marketplace}-${o.id}`));
    if (newOrders.length === 0) return;

    const newIds = new Set(newOrders.map((o) => `${o.marketplace}-${o.id}`));
    setFlashingIds(newIds);
    setTimeout(() => setFlashingIds(new Set()), 2500);

    addNewOrders(newOrders.length);

    const sum = newOrders.reduce((acc, o) => acc + o.price * o.qty, 0);
    const sumFmt = sum.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const title = `🛍 ${newOrders.length} новый заказ${newOrders.length === 1 ? "" : newOrders.length < 5 ? "а" : "ов"}`;

    toast({ title, description: `Сумма: ${sumFmt} ₽` });

    if (soundEnabled) playBeep();

    if (notifyEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body: `Сумма: ${sumFmt} ₽`, icon: "/favicon.ico", tag: "new-orders" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  const toggleSound = () => {
    setSoundEnabled((v) => {
      const next = !v;
      try { localStorage.setItem("orders-sound", next ? "on" : "off"); } catch { /* ignore */ }
      return next;
    });
  };

  const toggleNotify = async () => {
    if (!notifyEnabled) {
      if (typeof Notification === "undefined") return;
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") return;
      setNotifyEnabled(true);
      try { localStorage.setItem("orders-notify", "on"); } catch { /* ignore */ }
    } else {
      setNotifyEnabled(false);
      try { localStorage.setItem("orders-notify", "off"); } catch { /* ignore */ }
    }
  };

  const apply = () => { setAppliedFrom(from); setAppliedTo(to); };
  const totals = data?.totals;
  const orders = mpFilter === "all" ? allOrders : allOrders.filter((o) => o.marketplace === mpFilter);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">Лента заказов</h1>
            <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full border border-green-200">
              Live API
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">WB + Ozon FBO + ЯМ FBY/FBS · сортировка по времени</p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          {/* Period toggle */}
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

          {/* Date pickers — only in custom mode */}
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

          {/* Auto-refresh status */}
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
                <button onClick={() => refetch()} className="ml-1 hover:text-foreground transition-colors">
                  <RefreshCw className="h-3 w-3" />
                </button>
              </>
            ) : null}
            {mode === "today" && (
              <>
                <button
                  onClick={toggleSound}
                  title={soundEnabled ? "Звук включён — нажмите для отключения" : "Звук отключён — нажмите для включения"}
                  className={`ml-1 transition-colors hover:text-foreground ${soundEnabled ? "text-muted-foreground" : "text-muted-foreground/40"}`}
                >
                  {soundEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                </button>
                <button
                  onClick={toggleNotify}
                  title={notifyEnabled ? "Уведомления в фоне включены — нажмите для отключения" : "Уведомления в фоне отключены — нажмите для включения"}
                  className={`ml-1 transition-colors hover:text-foreground ${notifyEnabled ? "text-muted-foreground" : "text-muted-foreground/40"}`}
                >
                  <MonitorSpeaker className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Запрос к API всех площадок…</span>
        </div>
      )}

      {/* Totals */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="col-span-2 sm:col-span-1 border-border shadow-none">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Выручка</p>
              <p className="text-2xl font-bold tabular-nums">{fmt(totals.revenue)} ₽</p>
            </CardContent>
          </Card>
          {(["wb", "ozon", "ym"] as Marketplace[]).map((mp) => (
            <Card
              key={mp}
              className={`cursor-pointer transition-all shadow-none border ${
                mpFilter === mp ? "ring-2 ring-primary ring-offset-1" : "hover:shadow-md"
              }`}
              onClick={() => setMpFilter(mpFilter === mp ? "all" : mp)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${MP_DOT[mp]}`} />
                  <p className="text-xs text-muted-foreground font-medium">
                    {mp === "wb" ? "Wildberries" : mp === "ozon" ? "Ozon FBO" : "Яндекс Маркет"}
                  </p>
                </div>
                <p className="text-2xl font-bold tabular-nums">{fmt(totals[mp])}</p>
                <p className="text-xs text-muted-foreground mt-0.5">позиций</p>
              </CardContent>
            </Card>
          ))}
          <Card className="shadow-none border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Всего</p>
              <p className="text-2xl font-bold tabular-nums">{fmt(totals.total)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">позиций</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter pills */}
      {totals && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setMpFilter("all")}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
              mpFilter === "all"
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Все площадки · {totals.total}
          </button>
          {(["wb", "ozon", "ym"] as Marketplace[]).map((mp) => (
            <button
              key={mp}
              onClick={() => setMpFilter(mpFilter === mp ? "all" : mp)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                mpFilter === mp
                  ? `${MP_COLORS[mp]}`
                  : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {MP_LABELS[mp]} · {totals[mp]}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes row-flash {
          0%   { background-color: rgb(220 252 231); }
          60%  { background-color: rgb(220 252 231); }
          100% { background-color: transparent; }
        }
        .row-new-flash {
          animation: row-flash 2.5s ease-out forwards;
        }
      `}</style>

      {/* Orders table */}
      {orders.length > 0 && (
        <Card className="shadow-none border overflow-hidden">
          <CardHeader className="py-3 px-5 border-b bg-muted/30">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              {orders.length} позиций · {effectiveFrom === effectiveTo ? effectiveFrom : `${effectiveFrom} — ${effectiveTo}`}
              {mpFilter !== "all" && ` · ${MP_LABELS[mpFilter]}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 border-b">
                  <tr>
                    {["Время", "Площадка", "Артикул", "Товар", "Кол-во", "Цена", "Статус", "Склад / Регион"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {orders.map((o, i) => {
                    const { date, time } = fmtTime(o.time);
                    const cancelled = isCancelled(o.status);
                    const st = statusInfo(o.status);
                    const isNew = flashingIds.has(`${o.marketplace}-${o.id}`);
                    return (
                      <tr
                        key={`${o.marketplace}-${o.id}-${i}`}
                        className={`hover:bg-muted/30 ${isNew ? "row-new-flash" : `transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`} ${cancelled ? "opacity-50" : ""}`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold tabular-nums">{time}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">{date}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${MP_COLORS[o.marketplace]}`}>
                            {MP_LABELS[o.marketplace]}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.article}</td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <span className={`line-clamp-1 text-sm ${cancelled ? "line-through text-muted-foreground" : ""}`}>
                            {o.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium tabular-nums">
                          {o.qty > 1 ? <span className="font-bold text-primary">{o.qty}</span> : <span className="text-muted-foreground">{o.qty}</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-bold tabular-nums">{fmt(o.price * o.qty)} ₽</span>
                          {o.qty > 1 && (
                            <span className="text-xs text-muted-foreground ml-1.5">
                              ({fmt(o.price)} × {o.qty})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {o.warehouse && <span className="mr-1 font-medium">{o.warehouse}</span>}
                          {o.region && <span>{o.region}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && orders.length === 0 && data && (
        <Card className="shadow-none border">
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Нет заказов за выбранный период</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
