import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileSpreadsheet, Loader2, Trash2, ChevronLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

interface Report {
  id: number;
  filename: string;
  period: string | null;
  importedAt: string;
}

interface SkuRow {
  id: number;
  sku: string;
  productName: string;
  campaignNames: string;
  impressionsBoost: number;
  clicksBoost: number;
  ordersBoost: number;
  deliveredBoost: number;
  spendBoost: string;
  spendBonuses: string;
  revenueBoost: string;
  revenueAll: string;
  spendSharePct: string;
  cpo: number | null;
  roi: number | null;
  ctr: number;
  totalSpend: number;
}

interface CampaignRow {
  id: number;
  campaignId: string;
  campaignName: string;
  impressionsBoost: number;
  clicksBoost: number;
  ordersBoost: number;
  deliveredBoost: number;
  spendBoost: string;
  revenueBoost: string;
  cpo: number | null;
  roi: number | null;
  totalSpend: number;
}

function fmt(n: number | string | null | undefined, decimals = 0) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function RoiBadge({ roi }: { roi: number | null }) {
  if (roi === null) return <span className="text-muted-foreground">—</span>;
  const pct = (roi * 100).toFixed(0);
  if (roi >= 3) return <Badge className="bg-green-600 text-white">{pct}%</Badge>;
  if (roi >= 1.5) return <Badge className="bg-amber-500 text-white">{pct}%</Badge>;
  return <Badge variant="destructive">{pct}%</Badge>;
}

function CpoCell({ cpo }: { cpo: number | null }) {
  if (cpo === null) return <span className="text-muted-foreground">—</span>;
  const cls = cpo < 300 ? "text-green-600 font-bold" : cpo < 600 ? "text-amber-600 font-semibold" : "text-destructive font-bold";
  return <span className={cls}>{fmt(cpo, 2)} ₽</span>;
}

export default function YmBoost() {
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reports = [], isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["ym-boost-reports"],
    queryFn: async () => {
      const r = await fetch(`${BASE()}/api/ym/boost/reports`);
      return r.json();
    },
  });

  const deleteReport = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE()}/api/ym/boost/reports/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ym-boost-reports"] });
      if (selectedReport) setSelectedReport(null);
      toast({ title: "Отчёт удалён" });
    },
  });

  if (selectedReport) {
    return <ReportDetail report={selectedReport} onBack={() => setSelectedReport(null)} />;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Яндекс Маркет — Буст продаж</h1>
          <p className="text-muted-foreground mt-1">Анализ отчётов рекламных кампаний</p>
        </div>
        <UploadBoostReport onImported={() => queryClient.invalidateQueries({ queryKey: ["ym-boost-reports"] })} />
      </div>

      {reportsLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка...</div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-medium text-lg">Нет загруженных отчётов</p>
              <p className="text-sm text-muted-foreground mt-1">
                Загрузите сводный отчёт «Буст продаж» из рекламного кабинета Яндекс Маркета
              </p>
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
                  <TableHead>Загружен</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedReport(r)}>
                    <TableCell className="font-medium">{r.filename}</TableCell>
                    <TableCell className="text-muted-foreground">{r.period ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(r.importedAt).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => deleteReport.mutate(r.id)}
                        data-testid={`button-delete-report-${r.id}`}
                      >
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
  const { data: skus = [], isLoading: skusLoading } = useQuery<SkuRow[]>({
    queryKey: ["ym-boost-skus", report.id],
    queryFn: async () => {
      const r = await fetch(`${BASE()}/api/ym/boost/reports/${report.id}/skus`);
      return r.json();
    },
  });

  const { data: campaigns = [], isLoading: campsLoading } = useQuery<CampaignRow[]>({
    queryKey: ["ym-boost-campaigns", report.id],
    queryFn: async () => {
      const r = await fetch(`${BASE()}/api/ym/boost/reports/${report.id}/campaigns`);
      return r.json();
    },
  });

  const totalSpend = skus.reduce((s, r) => s + r.totalSpend, 0);
  const totalOrders = skus.reduce((s, r) => s + r.ordersBoost, 0);
  const totalRevenue = skus.reduce((s, r) => s + Number(r.revenueBoost), 0);
  const totalCpo = totalOrders > 0 ? totalSpend / totalOrders : null;
  const totalRoi = totalSpend > 0 ? totalRevenue / totalSpend : null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Назад
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{report.filename}</h1>
          <p className="text-muted-foreground text-sm">{report.period}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Расходы буст</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(totalSpend)} ₽</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Заказы с бустом</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalOrders}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">CPO буст</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold"><CpoCell cpo={totalCpo} /></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">ROI буст</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold"><RoiBadge roi={totalRoi} /></p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="skus">
        <TabsList>
          <TabsTrigger value="skus">По SKU ({skus.length})</TabsTrigger>
          <TabsTrigger value="campaigns">По кампаниям ({campaigns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="skus">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU / Товар</TableHead>
                    <TableHead className="text-right">Показы</TableHead>
                    <TableHead className="text-right">Клики</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Заказы</TableHead>
                    <TableHead className="text-right">Расход</TableHead>
                    <TableHead className="text-right">Выручка</TableHead>
                    <TableHead className="text-right">CPO</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skusLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center h-24 text-muted-foreground">Загрузка...</TableCell></TableRow>
                  ) : skus.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-mono text-xs text-muted-foreground">{s.sku}</div>
                        <div className="text-sm font-medium max-w-xs truncate" title={s.productName}>{s.productName}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmt(s.impressionsBoost)}</TableCell>
                      <TableCell className="text-right">{fmt(s.clicksBoost)}</TableCell>
                      <TableCell className="text-right">{fmt(s.ctr, 2)}%</TableCell>
                      <TableCell className="text-right font-medium">{s.ordersBoost}</TableCell>
                      <TableCell className="text-right">{fmt(s.totalSpend, 2)} ₽</TableCell>
                      <TableCell className="text-right">{s.revenueBoost !== "0" ? `${fmt(s.revenueBoost)} ₽` : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right"><CpoCell cpo={s.cpo} /></TableCell>
                      <TableCell className="text-right"><RoiBadge roi={s.roi} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Кампания</TableHead>
                    <TableHead className="text-right">Показы</TableHead>
                    <TableHead className="text-right">Клики</TableHead>
                    <TableHead className="text-right">Заказы</TableHead>
                    <TableHead className="text-right">Расход</TableHead>
                    <TableHead className="text-right">Выручка</TableHead>
                    <TableHead className="text-right">CPO</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campsLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center h-24 text-muted-foreground">Загрузка...</TableCell></TableRow>
                  ) : campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">ID {c.campaignId}</div>
                        <div className="font-medium">{c.campaignName}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmt(c.impressionsBoost)}</TableCell>
                      <TableCell className="text-right">{fmt(c.clicksBoost)}</TableCell>
                      <TableCell className="text-right font-medium">{c.ordersBoost}</TableCell>
                      <TableCell className="text-right">{fmt(c.totalSpend, 2)} ₽</TableCell>
                      <TableCell className="text-right">{Number(c.revenueBoost) > 0 ? `${fmt(c.revenueBoost)} ₽` : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right"><CpoCell cpo={c.cpo} /></TableCell>
                      <TableCell className="text-right"><RoiBadge roi={c.roi} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UploadBoostReport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [Dialog, setDialog] = useState(false); // workaround for inline dialog

  const reset = () => { setResult(null); setError(null); setIsLoading(false); };

  const handleFile = async (file: File) => {
    setIsLoading(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${BASE()}/api/ym/import/boost`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); }
      else { setResult(data); onImported(); toast({ title: "Импорт завершён", description: data.message }); }
    } catch { setError("Не удалось подключиться к серверу"); }
    finally { setIsLoading(false); }
  };

  // Simple inline upload panel instead of dialog for simplicity
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} data-testid="button-upload-ym-boost">
        <Upload className="mr-2 h-4 w-4" /> Загрузить отчёт
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => { setOpen(false); reset(); }}>
      <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Загрузить отчёт «Буст продаж»</h2>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); reset(); }}>✕</Button>
        </div>
        <p className="text-sm text-muted-foreground">Сводный отчёт из раздела «Буст продаж» рекламного кабинета ЯМ (.xlsx)</p>

        {!result && !isLoading && (
          <div
            data-testid="dropzone-ym-boost"
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Перетащите файл или нажмите для выбора</p>
            <p className="text-xs text-muted-foreground mt-1">Формат: .xlsx — «Сводный отчёт» из кабинета ЯМ</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} data-testid="input-file-ym-boost" />
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Обрабатываю файл...</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

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
