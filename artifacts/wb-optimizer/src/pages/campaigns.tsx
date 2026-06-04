import { useListCampaigns, useCreateCampaign, useDeleteCampaign, useListProducts, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Eye } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ImportReport } from "@/components/import-report";

const campaignSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  productId: z.coerce.number().min(1, "Выберите товар"),
  status: z.enum(["active", "paused", "stopped"]),
});

export default function Campaigns() {
  const { data: campaigns, isLoading } = useListCampaigns();
  const deleteCampaign = useDeleteCampaign();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleDelete = (id: number) => {
    if (confirm("Удалить кампанию?")) {
      deleteCampaign.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        }
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "active": return <Badge className="bg-success">Активна</Badge>;
      case "paused": return <Badge variant="secondary">Пауза</Badge>;
      case "stopped": return <Badge variant="destructive">Остановлена</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Кампании</h1>
          <p className="text-muted-foreground mt-1">Управление рекламными кампаниями</p>
        </div>
        <div className="flex gap-2">
          <ImportReport />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-campaign">
                <Plus className="mr-2 h-4 w-4" /> Создать кампанию
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новая кампания</DialogTitle>
              </DialogHeader>
              <CampaignForm onSuccess={() => setIsDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Расход</TableHead>
                <TableHead className="text-right">Заказы</TableHead>
                <TableHead className="text-right">CPO</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : !campaigns?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    Нет кампаний
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{getStatusBadge(c.status)}</TableCell>
                    <TableCell className="text-right">{c.totalSpend.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right">{c.totalOrders}</TableCell>
                    <TableCell className="text-right font-bold">{c.avgCpo.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Link href={`/campaigns/${c.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9" data-testid={`link-campaign-detail-${c.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} data-testid={`button-delete-campaign-${c.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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

function CampaignForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const createCampaign = useCreateCampaign();
  const { data: products } = useListProducts();

  const form = useForm<z.infer<typeof campaignSchema>>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      productId: 0,
      status: "active",
    },
  });

  const onSubmit = (values: z.infer<typeof campaignSchema>) => {
    createCampaign.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          onSuccess();
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название кампании</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-campaign-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="productId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Товар</FormLabel>
              <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                <FormControl>
                  <SelectTrigger data-testid="select-campaign-product">
                    <SelectValue placeholder="Выберите товар" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {products?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Статус</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-campaign-status">
                    <SelectValue placeholder="Выберите статус" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Активна</SelectItem>
                  <SelectItem value="paused">Пауза</SelectItem>
                  <SelectItem value="stopped">Остановлена</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={createCampaign.isPending} data-testid="button-submit-campaign">
          {createCampaign.isPending ? "Создание..." : "Создать кампанию"}
        </Button>
      </form>
    </Form>
  );
}
