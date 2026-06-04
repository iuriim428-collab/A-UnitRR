import { Router } from "express";
import { db } from "@workspace/db";
import { experimentsTable, snapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateExperimentBody,
  UpdateExperimentBody,
  GetExperimentParams,
  UpdateExperimentParams,
  AddExperimentSnapshotParams,
  AddExperimentSnapshotBody,
} from "@workspace/api-zod";

const router = Router();

function mapExp(e: typeof experimentsTable.$inferSelect) {
  return {
    ...e,
    initialBid: Number(e.initialBid),
    currentBid: Number(e.currentBid),
  };
}

function mapSnap(s: typeof snapshotsTable.$inferSelect) {
  return {
    ...s,
    bid: Number(s.bid),
    avgPosition: Number(s.avgPosition),
    cpo: Number(s.cpo),
  };
}

router.get("/experiments", async (req, res) => {
  const experiments = await db.select().from(experimentsTable).orderBy(experimentsTable.createdAt);
  res.json(experiments.map(mapExp));
});

router.post("/experiments", async (req, res) => {
  const body = CreateExperimentBody.parse(req.body);
  const [exp] = await db.insert(experimentsTable).values({
    campaignId: body.campaignId,
    name: body.name,
    initialBid: String(body.initialBid),
    currentBid: String(body.initialBid),
    status: "running",
  }).returning();
  res.status(201).json(mapExp(exp));
});

router.get("/experiments/:id", async (req, res) => {
  const { id } = GetExperimentParams.parse({ id: Number(req.params.id) });
  const [exp] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, id));
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  const snapshots = await db.select().from(snapshotsTable).where(eq(snapshotsTable.experimentId, id)).orderBy(snapshotsTable.recordedAt);
  res.json({ ...mapExp(exp), snapshots: snapshots.map(mapSnap) });
});

router.patch("/experiments/:id", async (req, res) => {
  const { id } = UpdateExperimentParams.parse({ id: Number(req.params.id) });
  const body = UpdateExperimentBody.parse(req.body);
  const [existing] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Experiment not found" });
  const updateData: Record<string, unknown> = {};
  if (body.currentBid !== undefined) updateData.current_bid = String(body.currentBid);
  if (body.status !== undefined) updateData.status = body.status;
  if (body.conclusion !== undefined) updateData.conclusion = body.conclusion;
  const [updated] = await db.update(experimentsTable).set(updateData).where(eq(experimentsTable.id, id)).returning();
  res.json(mapExp(updated));
});

router.post("/experiments/:id/snapshots", async (req, res) => {
  const { id } = AddExperimentSnapshotParams.parse({ id: Number(req.params.id) });
  const body = AddExperimentSnapshotBody.parse(req.body);
  const [exp] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, id));
  if (!exp) return res.status(404).json({ error: "Experiment not found" });
  const [snap] = await db.insert(snapshotsTable).values({
    experimentId: id,
    bid: String(body.bid),
    avgPosition: String(body.avgPosition),
    traffic: body.traffic,
    cpo: String(body.cpo),
    orders: body.orders,
  }).returning();
  // Update experiment current bid
  await db.update(experimentsTable).set({ currentBid: String(body.bid) }).where(eq(experimentsTable.id, id));
  res.status(201).json(mapSnap(snap));
});

export default router;
