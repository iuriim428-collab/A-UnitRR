import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, PackageCheck, Package, AlertTriangle, Plus,
  ChevronDown, ChevronRight, Truck, Clock, CheckCircle, Trash2,
  Download, Send, ShoppingBag, X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";


type Tab = "wb" | "ozon" | "ym";

const TAB_META: Record<Tab, { label: string; dot: string; color: string }> = {
  wb:   { label: "Wildberries", dot: "bg-[#cb11ab]", color: "text-[#cb11ab]" },
  ozon: { label: "Ozon FBS",   dot: "bg-[#005bff]", color: "text-[#005bff]" },
  ym:   { label: "Яндекс Маркет", dot: "bg-[#fc3f1d]", color: "text-[#fc3f1d]" },
};

function fmt(n: number) { return n.toLocaleString("ru-RU"); }
function fmtPrice(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDt(iso: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Moscow" }) +
      " " +
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })
    );
  } catch { return iso; }
}

function openBlob(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

// ─── WB ──────────────────────────────────────────────────────────────────────

interface WbSupply { id: string; name: string; done: boolean; createdAt: string; closedAt: string | null }
interface WbNewOrder { id: number; article: string; createdAt: string; warehouseId: number; skus: string[] }

function WbPanel() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedSupply, setExpandedSupply] = useState<string | null>(null);
  const [showNewOrders, setShowNewOrders] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [targetSupplyId, setTargetSupplyId] = useState<string>("");

  const suppliesQ = useQuery<{ supplies: WbSupply[] }>({
    queryKey: ["wb-supplies"],
    queryFn: () => fetch(`/api/shipments/wb/supplies`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const newOrdersQ = useQuery<{ orders: WbNewOrder[] }>({
    queryKey: ["wb-new-orders"],
    queryFn: () => fetch(`/api/shipments/wb/orders/new`).then((r) => r.json()),
    enabled: showNewOrders,
    staleTime: 60_000,
  });

  const supplyOrdersQ = useQuery<{ orders: any[] }>({
    queryKey: ["wb-supply-orders", expandedSupply],
    queryFn: () =>
      fetch(`/api/shipments/wb/supplies/${expandedSupply}/orders`).then((r) => r.json()),
    enabled: !!expandedSupply,
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wb-supplies"] });
    qc.invalidateQueries({ queryKey: ["wb-new-orders"] });
    if (expandedSupply) qc.invalidateQueries({ queryKey: ["wb-supply-orders", expandedSupply] });
  };

  const createMut = useMutation({
    mutationFn: (name: string) =>
      fetch(`/api/shipments/wb/supplies`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: (d) => {
      toast({ title: "Поставка создана", description: `ID: ${d.id}` });
      setNewName(""); setShowCreate(false); invalidate();
    },
    onError: (e: any) => toast({ title: "Ошибка создания", description: e.message, variant: "destructive" }),
  });

  const addOrdersMut = useMutation({
    mutationFn: async ({ supplyId, orderIds }: { supplyId: string; orderIds: number[] }) => {
      const results = await Promise.allSettled(
        orderIds.map((id) =>
          fetch(`/api/shipments/wb/supplies/${supplyId}/orders/${id}`, { method: "PUT" })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { added: orderIds.length - failed, failed };
    },
    onSuccess: ({ added, failed }) => {
      toast({
        title: `Добавлено ${added} заказов`,
        description: failed > 0 ? `${failed} не удалось добавить` : undefined,
      });
      setSelectedOrderIds(new Set());
      invalidate();
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const removeOrderMut = useMutation({
    mutationFn: ({ supplyId, orderId }: { supplyId: string; orderId: number }) =>
      fetch(`/api/shipments/wb/supplies/${supplyId}/orders/${orderId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Заказ удалён из поставки" }); invalidate(); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deliverMut = useMutation({
    mutationFn: (supplyId: string) =>
      fetch(`/api/shipments/wb/supplies/${supplyId}/deliver`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Поставка закрыта и передана в WB" }); invalidate(); },
    onError: (e: any) => toast({ title: "Ошибка закрытия", description: e.message, variant: "destructive" }),
  });

  const downloadBarcode = (supplyId: string) => {
    const url = `/api/shipments/wb/supplies/${supplyId}/barcode?type=png`;
    openBlob(url, `supply-${supplyId}.png`);
  };

  const supplies = suppliesQ.data?.supplies ?? [];
  const open = supplies.filter((s) => !s.done);
  const closed = supplies.filter((s) => s.done);
  const newOrders = newOrdersQ.data?.orders ?? [];
  const supplyOrders = supplyOrdersQ.data?.orders ?? [];

  const toggleOrder = (id: number) =>
    setSelectedOrderIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span><span className="font-semibold text-foreground">{open.length}</span> открытых</span>
          <span><span className="font-semibold text-foreground">{closed.length}</span> закрытых</span>
          {newOrders.length > 0 && (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {newOrders.length} заказов ожидают добавления в поставку
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setShowNewOrders((v) => !v); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${showNewOrders ? "bg-amber-50 border-amber-300 text-amber-700" : "hover:bg-muted text-muted-foreground"}`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Новые заказы {newOrders.length > 0 && `(${newOrders.length})`}
          </button>
          <button
            onClick={() => suppliesQ.refetch()}
            disabled={suppliesQ.isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${suppliesQ.isFetching ? "animate-spin" : ""}`} />
            Обновить
          </button>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#cb11ab] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            Создать поставку
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <input
            type="text"
            placeholder="Название поставки"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate(newName)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cb11ab]/30"
            autoFocus
          />
          <button
            onClick={() => createMut.mutate(newName)}
            disabled={!newName.trim() || createMut.isPending}
            className="px-4 py-2 rounded-lg bg-[#cb11ab] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Создать
          </button>
          <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* New orders panel */}
      {showNewOrders && (
        <div className="rounded-xl border bg-amber-50/50 border-amber-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex items-center justify-between flex-wrap gap-3">
            <span className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Новые FBO-заказы — ожидают добавления в поставку
            </span>
            {selectedOrderIds.size > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={targetSupplyId}
                  onChange={(e) => setTargetSupplyId(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-xs bg-white"
                >
                  <option value="">Выберите поставку…</option>
                  {open.map((s) => (
                    <option key={s.id} value={s.id}>{s.name || s.id}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!targetSupplyId) { toast({ title: "Выберите поставку", variant: "destructive" }); return; }
                    addOrdersMut.mutate({ supplyId: targetSupplyId, orderIds: [...selectedOrderIds] });
                  }}
                  disabled={!targetSupplyId || addOrdersMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#cb11ab] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {addOrdersMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Добавить {selectedOrderIds.size} в поставку
                </button>
              </div>
            )}
          </div>

          {newOrdersQ.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : newOrders.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Нет новых заказов, ожидающих поставку
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-amber-200 bg-amber-50/80">
                  <tr>
                    <th className="px-4 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.size === newOrders.length && newOrders.length > 0}
                        onChange={(e) =>
                          setSelectedOrderIds(e.target.checked ? new Set(newOrders.map((o) => o.id)) : new Set())
                        }
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">ID заказа</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Артикул</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Создан</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Склад WB</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {newOrders.map((o) => (
                    <tr
                      key={o.id}
                      className={`hover:bg-amber-50 cursor-pointer transition-colors ${selectedOrderIds.has(o.id) ? "bg-amber-50" : ""}`}
                      onClick={() => toggleOrder(o.id)}
                    >
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={selectedOrderIds.has(o.id)} onChange={() => toggleOrder(o.id)} className="rounded" />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs font-medium">{o.id}</td>
                      <td className="px-4 py-2 text-xs">{o.article || "—"}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDt(o.createdAt)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{o.warehouseId || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {suppliesQ.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка поставок…
        </div>
      )}

      {/* Empty */}
      {!suppliesQ.isLoading && supplies.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Поставок не найдено</p>
          <p className="text-xs mt-1">Создайте первую FBO-поставку</p>
        </div>
      )}

      {/* Supplies list */}
      {supplies.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">ID поставки</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Название</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Создана</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Закрыта</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Статус</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {supplies.map((s) => {
                const isOpen = !s.done;
                const isExpanded = expandedSupply === s.id;
                const stCls = isOpen
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-green-50 text-green-700 border-green-200";

                return [
                  <tr
                    key={s.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setExpandedSupply(isExpanded ? null : s.id)}
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium">{s.id}</td>
                    <td className="px-4 py-3 font-medium">{s.name || <span className="text-muted-foreground italic">без названия</span>}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDt(s.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{s.closedAt ? fmtDt(s.closedAt) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${stCls}`}>
                        {isOpen ? <Clock className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                        {isOpen ? "Открыта" : "Закрыта"}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => downloadBarcode(s.id)}
                          title="Скачать штрихкод"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs hover:bg-muted transition-colors text-muted-foreground"
                        >
                          <Download className="h-3 w-3" />
                          Штрихкод
                        </button>
                        {isOpen && (
                          <button
                            onClick={() => {
                              if (confirm(`Закрыть и передать поставку ${s.id} в WB? Это действие необратимо.`)) {
                                deliverMut.mutate(s.id);
                              }
                            }}
                            disabled={deliverMut.isPending}
                            title="Закрыть поставку и передать в WB"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#cb11ab] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            {deliverMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                            Закрыть
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,

                  isExpanded && (
                    <tr key={`${s.id}-orders`} className="bg-muted/10">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                          Заказы в поставке
                        </div>
                        {supplyOrdersQ.isLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
                          </div>
                        ) : supplyOrders.length === 0 ? (
                          <p className="text-xs text-muted-foreground">В поставке нет заказов. Добавьте через панель «Новые заказы».</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {supplyOrders.map((o: any) => (
                              <div
                                key={o.id}
                                className="flex items-center gap-1.5 bg-background border rounded-lg px-2.5 py-1 text-xs"
                              >
                                <span className="font-mono font-medium">#{o.id}</span>
                                {o.article && <span className="text-muted-foreground">{o.article}</span>}
                                {isOpen && (
                                  <button
                                    onClick={() => removeOrderMut.mutate({ supplyId: s.id, orderId: o.id })}
                                    disabled={removeOrderMut.isPending}
                                    className="ml-1 text-muted-foreground hover:text-red-500 transition-colors"
                                    title="Убрать из поставки"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
        <span>
          После закрытия поставки физически доставьте товары в пункт приёма WB.
          Штрихкод поставки нужно распечатать и прикрепить к коробкам.
        </span>
      </div>
    </div>
  );
}

// ─── Ozon FBS ─────────────────────────────────────────────────────────────────

const OZON_STATUS: Record<string, { label: string; cls: string; canShip: boolean }> = {
  awaiting_packaging: { label: "Упаковка",          cls: "bg-amber-50 text-amber-700 border-amber-200",  canShip: false },
  awaiting_deliver:   { label: "Ожид. отгрузки",    cls: "bg-blue-50 text-blue-700 border-blue-200",     canShip: true  },
  arbitration:        { label: "Арбитраж",           cls: "bg-red-50 text-red-600 border-red-200",        canShip: false },
};

interface OzonPosting {
  postingNumber: string; status: string; createdAt: string;
  shipmentDate: string | null; trackingNumber: string | null;
  products: Array<{ sku: number; offerId: string; name: string; qty: number; price: number }>;
  addresseeCity: string; warehouse: string; deliveryType: string;
}

function OzonPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<{ postings: OzonPosting[] }>({
    queryKey: ["ozon-fbs-postings"],
    queryFn: () => fetch(`/api/shipments/ozon/fbs`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const shipMut = useMutation({
    mutationFn: (p: OzonPosting) =>
      fetch(`/api/shipments/ozon/fbs/${p.postingNumber}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: p.products.map((pr) => ({ sku: pr.sku, qty: pr.qty })) }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      }),
    onSuccess: (_d, p) => {
      toast({ title: "Отгрузка подтверждена", description: `Отправление ${p.postingNumber}` });
      qc.invalidateQueries({ queryKey: ["ozon-fbs-postings"] });
    },
    onError: (e: any, p) =>
      toast({ title: `Ошибка отгрузки ${p.postingNumber}`, description: e.message, variant: "destructive" }),
  });

  const downloadLabel = (postingNumber: string) => {
    openBlob(`/api/shipments/ozon/fbs/${postingNumber}/label`, `label-${postingNumber}.pdf`);
  };

  const postings = data?.postings ?? [];
  const awaitingDeliver = postings.filter((p) => p.status === "awaiting_deliver");
  const awaitingPackage = postings.filter((p) => p.status === "awaiting_packaging");
  const other = postings.filter((p) => !["awaiting_deliver", "awaiting_packaging"].includes(p.status));

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap text-sm">
          {awaitingDeliver.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium bg-blue-50 text-blue-700 border-blue-200">
              <Send className="h-3 w-3" /> {awaitingDeliver.length} готовы к отгрузке
            </span>
          )}
          {awaitingPackage.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
              <Package className="h-3 w-3" /> {awaitingPackage.length} на упаковке
            </span>
          )}
          {other.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium bg-red-50 text-red-600 border-red-200">
              {other.length} прочих
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка отправлений…
        </div>
      )}

      {!isLoading && postings.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <PackageCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Нет отправлений, требующих действия</p>
          <p className="text-xs mt-1">FBS заказы в статусе «упаковка» или «ожидание отгрузки» появятся здесь</p>
        </div>
      )}

      {postings.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Отправление</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Статус</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Создано</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Дата отгрузки</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Склад / Город</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {postings.map((p) => {
                const st = OZON_STATUS[p.status] ?? { label: p.status, cls: "bg-muted text-muted-foreground border-border", canShip: false };
                const isExpanded = expanded === p.postingNumber;
                const totalItems = p.products.reduce((s, pr) => s + pr.qty, 0);
                const totalPrice = p.products.reduce((s, pr) => s + pr.price * pr.qty, 0);

                return [
                  <tr
                    key={p.postingNumber}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : p.postingNumber)}
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium">{p.postingNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDt(p.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.shipmentDate ? fmtDt(p.shipmentDate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.warehouse && <span className="font-medium">{p.warehouse}</span>}
                      {p.addresseeCity && <span className="ml-1 text-muted-foreground/70">· {p.addresseeCity}</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => downloadLabel(p.postingNumber)}
                          title="Скачать этикетку (PDF)"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs hover:bg-muted transition-colors text-muted-foreground"
                        >
                          <Download className="h-3 w-3" />
                          Этикетка
                        </button>
                        {st.canShip && (
                          <button
                            onClick={() => {
                              if (confirm(`Подтвердить отгрузку ${p.postingNumber}? (${totalItems} поз., ${fmtPrice(totalPrice)} ₽)`)) {
                                shipMut.mutate(p);
                              }
                            }}
                            disabled={shipMut.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#005bff] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {shipMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Отгрузить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,

                  isExpanded && (
                    <tr key={`${p.postingNumber}-items`} className="bg-muted/10">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="space-y-1.5">
                          {p.products.map((pr, i) => (
                            <div key={i} className="flex items-center text-xs gap-3">
                              <span className="text-muted-foreground font-mono w-24 flex-shrink-0">{pr.offerId}</span>
                              <span className="flex-1 truncate">{pr.name}</span>
                              <span className="text-muted-foreground whitespace-nowrap">× {pr.qty}</span>
                              <span className="font-medium tabular-nums whitespace-nowrap">{fmtPrice(pr.price * pr.qty)} ₽</span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-border/50 flex justify-between text-xs font-semibold">
                            <span>{fmt(totalItems)} позиций</span>
                            <span>{fmtPrice(totalPrice)} ₽</span>
                          </div>
                        </div>
                        {p.trackingNumber && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Трек: <span className="font-mono font-medium">{p.trackingNumber}</span>
                          </p>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── YM ──────────────────────────────────────────────────────────────────────

const YM_STATUS_CLS: Record<string, string> = {
  PROCESSING:    "bg-sky-50 text-sky-700 border-sky-200",
  READY_TO_SHIP: "bg-green-50 text-green-700 border-green-200",
  SHIPPED:       "bg-indigo-50 text-indigo-700 border-indigo-200",
};

interface YmOrder {
  id: number; status: string; statusLabel: string; substatus: string | null;
  creationDate: string; type: string; campaignId: string; buyerTotal: number;
  items: Array<{ offerId: string; offerName: string; count: number; price: number }>;
  delivery: { type: string; serviceName: string; dates: any } | null;
}

function YmPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<{ orders: YmOrder[] }>({
    queryKey: ["ym-pending-orders"],
    queryFn: () => fetch(`/api/shipments/ym/pending`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const confirmMut = useMutation({
    mutationFn: (orderId: number) =>
      fetch(`/api/shipments/ym/fbs/${orderId}/confirm`, { method: "POST" })
        .then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: (_d, id) => {
      toast({ title: "Статус обновлён", description: `Заказ #${id} готов к отгрузке` });
      qc.invalidateQueries({ queryKey: ["ym-pending-orders"] });
    },
    onError: (e: any, id) =>
      toast({ title: `Ошибка заказа #${id}`, description: e.message, variant: "destructive" }),
  });

  const downloadLabel = (orderId: number) => {
    openBlob(`/api/shipments/ym/fbs/${orderId}/label`, `label-ym-${orderId}.pdf`);
  };

  const orders = data?.orders ?? [];
  const byStatus = {
    PROCESSING:    orders.filter((o) => o.status === "PROCESSING"),
    READY_TO_SHIP: orders.filter((o) => o.status === "READY_TO_SHIP"),
    SHIPPED:       orders.filter((o) => o.status === "SHIPPED"),
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(byStatus).map(([status, rows]) => (
            rows.length > 0 && (
              <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${YM_STATUS_CLS[status] ?? "bg-muted"}`}>
                {rows.length} {status === "PROCESSING" ? "обрабатывается" : status === "READY_TO_SHIP" ? "к отгрузке" : "отгружено"}
              </span>
            )
          ))}
          {orders.length === 0 && !isLoading && (
            <span className="text-sm text-muted-foreground">Нет активных заказов</span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка заказов…
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Нет активных заказов</p>
          <p className="text-xs mt-1">Заказы в обработке, готовые к отгрузке и отгруженные появятся здесь</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">№ заказа</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Статус</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Создан</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Доставка</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сумма</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orders.map((o) => {
                const cls = YM_STATUS_CLS[o.status] ?? "bg-muted text-muted-foreground border-border";
                const isExpanded = expanded === o.id;
                const totalItems = o.items.reduce((s, i) => s + i.count, 0);

                return [
                  <tr
                    key={o.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : o.id)}
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium">#{o.id}</td>
                    <td className="px-4 py-3">
                      <div>
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${cls}`}>
                          {o.statusLabel}
                        </span>
                        {o.substatus && <div className="text-xs text-muted-foreground mt-0.5">{o.substatus}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${o.type === "FBY" ? "bg-orange-50 text-orange-700" : "bg-sky-50 text-sky-700"}`}>
                        {o.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.creationDate}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.delivery?.serviceName || o.delivery?.type || "—"}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-xs">
                      {o.buyerTotal > 0 ? `${fmtPrice(o.buyerTotal)} ₽` : "—"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 justify-end">
                        {o.type === "FBS" && (
                          <>
                            <button
                              onClick={() => downloadLabel(o.id)}
                              title="Скачать этикетку"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs hover:bg-muted transition-colors text-muted-foreground"
                            >
                              <Download className="h-3 w-3" />
                              Этикетка
                            </button>
                            {o.status === "PROCESSING" && (
                              <button
                                onClick={() => {
                                  if (confirm(`Подтвердить готовность к отгрузке заказа #${o.id}?`)) {
                                    confirmMut.mutate(o.id);
                                  }
                                }}
                                disabled={confirmMut.isPending}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#fc3f1d] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                              >
                                {confirmMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                                Готово
                              </button>
                            )}
                          </>
                        )}
                        {o.type === "FBY" && (
                          <span className="text-xs text-muted-foreground italic">FBY — Яндекс отгружает</span>
                        )}
                      </div>
                    </td>
                  </tr>,

                  isExpanded && (
                    <tr key={`${o.id}-items`} className="bg-muted/10">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="space-y-1.5">
                          {o.items.map((item, i) => (
                            <div key={i} className="flex items-center text-xs gap-3">
                              <span className="text-muted-foreground font-mono">{item.offerId}</span>
                              <span className="flex-1 truncate">{item.offerName}</span>
                              <span className="text-muted-foreground">× {item.count}</span>
                              {item.price > 0 && (
                                <span className="font-medium tabular-nums">{fmtPrice(item.price * item.count)} ₽</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {o.delivery?.dates && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Даты доставки:{" "}
                            {o.delivery.dates.fromDate && `с ${o.delivery.dates.fromDate}`}
                            {o.delivery.dates.toDate && ` по ${o.delivery.dates.toDate}`}
                          </p>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        FBY — Яндекс сам отгружает с их склада. FBS — вы отгружаете сами; кнопка «Готово» переводит заказ в статус «Готов к отгрузке».
        Этикетки доступны только для FBS-заказов.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Shipments() {
  const [tab, setTab] = useState<Tab>("wb");
  const { label, dot, color } = TAB_META[tab];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2.5">
          <Truck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Отгрузки</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          WB FBO поставки · Ozon FBS отправления · ЯМ FBS/FBY заказы
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {(["wb", "ozon", "ym"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TAB_META[t].dot}`} />
            {TAB_META[t].label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
        <h2 className={`text-base font-semibold ${color}`}>{label}</h2>
      </div>

      {tab === "wb"   && <WbPanel />}
      {tab === "ozon" && <OzonPanel />}
      {tab === "ym"   && <YmPanel />}
    </div>
  );
}
