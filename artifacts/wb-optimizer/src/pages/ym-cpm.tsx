import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, Trash2, ChevronLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const YM_COLOR = "#fc3f1d";

interface Report {
  id: number; filename: string; period: string | null; attribution: string | null; importedAt: string;
}

interface SkuRow {
  id: number; sku: string; productName: string;
  impressions: number; clicks: number; cartAdds: number; orders: number;
  cpm: string; calcSpend: string; revenue: string;
  campaignNames: string | null;
  cpo: number | null; drr: number | null; ctr: number | null; cartConv: number | null;
}

interface CampaignAgg {
  campaignId: string; campaignName: string;
  impressions: number; reach: number; clicks: number; cartAdds: number; orders: number;
  orderRevenue: number; calcSpend: number; actualSpend: number; bonuses: number;
  cpo: number | null; drr: number | null; ctr: number | null; cpm: number | null;
}

interface TrendPoint { date: string; impressions: number; orders: number; calcSpend: number; actualSpend: number; }

function fmt(n: number | string | null | undefined, dec = 0) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("ru-RU", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function CpoCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  const cls = v < 200 ? "text-green-600 font-bold" : v < 500 ? "text-amber-600 font-semibold" : "text-destructive font-bold";
  return <span className={cls}>{fmt(v, 0)} ₽</span>;
}

function DrrCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  const cls = v < 15 ? "text-green-600 font-bold" : v < 30 ? "text-amber-600" : "text-destructive font-bold";
  return <span className={cls}>{fmt(v, 1)}%</span>;
}

export default function YmCpm() {
  const [selected, setSelected] = useState<Report | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reports = [], isLoading } = useQuery<Report[]>({
    queryKey: ["ym-cpm-reports"],
    queryFn: async () => (await fetch(`/api/ym/cpm-reports`)).json(),
  });

  const deleteReport = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/ym/cpm-reports/${id}`, { method: "DELETE" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ym-cpm-reports"] }); setSelected(null); toast({ title: "Отчёт удалён" }); },
  });

  if (selected) return <ReportDetail report={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ЯМ — Буст продаж (CPM)</h1>
          <p className="text-muted-foreground mt-1">Оплата за показы: анализ по товарам и кампаниям</p>
        </div>
        <UploadCpmReport onImported={() => queryClient.invalidateQueries({ queryKey: ["ym-cpm-reports"] })} />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка...</div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-medium text-lg">Нет загруженных отчётов</p>
              <p className="text-sm text-muted-foreground mt-1">Загрузите отчёт «Буст продаж с оплатой за показы» из кабинета Яндекс Маркет</p>
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
                  <TableHead>Атрибуция</TableHead>
                  <TableHead>Загружен</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(r)}>
                    <TableCell className="font-medium">{r.filename}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.period ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.attribution ?? "—"}</TableCell>
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
  const [tab, setTab] = useState<"skus" | "campaigns" | "trend">("skus");

  const { data: skus = [], isLoading: skuLoading } = useQuery<SkuRow[]>({
    queryKey: ["ym-cpm-skus", report.id],
    queryFn: async () => (await fetch(`/api/ym/cpm-reports/${report.id}/skus`)).json(),
  });

  const { data: campData, isLoading: campLoading } = useQuery<{ campaigns: CampaignAgg[]; trend: TrendPoint[] }>({
    queryKey: ["ym-cpm-campaigns", report.id],
    queryFn: async () => (await fetch(`/api/ym/cpm-reports/${report.id}/campaigns`)).json(),
  });

  const campaigns = campData?.campaigns ?? [];
  const trend = campData?.trend ?? [];

  const totalSpend = skus.reduce((s, r) => s + Number(r.calcSpend), 0);
  const totalRevenue = skus.reduce((s, r) => s + Number(r.revenue), 0);
  const totalOrders = skus.reduce((s, r) => s + r.orders, 0);
  const totalImpressions = skus.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = skus.reduce((s, r) => s + r.clicks, 0);
  const overallCpo = totalOrders > 0 ? totalSpend / totalOrders : null;
  const overallDrr = totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : null;
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> Назад</Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{report.filename}</h1>
          <p className="text-muted-foreground text-sm">{report.period} · Атрибуция: {report.attribution}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Расход (расчётный)", value: `${fmt(totalSpend)} ₽` },
          { label: "Выручка с бустом", value: `${fmt(totalRevenue)} ₽` },
          { label: "Заказы", value: String(totalOrders) },
          { label: "CPO", value: overallCpo !== null ? `${fmt(overallCpo, 0)} ₽` : "—" },
          { label: "ДРР", value: overallDrr !== null ? `${fmt(overallDrr, 1)}%` : "—" },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold leading-tight">{value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Extra stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Показы", value: fmt(totalImpressions) },
          { label: "Клики", value: fmt(totalClicks) },
          { label: "CTR", value: overallCtr !== null ? `${fmt(overallCtr, 2)}%` : "—" },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold">{value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: "skus", label: "По товарам" },
          { key: "campaigns", label: "По кампаниям" },
          { key: "trend", label: "Динамика по дням" },
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(key as typeof tab)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "skus" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар / Артикул</TableHead>
                  <TableHead>Кампания</TableHead>
                  <TableHead className="text-right">Показы</TableHead>
                  <TableHead className="text-right">Клики</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">В корзину</TableHead>
                  <TableHead className="text-right">Заказы</TableHead>
                  <TableHead className="text-right">Выручка</TableHead>
                  <TableHead className="text-right">Расход</TableHead>
                  <TableHead className="text-right">CPO</TableHead>
                  <TableHead className="text-right">ДРР</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skuLoading ? (
                  <TableRow><TableCell colSpan={11} className="text-center h-24 text-muted-foreground">Загрузка...</TableCell></TableRow>
                ) : skus.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium text-sm max-w-[180px] truncate" title={r.productName}>{r.productName}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={r.campaignNames ?? ""}>{r.campaignNames ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(r.impressions)}</TableCell>
                    <TableCell className="text-right">{fmt(r.clicks)}</TableCell>
                    <TableCell className="text-right text-sm">{r.ctr !== null ? `${fmt(r.ctr, 2)}%` : "—"}</TableCell>
                    <TableCell className="text-right">{r.cartAdds > 0 ? r.cartAdds : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-medium">{r.orders > 0 ? r.orders : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{Number(r.revenue) > 0 ? `${fmt(r.revenue)} ₽` : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{fmt(r.calcSpend)} ₽</TableCell>
                    <TableCell className="text-right"><CpoCell v={r.cpo} /></TableCell>
                    <TableCell className="text-right"><DrrCell v={r.drr} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "campaigns" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Кампания</TableHead>
                  <TableHead className="text-right">Показы</TableHead>
                  <TableHead className="text-right">Охват</TableHead>
                  <TableHead className="text-right">Клики</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Заказы</TableHead>
                  <TableHead className="text-right">Выручка</TableHead>
                  <TableHead className="text-right">Расход</TableHead>
                  <TableHead className="text-right">Факт. расход</TableHead>
                  <TableHead className="text-right">CPO</TableHead>
                  <TableHead className="text-right">ДРР</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campLoading ? (
                  <TableRow><TableCell colSpan={11} className="text-center h-24 text-muted-foreground">Загрузка...</TableCell></TableRow>
                ) : campaigns.map((c) => (
                  <TableRow key={c.campaignId}>
                    <TableCell>
                      <div className="font-medium">{c.campaignName}</div>
                      <div className="text-xs text-muted-foreground font-mono">ID: {c.campaignId}</div>
                    </TableCell>
                    <TableCell className="text-right">{fmt(c.impressions)}</TableCell>
                    <TableCell className="text-right">{fmt(c.reach)}</TableCell>
                    <TableCell className="text-right">{fmt(c.clicks)}</TableCell>
                    <TableCell className="text-right text-sm">{c.ctr !== null ? `${fmt(c.ctr, 2)}%` : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{c.orders > 0 ? c.orders : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{c.orderRevenue > 0 ? `${fmt(c.orderRevenue)} ₽` : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{fmt(c.calcSpend)} ₽</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmt(c.actualSpend)} ₽</TableCell>
                    <TableCell className="text-right"><CpoCell v={c.cpo} /></TableCell>
                    <TableCell className="text-right"><DrrCell v={c.drr} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "trend" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Расход и заказы по дням</CardTitle></CardHeader>
          <CardContent>
            {campLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground h-48 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка...</div>
            ) : (
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Расход (расчётный), ₽</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`${fmt(v)} ₽`, "Расход"]} />
                      <Bar dataKey="calcSpend" fill={YM_COLOR} radius={[3, 3, 0, 0]} name="Расход" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Показы</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [fmt(v), "Показы"]} />
                      <Bar dataKey="impressions" fill="#f97316" radius={[3, 3, 0, 0]} name="Показы" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UploadCpmReport({ onImported }: { onImported: () => void }) {
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
      const res = await fetch(`/api/ym/import/cpm-boost`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Ошибка"); }
      else { setResult(data); onImported(); toast({ title: "Импорт завершён", description: data.message }); }
    } catch { setError("Не удалось подключиться к серверу"); }
    finally { setIsLoading(false); }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" /> Загрузить отчёт
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => { setOpen(false); reset(); }}>
      <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Загрузить CPM-буст отчёт</h2>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); reset(); }}>✕</Button>
        </div>
        <p className="text-sm text-muted-foreground">Отчёт «Буст продаж с оплатой за показы» из раздела Реклама → Аналитика в кабинете ЯМ.</p>

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
            <p className="text-xs text-muted-foreground mt-1">Формат: .xlsx — листы «Отчёт по кампаниям» и «Отчёт по товарам»</p>
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
