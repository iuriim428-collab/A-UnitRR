import { Link, useLocation } from "wouter";
import { Rss, Warehouse, LogOut, Bell, Calculator, Settings } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNewOrders } from "@/contexts/new-orders-context";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [bellKey, setBellKey] = useState(0);
  const bellIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();
  const { newOrderCount } = useNewOrders();
  const prevCountRef = useRef(newOrderCount);

  // Ring the bell immediately when new orders arrive, then every 4s while count > 0
  useEffect(() => {
    if (newOrderCount > 0 && newOrderCount !== prevCountRef.current) {
      setBellKey((k) => k + 1);
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

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {/* Лента заказов — с колокольчиком */}
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

          {/* Остатки по складам */}
          {(() => {
            const isActive = location === "/stocks";
            return (
              <Link
                href="/stocks"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all w-full ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Warehouse className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Остатки по складам</span>
              </Link>
            );
          })()}

          {/* Юнит-экономика */}
          {(() => {
            const isActive = location === "/unit-economics";
            return (
              <Link
                href="/unit-economics"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all w-full ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Calculator className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">Юнит-экономика</span>
              </Link>
            );
          })()}
        </nav>

        <div className="p-3 border-t space-y-1">
          <Link
            href="/settings"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all w-full ${
              location === "/settings"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Settings className="h-4 w-4" />
            Настройки API
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
          <p className="text-xs text-muted-foreground text-center pt-1">Ad Optimizer v0.1</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-muted/20">{children}</main>
    </div>
  );
}
