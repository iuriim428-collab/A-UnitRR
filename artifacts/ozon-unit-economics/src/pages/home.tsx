import { useState, useRef } from 'react';
import { useReport } from '../hooks/use-report';
import { parseOzonReport, exportToExcel } from '../lib/excel';
import { formatCurrency, formatPercent, formatNumber } from '../lib/utils';
import { TaxSettings, TaxType } from '../types';
import { Upload, Download, Trash2, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';

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

export default function Home() {
  const report = useReport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

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
        'Продажи, шт': r.salesCount,
        'Выручка, руб': r.netSales,
        'Комиссия Ozon, руб': r.ozonCommission,
        'Доставка, руб': r.deliveryServices,
        'Себестоимость, руб': r.costTotal,
        'НДС, руб': r.vatAmount,
        'Налог, руб': r.taxAmount,
        'Чистая прибыль, руб': r.netProfit,
        'Маржа, %': r.marginPercent.toFixed(1),
      })),
      'ozon_report.xlsx'
    );
  };

  const s = report.summary;
  const hasData = report.rows.length > 0;

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-mono text-sm dark select-none">
      {/* HEADER */}
      <header className="flex-none flex items-center justify-between px-5 py-3 border-b bg-card z-20 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <FileSpreadsheet className="w-5 h-5 text-primary flex-shrink-0" />
          <h1 className="text-base font-bold uppercase tracking-tight whitespace-nowrap">Ozon Unit Economics</h1>
          {hasData && (
            <span className="text-[10px] text-muted-foreground border border-border/50 px-2 py-0.5 ml-2 whitespace-nowrap">
              {report.format === 'new' ? 'НОВЫЙ ФОРМАТ' : 'СТАРЫЙ ФОРМАТ'} · {report.rows.length} SKU
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Tax selector */}
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

          {/* Filter */}
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
        /* UPLOAD ZONE */
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
              {loading ? 'Читаю файл...' : 'Перетащите отчёт Ozon или нажмите для выбора'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Поддерживаются отчёты о реализации в форматах .xlsx, .xls, .xlsm
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              Новый формат: отчёт с колонками «Чистые продажи», «Вознаграждение Ozon»<br />
              Старый формат: отчёт с колонками «Выкуплено», «Обработка и доставка»
            </p>
            {error && (
              <p className="mt-4 text-xs text-red-400 border border-red-400/20 bg-red-400/10 px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* DATA VIEW: left summary + right table */
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT SUMMARY PANEL */}
          <aside className="flex-none w-56 bg-card border-r overflow-y-auto p-3 text-xs space-y-0.5">
            <SectionHeader>Ключевые показатели</SectionHeader>
            <MetricRow label="Заказы, шт" value={formatNumber(s.ordersCount)} />
            <MetricRow label="Возвраты, шт" value={formatNumber(s.returnsCount)} />
            <MetricRow label="Продажи, шт" value={formatNumber(s.salesCount)} />
            <MetricRow label="Сумма заказов" value={formatCurrency(s.ordersSum)} />
            {s.returnsSum > 0 && <MetricRow label="Сумма возвратов" value={`-${formatCurrency(s.returnsSum)}`} />}
            <MetricRow label="Чистые продажи" value={formatCurrency(s.netSales)} />

            <SectionHeader>Расходы Ozon</SectionHeader>
            <MetricRow label="Комиссия" value={`-${formatCurrency(s.ozonCommission)}`} />
            <MetricRow label="Доставка итого" value={`-${formatCurrency(s.deliveryServices)}`} />
            {s.logistics > 0 && <MetricRow label="└ Логистика" value={`-${formatCurrency(s.logistics)}`} sub />}
            {s.lastMile > 0 && <MetricRow label="└ Последняя миля" value={`-${formatCurrency(s.lastMile)}`} sub />}
            {s.processing > 0 && <MetricRow label="└ Обработка" value={`-${formatCurrency(s.processing)}`} sub />}
            {s.returnLogistics > 0 && <MetricRow label="└ Обрат. лог." value={`-${formatCurrency(s.returnLogistics)}`} sub />}
            {s.agentServices > 0 && <MetricRow label="Услуги агентов" value={`-${formatCurrency(s.agentServices)}`} />}
            {s.acquiring > 0 && <MetricRow label="└ Эквайринг" value={`-${formatCurrency(s.acquiring)}`} sub />}
            {s.promotion > 0 && <MetricRow label="Продвижение" value={`-${formatCurrency(s.promotion)}`} />}
            {s.otherExpenses > 0 && <MetricRow label="Прочие" value={`-${formatCurrency(s.otherExpenses)}`} />}

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
                Укажите себестоимость в таблице для точного расчёта прибыли
              </p>
            )}
          </aside>

          {/* RIGHT: TABLE */}
          <div className="flex-1 overflow-auto">
            {/* Cost entry toggle */}
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border/50 text-[11px]">
              <button
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setCostOpen(v => !v)}
                data-testid="toggle-cost-panel"
              >
                {costOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Себестоимость по артикулам
              </button>
              {report.hasCosts && (
                <span className="text-green-400/70">· указана для {Object.keys(report.costs).length} SKU</span>
              )}
            </div>

            {/* Cost entry panel */}
            {costOpen && (
              <div className="border-b border-border/50 bg-muted/10 p-3">
                <div className="flex flex-wrap gap-2">
                  {report.rows.map(row => {
                    const c = report.costs[row.article] ?? { costPerUnit: 0, vatRate: 0 };
                    return (
                      <div key={row.article} className="flex items-center gap-1 border border-border/50 bg-card px-2 py-1 text-[11px] min-w-[280px]">
                        <span className="text-muted-foreground truncate max-w-[100px]" title={row.name}>{row.article}</span>
                        <span className="text-muted-foreground mx-1">|</span>
                        <span className="text-muted-foreground">Себест:</span>
                        <input
                          type="number"
                          min="0"
                          value={c.costPerUnit || ''}
                          placeholder="0"
                          onChange={e => report.updateCost(row.article, 'costPerUnit', parseFloat(e.target.value) || 0)}
                          className="w-20 bg-transparent border-b border-border focus:border-primary outline-none text-right px-1 tabular-nums"
                          data-testid={`input-cost-${row.article}`}
                        />
                        <span className="text-muted-foreground ml-0.5">₽</span>
                        <span className="text-muted-foreground mx-1">НДС:</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={c.vatRate || ''}
                          placeholder="0"
                          onChange={e => report.updateCost(row.article, 'vatRate', parseFloat(e.target.value) || 0)}
                          className="w-10 bg-transparent border-b border-border focus:border-primary outline-none text-right px-1 tabular-nums"
                          data-testid={`input-vat-${row.article}`}
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SKU TABLE */}
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-[33px] z-10 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap w-[100px]">Артикул</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Название</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Заказы</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Возвраты</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Продажи</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Ср. цена</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Выручка</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Комиссия</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Доставка</th>
                  {report.format === 'old' && <>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Лог.</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">П. миля</th>
                  </>}
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Себест.</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Налог</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Прибыль</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {report.calculatedRows.map((row, idx) => (
                  <tr
                    key={row.article}
                    className={`border-b border-border/30 hover:bg-muted/20 ${idx % 2 === 0 ? '' : 'bg-muted/5'}`}
                    data-testid={`row-sku-${row.article}`}
                  >
                    <td className="px-3 py-1.5 font-medium text-primary/80 whitespace-nowrap">{row.article}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={row.name}>{row.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.ordersCount)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-400/70">{row.returnsCount > 0 ? formatNumber(row.returnsCount) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(row.salesCount)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.avgPrice > 0 ? formatCurrency(row.avgPrice) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(row.netSales)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-orange-400/80">{row.ozonCommission > 0 ? `-${formatCurrency(row.ozonCommission)}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-blue-400/80">{row.deliveryServices > 0 ? `-${formatCurrency(row.deliveryServices)}` : '—'}</td>
                    {report.format === 'old' && <>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.logistics > 0 ? `-${formatCurrency(row.logistics)}` : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.lastMile > 0 ? `-${formatCurrency(row.lastMile)}` : '—'}</td>
                    </>}
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {row.costTotal > 0 ? `-${formatCurrency(row.costTotal)}` : <span className="text-yellow-400/50">укажите</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.taxAmount > 0 ? `-${formatCurrency(row.taxAmount)}` : '—'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${row.netProfit > 0 ? 'text-green-400' : 'text-red-400'}`} data-testid={`text-profit-${row.article}`}>
                      {formatCurrency(row.netProfit)}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${row.marginPercent > 20 ? 'text-green-400' : row.marginPercent > 10 ? 'text-yellow-400' : 'text-red-400'}`} data-testid={`text-margin-${row.article}`}>
                      {formatPercent(row.marginPercent)}
                    </td>
                  </tr>
                ))}
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
