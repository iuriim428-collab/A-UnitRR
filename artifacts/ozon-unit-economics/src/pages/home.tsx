import { useCalculator } from '../hooks/use-calculator';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatPercent } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { FileUpload } from '@/components/file-upload';
import { SettingsPanel } from '@/components/settings-panel';
import { ChevronDown, ChevronUp, Download, Settings2 } from 'lucide-react';
import { useState } from 'react';

export default function Home() {
  const calc = useCalculator();
  const [showSettings, setShowSettings] = useState(true);

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
            <button className={`px-4 py-1.5 ${calc.filter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => calc.setFilter('all')}>ALL</button>
            <button className={`px-4 py-1.5 border-l ${calc.filter === 'profitable' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => calc.setFilter('profitable')}>PROFITABLE</button>
            <button className={`px-4 py-1.5 border-l ${calc.filter === 'unprofitable' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} onClick={() => calc.setFilter('unprofitable')}>UNPROFITABLE</button>
          </div>
          <Button onClick={() => setShowSettings(!showSettings)} variant="outline" size="sm" className="rounded-none border-primary text-xs uppercase h-8">
            <Settings2 className="w-4 h-4 mr-2" /> Settings
          </Button>
          <Button onClick={handleExport} size="sm" className="rounded-none text-xs uppercase h-8">
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
                  <TableHead className="w-[200px]">Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Ozon Exp.</TableHead>
                  <TableHead className="text-right">Total Exp.</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead className="text-right">Break-even</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.calculatedRows.map((row) => (
                  <TableRow key={row.id} className="group border-b-border/50">
                    <TableCell className="font-medium">
                      <Input 
                        value={row.name} 
                        onChange={e => calc.updateRow(row.id, 'name', e.target.value)}
                        className="h-7 text-xs bg-transparent border-transparent hover:border-input focus:border-primary rounded-none shadow-none px-1 -ml-1"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input 
                        type="number"
                        value={row.price} 
                        onChange={e => calc.updateRow(row.id, 'price', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right bg-transparent border-transparent hover:border-input focus:border-primary rounded-none shadow-none px-1 -mr-1"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input 
                        type="number"
                        value={row.cost} 
                        onChange={e => calc.updateRow(row.id, 'cost', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right bg-transparent border-transparent hover:border-input focus:border-primary rounded-none shadow-none px-1 -mr-1"
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.ozonExpenses)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.totalExpenses)}</TableCell>
                    <TableCell className={`text-right font-bold ${row.grossProfit > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(row.grossProfit)}
                    </TableCell>
                    <TableCell className={`text-right ${row.marginPercent > 20 ? 'text-green-500' : row.marginPercent > 10 ? 'text-yellow-500' : 'text-red-500'}`}>
                      {formatPercent(row.marginPercent)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatPercent(row.roiPercent)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.breakEvenPrice)}</TableCell>
                  </TableRow>
                ))}
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
              <span className="text-muted-foreground uppercase tracking-wider block text-[10px] mb-1">Total Revenue</span>
              <span className="font-bold text-lg">{formatCurrency(totalRevenue)}</span>
            </div>
            <div>
              <span className="text-muted-foreground uppercase tracking-wider block text-[10px] mb-1">Total Profit</span>
              <span className={`font-bold text-lg ${totalProfit > 0 ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(totalProfit)}</span>
            </div>
            <div>
              <span className="text-muted-foreground uppercase tracking-wider block text-[10px] mb-1">Avg Margin</span>
              <span className="font-bold text-lg">{formatPercent(avgMargin * 100)}</span>
            </div>
          </div>
          <div className="flex gap-4 text-right">
            <div className="px-3 py-1 border border-green-500/20 bg-green-500/10 text-green-500">
              {profitableCount} Profitable
            </div>
            <div className="px-3 py-1 border border-red-500/20 bg-red-500/10 text-red-500">
              {unprofitableCount} Unprofitable
            </div>
            <Button variant="ghost" size="sm" onClick={() => calc.setRows([])} className="text-muted-foreground hover:text-foreground h-auto py-1 px-3 rounded-none uppercase text-[10px]">
              Clear Data
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}
