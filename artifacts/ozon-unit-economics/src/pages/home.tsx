import { useCalculator } from '../hooks/use-calculator';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatPercent } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { FileUpload } from '@/components/file-upload';
import { SettingsPanel } from '@/components/settings-panel';
import { ChevronRight, Download, Settings2 } from 'lucide-react';
import { useState } from 'react';

const COST_LABELS: { key: string; label: string; color: string }[] = [
  { key: 'commissionVal',  label: 'Комиссия',      color: '#f97316' },
  { key: 'logisticsVal',   label: 'Логистика',     color: '#3b82f6' },
  { key: 'lastMileVal',    label: 'Последняя миля',color: '#6366f1' },
  { key: 'storageVal',     label: 'Хранение',      color: '#8b5cf6' },
  { key: 'processingVal',  label: 'Обработка',     color: '#a855f7' },
  { key: 'advertisingVal', label: 'Реклама',       color: '#ec4899' },
  { key: 'vatVal',         label: 'НДС',           color: '#14b8a6' },
  { key: 'returnCostVal',  label: 'Возвраты',      color: '#ef4444' },
  { key: 'packagingVal',   label: 'Упаковка',      color: '#f59e0b' },
];

export default function Home() {
  const calc = useCalculator();
  const [showSettings, setShowSettings] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(calc.calculatedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Economics");
    XLSX.writeFile(wb, "ozon_economics.xlsx");
  };

  const totalRevenue = calc.calculatedRows.reduce((sum, r) => sum + r.revenue, 0);
  const totalProfit = calc.calculatedRows.reduce((sum, r) => sum + r.grossProfit, 0);
  const avgMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;
  const profitableCount = calc.calculatedRows.filter(r => r.grossProfit > 0).length;
  const unprofitableCount = calc.calculatedRows.length - profitableCount;

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-mono text-sm dark">
      {/* HEADER */}
      <header className="flex-none flex items-center justify-between px-6 py-4 border-b bg-card z-10">
        <div className="flex items-center gap-4">
          <div className="w-4 h-4 bg-primary rounded-sm" />
          <h1 className="text-xl font-bold uppercase tracking-tighter">Ozon Unit Economics</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex border text-xs">
            <button className={`px-4 py-1.5 ${calc.filter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => calc.setFilter('all')} data-testid="filter-all">ALL</button>
            <button className={`px-4 py-1.5 border-l ${calc.filter === 'profitable' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => calc.setFilter('profitable')} data-testid="filter-profitable">PROFITABLE</button>
            <button className={`px-4 py-1.5 border-l ${calc.filter === 'unprofitable' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => calc.setFilter('unprofitable')} data-testid="filter-unprofitable">UNPROFITABLE</button>
          </div>
          <Button onClick={() => setShowSettings(!showSettings)} variant="outline" size="sm" className="rounded-none border-primary text-xs uppercase h-8" data-testid="button-settings">
            <Settings2 className="w-4 h-4 mr-2" /> Settings
          </Button>
          <Button onClick={handleExport} size="sm" className="rounded-none text-xs uppercase h-8" data-testid="button-export">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        </div>
      </header>

      {/* SETTINGS PANEL */}
      {showSettings && (
        <div className="flex-none border-b border-border/50">
          <SettingsPanel settings={calc.settings} onChange={calc.updateSetting} />
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-hidden flex flex-col bg-muted/20">
        {calc.rows.length === 0 ? (
          <div className="flex-1 p-8 flex items-center justify-center">
            <FileUpload onUpload={calc.setRows} onDemo={calc.loadDemoData} />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <Table className="border-b">
              <TableHeader className="bg-card sticky top-0 z-10 outline outline-1 outline-border">
                <TableRow className="hover:bg-card">
                  <TableHead className="w-6" />
                  <TableHead className="w-[200px]">Товар</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead className="text-right">Себест.</TableHead>
                  <TableHead className="text-right">Расх. Ozon</TableHead>
                  <TableHead className="text-right">Итого расх.</TableHead>
                  <TableHead className="text-right">Прибыль</TableHead>
                  <TableHead className="text-right">Маржа</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead className="text-right">Безубыточность</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.calculatedRows.map((row) => {
                  const isExpanded = expandedRows.has(row.id);
                  const bd = row.breakdown;
                  const totalCost = row.totalExpenses;

                  return (
                    <>
                      {/* MAIN ROW */}
                      <TableRow
                        key={row.id}
                        className="group border-b-border/50 cursor-pointer hover:bg-muted/40"
                        onClick={() => toggleRow(row.id)}
                        data-testid={`row-product-${row.id}`}
                      >
                        <TableCell className="pl-3 pr-0 w-6">
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium" onClick={e => e.stopPropagation()}>
                          <Input
                            value={row.name}
                            onChange={e => calc.updateRow(row.id, 'name', e.target.value)}
                            className="h-7 text-xs bg-transparent border-transparent hover:border-input focus:border-primary rounded-none shadow-none px-1 -ml-1"
                            data-testid={`input-name-${row.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Input
                            type="number"
                            value={row.price}
                            onChange={e => calc.updateRow(row.id, 'price', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right bg-transparent border-transparent hover:border-input focus:border-primary rounded-none shadow-none px-1 -mr-1"
                            data-testid={`input-price-${row.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Input
                            type="number"
                            value={row.cost}
                            onChange={e => calc.updateRow(row.id, 'cost', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right bg-transparent border-transparent hover:border-input focus:border-primary rounded-none shadow-none px-1 -mr-1"
                            data-testid={`input-cost-${row.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(row.ozonExpenses)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(row.totalExpenses)}</TableCell>
                        <TableCell className={`text-right font-bold ${row.grossProfit > 0 ? 'text-green-500' : 'text-red-500'}`} data-testid={`text-profit-${row.id}`}>
                          {formatCurrency(row.grossProfit)}
                        </TableCell>
                        <TableCell className={`text-right ${row.marginPercent > 20 ? 'text-green-500' : row.marginPercent > 10 ? 'text-yellow-500' : 'text-red-500'}`} data-testid={`text-margin-${row.id}`}>
                          {formatPercent(row.marginPercent)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatPercent(row.roiPercent)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(row.breakEvenPrice)}</TableCell>
                      </TableRow>

                      {/* COST BREAKDOWN ROW */}
                      {isExpanded && (
                        <TableRow key={`${row.id}-breakdown`} className="bg-muted/10 border-b border-dashed border-border/30 hover:bg-muted/10">
                          <TableCell />
                          <TableCell colSpan={9} className="py-3 px-4">
                            <div className="flex flex-col gap-2">
                              {/* Bar chart */}
                              <div className="flex h-5 w-full rounded-sm overflow-hidden gap-px">
                                {COST_LABELS.map(({ key, label, color }) => {
                                  const val = bd[key as keyof typeof bd] as number;
                                  const pct = totalCost > 0 ? (val / totalCost) * 100 : 0;
                                  if (pct < 0.5) return null;
                                  return (
                                    <div
                                      key={key}
                                      title={`${label}: ${formatCurrency(val)} (${pct.toFixed(1)}%)`}
                                      style={{ width: `${pct}%`, backgroundColor: color }}
                                      className="h-full transition-all"
                                    />
                                  );
                                })}
                              </div>

                              {/* Cost cards */}
                              <div className="flex flex-wrap gap-3 mt-1">
                                {COST_LABELS.map(({ key, label, color }) => {
                                  const val = bd[key as keyof typeof bd] as number;
                                  const pct = totalCost > 0 ? (val / totalCost) * 100 : 0;
                                  return (
                                    <div
                                      key={key}
                                      className="flex items-center gap-1.5 text-[11px]"
                                      data-testid={`breakdown-${key}-${row.id}`}
                                    >
                                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                                      <span className="text-muted-foreground">{label}:</span>
                                      <span className="font-medium">{formatCurrency(val)}</span>
                                      <span className="text-muted-foreground/60">({pct.toFixed(1)}%)</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Summary line */}
                              <div className="flex items-center gap-4 mt-1 pt-2 border-t border-border/20 text-[11px]">
                                <span className="text-muted-foreground">Итого затрат:</span>
                                <span className="font-bold">{formatCurrency(totalCost)}</span>
                                <span className="text-muted-foreground ml-4">из которых расходы Ozon:</span>
                                <span className="font-medium text-orange-400">{formatCurrency(row.ozonExpenses)}</span>
                                <span className="text-muted-foreground ml-2">({totalCost > 0 ? ((row.ozonExpenses / totalCost) * 100).toFixed(1) : 0}% от затрат)</span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      {/* FOOTER STATS */}
      {calc.rows.length > 0 && (
        <footer className="flex-none bg-card border-t p-4 flex items-center justify-between text-xs">
          <div className="flex gap-8">
            <div>
              <span className="text-muted-foreground uppercase tracking-wider block text-[10px] mb-1">Выручка итого</span>
              <span className="font-bold text-lg" data-testid="text-total-revenue">{formatCurrency(totalRevenue)}</span>
            </div>
            <div>
              <span className="text-muted-foreground uppercase tracking-wider block text-[10px] mb-1">Прибыль итого</span>
              <span className={`font-bold text-lg ${totalProfit > 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-total-profit">{formatCurrency(totalProfit)}</span>
            </div>
            <div>
              <span className="text-muted-foreground uppercase tracking-wider block text-[10px] mb-1">Ср. маржа</span>
              <span className="font-bold text-lg" data-testid="text-avg-margin">{formatPercent(avgMargin * 100)}</span>
            </div>
          </div>
          <div className="flex gap-4 text-right items-center">
            <div className="px-3 py-1 border border-green-500/20 bg-green-500/10 text-green-500" data-testid="text-profitable-count">
              {profitableCount} прибыльных
            </div>
            <div className="px-3 py-1 border border-red-500/20 bg-red-500/10 text-red-500" data-testid="text-unprofitable-count">
              {unprofitableCount} убыточных
            </div>
            <Button variant="ghost" size="sm" onClick={() => calc.setRows([])} className="text-muted-foreground hover:text-foreground h-auto py-1 px-3 rounded-none uppercase text-[10px]" data-testid="button-clear">
              Очистить
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
