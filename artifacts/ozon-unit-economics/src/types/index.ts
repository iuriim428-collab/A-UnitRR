export type TaxType = 'usn_income' | 'usn_income_expense' | 'osno' | 'none';
export type ReportFormat = 'new' | 'old' | 'unknown';

export interface TaxSettings {
  type: TaxType;
  rate: number;
}

// Per-SKU row parsed from Ozon report
export interface OzonReportRow {
  article: string;
  name: string;
  ordersCount: number;
  ordersSum: number;
  returnsCount: number;
  returnsSum: number;
  salesCount: number;
  netSales: number;
  ozonCommission: number;    // Вознаграждение Ozon (negative in file, we store as positive expense)
  deliveryServices: number;  // Услуги доставки total
  logistics: number;         // Логистика
  returnLogistics: number;   // Обратная логистика
  otherDelivery: number;     // Прочие начисления по доставке
  agentServices: number;     // Услуги агентов
  acquiring: number;         // Эквайринг
  lastMile: number;          // Последняя миля (old format)
  processing: number;        // Обработка отправления (old format)
  promotion: number;         // Продвижение/реклама
  otherExpenses: number;     // Прочие расходы маркетплейса
}

// User-entered cost per SKU
export interface SkuCost {
  costPerUnit: number;
  vatRate: number;
}

// Full calculated SKU row
export interface CalculatedRow extends OzonReportRow {
  costTotal: number;
  vatAmount: number;
  taxAmount: number;
  profitBeforeCosts: number;
  netProfit: number;
  marginPercent: number;
  avgPrice: number;
}

// Summary totals
export interface ReportSummary {
  ordersCount: number;
  returnsCount: number;
  salesCount: number;
  ordersSum: number;
  returnsSum: number;
  netSales: number;
  ozonCommission: number;
  deliveryServices: number;
  logistics: number;
  returnLogistics: number;
  lastMile: number;
  processing: number;
  agentServices: number;
  acquiring: number;
  promotion: number;
  otherExpenses: number;
  profitBeforeCosts: number;
  costTotal: number;
  vatAmount: number;
  taxAmount: number;
  netProfit: number;
  marginPercent: number;
}
