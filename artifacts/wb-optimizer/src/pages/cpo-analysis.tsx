import { useGetCpoAnalysis, useMoveKeywordToMinus, getGetCpoAnalysisQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Download } from "lucide-react";

export default function CpoAnalysis() {
  const { data: analysis, isLoading } = useGetCpoAnalysis();
  const moveToMinus = useMoveKeywordToMinus();
  const queryClient = useQueryClient();

  const handleMinus = (keywordId: number) => {
    moveToMinus.mutate({ data: { keywordId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCpoAnalysisQueryKey() });
      }
    });
  };

  const exportCsv = () => {
    if (!analysis?.items) return;
    
    const headers = ["Фраза", "Товар", "Кампания", "Кластер", "Расход", "Заказы", "CPO", "Доход", "Убыток/Прибыль", "Статус"];
    const rows = analysis.items.map(item => [
      item.phrase,
      item.productName,
      item.campaignName,
      item.cluster,
      item.spend,
      item.orders,
      item.cpo,
      item.incomePerSale,
      item.lossPerOrder ? `-${item.lossPerOrder}` : `+${item.incomePerSale - item.cpo}`,
      item.status
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "cpo_analysis.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Сводный анализ CPO</h1>
          <p className="text-muted-foreground mt-1">Все ключевые фразы, отсортированные по размеру убытка</p>
        </div>
        <Button variant="outline" onClick={exportCsv} data-testid="button-export-csv" disabled={isLoading || !analysis?.items.length}>
          <Download className="mr-2 h-4 w-4" /> Экспорт CSV
        </Button>
      </div>

      {!isLoading && analysis && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-destructive">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Суммарный убыток</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-destructive">{analysis.totalLoss.toLocaleString('ru-RU')} ₽</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Фраз в минус</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-destructive">{analysis.lossKeywordsCount}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Прибыльных фраз</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-success">{analysis.profitableKeywordsCount}</div></CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Фраза / Кластер</TableHead>
                <TableHead>Товар / Кампания</TableHead>
                <TableHead className="text-right">Расход</TableHead>
                <TableHead className="text-right">Заказы</TableHead>
                <TableHead className="text-right">Доход с 1 шт.</TableHead>
                <TableHead className="text-right font-bold">CPO</TableHead>
                <TableHead className="text-right">Результат (на 1 шт)</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">Загрузка...</TableCell>
                </TableRow>
              ) : !analysis?.items.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">Нет данных</TableCell>
                </TableRow>
              ) : (
                analysis.items.map((item) => (
                  <TableRow key={item.keywordId} className={item.lossPerOrder ? "bg-destructive/5" : "bg-success/5"}>
                    <TableCell>
                      <div className="font-bold">{item.phrase}</div>
                      <div className="text-xs text-muted-foreground">{item.cluster}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{item.productName}</div>
                      <div className="text-xs text-muted-foreground">{item.campaignName}</div>
                    </TableCell>
                    <TableCell className="text-right">{item.spend.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right">{item.orders}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{item.incomePerSale.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right font-bold">{item.cpo.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right">
                      {item.lossPerOrder ? (
                        <span className="text-destructive font-bold">-{item.lossPerOrder.toLocaleString('ru-RU')} ₽</span>
                      ) : (
                        <span className="text-success font-bold">+{((item.incomePerSale) - item.cpo).toLocaleString('ru-RU')} ₽</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === 'minus' ? (
                        <Badge variant="destructive">В минусе</Badge>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleMinus(item.keywordId)}
                          disabled={moveToMinus.isPending || item.status === 'minus'}
                          data-testid={`button-minus-cpo-${item.keywordId}`}
                          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <Ban className="h-4 w-4 mr-2" /> В минус
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
