import { Link, useLocation } from "wouter";
import { LayoutDashboard, Package, TrendingUp, TestTube, LineChart, ChevronRight, Layers, BarChart2, ScanSearch, Zap, Megaphone, Rss, Warehouse, LogOut, Truck, LayoutGrid, Bell, PackageCheck, Calculator } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNewOrders } from "@/contexts/new-orders-context";

const wbNav = [
  { href: "/wb/live", label: "Живая аналитика", icon: Zap },
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/campaigns", label: "Кампании", icon: TrendingUp },
  { href: "/experiments", label: "Эксперименты", icon: TestTube },
  { href: "/cpo-analysis", label: "CPO Анализ", icon: LineChart },
];

const ymNav = [
  { href: "/ym/live", label: "Живая аналитика", icon: Zap },
  { href: "/ym/boost", label: "Буст продаж (CPC)", icon: TrendingUp },
  { href: "/ym/cpm", label: "Буст продаж (CPM)", icon: BarChart2 },
];

const ozonNav = [
  { href: "/ozon/live", label: "Живая аналитика", icon: Zap },
  { href: "/ozon/campaigns", label: "Кампании", icon: Megaphone },
  { href: "/ozon/ad", label: "Аналитика продвижения", icon: LineChart },
  { href: "/ozon/sales", label: "Аналитика по товарам", icon: Package },
  { href: "/ozon/compare", label: "Реклама vs Органика", icon: Layers },
];

const marketplaces = [
  { key: "wb",   label: "Wildberries",   dotColor: "bg-[#cb11ab]", brand: "#cb11ab", items: wbNav },
  { key: "ym",   label: "Яндекс Маркет", dotColor: "bg-[#fc3f1d]", brand: "#fc3f1d", items: ymNav },
  { key: "ozon", label: "Ozon",           dotColor: "bg-[#005bff]", brand: "#005bff", items: ozonNav },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ wb: true, ym: true, ozon: true });
  const [hovered, setHovered] = useState<string | null>(null);
  const [bellKey, setBellKey] = useState(0);
  const bellIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();
  const { newOrderCount } = useNewOrders();
  const prevCountRef = useRef(newOrderCount);

  // Ring the bell immediately when new orders arrive, then every 4s while count > 0
  useEffect(() => {
    if (newOrderCount > 0 && newOrderCount !== prevCountRef.current) {
      setBellKey((k) => k + 1); // restart animation
    }
    prevCountRef.current = newOrderCount;

    if (bellIntervalRef.current) clearInterval(bellIntervalRef.current);
    if (newOrderCount > 0) {
      bellIntervalRef.current = setInterval(() => {
        setBellKey((k) => k + 1);
      }, 4000);
    }
    return () => {
      if (bellIntervalRef.current) clearInterval(bellIntervalRef.current);
    };
  }, [newOrderCount]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.setQueryData(["auth-me"], { authenticated: false });
  }

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex h-screen bg-muted/30">
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col shadow-lg">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2.5 font-bold text-lg text-primary tracking-tight">
            <span className="bg-primary text-primary-foreground p-1.5 rounded-xl px-2.5 shadow-sm">Ad</span>
            Optimizer
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">Управление рекламой</p>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {/* Общие разделы */}
          <div className="space-y-1">
            {/* Лента заказов — отдельно, с колокольчиком */}
            {(() => {
              const isActive = location === "/orders-feed";
              return (
                <Link
                  href="/orders-feed"
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all w-full ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {newOrderCount > 0 ? (
                    <Bell
                      key={bellKey}
                      className="h-4 w-4 flex-shrink-0 bell-ring text-amber-500"
                      style={isActive ? { color: "white" } : undefined}
                    />
                  ) : (
                    <Rss className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="flex-1">Лента заказов</span>
                  {newOrderCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold leading-none">
                      {newOrderCount > 99 ? "99+" : newOrderCount}
                    </span>
                  )}
                </Link>
              );
            })()}

            {[
              { href: "/orders-heatmap", label: "Тепловая карта",    icon: LayoutGrid },
              { href: "/stocks",         label: "Остатки по складам", icon: Warehouse },
              { href: "/shipment-plan",  label: "План отгрузок",      icon: Truck },
              { href: "/shipments",      label: "Отгрузки",           icon: PackageCheck },
              { href: "/sku-card",       label: "Карточка товара",    icon: ScanSearch },
              { href: "/unit-economics", label: "Юнит-экономика",     icon: Calculator },
            ].map(({ href, label, icon: Icon }) => {
              const isActive = location === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all w-full ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                </Link>
              );
            })}
          </div>

          {/* Маркетплейсы */}
          {marketplaces.map(({ key, label, dotColor, brand, items }) => (
            <div key={key}>
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors rounded-lg"
              >
                <span className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
                  {label}
                </span>
                <ChevronRight size={12} className={`transition-transform ${expanded[key] ? "rotate-90" : ""}`} />
              </button>

              {expanded[key] && (
                <div className="mt-1 space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      location === item.href ||
                      (item.href !== "/" && location.startsWith(item.href));
                    const isHovered = hovered === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onMouseEnter={() => setHovered(item.href)}
                        onMouseLeave={() => setHovered(null)}
                        className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all"
                        style={{
                          backgroundColor: isActive
                            ? brand
                            : isHovered
                              ? `${brand}18`
                              : undefined,
                          color: isActive ? "#ffffff" : undefined,
                          boxShadow: isActive ? `0 1px 6px 0 ${brand}44` : undefined,
                        }}
                      >
                        <Icon
                          size={16}
                          style={{ color: isActive ? "#ffffff" : brand }}
                        />
                        <span
                          className={!isActive ? "text-sidebar-foreground" : ""}
                        >
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
          <p className="text-xs text-muted-foreground text-center">Ad Optimizer v0.1</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-muted/20">{children}</main>
    </div>
  );
}
