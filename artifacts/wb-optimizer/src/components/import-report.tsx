import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListCampaignsQueryKey, getListProductsQueryKey, getListKeywordsQueryKey, getGetDashboardSummaryQueryKey, getGetCpoAnalysisQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface ImportResult {
  success: boolean;
  productsCreated: number;
  campaignsCreated: number;
  keywordsCreated: number;
  keywordsUpdated: number;
  message: string;
}

export function ImportReport() {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reset = () => {
    setResult(null);
    setError(null);
    setIsLoading(false);
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Поддерживаются только файлы .xlsx и .xls");
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/import/wb-report`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка при загрузке");
      } else {
        setResult(data);
        // Invalidate all related queries
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListKeywordsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCpoAnalysisQueryKey() });
        toast({ title: "Импорт завершён", description: data.message });
      }
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setIsLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-report">
          <Upload className="mr-2 h-4 w-4" />
          Загрузить отчёт WB
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Импорт отчёта Wildberries</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Загрузите стандартный отчёт из рекламного кабинета WB (.xlsx). Кампании и ключевые фразы добавятся автоматически.
          </p>

          {/* Drop zone */}
          {!result && !isLoading && (
            <div
              data-testid="dropzone-import"
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Перетащите файл или нажмите для выбора</p>
              <p className="text-xs text-muted-foreground mt-1">Формат: .xlsx — статистика рекламного кабинета</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onInputChange}
                data-testid="input-file-import"
              />
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Обрабатываю файл...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Ошибка</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{result.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {result.productsCreated > 0 && (
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <p className="text-2xl font-bold">{result.productsCreated}</p>
                    <p className="text-xs text-muted-foreground">Товаров создано</p>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold">{result.campaignsCreated}</p>
                  <p className="text-xs text-muted-foreground">Кампаний</p>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold">{result.keywordsCreated}</p>
                  <p className="text-xs text-muted-foreground">Ключей добавлено</p>
                </div>
                {result.keywordsUpdated > 0 && (
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <p className="text-2xl font-bold">{result.keywordsUpdated}</p>
                    <p className="text-xs text-muted-foreground">Ключей обновлено</p>
                  </div>
                )}
              </div>
              {result.productsCreated > 0 && (
                <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded p-3">
                  Товар создан с нулевой юнит-экономикой. Перейдите в раздел «Товары» и укажите цену, комиссию и логистику — это нужно для расчёта CPO.
                </p>
              )}
              <Button variant="outline" className="w-full" onClick={reset} data-testid="button-import-again">
                Загрузить ещё файл
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
