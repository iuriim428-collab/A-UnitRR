import { useState, useRef, useCallback } from 'react';
import { useReport } from '../hooks/use-report';
import { parseOzonReport, exportToExcel } from '../lib/excel';
import { formatCurrency, formatPercent, formatNumber } from '../lib/utils';
import { TaxSettings, TaxType } from '../types';
import { Upload, Download, Trash2, FileSpreadsheet, Pencil } from 'lucide-react';

const TAX_OPTIONS: { label: string; type: TaxType; rate: number }[] = [
  { label: 'УСН 6% (доходы)', type: 'usn_income', rate: 0.06 },
  { label: 'УСН 15% (д-р)', type: 'usn_income_expense', rate: 0.15 },
  { label: 'ОСНО 20%', type: 'osno', rate: 0.20 },
  { label: 'Без налога', type: 'none', rate: 0 },
];

function MetricRow({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline gap-2 ${sub ? 'pl-3 text-[11px]' : 'text-xs'}`}>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={`tabular-nums whitespace-nowrap font-mono ${accent ? 'font-bold text-base' : 'font-medium'} ${value.startsWith('-') || value.startsWith('−') ? 'text-red-400' : accent ? 'text-green-400' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-3 mb-1 border-b border-border/30 pb-0.5">
      {children}
    </div>
  );
}

function formatLabel(format: string) {
  if (format === 'nacisleniya') return 'OZON · НАЧИСЛЕНИЯ';
  if (format === 'new')         return 'OZON · РЕАЛИЗАЦИЯ (НОВЫЙ)';
  if (format === 'old')         return 'OZON · РЕАЛИЗАЦИЯ (СТАРЫЙ)';
  if (format === 'yandex')      return 'ЯНДЕКС МАРКЕТ';
  return '';
}

interface CostEditorProps {
  article: string;
  costPerUnit: number;
  vatRate: number;
  onChangeCost: (v: number) => void;
  onChangeVat: (v: number) => void;
  onClose: () => void;
}

function CostEditor({ article, costPerUnit, vatRate, onChangeCost, onChangeVat, onClose }: CostEditorProps) {
  const costRef = useRef<HTMLInputElement>(null);
  const [localCost, setLocalCost] = useState(costPerUnit > 0 ? String(costPerUnit) : '');
  const [localVat, setLocalVat] = useState(vatRate > 0 ? String(vatRate) : '');

  const commit = useCallback(() => {
    onChangeCost(parseFloat(localCost) || 0);
    onChangeVat(parseFloat(localVat) || 0);
    onClose();
  }, [localCost, localVat, onChangeCost, onChangeVat, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div
      className="flex items-center gap-1 bg-card border border-primary/50 px-2 py-1 shadow-lg z-50 min-w-[220px]"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) commit(); }}
    >
      <span className="text-muted-foreground text-[10px] whitespace-nowrap">{article}</span>
      <span className="text-border mx-1">|</span>
      <input
        ref={costRef}
        autoFocus
        type="number"
        min="0"
        step="any"
        value={localCost}
        placeholder="0"
        onChange={e => setLocalCost(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-20 bg-transparent border-b border-primary outline-none text-right px-1 tabular-nums text-xs"
        data-testid={`input-cost-${article}`}
      />
      <span className="text-muted-foreground text-[10px]">₽/шт</span>
      <span className="text-border mx-1">|</span>
      <span className="text-muted-foreground text-[10px]">НДС</span>
      <input
        type="number"
        min="0"
        max="20"
        step="any"
        value={localVat}
        placeholder="0"
        onChange={e => setLocalVat(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-10 bg-transparent border-b border-primary/60 outline-none text-right px-1 tabular-nums text-xs"
        data-testid={`input-vat-${article}`}
      />
      <span className="text-muted-foreground text-[10px]">%</span>
      <button
        onMouseDown={e => { e.preventDefault(); commit(); }}
        className="ml-1 text-[10px] text-primary hover:text-primary/80 font-medium"
      >
        ✓
      </button>
    </div>
  );
}

export default function Home() {
  const report = useReport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingArticle, setEditingArticle] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const { rows, format } = await parseOzonReport(file);
      report.loadReport(rows, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleExport = () => {
    exportToExcel(
      report.calculatedRows.map(r => ({
        'Артикул': r.article,
        'Название': r.name,
        'Заказы, шт': r.ordersCount,
        'Возвраты, шт': r.returnsCount,
        'Продажи, шт': r.salesCount,
        'Выручка (чистая), руб': r.netSales,
        'Комиссия Ozon, руб': r.ozonCommission,
        'Логистика, руб': r.logistics,
        'Обратная логистика, руб': r.returnLogistics,
        'Последняя миля, руб': r.lastMile,
        'Эквайринг, руб': r.acquiring,
        'Продвижение, руб': r.promotion,
        'Хранение, руб': r.storage,
        'Прочие FBO, руб': r.fboServices,
        'Другие расходы, руб': r.otherExpenses,
        'Себестоимость, руб': r.costTotal,
        'НДС, руб': r.vatAmount,
        'Налог, руб': r.taxAmount,
        'Чистая прибыль, руб': r.netProfit,
        'Маржа, %': r.marginPercent.toFixed(1),
      })),
      'ozon_unit_economics.xlsx'
    );
  };

  const s = report.summary;
  const hasData = report.rows.length > 0;
  const isNac = report.format === 'nacisleniya';

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-mono text-sm dark select-none">
      {/* HEADER */}
      <header className="flex-none flex items-center justify-between px-5 py-3 border-b bg-card z-20 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <FileSpreadsheet className="w-5 h-5 text-primary flex-shrink-0" />
          <h1 className="text-base font-bold uppercase tracking-tight whitespace-nowrap">Ozon Unit Economics</h1>
          {hasData && (
            <span className="text-[10px] text-muted-foreground border border-border/50 px-2 py-0.5 ml-2 whitespace-nowrap">
              {formatLabel(report.format)} · {report.rows.length} SKU
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            className="h-7 text-xs bg-muted border border-border rounded-none px-2 text-foreground"
            value={report.tax.type}
            onChange={e => {
              const opt = TAX_OPTIONS.find(o => o.type === e.target.value);
              if (opt) report.setTax({ type: opt.type, rate: opt.rate } as TaxSettings);
            }}
            data-testid="select-tax"
          >
            {TAX_OPTIONS.map(o => (
              <option key={o.type} value={o.type}>{o.label}</option>
            ))}
          </select>

          <div className="flex border border-border text-[11px]">
            {(['all', 'profitable', 'unprofitable'] as const).map(f => (
              <button
                key={f}
                className={`px-3 py-1 ${report.filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'} ${f !== 'all' ? 'border-l border-border' : ''}`}
                onClick={() => report.setFilter(f)}
                data-testid={`filter-${f}`}
              >
                {f === 'all' ? 'Все' : f === 'profitable' ? 'Прибыльные' : 'Убыточные'}
              </button>
            ))}
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 h-7 px-3 text-[11px] border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            data-testid="button-upload"
          >
            <Upload className="w-3.5 h-3.5" /> Загрузить отчёт
          </button>

          {hasData && (
            <>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 h-7 px-3 text-[11px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                data-testid="button-export"
              >
                <Download className="w-3.5 h-3.5" /> Экспорт
              </button>
              <button
                onClick={report.clear}
                className="flex items-center gap-1 h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground border border-border hover:border-foreground/50 transition-colors"
                data-testid="button-clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* MAIN */}
      {!hasData ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div
            className="border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors rounded-sm p-12 text-center max-w-lg w-full cursor-pointer"
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            data-testid="upload-zone"
          >
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-base font-medium mb-1">
              {loading ? 'Читаю файл...' : 'Перетащите отчёт или нажмите для выбора'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Поддерживаются отчёты Ozon и Яндекс Маркета в форматах .xlsx
            </p>
            <div className="text-[11px] text-muted-foreground/60 space-y-1.5">
              <p className="font-medium text-muted-foreground/80">Ozon</p>
              <p>«Отчёт по начислениям» (Финансы → Начисления)<br />
              Отчёт о реализации (новый и старый форматы)</p>
              <p className="font-medium text-muted-foreground/80 mt-1">Яндекс Маркет</p>
              <p>«Отчёт о заказах» (united_orders_*.xlsx)</p>
            </div>
            {error && (
              <p className="mt-4 text-xs text-red-400 border border-red-400/20 bg-red-400/10 px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT SUMMARY PANEL */}
          <aside className="flex-none w-56 bg-card border-r overflow-y-auto p-3 text-xs space-y-0.5">
            <SectionHeader>Ключевые показатели</SectionHeader>
            <MetricRow label="Продажи, шт" value={formatNumber(s.salesCount)} />
            <MetricRow label="Возвраты, шт" value={s.returnsCount > 0 ? `-${formatNumber(s.returnsCount)}` : '—'} />
            {s.ordersSum > 0 && <MetricRow label="Сумма продаж" value={formatCurrency(s.ordersSum)} />}
            {s.returnsSum > 0 && <MetricRow label="Сумма возвратов" value={`-${formatCurrency(s.returnsSum)}`} />}
            <MetricRow label="Чистая выручка" value={formatCurrency(s.netSales)} />

            <SectionHeader>Расходы Ozon</SectionHeader>
            <MetricRow label="Комиссия" value={`-${formatCurrency(s.ozonCommission)}`} />
            {s.deliveryServices > 0 && <MetricRow label="Доставка итого" value={`-${formatCurrency(s.deliveryServices)}`} />}
            {s.logistics > 0 && <MetricRow label="└ Логистика" value={`-${formatCurrency(s.logistics)}`} sub />}
            {s.returnLogistics > 0 && <MetricRow label="└ Обрат. лог." value={`-${formatCurrency(s.returnLogistics)}`} sub />}
            {s.lastMile > 0 && <MetricRow label="└ Доставка ПВЗ" value={`-${formatCurrency(s.lastMile)}`} sub />}
            {s.processing > 0 && <MetricRow label="└ Drop-off" value={`-${formatCurrency(s.processing)}`} sub />}
            {s.agentServices > 0 && <MetricRow label="Услуги партнёров" value={`-${formatCurrency(s.agentServices)}`} />}
            {s.acquiring > 0 && <MetricRow label="└ Эквайринг" value={`-${formatCurrency(s.acquiring)}`} sub />}
            {s.returnProcessing > 0 && <MetricRow label="└ Обраб. возвратов" value={`-${formatCurrency(s.returnProcessing)}`} sub />}
            {s.promotion > 0 && <MetricRow label="Продвижение" value={`-${formatCurrency(s.promotion)}`} />}
            {s.storage > 0 && <MetricRow label="Хранение (FBO)" value={`-${formatCurrency(s.storage)}`} />}
            {s.fboServices > 0 && <MetricRow label="Прочие FBO" value={`-${formatCurrency(s.fboServices)}`} />}
            {s.otherExpenses > 0 && <MetricRow label="Штрафы и прочее" value={`-${formatCurrency(s.otherExpenses)}`} />}

            <SectionHeader>До себестоимости</SectionHeader>
            <MetricRow label="Прибыль" value={formatCurrency(s.profitBeforeCosts)} accent={s.profitBeforeCosts > 0} />

            <SectionHeader>Себестоимость и налоги</SectionHeader>
            <MetricRow label="Себестоимость" value={s.costTotal > 0 ? `-${formatCurrency(s.costTotal)}` : 'не указана'} />
            {s.vatAmount > 0 && <MetricRow label="НДС" value={`-${formatCurrency(s.vatAmount)}`} />}
            <MetricRow label="Налог" value={s.taxAmount > 0 ? `-${formatCurrency(s.taxAmount)}` : '—'} />

            <div className="mt-3 pt-2 border-t border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mb-1">Чистая прибыль</div>
              <div className={`text-2xl font-bold tabular-nums ${s.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-net-profit">
                {formatCurrency(s.netProfit)}
              </div>
              <div className={`text-xs mt-0.5 ${s.marginPercent >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`} data-testid="text-margin">
                Маржа {formatPercent(s.marginPercent)}
              </div>
            </div>

            {!report.hasCosts && (
              <p className="text-[10px] text-yellow-400/70 border border-yellow-400/20 bg-yellow-400/5 px-2 py-1.5 mt-2">
                Нажмите на ячейку «Себест.» в таблице для ввода
              </p>
            )}
          </aside>

          {/* RIGHT: TABLE */}
          <div className="flex-1 overflow-auto" onClick={() => setEditingArticle(null)}>
            {/* Table hint */}
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border/50 text-[11px] text-muted-foreground/60">
              <Pencil className="w-3 h-3" />
              Нажмите на ячейку «Себест.» для редактирования · Enter или клик вне поля — сохранить
              {report.hasCosts && (
                <span className="text-green-400/70 ml-1">· указана для {Object.keys(report.costs).length} SKU</span>
              )}
            </div>

            {/* SKU TABLE */}
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-[33px] z-10 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Артикул</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Название</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Продажи</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Возвраты</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Ср. цена</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Выручка</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Комиссия</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Доставка</th>
                  {isNac && <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Партнёры</th>}
                  {isNac && <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Реклама</th>}
                  {isNac && <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Хранение</th>}
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">
                      Себест. <Pencil className="w-2.5 h-2.5 text-primary/60" />
                    </span>
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Налог</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Прибыль</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {report.calculatedRows.map((row, idx) => {
                  const isEditing = editingArticle === row.article;
                  const c = report.costs[row.article] ?? { costPerUnit: 0, vatRate: 0 };
                  return (
                    <tr
                      key={row.article}
                      className={`border-b border-border/30 hover:bg-muted/20 ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}
                      data-testid={`row-sku-${row.article}`}
                    >
                      <td className="px-3 py-1.5 font-medium text-primary/80 whitespace-nowrap">{row.article}</td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={row.name}>{row.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.salesCount)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-red-400/70">{row.returnsCount > 0 ? formatNumber(row.returnsCount) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.avgPrice > 0 ? formatCurrency(row.avgPrice) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(row.netSales)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-orange-400/80">{row.ozonCommission > 0 ? `-${formatCurrency(row.ozonCommission)}` : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-blue-400/80">{row.deliveryServices > 0 ? `-${formatCurrency(row.deliveryServices)}` : '—'}</td>
                      {isNac && <td className="px-3 py-1.5 text-right tabular-nums text-purple-400/80">{row.agentServices > 0 ? `-${formatCurrency(row.agentServices)}` : '—'}</td>}
                      {isNac && <td className="px-3 py-1.5 text-right tabular-nums text-pink-400/80">{row.promotion > 0 ? `-${formatCurrency(row.promotion)}` : '—'}</td>}
                      {isNac && <td className="px-3 py-1.5 text-right tabular-nums text-cyan-400/80">{(row.storage + row.fboServices) > 0 ? `-${formatCurrency(row.storage + row.fboServices)}` : '—'}</td>}

                      {/* COST CELL — click to edit inline */}
                      <td
                        className="px-1 py-0.5 text-right"
                        onClick={e => { e.stopPropagation(); setEditingArticle(row.article); }}
                      >
                        {isEditing ? (
                          <CostEditor
                            article={row.article}
                            costPerUnit={c.costPerUnit}
                            vatRate={c.vatRate}
                            onChangeCost={v => report.updateCost(row.article, 'costPerUnit', v)}
                            onChangeVat={v => report.updateCost(row.article, 'vatRate', v)}
                            onClose={() => setEditingArticle(null)}
                          />
                        ) : (
                          <span
                            className={`group relative flex items-center justify-end gap-1 cursor-pointer rounded px-2 py-1 hover:bg-primary/10 hover:text-primary transition-colors tabular-nums ${row.costTotal > 0 ? 'text-muted-foreground' : 'text-yellow-400/50'}`}
                            title="Нажмите для редактирования себестоимости"
                          >
                            {row.costTotal > 0 ? `-${formatCurrency(row.costTotal)}` : '—'}
                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 flex-shrink-0" />
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.taxAmount > 0 ? `-${formatCurrency(row.taxAmount)}` : '—'}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${row.netProfit > 0 ? 'text-green-400' : 'text-red-400'}`} data-testid={`text-profit-${row.article}`}>
                        {formatCurrency(row.netProfit)}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${row.marginPercent > 20 ? 'text-green-400' : row.marginPercent > 10 ? 'text-yellow-400' : 'text-red-400'}`} data-testid={`text-margin-${row.article}`}>
                        {formatPercent(row.marginPercent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv"
        className="hidden"
        onChange={onFileChange}
        data-testid="input-file"
      />
    </div>
  );
}
