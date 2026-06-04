import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Target, AlertTriangle, TrendingUp, DollarSign } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground animate-pulse font-medium">Загрузка данных...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Дашборд</h1>
        <p className="text-muted-foreground">Нет данных для отображения</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Сводка CPO</h1>
          <p className="text-muted-foreground mt-1 text-sm">Обзор эффективности рекламных кампаний</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Расход (₽)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalSpend.toLocaleString('ru-RU')} ₽</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Заказы</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalOrders}</div>
          </CardContent>
        </Card>

        <Card className={summary.avgCpo > 500 ? "border-l-4 border-l-destructive" : "border-l-4 border-l-success"}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Средний CPO</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.avgCpo.toLocaleString('ru-RU')} ₽</div>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20 border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Убыток (₽)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary.totalLoss.toLocaleString('ru-RU')} ₽</div>
            <p className="text-xs text-destructive/80 mt-1">{summary.lossKeywords} фраз в минус</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Эксперименты</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.activeExperiments}</div>
            <p className="text-xs text-muted-foreground mt-1">Активных</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Table could be here or link to full analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Статус Ключевых Фраз</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden flex">
              <div 
                className="bg-success h-full transition-all" 
                style={{ width: `${(summary.profitableKeywords / Math.max(1, summary.totalKeywords)) * 100}%` }} 
              />
              <div 
                className="bg-destructive h-full transition-all" 
                style={{ width: `${(summary.lossKeywords / Math.max(1, summary.totalKeywords)) * 100}%` }} 
              />
            </div>
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <div className="text-success font-medium">{summary.profitableKeywords} прибыльных</div>
            <div className="text-destructive font-medium">{summary.lossKeywords} убыточных</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
