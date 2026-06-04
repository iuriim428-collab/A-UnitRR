/**
 * Инициализация схемы БД для PGlite (Desktop-режим).
 * Создаёт все таблицы если они ещё не существуют.
 */

export const PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS user_sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS api_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  wb_commission NUMERIC(5,2) NOT NULL,
  logistics_cost NUMERIC(12,2) NOT NULL,
  cost_price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  cluster TEXT NOT NULL,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  initial_bid NUMERIC(12,2) NOT NULL,
  current_bid NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  conclusion TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id SERIAL PRIMARY KEY,
  experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  bid NUMERIC(12,2) NOT NULL,
  avg_position NUMERIC(5,2) NOT NULL,
  traffic INTEGER NOT NULL,
  cpo NUMERIC(12,2) NOT NULL,
  orders INTEGER NOT NULL,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS ozon_ad_reports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  period TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS ozon_ad_rows (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES ozon_ad_reports(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  tool TEXT,
  placement TEXT,
  campaign_id TEXT,
  spend NUMERIC(14,6) NOT NULL DEFAULT 0,
  drr NUMERIC(8,4),
  sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(10,6),
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cart INTEGER NOT NULL DEFAULT 0,
  cart_conversion NUMERIC(10,6),
  cpo NUMERIC(14,6),
  cpc NUMERIC(14,6)
);

CREATE TABLE IF NOT EXISTS ozon_sales_reports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  period TEXT,
  seller TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS ozon_sales_rows (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES ozon_sales_reports(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  cat1 TEXT,
  cat2 TEXT,
  cat3 TEXT,
  brand TEXT,
  model TEXT,
  fulfillment TEXT,
  sku TEXT NOT NULL,
  article TEXT,
  abc_revenue TEXT,
  abc_orders TEXT,
  orders_revenue NUMERIC(14,2) DEFAULT 0,
  reven_dynamic NUMERIC(8,4),
  search_position NUMERIC(8,2),
  search_pos_dynamic NUMERIC(8,4),
  impressions INTEGER DEFAULT 0,
  impressions_dynamic NUMERIC(8,4),
  card_visits INTEGER DEFAULT 0,
  card_visits_dynamic NUMERIC(8,4),
  cart_conversion NUMERIC(8,6),
  cart_conversion_dynamic NUMERIC(8,4),
  cart_adds INTEGER DEFAULT 0,
  cart_adds_dynamic NUMERIC(8,4),
  orders_qty INTEGER DEFAULT 0,
  orders_qty_dynamic NUMERIC(8,4),
  cancellations INTEGER DEFAULT 0,
  cancellations_dynamic NUMERIC(8,4),
  returns INTEGER DEFAULT 0,
  returns_dynamic NUMERIC(8,4),
  supply_recommendation TEXT,
  supply_qty INTEGER
);

CREATE TABLE IF NOT EXISTS ym_boost_reports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  period TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS ym_boost_skus (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES ym_boost_reports(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  campaign_ids TEXT,
  campaign_names TEXT,
  impressions_boost INTEGER NOT NULL DEFAULT 0,
  impressions_all INTEGER NOT NULL DEFAULT 0,
  clicks_boost INTEGER NOT NULL DEFAULT 0,
  clicks_all INTEGER NOT NULL DEFAULT 0,
  cart_boost INTEGER NOT NULL DEFAULT 0,
  cart_all INTEGER NOT NULL DEFAULT 0,
  orders_boost INTEGER NOT NULL DEFAULT 0,
  orders_all INTEGER NOT NULL DEFAULT 0,
  delivered_boost INTEGER NOT NULL DEFAULT 0,
  delivered_all INTEGER NOT NULL DEFAULT 0,
  spend_boost NUMERIC(14,2) NOT NULL DEFAULT 0,
  spend_bonuses NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_boost_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  spend_share_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
  revenue_boost NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_all NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_share_pct NUMERIC(8,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ym_boost_campaigns (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES ym_boost_reports(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  impressions_boost INTEGER NOT NULL DEFAULT 0,
  clicks_boost INTEGER NOT NULL DEFAULT 0,
  cart_boost INTEGER NOT NULL DEFAULT 0,
  orders_boost INTEGER NOT NULL DEFAULT 0,
  delivered_boost INTEGER NOT NULL DEFAULT 0,
  spend_boost NUMERIC(14,2) NOT NULL DEFAULT 0,
  spend_bonuses NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_boost NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ym_cpm_reports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  period TEXT,
  attribution TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS ym_cpm_campaign_rows (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES ym_cpm_reports(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  frequency NUMERIC(8,4) DEFAULT 0,
  cart_adds INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  conversion_pct NUMERIC(8,4) DEFAULT 0,
  order_revenue NUMERIC(14,2) DEFAULT 0,
  cpo NUMERIC(14,2) DEFAULT 0,
  calc_spend NUMERIC(14,2) DEFAULT 0,
  spend_share_pct NUMERIC(8,4) DEFAULT 0,
  cpm NUMERIC(14,2) DEFAULT 0,
  actual_spend NUMERIC(14,2) DEFAULT 0,
  bonuses NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ym_cpm_sku_rows (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES ym_cpm_reports(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cart_adds INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  cpm NUMERIC(14,2) DEFAULT 0,
  calc_spend NUMERIC(14,2) DEFAULT 0,
  revenue NUMERIC(14,2) DEFAULT 0,
  campaign_ids TEXT,
  campaign_names TEXT
);

INSERT INTO api_settings (id, settings) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;
`;
