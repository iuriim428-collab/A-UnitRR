export interface GlobalSettings {
  commissionPercent: number;
  logisticsToWarehouse: number;
  lastMile: number;
  storagePerDay: number;
  processing: number;
  returnRatePercent: number;
  vatPercent: number;
  returnLogisticsCost: number;
  advertisingPercent: number;
}

export interface ProductRow {
  id: string;
  name: string;
  price: number;
  cost: number;
  commission: number | null; // null means use global
  logistics: number | null;
  lastMile: number | null;
  storage: number | null;
  processing: number | null;
  advertising: number | null;
  returnRate: number | null;
  vat: number | null;
  packaging: number;
}

export interface CalculatedProductRow extends ProductRow {
  revenue: number;
  ozonExpenses: number;
  totalExpenses: number;
  grossProfit: number;
  marginPercent: number;
  roiPercent: number;
  breakEvenPrice: number;
}
