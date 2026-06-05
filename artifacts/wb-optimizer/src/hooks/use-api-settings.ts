/**
 * Fetches API keys from the server and syncs them into localStorage
 * so all marketplace hooks pick them up automatically.
 *
 * localStorage key mapping (must match what each hook reads):
 *   WB:   wb_api_token, wb_analytics_token, wb_advert_token
 *   Ozon: ozon_api_client_id, ozon_api_api_key, perf_api_client_id, perf_api_client_secret
 *   YM:   ym_api_token, ym_api_campaign_id
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface ApiSettings {
  wb?: { token?: string; analyticsToken?: string; advertToken?: string };
  ozon?: { clientId?: string; apiKey?: string; perfClientId?: string; perfClientSecret?: string };
  ym?: { token?: string; campaignIds?: string };
  costs?: {
    wb?: Record<string, { costPerUnit: number; vatRate: number }>;
    ozon?: Record<string, { costPerUnit: number; vatRate: number }>;
    ym?: Record<string, { costPerUnit: number; vatRate: number }>;
  };
}

function sync(settings: ApiSettings) {
  const wb   = settings.wb   ?? {};
  const ozon = settings.ozon ?? {};
  const ym   = settings.ym   ?? {};

  // WB — hooks read: wb_api_token, wb_analytics_token, wb_advert_token
  if (wb.token)              localStorage.setItem("wb_api_token",            wb.token);
  if (wb.analyticsToken)     localStorage.setItem("wb_analytics_token",      wb.analyticsToken);
  if (wb.advertToken)        localStorage.setItem("wb_advert_token",          wb.advertToken);

  // Ozon — hooks read: ozon_api_client_id, ozon_api_api_key
  if (ozon.clientId)         localStorage.setItem("ozon_api_client_id",       ozon.clientId);
  if (ozon.apiKey)           localStorage.setItem("ozon_api_api_key",         ozon.apiKey);
  // Perf — hooks read: perf_api_client_id, perf_api_client_secret
  if (ozon.perfClientId)     localStorage.setItem("perf_api_client_id",       ozon.perfClientId);
  if (ozon.perfClientSecret) localStorage.setItem("perf_api_client_secret",   ozon.perfClientSecret);

  // YM — hooks read: ym_api_token, ym_api_campaign_id
  if (ym.token)              localStorage.setItem("ym_api_token",             ym.token);
  if (ym.campaignIds)        localStorage.setItem("ym_api_campaign_id",       ym.campaignIds);

  // Costs — sync to localStorage so unit economics hooks pick them up
  const costs = settings.costs ?? {};
  if (costs.wb   && Object.keys(costs.wb).length)   localStorage.setItem("costs_wb_api",   JSON.stringify(costs.wb));
  if (costs.ozon && Object.keys(costs.ozon).length) localStorage.setItem("costs_ozon_api", JSON.stringify(costs.ozon));
  if (costs.ym   && Object.keys(costs.ym).length)   localStorage.setItem("costs_ym_api",   JSON.stringify(costs.ym));
}

export function useApiSettingsSync() {
  const { data } = useQuery<ApiSettings>({
    queryKey: ["api-settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (data) sync(data);
  }, [data]);
}
