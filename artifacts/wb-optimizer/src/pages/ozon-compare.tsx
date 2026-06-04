import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";


interface Report { id: number; filename: string; period: string | null; }

interface CompareRow {
  sku: string;
  article: string | null;
  productName: string;
  abcRevenue: string | null;
  searchPosition: number | null;
  totalOrders: number;
  adOrders: number;
  organicOrders: number;
  adShare: number;
  totalRevenue: number;
  adSpend: number;
  adCpo: number | null;
  totalCpo: number | null;
  drr: number | null;
  impressionsSearch: number;
  impressionsAd: number;
  cartConvPct: number;
  supplyRecommendation: string | null;
  supplyQty: number | null;
  hasAdData: boolean;
}

function fmt(n: number | string | null | undefined, dec = 0) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function AbcBadge({ val }: { val: string | null }) {
  if (!val) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = val === "A" ? "bg-green-600 text-white" : val === "B" ? "bg-amber-500 text-white" : "bg-gray-400 text-white";
  return <Badge className={`${cls} text-xs px-1.5`}>{val}</Badge>;
}

function AdShareBar({ pct }: { pct: number }) {
  const organic = 100 - pct;
  if (pct === 0) return <div className="flex items-center gap-1"><div className="w-20 h-2 rounded bg-green-200" /><span className="text-xs text-green-600">100% орг.</span></div>;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-2 w-20 rounded overflow-hidden">
        <div className="bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
        <div className="bg-green-300" style={{ width: `${Math.max(organic, 0)}%` }} />
      </div>
      <div className="flex gap-1 text-xs">
        <span className="text-blue-600">{fmt(pct, 0)}%</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-green-600">{fmt(organic, 0)}%</span>
      </div>
    </div>
  );
}

function CpoCell({ cpo, label }: { cpo: number | null; label?: string }) {
  if (cpo === null) return <span className="text-muted-foreground">—</span>;
  const cls = cpo < 200 ? "text-green-600 font-bold" : cpo < 500 ? "text-amber-600 font-semibold" : "text-destructive font-bold";
  return <span className={cls}>{label && <span className="text-xs text-muted-foreground mr-1">{label}</span>}{fmt(cpo, 0)} ₽</span>;
}

export default function OzonCompare() {
  const [adReportId, setAdReportId] = useState<string>("");
  const [salesReportId, setSalesReportId] = useState<string>("");
  const [runCompare, setRunCompare] = useState(false);

  const { data: adReports = [], isLoading: adLoading } = useQuery<Report[]>({
    queryKey: ["ozon-ad-reports"],
    queryFn: async () => {
      const r = await fetch(`/api/ozon/ad-reports`);
      return r.json();
    },
    staleTime: 0,
  });

  const { data: salesReports = [], isLoading: salesLoading } = useQuery<Report[]>({
    queryKey: ["ozon-sales-reports"],
    queryFn: async () => {
      const r = await fetch(`/api/ozon/sales-reports`);
      return r.json();
    },
    staleTime: 0,
  });

  const reportsLoading = adLoading || salesLoading;

  const { data: rows = [], isLoading } = useQuery<CompareRow[]>({
    queryKey: ["ozon-compare", adReportId, salesReportId],
    queryFn: async () => {
      const r = await fetch(`/api/ozon/compare?adReportId=${adReportId}&salesReportId=${salesReportId}`);
      return r.json();
    },
    enabled: runCompare && !!adReportId && !!salesReportId,
  });

  const totalAdSpend = rows.reduce((s, r) => s + r.adSpend, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalOrders = rows.reduce((s, r) => s + r.totalOrders, 0);
  const totalAdOrders = rows.reduce((s, r) => s + r.adOrders, 0);
  const totalOrganic = rows.reduce((s, r) => s + r.organicOrders, 0);
  const totalDrr = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : null;
  const overallAdCpo = totalAdOrders > 0 ? totalAdSpend / totalAdOrders : null;
  const overallTotalCpo = totalOrders > 0 ? totalAdSpend / totalOrders : null;
  const urgentRows = rows.filter((r) => r.supplyRecommendation?.includes("Срочно"));
  const dependentRows = rows.filter((r) => r.adShare > 70 && r.adOrders > 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ozon — Сравнение: реклама vs органика</h1>
        <p className="text-muted-foreground mt-1">Выберите отчёт продвижения и аналитики за один период</p>
      </div>

      {/* Report selectors */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Аналитика продвижения (реклама)</label>
              {adLoading ? (
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted/30 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка...
                </div>
              ) : (
                <Select value={adReportId} onValueChange={(v) => { setAdReportId(v); setRunCompare(false); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={adReports.length === 0 ? "Нет загруженных отчётов" : "Выберите период..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {adReports.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.period ?? r.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Аналитика по товарам (общая)</label>
              {salesLoading ? (
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted/30 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка...
                </div>
              ) : (
                <Select value={salesReportId} onValueChange={(v) => { setSalesReportId(v); setRunCompare(false); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={salesReports.length === 0 ? "Нет загруженных отчётов" : "Выберите период..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {salesReports.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.period ?? r.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              disabled={!adReportId || !salesReportId || reportsLoading}
              onClick={() => setRunCompare(true)}
              className="shrink-0"
            >
              {reportsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
              Сравнить
            </Button>
          </div>
          {!reportsLoading && (adReports.length === 0 || salesReports.length === 0) && (
            <div className="mt-3 text-sm text-amber-600">
              {adReports.length === 0 && <span>Загрузите отчёт «Аналитика продвижения» через соответствующий раздел. </span>}
              {salesReports.length === 0 && <span>Загрузите отчёт «Аналитика по товарам» через соответствующий раздел.</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Сравниваю данные...</div>
      )}

      {runCompare && !isLoading && rows.length > 0 && (
        <>
          {/* Alert: ad-dependent products */}
          {dependentRows.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-400">Зависимость от рекламы: {dependentRows.length} товаров</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Более 70% заказов — из рекламы: {dependentRows.map((r) => r.article ?? r.sku).join(", ")}. Без рекламы продажи упадут.
                </p>
              </div>
            </div>
          )}

          {urgentRows.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">Срочная поставка: {urgentRows.length} товаров</p>
                <p className="text-sm text-muted-foreground mt-1">{urgentRows.map((r) => `${r.article ?? r.sku} (${r.supplyQty} шт)`).join(" · ")}</p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Расход на рекламу", value: `${fmt(totalAdSpend, 0)} ₽` },
              { label: "Выручка (все заказы)", value: `${fmt(totalRevenue, 0)} ₽` },
              { label: "Заказы рекл. / орг.", value: `${totalAdOrders} / ${totalOrganic}` },
              { label: "ДРР общий", value: totalDrr !== null ? `${fmt(totalDrr, 1)}%` : "—" },
              { label: "CPO рекл. / на все заказы", value: overallAdCpo !== null ? `${fmt(overallAdCpo, 0)} / ${fmt(overallTotalCpo, 0)} ₽` : "—" },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
                <CardContent><p className="text-lg font-bold leading-tight">{value}</p></CardContent>
              </Card>
            ))}
          </div>

          {/* Detail table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Товар</TableHead>
                    <TableHead className="text-center">ABC</TableHead>
                    <TableHead className="text-right">Позиция</TableHead>
                    <TableHead className="text-right">Выручка</TableHead>
                    <TableHead>Реклама / Органика</TableHead>
                    <TableHead className="text-right">Расход</TableHead>
                    <TableHead className="text-right">CPO рекл.</TableHead>
                    <TableHead className="text-right">CPO на все заказы</TableHead>
                    <TableHead className="text-right">ДРР</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={r.adShare > 70 && r.adOrders > 0 ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                      <TableCell>
                        <div className="font-medium text-sm max-w-[200px] truncate" title={r.productName}>{r.productName}</div>
                        {r.article && <div className="font-mono text-xs text-muted-foreground">{r.article}</div>}
                        {!r.hasAdData && <Badge variant="outline" className="text-xs mt-0.5 text-muted-foreground">нет в рекл. отчёте</Badge>}
                      </TableCell>
                      <TableCell className="text-center"><AbcBadge val={r.abcRevenue} /></TableCell>
                      <TableCell className="text-right">
                        {r.searchPosition !== null ? (
                          <span className={r.searchPosition <= 50 ? "text-green-600 font-semibold" : r.searchPosition <= 100 ? "text-amber-600" : "text-destructive"}>
                            {fmt(r.searchPosition, 0)}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.totalRevenue)} ₽</TableCell>
                      <TableCell>
                        {r.hasAdData ? (
                          <AdShareBar pct={r.adShare} />
                        ) : (
                          <span className="text-xs text-muted-foreground">только органика</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{r.adSpend > 0 ? `${fmt(r.adSpend, 0)} ₽` : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right"><CpoCell cpo={r.adCpo} /></TableCell>
                      <TableCell className="text-right"><CpoCell cpo={r.totalCpo} /></TableCell>
                      <TableCell className="text-right">
                        {r.drr !== null ? (
                          <span className={r.drr < 15 ? "text-green-600 font-bold" : r.drr < 30 ? "text-amber-600" : "text-destructive font-bold"}>
                            {fmt(r.drr, 1)}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
