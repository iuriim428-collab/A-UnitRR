import { useListExperiments, useCreateExperiment, useListCampaigns, getListExperimentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Eye } from "lucide-react";
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

const experimentSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  campaignId: z.coerce.number().min(1, "Выберите кампанию"),
  initialBid: z.coerce.number().min(0, "Ставка должна быть >= 0"),
});

export default function Experiments() {
  const { data: experiments, isLoading } = useListExperiments();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "running": return <Badge className="bg-primary">В процессе</Badge>;
      case "completed": return <Badge className="bg-success">Завершен</Badge>;
      case "paused": return <Badge variant="secondary">Пауза</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Эксперименты</h1>
          <p className="text-muted-foreground mt-1">Тестирование ставок и их влияние на CPO</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-experiment">
              <Plus className="mr-2 h-4 w-4" /> Новый эксперимент
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Запуск эксперимента</DialogTitle>
            </DialogHeader>
            <ExperimentForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Начальная ставка</TableHead>
                <TableHead className="text-right">Текущая ставка</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Загрузка...</TableCell>
                </TableRow>
              ) : !experiments?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Нет экспериментов</TableCell>
                </TableRow>
              ) : (
                experiments.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>{getStatusBadge(e.status)}</TableCell>
                    <TableCell className="text-right">{e.initialBid} ₽</TableCell>
                    <TableCell className="text-right font-bold">{e.currentBid} ₽</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/experiments/${e.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9" data-testid={`link-experiment-detail-${e.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
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

function ExperimentForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const createExperiment = useCreateExperiment();
  const { data: campaigns } = useListCampaigns();

  const form = useForm<z.infer<typeof experimentSchema>>({
    resolver: zodResolver(experimentSchema),
    defaultValues: {
      name: "",
      campaignId: 0,
      initialBid: 0,
    },
  });

  const onSubmit = (values: z.infer<typeof experimentSchema>) => {
    createExperiment.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListExperimentsQueryKey() });
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
              <FormLabel>Название</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-experiment-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="campaignId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Кампания</FormLabel>
              <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                <FormControl>
                  <SelectTrigger data-testid="select-experiment-campaign">
                    <SelectValue placeholder="Выберите кампанию" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {campaigns?.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="initialBid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Начальная ставка (₽)</FormLabel>
              <FormControl>
                <Input type="number" {...field} data-testid="input-experiment-bid" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={createExperiment.isPending} data-testid="button-submit-experiment">
          {createExperiment.isPending ? "Запуск..." : "Запустить эксперимент"}
        </Button>
      </form>
    </Form>
  );
}
