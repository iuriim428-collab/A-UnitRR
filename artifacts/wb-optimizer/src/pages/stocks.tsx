import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, Warehouse } from "lucide-react";

interface WbStock {
  nmId: number;
  article: string;
  name: string;
  total: number;
  warehouses: Record<string, number>;
}

interface OzonStock {
  article: string;
  name: string;
  total: number;
  warehouses: Record<string, number>;
}

interface YmStock {
  article: string;
  warehouses: Record<string, number>;
  total: number;
}

interface StocksData {
  wb: WbStock[];
  ozon: OzonStock[];
  ym: YmStock[];
  ymWarehouseNames: Record<string, string>;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

type Tab = "wb" | "ozon" | "ym";

export default function Stocks() {
  const [tab, setTab] = useState<Tab>("wb");

  const { data, isLoading, refetch, isFetching } = useQuery<StocksData>({
    queryKey: ["stocks"],
    queryFn: () => fetch("/api/stocks").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const tabs: { key: Tab; label: string; color: string; count: number }[] = [
    { key: "wb", label: "Wildberries", color: "bg-[#cb11ab]", count: data?.wb.length ?? 0 },
    { key: "ozon", label: "Ozon", color: "bg-[#005bff]", count: data?.ozon.length ?? 0 },
    { key: "ym", label: "Яндекс Маркет", color: "bg-[#fc3f1d]", count: data?.ym.length ?? 0 },
  ];

  function collectWarehouses(rows: { warehouses: Record<string, number> }[]): string[] {
    const totals: Record<string, number> = {};
    for (const row of rows) {
      for (const [wh, qty] of Object.entries(row.warehouses ?? {})) {
        totals[wh] = (totals[wh] ?? 0) + qty;
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }

  // Collect all WB warehouses in order of total stock
  const wbWarehouses = collectWarehouses(data?.wb ?? []);
  const ozonWarehouses = collectWarehouses(data?.ozon ?? []);

  const ymWarehouses = collectWarehouses(data?.ym ?? []);

  const wbTotal = data?.wb.reduce((s, r) => s + r.total, 0) ?? 0;
  const ozonTotal = data?.ozon.reduce((s, r) => s + r.total, 0) ?? 0;
  const ymTotal = data?.ym.reduce((s, r) => s + r.total, 0) ?? 0;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Warehouse className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Остатки по складам</h1>
            <p className="text-sm text-muted-foreground">Актуальные данные с маркетплейсов</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "WB", color: "border-[#cb11ab]", dot: "bg-[#cb11ab]", total: wbTotal, skus: data?.wb.length ?? 0 },
          { label: "Ozon", color: "border-[#005bff]", dot: "bg-[#005bff]", total: ozonTotal, skus: data?.ozon.length ?? 0 },
          { label: "Яндекс Маркет", color: "border-[#fc3f1d]", dot: "bg-[#fc3f1d]", total: ymTotal, skus: data?.ym.length ?? 0 },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border-l-4 ${c.color} bg-card p-4 shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              <span className="text-sm font-medium text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-3xl font-bold">{fmt(c.total)}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.skus} артикулов</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${t.color}`} />
            {t.label}
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab === t.key ? "bg-muted text-muted-foreground" : "bg-background/50"}`}>
              {t.count}
            </span>
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
          <>
            {/* WB */}
            {tab === "wb" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-muted/40">Артикул</th>
                      <th className="text-left px-4 py-3 font-semibold min-w-[180px]">Название</th>
                      <th className="text-right px-4 py-3 font-semibold">Всего</th>
                      {wbWarehouses.map((wh) => (
                        <th key={wh} className="text-right px-3 py-3 font-semibold whitespace-nowrap text-xs text-muted-foreground">
                          {wh}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.wb ?? []).map((row) => (
                      <tr key={row.nmId} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs sticky left-0 bg-background">{row.article}</td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate" title={row.name}>
                          {row.name}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">
                          <span className={row.total === 0 ? "text-destructive" : row.total < 10 ? "text-yellow-600 dark:text-yellow-400" : ""}>
                            {fmt(row.total)}
                          </span>
                        </td>
                        {wbWarehouses.map((wh) => {
                          const qty = row.warehouses[wh] ?? 0;
                          return (
                            <td key={wh} className="px-3 py-2.5 text-right text-muted-foreground">
                              {qty > 0 ? fmt(qty) : <span className="text-muted-foreground/30">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-muted/20 font-semibold text-sm">
                      <td className="px-4 py-2.5 sticky left-0 bg-muted/20" colSpan={2}>Итого</td>
                      <td className="px-4 py-2.5 text-right">{fmt(wbTotal)}</td>
                      {wbWarehouses.map((wh) => {
                        const total = (data?.wb ?? []).reduce((s, r) => s + (r.warehouses[wh] ?? 0), 0);
                        return <td key={wh} className="px-3 py-2.5 text-right">{fmt(total)}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Ozon */}
            {tab === "ozon" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-muted/40">Артикул</th>
                      <th className="text-left px-4 py-3 font-semibold min-w-[180px]">Название</th>
                      <th className="text-right px-4 py-3 font-semibold">Всего</th>
                      {ozonWarehouses.map((wh) => (
                        <th key={wh} className="text-right px-3 py-3 font-semibold whitespace-nowrap text-xs text-muted-foreground">
                          {wh.replace(/_РФЦ$/, "").replace(/_МРФЦ$/, "").replace(/_МПСЦ$/, "").replaceAll("_", " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.ozon ?? []).map((row) => (
                      <tr key={row.article} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs sticky left-0 bg-background">{row.article}</td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate" title={row.name}>
                          {row.name}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">
                          <span className={row.total === 0 ? "text-destructive" : row.total < 10 ? "text-yellow-600 dark:text-yellow-400" : ""}>
                            {fmt(row.total)}
                          </span>
                        </td>
                        {ozonWarehouses.map((wh) => {
                          const qty = row.warehouses[wh] ?? 0;
                          return (
                            <td key={wh} className="px-3 py-2.5 text-right text-muted-foreground">
                              {qty > 0 ? fmt(qty) : <span className="text-muted-foreground/30">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-muted/20 font-semibold text-sm">
                      <td className="px-4 py-2.5 sticky left-0 bg-muted/20" colSpan={2}>Итого</td>
                      <td className="px-4 py-2.5 text-right">{fmt(ozonTotal)}</td>
                      {ozonWarehouses.map((wh) => {
                        const total = (data?.ozon ?? []).reduce((s, r) => s + (r.warehouses[wh] ?? 0), 0);
                        return <td key={wh} className="px-3 py-2.5 text-right">{fmt(total)}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* YM */}
            {tab === "ym" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-muted/40">Артикул</th>
                      <th className="text-right px-4 py-3 font-semibold">Доступно (всего)</th>
                      {ymWarehouses.map((whId) => (
                        <th key={whId} className="text-right px-3 py-3 font-semibold whitespace-nowrap text-xs text-muted-foreground">
                          {data?.ymWarehouseNames?.[whId] ?? `Склад ${whId}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.ym ?? []).map((row) => (
                      <tr key={row.article} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs sticky left-0 bg-background">{row.article}</td>
                        <td className="px-4 py-2.5 text-right font-bold">
                          <span className={row.total === 0 ? "text-destructive" : row.total < 5 ? "text-yellow-600 dark:text-yellow-400" : ""}>
                            {fmt(row.total)}
                          </span>
                        </td>
                        {ymWarehouses.map((whId) => {
                          const qty = row.warehouses[whId] ?? 0;
                          return (
                            <td key={whId} className="px-3 py-2.5 text-right text-muted-foreground">
                              {qty > 0 ? fmt(qty) : <span className="text-muted-foreground/30">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-muted/20 font-semibold text-sm">
                      <td className="px-4 py-2.5 sticky left-0 bg-muted/20">Итого</td>
                      <td className="px-4 py-2.5 text-right">{fmt(ymTotal)}</td>
                      {ymWarehouses.map((whId) => {
                        const total = (data?.ym ?? []).reduce((s, r) => s + (r.warehouses[whId] ?? 0), 0);
                        return <td key={whId} className="px-3 py-2.5 text-right">{fmt(total)}</td>;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
