import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, Trash2, ChevronLeft, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";


interface Report {
  id: number;
  filename: string;
  period: string | null;
  seller: string | null;
  importedAt: string;
}

interface SalesRow {
  id: number;
  productName: string;
  article: string | null;
  sku: string;
  fulfillment: string | null;
  cat2: string | null;
  abcRevenue: string | null;
  abcOrders: string | null;
  ordersRevenue: string;
  revenDynamic: string | null;
  searchPosition: string | null;
  impressions: number;
  cardVisits: number;
  ordersQty: number;
  cancellations: number;
  returns: number;
  supplyRecommendation: string | null;
  supplyQty: number | null;
  cartConvPct: number;
  visitToOrderPct: number;
  ctr: number;
  netOrders: number;
  isUrgent: boolean;
}

function fmt(n: number | string | null | undefined, dec = 0) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function dyn(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  const pct = (n * 100).toFixed(0);
  if (n > 0.02) return <span className="text-green-600 text-xs">↑{pct}%</span>;
  if (n < -0.02) return <span className="text-destructive text-xs">↓{Math.abs(Number(pct))}%</span>;
  return <span className="text-muted-foreground text-xs">={pct}%</span>;
}

function AbcBadge({ val }: { val: string | null }) {
  if (!val) return <span className="text-muted-foreground">—</span>;
  const cls = val === "A" ? "bg-green-600 text-white" : val === "B" ? "bg-amber-500 text-white" : "bg-gray-400 text-white";
  return <Badge className={`${cls} text-xs px-1.5`}>{val}</Badge>;
}

function SupplyBadge({ rec, qty }: { rec: string | null; qty: number | null }) {
  if (!rec) return null;
  if (rec.includes("Срочно")) {
    return (
      <Badge variant="destructive" className="text-xs gap-1 whitespace-nowrap">
        <AlertTriangle className="h-3 w-3" /> Срочно: {qty ?? "?"} шт
      </Badge>
    );
  }
  if (rec.includes("Поставьте") || rec.includes("поставьте") || rec.includes("Поддерживайте")) {
    return <Badge variant="secondary" className="text-xs whitespace-nowrap">Поставить: {qty ?? "?"} шт</Badge>;
  }
  return <Badge variant="outline" className="text-xs whitespace-nowrap text-green-600">Хватает</Badge>;
}

export default function OzonSales() {
  const [selected, setSelected] = useState<Report | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["ozon-sales-reports"],
    queryFn: async () => (await fetch(`/api/ozon/sales-reports`)).json(),
  });

  const deleteReport = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/ozon/sales-reports/${id}`, { method: "DELETE" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ozon-sales-reports"] }); setSelected(null); toast({ title: "Отчёт удалён" }); },
  });

  if (selected) return <ReportDetail report={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ozon — Аналитика по товарам</h1>
          <p className="text-muted-foreground mt-1">ABC-анализ, воронка продаж, позиции в поиске и рекомендации по поставке</p>
        </div>
        <UploadSalesReport onImported={() => queryClient.invalidateQueries({ queryKey: ["ozon-sales-reports"] })} />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка...</div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-medium text-lg">Нет загруженных отчётов</p>
              <p className="text-sm text-muted-foreground mt-1">Загрузите отчёт «Аналитика» → «По товарам» из кабинета Ozon</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Файл</TableHead>
                  <TableHead>Период</TableHead>
                  <TableHead>Продавец</TableHead>
                  <TableHead>Загружен</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(r)}>
                    <TableCell className="font-medium">{r.filename}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.period ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.seller ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.importedAt).toLocaleDateString("ru-RU")}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => deleteReport.mutate(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReportDetail({ report, onBack }: { report: Report; onBack: () => void }) {
  const [abcFilter, setAbcFilter] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery<SalesRow[]>({
    queryKey: ["ozon-sales-rows", report.id],
    queryFn: async () => (await fetch(`/api/ozon/sales-reports/${report.id}/rows`)).json(),
  });

  const urgentRows = rows.filter((r) => r.isUrgent);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.ordersRevenue), 0);
  const totalOrders = rows.reduce((s, r) => s + r.ordersQty, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const avgPosition = rows.filter((r) => r.searchPosition).length > 0
    ? rows.filter((r) => r.searchPosition).reduce((s, r) => s + Number(r.searchPosition), 0) / rows.filter((r) => r.searchPosition).length
    : null;

  const filtered = abcFilter === "all" ? rows : rows.filter((r) => r.abcRevenue === abcFilter);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> Назад</Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{report.filename}</h1>
          <p className="text-muted-foreground text-sm">{report.period} · {report.seller}</p>
        </div>
      </div>

      {/* Urgent supply alerts */}
      {urgentRows.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive">Срочная поставка: {urgentRows.length} товаров</p>
            <p className="text-sm text-muted-foreground mt-1">
              {urgentRows.map((r) => `${r.article ?? r.sku} (${r.supplyQty} шт)`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Выручка (заказы)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(totalRevenue)} ₽</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Заказано товаров</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalOrders}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Показы в поиске</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(totalImpressions)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Ср. позиция</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{avgPosition ? fmt(avgPosition, 0) : "—"}</p></CardContent>
        </Card>
      </div>

      {/* ABC filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">ABC-фильтр:</span>
        {["all", "A", "B", "C"].map((f) => (
          <Button
            key={f}
            variant={abcFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setAbcFilter(f)}
          >
            {f === "all" ? "Все" : `Класс ${f}`}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар / Артикул</TableHead>
                <TableHead className="text-center">ABC</TableHead>
                <TableHead className="text-right">Выручка</TableHead>
                <TableHead className="text-right">Позиция</TableHead>
                <TableHead className="text-right">Показы</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Конв. в корзину</TableHead>
                <TableHead className="text-right">Заказы</TableHead>
                <TableHead className="text-right">Отм/Возвр</TableHead>
                <TableHead>Поставка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center h-24 text-muted-foreground">Загрузка...</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id} className={r.isUrgent ? "bg-destructive/5" : ""}>
                  <TableCell>
                    <div className="font-medium text-sm max-w-xs truncate" title={r.productName}>{r.productName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {r.article && <span className="font-mono text-xs text-muted-foreground">{r.article}</span>}
                      {r.fulfillment && <Badge variant="outline" className="text-xs px-1 py-0">{r.fulfillment}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <AbcBadge val={r.abcRevenue} />
                      <span className="text-xs text-muted-foreground">{r.abcOrders}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium">{fmt(r.ordersRevenue)} ₽</div>
                    <div>{dyn(r.revenDynamic)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.searchPosition ? (
                      <span className={Number(r.searchPosition) <= 50 ? "text-green-600 font-semibold" : Number(r.searchPosition) <= 100 ? "text-amber-600" : "text-destructive"}>
                        {fmt(r.searchPosition, 0)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.impressions)}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(r.ctr, 1)}%</TableCell>
                  <TableCell className="text-right">
                    <div className={r.cartConvPct < 5 ? "text-destructive" : r.cartConvPct < 10 ? "text-amber-600" : "text-green-600"}>
                      {fmt(r.cartConvPct, 1)}%
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{r.ordersQty}</TableCell>
                  <TableCell className="text-right">
                    {(r.cancellations > 0 || r.returns > 0) ? (
                      <span className="text-destructive text-sm">{r.cancellations + r.returns}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <SupplyBadge rec={r.supplyRecommendation} qty={r.supplyQty} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function UploadSalesReport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => { setResult(null); setError(null); setIsLoading(false); };

  const handleFile = async (file: File) => {
    setIsLoading(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/ozon/import/sales-report`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); }
      else { setResult(data); onImported(); toast({ title: "Импорт завершён", description: data.message }); }
    } catch { setError("Не удалось подключиться к серверу"); }
    finally { setIsLoading(false); }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} data-testid="button-upload-ozon-sales">
        <Upload className="mr-2 h-4 w-4" /> Загрузить отчёт
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => { setOpen(false); reset(); }}>
      <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Загрузить «Аналитику по товарам»</h2>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); reset(); }}>✕</Button>
        </div>
        <p className="text-sm text-muted-foreground">Раздел «Аналитика» → «По товарам» в кабинете Ozon. Содержит лист «По товарам».</p>

        {!result && !isLoading && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Перетащите файл или нажмите для выбора</p>
            <p className="text-xs text-muted-foreground mt-1">Формат: .xlsx — лист «По товарам»</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>
        )}
        {isLoading && <div className="flex flex-col items-center gap-3 py-6"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Обрабатываю файл...</p></div>}
        {error && <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive"><AlertCircle className="h-5 w-5 shrink-0 mt-0.5" /><p className="text-sm">{error}</p></div>}
        {result && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{result.message}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Загрузить ещё</Button>
              <Button className="flex-1" onClick={() => { setOpen(false); reset(); }}>Смотреть анализ</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
