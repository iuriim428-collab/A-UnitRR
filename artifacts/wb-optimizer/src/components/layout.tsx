import { Link, useLocation } from "wouter";
import { Rss, Warehouse, LogOut, Bell, Calculator, Settings, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNewOrders } from "@/contexts/new-orders-context";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [bellKey, setBellKey] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
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

  const navItems = [
    {
      href: "/orders-feed",
      label: "Лента заказов",
      icon: (isActive: boolean) =>
        newOrderCount > 0 ? (
          <Bell
            key={bellKey}
            className="h-4 w-4 flex-shrink-0 bell-ring text-amber-500"
            style={isActive ? { color: "white" } : undefined}
          />
        ) : (
          <Rss className="h-4 w-4 flex-shrink-0" />
        ),
      badge: newOrderCount > 0 ? (newOrderCount > 99 ? "99+" : String(newOrderCount)) : null,
    },
    {
      href: "/stocks",
      label: "Остатки по складам",
      icon: () => <Warehouse className="h-4 w-4 flex-shrink-0" />,
      badge: null,
    },
    {
      href: "/unit-economics",
      label: "Юнит-экономика",
      icon: () => <Calculator className="h-4 w-4 flex-shrink-0" />,
      badge: null,
    },
  ];

  return (
    <div className="flex h-screen bg-muted/30 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`relative flex-none border-r bg-sidebar text-sidebar-foreground flex flex-col shadow-lg transition-all duration-200 ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        {/* Logo */}
        <div className={`border-b flex items-center gap-2.5 font-bold text-lg text-primary tracking-tight ${collapsed ? "p-3 justify-center" : "p-4"}`}>
          <span className="bg-primary text-primary-foreground p-1.5 rounded-xl shadow-sm flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4" />
          </span>
          {!collapsed && <span>Analytics</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon, badge }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all w-full ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                } ${collapsed ? "justify-center" : ""}`}
              >
                {icon(isActive)}
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
                {!collapsed && badge && (
                  <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold leading-none">
                    {badge}
                  </span>
                )}
                {collapsed && badge && (
                  <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-2 border-t space-y-0.5">
          <Link
            href="/settings"
            title={collapsed ? "Настройки API" : undefined}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all w-full ${
              location === "/settings"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            } ${collapsed ? "justify-center" : ""}`}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="truncate">Настройки API</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={collapsed ? "Выйти" : undefined}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="truncate">Выйти</span>}
          </button>
          {!collapsed && (
            <p className="text-xs text-muted-foreground text-center pt-1">Ad Optimizer v0.1</p>
          )}
        </div>

        {/* Toggle button — pinned to right edge */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-sidebar border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto min-w-0 bg-muted/20">{children}</main>
    </div>
  );
}
