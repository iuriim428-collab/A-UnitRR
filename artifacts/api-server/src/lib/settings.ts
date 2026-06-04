import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface StoredSettings {
  wb?: { token?: string; analyticsToken?: string; advertToken?: string };
  ozon?: { clientId?: string; apiKey?: string; perfClientId?: string; perfClientSecret?: string };
  ym?: { token?: string; campaignIds?: string };
}

let cache: StoredSettings | null = null;
let cacheAt = 0;
const TTL = 10_000; // 10s

export async function getSettings(): Promise<StoredSettings> {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return cache;
  try {
    const rows = await db.execute(sql`SELECT settings FROM api_settings LIMIT 1`);
    cache = ((rows.rows[0] as any)?.settings ?? {}) as StoredSettings;
    cacheAt = now;
  } catch {
    cache = cache ?? {};
  }
  return cache;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function getWbToken(): Promise<string> {
  const s = await getSettings();
  return s.wb?.token ?? process.env.WB_API_KEY ?? "";
}

export async function getOzonHeaders(): Promise<{ "Client-Id": string; "Api-Key": string }> {
  const s = await getSettings();
  return {
    "Client-Id": s.ozon?.clientId ?? process.env.OZON_CLIENT_ID ?? "",
    "Api-Key": s.ozon?.apiKey ?? process.env.OZON_API_KEY ?? "",
  };
}

export async function getYmToken(): Promise<string> {
  const s = await getSettings();
  return s.ym?.token ?? process.env.YM_OAUTH_TOKEN ?? "";
}

/** Returns [fbyId, fbsId] from campaignIds CSV or env fallbacks */
export async function getYmCampaignIds(): Promise<[string, string]> {
  const s = await getSettings();
  const ids = (s.ym?.campaignIds ?? "")
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const fby = ids[0] ?? process.env.YM_FBY_CAMPAIGN_ID ?? "149095778";
  const fbs = ids[1] ?? process.env.YM_FBS_CAMPAIGN_ID ?? "149103486";
  return [fby, fbs];
}
