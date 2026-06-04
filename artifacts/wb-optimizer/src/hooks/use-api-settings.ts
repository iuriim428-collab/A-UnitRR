/**
 * Fetches API keys from the server and syncs them into localStorage
 * so all marketplace hooks pick them up automatically.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface ApiSettings {
  wb?: { token?: string; analyticsToken?: string; advertToken?: string };
  ozon?: { clientId?: string; apiKey?: string; perfClientId?: string; perfClientSecret?: string };
  ym?: { token?: string; campaignIds?: string };
}

function sync(settings: ApiSettings) {
  const wb = settings.wb ?? {};
  const ozon = settings.ozon ?? {};
  const ym = settings.ym ?? {};

  if (wb.token)              localStorage.setItem("wb_api_token",            wb.token);
  if (wb.analyticsToken)     localStorage.setItem("wb_analytics_token",      wb.analyticsToken);
  if (wb.advertToken)        localStorage.setItem("wb_advert_token",          wb.advertToken);
  if (ozon.clientId)         localStorage.setItem("ozon_client_id",           ozon.clientId);
  if (ozon.apiKey)           localStorage.setItem("ozon_api_key",             ozon.apiKey);
  if (ozon.perfClientId)     localStorage.setItem("ozon_perf_client_id",      ozon.perfClientId);
  if (ozon.perfClientSecret) localStorage.setItem("ozon_perf_client_secret",  ozon.perfClientSecret);
  if (ym.token)              localStorage.setItem("ym_token",                 ym.token);
  if (ym.campaignIds)        localStorage.setItem("ym_campaign_ids",          ym.campaignIds);
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
