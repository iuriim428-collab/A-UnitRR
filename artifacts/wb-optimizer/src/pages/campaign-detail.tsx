import { useGetCampaign, useListKeywords, useMoveKeywordToMinus, useGetProduct, getListKeywordsQueryKey, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  
  const { data: campaign, isLoading: campaignLoading } = useGetCampaign(campaignId);
  // Get product to know the incomePerSale
  const { data: product } = useGetProduct(campaign?.productId || 0, { query: { enabled: !!campaign?.productId, queryKey: ['product', campaign?.productId] } });
  
  const { data: keywords, isLoading: keywordsLoading } = useListKeywords({ campaignId });
  const moveToMinus = useMoveKeywordToMinus();
  const queryClient = useQueryClient();

  const handleMinus = (keywordId: number) => {
    moveToMinus.mutate({ data: { keywordId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKeywordsQueryKey({ campaignId }) });
      }
    });
  };

  if (campaignLoading || keywordsLoading) return <div className="p-8">Загрузка...</div>;
  if (!campaign) return <div className="p-8">Кампания не найдена</div>;

  const income = product?.incomePerSale || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/campaigns" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{campaign.name}</h1>
          <p className="text-muted-foreground mt-1">Анализ фраз • Доход с продажи: {income.toLocaleString('ru-RU')} ₽</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Расход</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{campaign.totalSpend.toLocaleString('ru-RU')} ₽</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Заказы</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{campaign.totalOrders}</div></CardContent>
        </Card>
        <Card className={campaign.avgCpo > income ? "border-destructive" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Средний CPO</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{campaign.avgCpo.toLocaleString('ru-RU')} ₽</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ключевые фразы</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Фраза</TableHead>
                <TableHead>Кластер</TableHead>
                <TableHead className="text-right">Расход</TableHead>
                <TableHead className="text-right">Заказы</TableHead>
                <TableHead className="text-right">CPO</TableHead>
                <TableHead className="text-right">Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!keywords?.length ? (
                <TableRow><TableCell colSpan={7} className="text-center h-24">Нет фраз</TableCell></TableRow>
              ) : (
                keywords.map((k) => {
                  const isLoss = k.cpo > income && k.orders > 0;
                  const isProfitable = k.cpo <= income && k.orders > 0;
                  
                  return (
                    <TableRow key={k.id} className={isLoss ? "bg-destructive/5" : isProfitable ? "bg-success/5" : ""}>
                      <TableCell className="font-medium">{k.phrase}</TableCell>
                      <TableCell className="text-muted-foreground">{k.cluster}</TableCell>
                      <TableCell className="text-right">{k.spend.toLocaleString('ru-RU')} ₽</TableCell>
                      <TableCell className="text-right">{k.orders}</TableCell>
                      <TableCell className={`text-right font-bold ${isLoss ? 'text-destructive' : isProfitable ? 'text-success' : ''}`}>
                        {k.cpo > 0 ? `${k.cpo.toLocaleString('ru-RU')} ₽` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {k.status === 'minus' ? (
                          <Badge variant="destructive">Минус-фраза</Badge>
                        ) : (
                          <Badge variant="secondary">Активна</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {k.status !== 'minus' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleMinus(k.id)}
                            disabled={moveToMinus.isPending}
                            data-testid={`button-minus-${k.id}`}
                            className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <Ban className="h-4 w-4 mr-2" /> В минус
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
