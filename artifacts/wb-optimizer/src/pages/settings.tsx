import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Save, Eye, EyeOff, Key, Download, Monitor,
  Upload, FileJson, Plus, Trash2, Package,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiSettings {
  wb?: { token?: string; analyticsToken?: string; advertToken?: string };
  ozon?: { clientId?: string; apiKey?: string; perfClientId?: string; perfClientSecret?: string };
  ym?: { token?: string; campaignIds?: string };
}

interface SkuCost { costPerUnit: number; vatRate: number }
type CostsMap = Record<string, SkuCost>;
interface Costs { wb: CostsMap; ozon: CostsMap; ym: CostsMap }
interface CostRow { article: string; costPerUnit: string; vatRate: string }
type CostsMp = "wb" | "ozon" | "ym";

// ─── Small helpers ────────────────────────────────────────────────────────────

function MaskedInput({ id, value, onChange, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id} type={show ? "text" : "password"} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="pr-10 font-mono text-sm" autoComplete="off"
      />
      <button type="button" onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Section({ title, dot, children, action }: {
  title: string; dot: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: dot }} />
            {title}
          </span>
          {action}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, id, value, onChange, placeholder, hint }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <MaskedInput id={id} value={value} onChange={onChange} placeholder={placeholder} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Costs helpers ────────────────────────────────────────────────────────────

function costsMapToRows(map: CostsMap): CostRow[] {
  return Object.entries(map).map(([article, { costPerUnit, vatRate }]) => ({
    article,
    costPerUnit: costPerUnit > 0 ? String(costPerUnit) : "",
    vatRate: vatRate > 0 ? String(vatRate) : "",
  }));
}

function rowsToCostsMap(rows: CostRow[]): CostsMap {
  const out: CostsMap = {};
  for (const r of rows) {
    if (!r.article.trim()) continue;
    out[r.article.trim()] = {
      costPerUnit: parseFloat(r.costPerUnit) || 0,
      vatRate: parseFloat(r.vatRate) || 0,
    };
  }
  return out;
}

function parseCsv(text: string): CostRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: CostRow[] = [];
  for (const line of lines) {
    const parts = line.split(/[,;\t]/);
    if (parts.length < 2) continue;
    const article = parts[0].trim();
    if (!article || article.toLowerCase() === "article" || article.toLowerCase() === "артикул") continue;
    rows.push({
      article,
      costPerUnit: parts[1]?.trim() ?? "",
      vatRate: parts[2]?.trim() ?? "",
    });
  }
  return rows;
}

function downloadCsvTemplate(mp: CostsMp) {
  const header = "article,cost,vat\n";
  const example = "sku001,1000,0\nsku002,2500,20\n";
  const blob = new Blob([header + example], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${mp}_costs_template.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Costs tab ────────────────────────────────────────────────────────────────

function CostsTab({ mp, rows, onChange }: {
  mp: CostsMp; rows: CostRow[]; onChange: (rows: CostRow[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const updateRow = (i: number, field: keyof CostRow, val: string) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
    onChange(next);
  };
  const addRow = () => onChange([...rows, { article: "", costPerUnit: "", vatRate: "" }]);
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const onCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        toast({ title: "Файл пустой", description: "Не найдено строк с данными", variant: "destructive" });
        return;
      }
      // Merge: update existing articles, add new ones
      const existing = new Map(rows.map((r) => [r.article, r]));
      for (const r of parsed) existing.set(r.article, r);
      onChange(Array.from(existing.values()));
      toast({ title: `Загружено ${parsed.length} строк`, description: "Нажмите «Сохранить себестоимость» для применения" });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const mpLabel: Record<CostsMp, string> = { wb: "Wildberries", ozon: "Ozon", ym: "Яндекс Маркет" };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
          onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Загрузить CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onCsvFile} />
        <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8 text-muted-foreground"
          onClick={() => downloadCsvTemplate(mp)}>
          <Download className="h-3.5 w-3.5" /> Шаблон CSV
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          Формат: артикул, себестоимость, НДС%
        </span>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-1/2">Артикул</th>
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Себест., ₽/шт</th>
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">НДС, %</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t hover:bg-muted/20">
                  <td className="px-2 py-1">
                    <Input value={row.article} onChange={(e) => updateRow(i, "article", e.target.value)}
                      placeholder="sku001" className="h-7 text-xs font-mono border-0 shadow-none focus-visible:ring-0 bg-transparent" />
                  </td>
                  <td className="px-2 py-1">
                    <Input value={row.costPerUnit} onChange={(e) => updateRow(i, "costPerUnit", e.target.value)}
                      type="number" min="0" step="any" placeholder="0"
                      className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 bg-transparent" />
                  </td>
                  <td className="px-2 py-1">
                    <Input value={row.vatRate} onChange={(e) => updateRow(i, "vatRate", e.target.value)}
                      type="number" min="0" max="100" step="any" placeholder="0"
                      className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 bg-transparent" />
                  </td>
                  <td className="px-2 py-1">
                    <button onClick={() => removeRow(i)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-muted py-8 text-center text-sm text-muted-foreground">
          Нет данных для {mpLabel[mp]}. Загрузите CSV или добавьте строки вручную.
        </div>
      )}

      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={addRow}>
        <Plus className="h-3.5 w-3.5" /> Добавить строку
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Settings() {
  const qc = useQueryClient();
  const keyFileRef = useRef<HTMLInputElement>(null);

  // ── API keys state ──
  const { data, isLoading } = useQuery<ApiSettings>({
    queryKey: ["api-settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
  });

  const [wb, setWb]     = useState({ token: "", analyticsToken: "", advertToken: "" });
  const [ozon, setOzon] = useState({ clientId: "", apiKey: "", perfClientId: "", perfClientSecret: "" });
  const [ym, setYm]     = useState({ token: "", campaignIds: "" });

  useEffect(() => {
    if (!data) return;
    if (data.wb)   setWb({ token: data.wb.token ?? "", analyticsToken: data.wb.analyticsToken ?? "", advertToken: data.wb.advertToken ?? "" });
    if (data.ozon) setOzon({ clientId: data.ozon.clientId ?? "", apiKey: data.ozon.apiKey ?? "", perfClientId: data.ozon.perfClientId ?? "", perfClientSecret: data.ozon.perfClientSecret ?? "" });
    if (data.ym)   setYm({ token: data.ym.token ?? "", campaignIds: data.ym.campaignIds ?? "" });
  }, [data]);

  // ── Costs state ──
  const [costsTab, setCostsTab]   = useState<CostsMp>("wb");
  const [wbRows,   setWbRows]     = useState<CostRow[]>([]);
  const [ozonRows, setOzonRows]   = useState<CostRow[]>([]);
  const [ymRows,   setYmRows]     = useState<CostRow[]>([]);

  const { data: costsData } = useQuery<Costs>({
    queryKey: ["costs"],
    queryFn: () => fetch("/api/costs", { credentials: "include" }).then((r) => r.json()),
  });

  useEffect(() => {
    if (!costsData) return;
    setWbRows(costsMapToRows(costsData.wb ?? {}));
    setOzonRows(costsMapToRows(costsData.ozon ?? {}));
    setYmRows(costsMapToRows(costsData.ym ?? {}));
  }, [costsData]);

  // ── Save API keys ──
  const saveKeys = useMutation({
    mutationFn: (payload: ApiSettings) =>
      fetch("/api/settings", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-settings"] });
      syncToLocalStorage();
      toast({ title: "Ключи сохранены", description: "Настройки применятся на всех страницах" });
    },
    onError: () => toast({ title: "Ошибка", description: "Не удалось сохранить ключи", variant: "destructive" }),
  });

  // ── Save costs ──
  const saveCosts = useMutation({
    mutationFn: (payload: Costs) =>
      fetch("/api/costs", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["costs"] });
      // Also write to localStorage so unit-economics picks up immediately
      if (Object.keys(vars.wb).length)   localStorage.setItem("costs_wb_api",   JSON.stringify(vars.wb));
      if (Object.keys(vars.ozon).length) localStorage.setItem("costs_ozon_api", JSON.stringify(vars.ozon));
      if (Object.keys(vars.ym).length)   localStorage.setItem("costs_ym_api",   JSON.stringify(vars.ym));
      const total = Object.keys(vars.wb).length + Object.keys(vars.ozon).length + Object.keys(vars.ym).length;
      toast({ title: "Себестоимость сохранена", description: `Всего артикулов: ${total}` });
    },
    onError: () => toast({ title: "Ошибка", description: "Не удалось сохранить себестоимость", variant: "destructive" }),
  });

  function syncToLocalStorage() {
    // WB
    if (wb.token)              localStorage.setItem("wb_api_token",          wb.token);
    if (wb.analyticsToken)     localStorage.setItem("wb_analytics_token",    wb.analyticsToken);
    if (wb.advertToken)        localStorage.setItem("wb_advert_token",        wb.advertToken);
    // Ozon
    if (ozon.clientId)         localStorage.setItem("ozon_api_client_id",     ozon.clientId);
    if (ozon.apiKey)           localStorage.setItem("ozon_api_api_key",       ozon.apiKey);
    if (ozon.perfClientId)     localStorage.setItem("perf_api_client_id",     ozon.perfClientId);
    if (ozon.perfClientSecret) localStorage.setItem("perf_api_client_secret", ozon.perfClientSecret);
    // YM
    if (ym.token)              localStorage.setItem("ym_api_token",           ym.token);
    if (ym.campaignIds)        localStorage.setItem("ym_api_campaign_id",     ym.campaignIds);
  }

  function handleSaveKeys() { saveKeys.mutate({ wb, ozon, ym }); }

  function handleSaveCosts() {
    saveCosts.mutate({
      wb:   rowsToCostsMap(wbRows),
      ozon: rowsToCostsMap(ozonRows),
      ym:   rowsToCostsMap(ymRows),
    });
  }

  // ── JSON key import ──
  function onKeyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        // Support two formats:
        // 1. Settings format: { wb: { token }, ozon: { clientId }, ym: { token } }
        // 2. LocalStorage export format: { wb_api_token: "...", ozon_api_client_id: "..." }
        const isSettingsFormat = "wb" in json || "ozon" in json || "ym" in json;

        if (isSettingsFormat) {
          const wbJ = (json.wb ?? {}) as Record<string, string>;
          const ozJ = (json.ozon ?? {}) as Record<string, string>;
          const ymJ = (json.ym ?? {}) as Record<string, string>;
          setWb(prev => ({
            token:          wbJ.token          ?? prev.token,
            analyticsToken: wbJ.analyticsToken ?? prev.analyticsToken,
            advertToken:    wbJ.advertToken    ?? prev.advertToken,
          }));
          setOzon(prev => ({
            clientId:         ozJ.clientId         ?? prev.clientId,
            apiKey:           ozJ.apiKey           ?? prev.apiKey,
            perfClientId:     ozJ.perfClientId     ?? prev.perfClientId,
            perfClientSecret: ozJ.perfClientSecret ?? prev.perfClientSecret,
          }));
          setYm(prev => ({
            token:      ymJ.token      ?? prev.token,
            campaignIds: ymJ.campaignIds ?? prev.campaignIds,
          }));
        } else {
          // localStorage format
          const s = json as Record<string, string>;
          setWb(prev => ({
            token:          s.wb_api_token       ?? prev.token,
            analyticsToken: s.wb_analytics_token ?? prev.analyticsToken,
            advertToken:    s.wb_advert_token    ?? prev.advertToken,
          }));
          setOzon(prev => ({
            clientId:         s.ozon_api_client_id    ?? prev.clientId,
            apiKey:           s.ozon_api_api_key      ?? prev.apiKey,
            perfClientId:     s.perf_api_client_id    ?? prev.perfClientId,
            perfClientSecret: s.perf_api_client_secret ?? prev.perfClientSecret,
          }));
          setYm(prev => ({
            token:      s.ym_api_token      ?? prev.token,
            campaignIds: s.ym_api_campaign_id ?? prev.campaignIds,
          }));
        }
        toast({ title: "Ключи загружены из файла", description: "Нажмите «Сохранить все ключи» для применения" });
      } catch {
        toast({ title: "Ошибка", description: "Не удалось прочитать JSON файл", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function exportKeysJson() {
    const data = { wb, ozon, ym };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "api-keys.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Costs tab rows helper ──
  const costsRowsFor: Record<CostsMp, CostRow[]> = { wb: wbRows, ozon: ozonRows, ym: ymRows };
  const costsSetFor: Record<CostsMp, (r: CostRow[]) => void> = { wb: setWbRows, ozon: setOzonRows, ym: setYmRows };
  const totalCosts = wbRows.filter(r => r.article).length + ozonRows.filter(r => r.article).length + ymRows.filter(r => r.article).length;

  const COSTS_TABS: { id: CostsMp; label: string; dot: string }[] = [
    { id: "wb",   label: "Wildberries",    dot: "#cb11ab" },
    { id: "ozon", label: "Ozon",           dot: "#005bff" },
    { id: "ym",   label: "Яндекс Маркет", dot: "#fc3f1d" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6" /> Настройки
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            API-ключи и себестоимость товаров — вводятся один раз
          </p>
        </div>
        <Button onClick={handleSaveKeys} disabled={saveKeys.isPending} className="gap-2">
          {saveKeys.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить ключи
        </Button>
      </div>

      {/* ── Import keys from file ── */}
      <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <FileJson className="h-4 w-4 text-indigo-600" />
                Импорт ключей из файла
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Загрузите JSON с ключами — поля заполнятся автоматически
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportKeysJson}>
                <Download className="h-3.5 w-3.5" /> Экспорт
              </Button>
              <Button size="sm" className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700"
                onClick={() => keyFileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Загрузить JSON
              </Button>
              <input ref={keyFileRef} type="file" accept=".json" className="hidden" onChange={onKeyFile} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── WB ── */}
      <Section title="Wildberries" dot="#cb11ab">
        <Field label="API-токен (основной)" id="wb-token" value={wb.token}
          onChange={(v) => setWb((s) => ({ ...s, token: v }))}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          hint="Личный кабинет WB → Настройки → Доступ к API" />
        <Field label="Токен аналитики (опционально)" id="wb-analytics" value={wb.analyticsToken}
          onChange={(v) => setWb((s) => ({ ...s, analyticsToken: v }))}
          placeholder="Если отличается от основного" />
        <Field label="Токен рекламы (опционально)" id="wb-advert" value={wb.advertToken}
          onChange={(v) => setWb((s) => ({ ...s, advertToken: v }))}
          placeholder="Если отличается от основного" />
      </Section>

      {/* ── Ozon ── */}
      <Section title="Ozon" dot="#005bff">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client-Id" id="ozon-client-id" value={ozon.clientId}
            onChange={(v) => setOzon((s) => ({ ...s, clientId: v }))}
            placeholder="123456" hint="Настройки → Seller API" />
          <Field label="API-Key" id="ozon-api-key" value={ozon.apiKey}
            onChange={(v) => setOzon((s) => ({ ...s, apiKey: v }))}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Performance Client-Id" id="ozon-perf-id" value={ozon.perfClientId}
            onChange={(v) => setOzon((s) => ({ ...s, perfClientId: v }))}
            placeholder="Для Performance API" />
          <Field label="Performance Client-Secret" id="ozon-perf-secret" value={ozon.perfClientSecret}
            onChange={(v) => setOzon((s) => ({ ...s, perfClientSecret: v }))}
            placeholder="Для Performance API" />
        </div>
      </Section>

      {/* ── YM ── */}
      <Section title="Яндекс Маркет" dot="#fc3f1d">
        <Field label="OAuth-токен" id="ym-token" value={ym.token}
          onChange={(v) => setYm((s) => ({ ...s, token: v }))}
          placeholder="y0_AgAAAA..." hint="oauth.yandex.ru → Partner API" />
        <Field label="ID кампаний (через запятую)" id="ym-campaigns" value={ym.campaignIds}
          onChange={(v) => setYm((s) => ({ ...s, campaignIds: v }))}
          placeholder="12345678, 87654321"
          hint="Личный кабинет ЯМ → Управление → Бизнес" />
      </Section>

      {/* ── Save keys button ── */}
      <div className="flex justify-end">
        <Button onClick={handleSaveKeys} disabled={saveKeys.isPending} size="lg" className="gap-2">
          {saveKeys.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить все ключи
        </Button>
      </div>

      {/* ── Costs section ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Себестоимость товаров
              {totalCosts > 0 && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {totalCosts} артикулов
                </span>
              )}
            </span>
          </CardTitle>
          <CardDescription>
            Укажите себестоимость по артикулам — она будет автоматически применяться в юнит-экономике.
            Загружайте CSV или редактируйте вручную.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b">
            {COSTS_TABS.map(({ id, label, dot }) => (
              <button key={id} onClick={() => setCostsTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  costsTab === id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
                {label}
                {costsRowsFor[id].filter(r => r.article).length > 0 && (
                  <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5">
                    {costsRowsFor[id].filter(r => r.article).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <CostsTab
            mp={costsTab}
            rows={costsRowsFor[costsTab]}
            onChange={costsSetFor[costsTab]}
          />

          <div className="flex justify-end pt-2 border-t">
            <Button onClick={handleSaveCosts} disabled={saveCosts.isPending} className="gap-2">
              {saveCosts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Сохранить себестоимость
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Security note ── */}
      <Card className="border-muted bg-muted/30">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">
            🔒 Ключи и себестоимость хранятся в зашифрованной базе данных на сервере.
            Страницы маркетплейсов и юнит-экономика автоматически подхватят данные.
          </p>
        </CardContent>
      </Card>

      {/* ── Desktop download ── */}
      {!(typeof window !== "undefined" && "electronApp" in window) && (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Десктоп-версия для Windows
            </CardTitle>
            <CardDescription>
              Автономное приложение — работает без интернета, данные хранятся локально.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <a href="/wb/downloads/ADUnitR-Setup-win-x64.exe" download>
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  <Download className="h-4 w-4" />
                  Скачать установщик .exe (~90 МБ)
                </Button>
              </a>
              <a href="/wb/downloads/ADUnitR-win-x64.zip" download>
                <Button variant="outline" className="gap-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950">
                  <Download className="h-4 w-4" />
                  Портативный ZIP (~110 МБ)
                </Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              Windows x64 · Установщик создаёт ярлык и добавляет запись в «Программы и компоненты»
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
