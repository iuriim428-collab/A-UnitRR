import { useListProducts, useCreateProduct, useDeleteProduct, getListProductsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const productSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  sku: z.string().min(1, "Обязательное поле"),
  price: z.coerce.number().min(0),
  wbCommission: z.coerce.number().min(0).max(100),
  logisticsCost: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0),
});

export default function Products() {
  const { data: products, isLoading } = useListProducts();
  const deleteProduct = useDeleteProduct();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleDelete = (id: number) => {
    if (confirm("Удалить товар?")) {
      deleteProduct.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        }
      });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Товары</h1>
          <p className="text-muted-foreground mt-1">Юнит-экономика и управление артикулами</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-product">
              <Plus className="mr-2 h-4 w-4" /> Добавить товар
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новый товар</DialogTitle>
            </DialogHeader>
            <ProductForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название / SKU</TableHead>
                <TableHead className="text-right">Цена</TableHead>
                <TableHead className="text-right">Комиссия WB</TableHead>
                <TableHead className="text-right">Логистика</TableHead>
                <TableHead className="text-right">Себестоимость</TableHead>
                <TableHead className="text-right font-bold">Доход (Income)</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : !products?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                    Нет добавленных товаров
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.sku}</div>
                    </TableCell>
                    <TableCell className="text-right">{p.price.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right">{p.wbCommission}%</TableCell>
                    <TableCell className="text-right">{p.logisticsCost.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right">{p.costPrice.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right font-bold text-primary">{p.incomePerSale.toLocaleString('ru-RU')} ₽</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} data-testid={`button-delete-product-${p.id}`}>
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

function ProductForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      sku: "",
      price: 0,
      wbCommission: 0,
      logisticsCost: 0,
      costPrice: 0,
    },
  });

  const onSubmit = (values: z.infer<typeof productSchema>) => {
    createProduct.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
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
                <Input {...field} data-testid="input-product-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SKU (Артикул WB)</FormLabel>
              <FormControl>
                <Input {...field} data-testid="input-product-sku" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Цена (₽)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-product-price" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="wbCommission"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Комиссия WB (%)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-product-commission" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="logisticsCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Логистика (₽)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-product-logistics" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="costPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Себестоимость (₽)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} data-testid="input-product-cost" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" className="w-full" disabled={createProduct.isPending} data-testid="button-submit-product">
          {createProduct.isPending ? "Сохранение..." : "Сохранить товар"}
        </Button>
      </form>
    </Form>
  );
}
