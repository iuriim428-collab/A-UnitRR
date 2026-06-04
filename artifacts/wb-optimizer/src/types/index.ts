export type TaxType = 'usn_income' | 'usn_income_expense' | 'osno' | 'none';
export type ReportFormat = 'nacisleniya' | 'new' | 'old' | 'yandex' | 'unknown';

export interface TaxSettings {
  type: TaxType;
  rate: number;
}

// Per-SKU row parsed from Ozon report
export interface OzonReportRow {
  article: string;
  name: string;
  ordersCount: number;   // total orders (sales + returns)
  ordersSum: number;     // gross revenue (Продажи group)
  returnsCount: number;  // return events
  returnsSum: number;    // gross returned amount (positive)
  salesCount: number;    // sold units
  netSales: number;      // ordersSum - returnsSum (net)
  ozonCommission: number;    // Вознаграждение за продажу (net of refunds)
  deliveryServices: number;  // Услуги доставки total
  logistics: number;         // Логистика
  returnLogistics: number;   // Обратная логистика
  lastMile: number;          // Последняя миля / Доставка до места выдачи
  processing: number;        // Обработка отправления / Drop-off
  otherDelivery: number;     // Прочие начисления по доставке
  agentServices: number;     // Услуги партнёров total
  acquiring: number;         // Эквайринг
  returnProcessing: number;  // Обработка возвратов партнёрами
  promotion: number;         // Продвижение и реклама
  storage: number;           // Хранение (Услуги FBO | Размещение на складе)
  fboServices: number;       // Прочие Услуги FBO
  otherExpenses: number;     // Другие услуги и штрафы
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
  returnProcessing: number;
  promotion: number;
  storage: number;
  fboServices: number;
  otherExpenses: number;
  profitBeforeCosts: number;
  costTotal: number;
  vatAmount: number;
  taxAmount: number;
  netProfit: number;
  marginPercent: number;
}
