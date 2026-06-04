import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Login from "@/pages/login";
import { NewOrdersProvider } from "@/contexts/new-orders-context";
import { useApiSettingsSync } from "@/hooks/use-api-settings";
import Settings from "@/pages/settings";

// Pages
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import Experiments from "@/pages/experiments";
import ExperimentDetail from "@/pages/experiment-detail";
import CpoAnalysis from "@/pages/cpo-analysis";
import YmBoost from "@/pages/ym-boost";
import OzonAd from "@/pages/ozon-ad";
import OzonSales from "@/pages/ozon-sales";
import OzonCompare from "@/pages/ozon-compare";
import YmCpm from "@/pages/ym-cpm";
import SkuCard from "@/pages/sku-card";
import OzonLive from "@/pages/ozon-live";
import OzonCampaigns from "@/pages/ozon-campaigns";
import WbLive from "@/pages/wb-live";
import YmLive from "@/pages/ym-live";
import OrdersFeed from "@/pages/orders-feed";
import OrdersHeatmap from "@/pages/orders-heatmap";
import Stocks from "@/pages/stocks";
import ShipmentPlan from "@/pages/shipment-plan";
import Shipments from "@/pages/shipments";
import UnitEconomics from "@/pages/unit-economics";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function AppWithSettings({ children }: { children: React.ReactNode }) {
  useApiSettingsSync();
  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/settings" component={Settings} />
        <Route path="/" component={Dashboard} />
        <Route path="/products" component={Products} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/campaigns/:id" component={CampaignDetail} />
        <Route path="/experiments" component={Experiments} />
        <Route path="/experiments/:id" component={ExperimentDetail} />
        <Route path="/cpo-analysis" component={CpoAnalysis} />
        <Route path="/ym/boost" component={YmBoost} />
        <Route path="/ozon/ad" component={OzonAd} />
        <Route path="/ozon/sales" component={OzonSales} />
        <Route path="/ozon/compare" component={OzonCompare} />
        <Route path="/ym/cpm" component={YmCpm} />
        <Route path="/sku-card" component={SkuCard} />
        <Route path="/ozon/live" component={OzonLive} />
        <Route path="/ozon/campaigns" component={OzonCampaigns} />
        <Route path="/wb/live" component={WbLive} />
        <Route path="/ym/live" component={YmLive} />
        <Route path="/orders-feed" component={OrdersFeed} />
        <Route path="/orders-heatmap" component={OrdersHeatmap} />
        <Route path="/stocks" component={Stocks} />
        <Route path="/shipment-plan" component={ShipmentPlan} />
        <Route path="/shipments" component={Shipments} />
        <Route path="/unit-economics" component={UnitEconomics} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate() {
  const { data, isLoading, refetch } = useQuery<{ authenticated: boolean }>({
    queryKey: ["auth-me"],
    queryFn: () =>
      fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!data?.authenticated) {
    return (
      <Login
        onSuccess={() => {
          refetch();
        }}
      />
    );
  }

  return (
    <NewOrdersProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppWithSettings>
          <Router />
        </AppWithSettings>
      </WouterRouter>
    </NewOrdersProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
