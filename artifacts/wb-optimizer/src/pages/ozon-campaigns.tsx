import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Megaphone, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

const fmt = (n: number) => n.toLocaleString("ru-RU");

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  CAMPAIGN_STATE_RUNNING:   { label: "Активна",   color: "bg-green-100 text-green-800" },
  CAMPAIGN_STATE_INACTIVE:  { label: "Остановлена", color: "bg-gray-100 text-gray-600" },
  CAMPAIGN_STATE_ARCHIVED:  { label: "В архиве",  color: "bg-gray-100 text-gray-400" },
  CAMPAIGN_STATE_MODERATION:{ label: "На модерации", color: "bg-yellow-100 text-yellow-800" },
};

const TYPE_LABEL: Record<string, string> = {
  SKU: "SKU",
  BANNER: "Баннер",
  BRAND_SHELF: "Брендовая полка",
  SEARCH_PROMO: "Поисковое продвижение",
};

const PLACEMENT_LABEL: Record<string, string> = {
  PLACEMENT_TOP_PROMOTION: "Топ поиска",
  PLACEMENT_SEARCH_AND_CATEGORY: "Поиск и категории",
  PLACEMENT_PDP_SIMILAR: "Похожие товары",
  PLACEMENT_PDP_COMPLEMENTARY: "С этим берут",
  PLACEMENT_CART: "Корзина",
};

interface Campaign {
  id: string;
  title: string;
  state: string;
  type: string;
  paymentType: string;
  placement: string[];
  fromDate: string;
  toDate: string;
  dailyBudget: number;
  budget: number;
  skus: string[];
  isActive: boolean;
}

export default function OzonCampaigns() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  const { data, isLoading } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["ozon-campaigns"],
    queryFn: () => fetch(`${BASE()}/api/ozon-live/campaigns`).then((r) => r.json()),
    staleTime: 3600_000,
  });

  const campaigns = (data?.campaigns ?? []).filter((c) => {
    if (filter === "active") return c.isActive;
    if (filter === "inactive") return !c.isActive;
    return true;
  });

  const active = data?.campaigns.filter((c) => c.isActive).length ?? 0;
  const total = data?.campaigns.length ?? 0;
  const totalSkus = new Set(data?.campaigns.flatMap((c) => c.skus) ?? []).size;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Кампании Ozon</h1>
            <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">Performance API</span>
          </div>
          <p className="text-muted-foreground mt-1">Все рекламные кампании аккаунта · привязка к товарам</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка кампаний...
        </div>
      )}

      {!isLoading && data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Всего кампаний", value: String(total) },
              { label: "Активных", value: String(active), good: true },
              { label: "Уникальных SKU", value: String(totalSkus) },
            ].map(({ label, value, good }) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold mt-0.5 ${good && Number(value) > 0 ? "text-green-600" : ""}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            {([["all", "Все"], ["active", "Активные"], ["inactive", "Остановленные"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filter === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Campaigns list */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {campaigns.map((c) => {
                  const stateInfo = STATE_LABEL[c.state] ?? { label: c.state, color: "bg-gray-100 text-gray-600" };
                  const isOpen = openId === c.id;
                  return (
                    <div key={c.id}>
                      <div
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${isOpen ? "bg-muted/20" : ""}`}
                        onClick={() => setOpenId(isOpen ? null : c.id)}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{c.title}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stateInfo.color}`}>{stateInfo.label}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">{TYPE_LABEL[c.type] ?? c.type}</span>
                            <span className="text-xs text-muted-foreground">{c.paymentType}</span>
                            {c.placement?.map((p) => (
                              <span key={p} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded dark:bg-blue-950/30">
                                {PLACEMENT_LABEL[p] ?? p}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-xs text-muted-foreground">{c.fromDate} — {c.toDate || "∞"}</p>
                          {c.dailyBudget > 0 && <p className="text-xs font-medium">{fmt(c.dailyBudget)} ₽/день</p>}
                        </div>

                        <Badge variant="outline" className="shrink-0 text-xs">{c.skus.length} SKU</Badge>
                      </div>

                      {isOpen && (
                        <div className="px-10 pb-4 bg-muted/10">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 font-medium">Товары в кампании</p>
                          {c.skus.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Товаров нет</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {c.skus.map((sku) => (
                                <a
                                  key={sku}
                                  href={`/sku-card?q=${sku}`}
                                  className="font-mono text-xs bg-muted px-2 py-1 rounded hover:bg-[#005bff]/10 hover:text-[#005bff] transition-colors"
                                >
                                  {sku}
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="mt-3 flex gap-4 text-xs text-muted-foreground flex-wrap">
                            <span>ID кампании: <span className="font-mono">{c.id}</span></span>
                            <span>Тип: {TYPE_LABEL[c.type] ?? c.type}</span>
                            {c.budget > 0 && <span>Общий бюджет: {fmt(c.budget)} ₽</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
