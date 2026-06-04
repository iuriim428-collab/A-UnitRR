import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, TruckIcon, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock } from "lucide-react";

type MPKey = "wb" | "ozon" | "ym";

interface MPEntry {
  stock: number;
  soldInPeriod: number;
  dailyVelocity: number;
  daysLeft: number;
  suggestedShipment: number;
  warehouses: Record<string, number>;
}

interface PlanRow {
  article: string;
  name: string;
  minDaysLeft: number;
  marketplaces: Partial<Record<MPKey, MPEntry>>;
}

interface PlanData {
  from: string;
  to: string;
  periodDays: number;
  targetDays: number;
  rows: PlanRow[];
}

const MP_LABELS: Record<MPKey, { label: string; color: string; dot: string }> = {
  wb:   { label: "WB",   color: "text-[#cb11ab]", dot: "bg-[#cb11ab]" },
  ozon: { label: "Ozon", color: "text-[#005bff]", dot: "bg-[#005bff]" },
  ym:   { label: "ЯМ",   color: "text-[#fc3f1d]", dot: "bg-[#fc3f1d]" },
};

function fmt(n: number) { return n.toLocaleString("ru-RU"); }
function fmtV(n: number) {
  return n >= 1 ? fmt(Math.round(n)) : n.toFixed(1);
}

function DaysCell({ days }: { days: number }) {
  if (days >= 9999) return <span className="text-muted-foreground text-xs">∞</span>;
  const cls =
    days <= 14 ? "text-red-600 dark:text-red-400 font-bold" :
    days <= 30 ? "text-yellow-600 dark:text-yellow-500 font-semibold" :
    "text-green-600 dark:text-green-400";
  return <span className={cls}>{fmt(Math.round(days))}</span>;
}

function DaysIcon({ days }: { days: number }) {
  if (days >= 9999 || days > 30) return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (days > 14) return <Clock className="h-4 w-4 text-yellow-500" />;
  return <AlertTriangle className="h-4 w-4 text-red-500" />;
}

export default function ShipmentPlan() {
  const [periodDays, setPeriodDays] = useState(30);
  const [targetDays, setTargetDays] = useState(45);
  const [mpFilter, setMpFilter] = useState<MPKey | "all">("all");
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, refetch } = useQuery<PlanData>({
    queryKey: ["shipment-plan", periodDays, targetDays],
    queryFn: () =>
      fetch(`/api/shipment-plan?days=${periodDays}&targetDays=${targetDays}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const toggleArticle = (article: string) => {
    setExpandedArticles((prev) => {
      const next = new Set(prev);
      next.has(article) ? next.delete(article) : next.add(article);
      return next;
    });
  };

  // Flat rows filtered by marketplace
  const flatRows = (data?.rows ?? []).flatMap((row) => {
    const mps = (Object.entries(row.marketplaces) as [MPKey, MPEntry][])
      .filter(([mp]) => mpFilter === "all" || mp === mpFilter);
    return mps.map(([mp, entry]) => ({ ...row, mp, entry }));
  }).sort((a, b) => a.entry.daysLeft - b.entry.daysLeft);

  // Summary stats
  const urgent = flatRows.filter((r) => r.entry.daysLeft <= 14 && r.entry.suggestedShipment > 0).length;
  const totalUnits = flatRows.reduce((s, r) => s + r.entry.suggestedShipment, 0);
  const needShipment = flatRows.filter((r) => r.entry.suggestedShipment > 0).length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <TruckIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">План отгрузок</h1>
            <p className="text-sm text-muted-foreground">
              {data ? `Продажи за ${data.from} — ${data.to}` : "Расчёт на основе продаж"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Период продаж:</span>
            <div className="flex gap-1">
              {[7, 14, 30, 60, 90].map((d) => (
                <button key={d}
                  onClick={() => setPeriodDays(d)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${periodDays === d ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}
                >
                  {d}д
                </button>
              ))}
            </div>
          </div>
          {/* Target days */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Цель запаса:</span>
            <div className="flex gap-1">
              {[30, 45, 60, 90].map((d) => (
                <button key={d}
                  onClick={() => setTargetDays(d)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${targetDays === d ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}
                >
                  {d}д
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Обновить
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border-l-4 border-red-500 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-muted-foreground">Срочно (&lt;14 дней)</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{urgent}</p>
          <p className="text-xs text-muted-foreground mt-1">позиций требуют пополнения</p>
        </div>
        <div className="rounded-xl border-l-4 border-primary bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <TruckIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">К отправке</span>
          </div>
          <p className="text-3xl font-bold">{fmt(totalUnits)}</p>
          <p className="text-xs text-muted-foreground mt-1">единиц суммарно</p>
        </div>
        <div className="rounded-xl border-l-4 border-yellow-500 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium text-muted-foreground">Позиций к пополнению</span>
          </div>
          <p className="text-3xl font-bold">{needShipment}</p>
          <p className="text-xs text-muted-foreground mt-1">из {flatRows.length} позиций</p>
        </div>
      </div>

      {/* Marketplace filter */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {(["all", "wb", "ozon", "ym"] as const).map((mp) => (
          <button key={mp}
            onClick={() => setMpFilter(mp)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mpFilter === mp ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mp !== "all" && <span className={`w-2 h-2 rounded-full ${MP_LABELS[mp].dot}`} />}
            {mp === "all" ? "Все" : MP_LABELS[mp].label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Загрузка…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs">
                  <th className="text-left px-4 py-3 font-semibold w-8" />
                  <th className="text-left px-4 py-3 font-semibold">Артикул</th>
                  <th className="text-left px-4 py-3 font-semibold">Название</th>
                  <th className="text-center px-3 py-3 font-semibold">Площадка</th>
                  <th className="text-right px-3 py-3 font-semibold">Остаток</th>
                  <th className="text-right px-3 py-3 font-semibold">Продано за период</th>
                  <th className="text-right px-3 py-3 font-semibold">Продаж/день</th>
                  <th className="text-right px-3 py-3 font-semibold">Осталось дней</th>
                  <th className="text-right px-4 py-3 font-semibold text-primary">К отправке</th>
                </tr>
              </thead>
              <tbody>
                {flatRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      Нет данных
                    </td>
                  </tr>
                )}
                {flatRows.map((row, i) => {
                  const expandKey = `${row.article}-${row.mp}`;
                  const expanded = expandedArticles.has(expandKey);
                  const whEntries = Object.entries(row.entry.warehouses).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);

                  return [
                    <tr key={expandKey}
                      className={`border-b transition-colors hover:bg-muted/30 ${row.entry.suggestedShipment > 0 ? "" : "opacity-60"}`}
                    >
                      <td className="px-4 py-2.5">
                        {whEntries.length > 0 ? (
                          <button onClick={() => toggleArticle(expandKey)}
                            className="text-muted-foreground hover:text-foreground transition-colors">
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">{row.article}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate" title={row.name}>
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${MP_LABELS[row.mp].color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${MP_LABELS[row.mp].dot}`} />
                          {MP_LABELS[row.mp].label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{fmt(row.entry.stock)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(row.entry.soldInPeriod)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtV(row.entry.dailyVelocity)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <DaysIcon days={row.entry.daysLeft} />
                          <DaysCell days={row.entry.daysLeft} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">
                        {row.entry.suggestedShipment > 0 ? (
                          <span className="text-primary">{fmt(row.entry.suggestedShipment)}</span>
                        ) : (
                          <span className="text-muted-foreground/40 font-normal">—</span>
                        )}
                      </td>
                    </tr>,
                    expanded && whEntries.length > 0 && (
                      <tr key={`${expandKey}-wh`} className="border-b bg-muted/10">
                        <td colSpan={4} className="px-8 py-2 text-xs text-muted-foreground">
                          Склады:
                        </td>
                        <td colSpan={5} className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            {whEntries.map(([wh, qty]) => (
                              <span key={wh} className="inline-flex items-center gap-1 text-xs bg-muted rounded-md px-2 py-0.5">
                                <span className="text-muted-foreground">{wh}</span>
                                <span className="font-medium">{fmt(qty)}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> менее 14 дней</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-yellow-500" /> 14–30 дней</span>
        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> более 30 дней</span>
        <span className="ml-2">«К отправке» = цель запаса × продаж/день − текущий остаток</span>
      </div>
    </div>
  );
}
