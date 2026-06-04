import { useGetExperiment, useUpdateExperiment, useAddExperimentSnapshot, getGetExperimentQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const snapshotSchema = z.object({
  bid: z.coerce.number().min(0),
  avgPosition: z.coerce.number().min(1),
  traffic: z.coerce.number().min(0),
  cpo: z.coerce.number().min(0),
  orders: z.coerce.number().min(0),
});

const conclusionSchema = z.object({
  status: z.enum(["running", "completed", "paused"]),
  conclusion: z.string().optional(),
});

export default function ExperimentDetail() {
  const { id } = useParams<{ id: string }>();
  const experimentId = Number(id);
  const { data: experiment, isLoading } = useGetExperiment(experimentId);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateExperiment = useUpdateExperiment();

  const conclusionForm = useForm<z.infer<typeof conclusionSchema>>({
    resolver: zodResolver(conclusionSchema),
    values: {
      status: (experiment?.status as any) || "running",
      conclusion: experiment?.conclusion || "",
    }
  });

  const onConclusionSubmit = (values: z.infer<typeof conclusionSchema>) => {
    updateExperiment.mutate({ id: experimentId, data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetExperimentQueryKey(experimentId) });
      }
    });
  };

  if (isLoading) return <div className="p-8">Загрузка...</div>;
  if (!experiment) return <div className="p-8">Эксперимент не найден</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/experiments" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            {experiment.name}
            {experiment.status === 'running' && <Badge className="bg-primary">В процессе</Badge>}
            {experiment.status === 'completed' && <Badge className="bg-success">Завершен</Badge>}
          </h1>
          <p className="text-muted-foreground mt-1">Начальная ставка: {experiment.initialBid} ₽ • Текущая: {experiment.currentBid} ₽</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Замеры (Срезы)</CardTitle>
              <Dialog open={isSnapshotOpen} onOpenChange={setIsSnapshotOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-snapshot">
                    <Plus className="mr-2 h-4 w-4" /> Добавить замер
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Новый замер</DialogTitle>
                  </DialogHeader>
                  <SnapshotForm experimentId={experimentId} onSuccess={() => setIsSnapshotOpen(false)} />
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead className="text-right">Ставка</TableHead>
                    <TableHead className="text-right">Позиция</TableHead>
                    <TableHead className="text-right">Трафик</TableHead>
                    <TableHead className="text-right">Заказы</TableHead>
                    <TableHead className="text-right font-bold">CPO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!experiment.snapshots?.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center h-24">Нет замеров</TableCell></TableRow>
                  ) : (
                    experiment.snapshots.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground">
                          {new Date(s.recordedAt).toLocaleString('ru-RU')}
                        </TableCell>
                        <TableCell className="text-right font-medium">{s.bid} ₽</TableCell>
                        <TableCell className="text-right">{s.avgPosition}</TableCell>
                        <TableCell className="text-right">{s.traffic}</TableCell>
                        <TableCell className="text-right">{s.orders}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{s.cpo} ₽</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Выводы и статус</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...conclusionForm}>
                <form onSubmit={conclusionForm.handleSubmit(onConclusionSubmit)} className="space-y-4">
                  <FormField
                    control={conclusionForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Статус эксперимента</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-exp-status">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="running">В процессе</SelectItem>
                            <SelectItem value="paused">Пауза</SelectItem>
                            <SelectItem value="completed">Завершен</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={conclusionForm.control}
                    name="conclusion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Вывод (результат)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            rows={4} 
                            placeholder="Опишите результаты: какая ставка дала оптимальный CPO..." 
                            data-testid="textarea-exp-conclusion"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={updateExperiment.isPending} data-testid="button-save-conclusion">
                    {updateExperiment.isPending ? "Сохранение..." : "Сохранить итоги"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SnapshotForm({ experimentId, onSuccess }: { experimentId: number, onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const addSnapshot = useAddExperimentSnapshot();

  const form = useForm<z.infer<typeof snapshotSchema>>({
    resolver: zodResolver(snapshotSchema),
    defaultValues: {
      bid: 0,
      avgPosition: 1,
      traffic: 0,
      cpo: 0,
      orders: 0,
    },
  });

  const onSubmit = (values: z.infer<typeof snapshotSchema>) => {
    addSnapshot.mutate(
      { id: experimentId, data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetExperimentQueryKey(experimentId) });
          onSuccess();
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="bid"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ставка (₽)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-snap-bid" />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="avgPosition"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ср. позиция</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-snap-pos" />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="traffic"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Трафик</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-snap-traffic" />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="orders"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Заказы</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-snap-orders" />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cpo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPO (₽)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-snap-cpo" />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" className="w-full" disabled={addSnapshot.isPending} data-testid="button-save-snapshot">
          Сохранить замер
        </Button>
      </form>
    </Form>
  );
}
