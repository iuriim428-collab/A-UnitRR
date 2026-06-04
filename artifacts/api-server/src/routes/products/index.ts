import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
} from "@workspace/api-zod";

const router = Router();

function calcIncomePerSale(price: number, wbCommission: number, logisticsCost: number, costPrice: number) {
  return price - (price * wbCommission) / 100 - logisticsCost - costPrice;
}

router.get("/products", async (req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.createdAt);
  const result = products.map((p) => ({
    ...p,
    price: Number(p.price),
    wbCommission: Number(p.wbCommission),
    logisticsCost: Number(p.logisticsCost),
    costPrice: Number(p.costPrice),
    incomePerSale: calcIncomePerSale(Number(p.price), Number(p.wbCommission), Number(p.logisticsCost), Number(p.costPrice)),
  }));
  res.json(result);
});

router.post("/products", async (req, res) => {
  const body = CreateProductBody.parse(req.body);
  const [product] = await db.insert(productsTable).values({
    name: body.name,
    sku: body.sku,
    price: String(body.price),
    wbCommission: String(body.wbCommission),
    logisticsCost: String(body.logisticsCost),
    costPrice: String(body.costPrice),
  }).returning();
  res.status(201).json({
    ...product,
    price: Number(product.price),
    wbCommission: Number(product.wbCommission),
    logisticsCost: Number(product.logisticsCost),
    costPrice: Number(product.costPrice),
    incomePerSale: calcIncomePerSale(Number(product.price), Number(product.wbCommission), Number(product.logisticsCost), Number(product.costPrice)),
  });
});

router.get("/products/:id", async (req, res) => {
  const { id } = GetProductParams.parse({ id: Number(req.params.id) });
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({
    ...product,
    price: Number(product.price),
    wbCommission: Number(product.wbCommission),
    logisticsCost: Number(product.logisticsCost),
    costPrice: Number(product.costPrice),
    incomePerSale: calcIncomePerSale(Number(product.price), Number(product.wbCommission), Number(product.logisticsCost), Number(product.costPrice)),
  });
});

router.patch("/products/:id", async (req, res) => {
  const { id } = UpdateProductParams.parse({ id: Number(req.params.id) });
  const body = UpdateProductBody.parse(req.body);
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Product not found" });
  const updateData: Record<string, string> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.sku !== undefined) updateData.sku = body.sku;
  if (body.price !== undefined) updateData.price = String(body.price);
  if (body.wbCommission !== undefined) updateData.wb_commission = String(body.wbCommission);
  if (body.logisticsCost !== undefined) updateData.logistics_cost = String(body.logisticsCost);
  if (body.costPrice !== undefined) updateData.cost_price = String(body.costPrice);
  const [updated] = await db.update(productsTable).set(updateData).where(eq(productsTable.id, id)).returning();
  res.json({
    ...updated,
    price: Number(updated.price),
    wbCommission: Number(updated.wbCommission),
    logisticsCost: Number(updated.logisticsCost),
    costPrice: Number(updated.costPrice),
    incomePerSale: calcIncomePerSale(Number(updated.price), Number(updated.wbCommission), Number(updated.logisticsCost), Number(updated.costPrice)),
  });
});

router.delete("/products/:id", async (req, res) => {
  const { id } = DeleteProductParams.parse({ id: Number(req.params.id) });
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).send();
});

export default router;
