import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const experimentsTable = pgTable("experiments", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  initialBid: numeric("initial_bid", { precision: 12, scale: 2 }).notNull(),
  currentBid: numeric("current_bid", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("running"),
  conclusion: text("conclusion"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const snapshotsTable = pgTable("snapshots", {
  id: serial("id").primaryKey(),
  experimentId: integer("experiment_id").notNull().references(() => experimentsTable.id, { onDelete: "cascade" }),
  bid: numeric("bid", { precision: 12, scale: 2 }).notNull(),
  avgPosition: numeric("avg_position", { precision: 5, scale: 2 }).notNull(),
  traffic: integer("traffic").notNull(),
  cpo: numeric("cpo", { precision: 12, scale: 2 }).notNull(),
  orders: integer("orders").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertExperimentSchema = createInsertSchema(experimentsTable).omit({ id: true, createdAt: true, currentBid: true, status: true, conclusion: true });
export const insertSnapshotSchema = createInsertSchema(snapshotsTable).omit({ id: true, recordedAt: true });
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Experiment = typeof experimentsTable.$inferSelect;
export type Snapshot = typeof snapshotsTable.$inferSelect;
