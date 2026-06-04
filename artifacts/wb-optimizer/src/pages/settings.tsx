import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Eye, EyeOff, Key, RefreshCw, Download, Monitor } from "lucide-react";

interface ApiSettings {
  wb?: {
    token?: string;
    analyticsToken?: string;
    advertToken?: string;
  };
  ozon?: {
    clientId?: string;
    apiKey?: string;
    perfClientId?: string;
    perfClientSecret?: string;
  };
  ym?: {
    token?: string;
    campaignIds?: string;
  };
}

function MaskedInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10 font-mono text-sm"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Section({
  title,
  dot,
  children,
}: {
  title: string;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`inline-block w-2.5 h-2.5 rounded-full`} style={{ background: dot }} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <MaskedInput id={id} value={value} onChange={onChange} placeholder={placeholder} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ApiSettings>({
    queryKey: ["api-settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
  });

  const [wb, setWb] = useState({ token: "", analyticsToken: "", advertToken: "" });
  const [ozon, setOzon] = useState({ clientId: "", apiKey: "", perfClientId: "", perfClientSecret: "" });
  const [ym, setYm] = useState({ token: "", campaignIds: "" });

  useEffect(() => {
    if (!data) return;
    if (data.wb) setWb({ token: data.wb.token ?? "", analyticsToken: data.wb.analyticsToken ?? "", advertToken: data.wb.advertToken ?? "" });
    if (data.ozon) setOzon({ clientId: data.ozon.clientId ?? "", apiKey: data.ozon.apiKey ?? "", perfClientId: data.ozon.perfClientId ?? "", perfClientSecret: data.ozon.perfClientSecret ?? "" });
    if (data.ym) setYm({ token: data.ym.token ?? "", campaignIds: data.ym.campaignIds ?? "" });
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: ApiSettings) =>
      fetch("/api/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-settings"] });
      syncToLocalStorage();
      toast({ title: "Ключи сохранены", description: "Настройки применятся на всех страницах" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось сохранить ключи", variant: "destructive" });
    },
  });

  function syncToLocalStorage() {
    if (wb.token)         localStorage.setItem("wb_api_token", wb.token);
    if (wb.analyticsToken) localStorage.setItem("wb_analytics_token", wb.analyticsToken);
    if (wb.advertToken)   localStorage.setItem("wb_advert_token", wb.advertToken);
    if (ozon.clientId)    localStorage.setItem("ozon_client_id", ozon.clientId);
    if (ozon.apiKey)      localStorage.setItem("ozon_api_key", ozon.apiKey);
    if (ozon.perfClientId)     localStorage.setItem("ozon_perf_client_id", ozon.perfClientId);
    if (ozon.perfClientSecret) localStorage.setItem("ozon_perf_client_secret", ozon.perfClientSecret);
    if (ym.token)         localStorage.setItem("ym_token", ym.token);
    if (ym.campaignIds)   localStorage.setItem("ym_campaign_ids", ym.campaignIds);
  }

  function handleSave() {
    save.mutate({ wb, ozon, ym });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6" /> Настройки API
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Введите ключи один раз — они сохраняются на сервере и применяются автоматически
          </p>
        </div>
        <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить
        </Button>
      </div>

      <Section title="Wildberries" dot="#cb11ab">
        <Field
          label="API-токен (основной)"
          id="wb-token"
          value={wb.token}
          onChange={(v) => setWb((s) => ({ ...s, token: v }))}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          hint="Личный кабинет WB → Настройки → Доступ к API"
        />
        <Field
          label="Токен аналитики (опционально)"
          id="wb-analytics"
          value={wb.analyticsToken}
          onChange={(v) => setWb((s) => ({ ...s, analyticsToken: v }))}
          placeholder="Если отличается от основного"
        />
        <Field
          label="Токен рекламы (опционально)"
          id="wb-advert"
          value={wb.advertToken}
          onChange={(v) => setWb((s) => ({ ...s, advertToken: v }))}
          placeholder="Если отличается от основного"
        />
      </Section>

      <Section title="Ozon" dot="#005bff">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Client-Id"
            id="ozon-client-id"
            value={ozon.clientId}
            onChange={(v) => setOzon((s) => ({ ...s, clientId: v }))}
            placeholder="123456"
            hint="Настройки → Seller API"
          />
          <Field
            label="API-Key"
            id="ozon-api-key"
            value={ozon.apiKey}
            onChange={(v) => setOzon((s) => ({ ...s, apiKey: v }))}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Performance Client-Id"
            id="ozon-perf-id"
            value={ozon.perfClientId}
            onChange={(v) => setOzon((s) => ({ ...s, perfClientId: v }))}
            placeholder="Для Performance API"
          />
          <Field
            label="Performance Client-Secret"
            id="ozon-perf-secret"
            value={ozon.perfClientSecret}
            onChange={(v) => setOzon((s) => ({ ...s, perfClientSecret: v }))}
            placeholder="Для Performance API"
          />
        </div>
      </Section>

      <Section title="Яндекс Маркет" dot="#fc3f1d">
        <Field
          label="OAuth-токен"
          id="ym-token"
          value={ym.token}
          onChange={(v) => setYm((s) => ({ ...s, token: v }))}
          placeholder="y0_AgAAAA..."
          hint="oauth.yandex.ru → Partner API"
        />
        <Field
          label="ID кампаний (через запятую)"
          id="ym-campaigns"
          value={ym.campaignIds}
          onChange={(v) => setYm((s) => ({ ...s, campaignIds: v }))}
          placeholder="12345678, 87654321"
          hint="Личный кабинет ЯМ → Управление → Бизнес"
        />
      </Section>

      <Card className="border-muted bg-muted/30">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">
            🔒 Ключи хранятся в зашифрованной базе данных на сервере и не передаются третьим лицам.
            Страницы маркетплейсов автоматически подхватят ключи при следующем открытии.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={save.isPending} size="lg" className="gap-2">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить все ключи
        </Button>
      </div>

      {/* Desktop download — only shown in web (browser) mode */}
      {!(typeof window !== 'undefined' && 'electronApp' in window) && (
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
          <CardContent>
            <div className="flex items-center gap-4">
              <a href="/wb/downloads/ADUnitR-win-x64.zip" download>
                <Button variant="outline" className="gap-2 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900">
                  <Download className="h-4 w-4" />
                  Скачать ZIP (Windows x64, ~110 МБ)
                </Button>
              </a>
              <p className="text-xs text-muted-foreground">
                Распакуйте ZIP и запустите <code className="font-mono bg-muted px-1 rounded">AD Unit R.exe</code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
