import { useState, useMemo } from 'react';
import { GlobalSettings, ProductRow, CalculatedProductRow } from '../types';

const defaultSettings: GlobalSettings = {
  commissionPercent: 15,
  logisticsToWarehouse: 80,
  lastMile: 40,
  storagePerDay: 5,
  processing: 30,
  returnRatePercent: 5,
  vatPercent: 20,
  returnLogisticsCost: 80,
  advertisingPercent: 10,
};

export function useCalculator() {
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'profitable' | 'unprofitable'>('all');

  const calculatedRows = useMemo(() => {
    return rows.map((row): CalculatedProductRow => {
      // Итого расходы = Себестоимость + Расходы Ozon + Реклама + Упаковка + (Цена × НДС%) + (Цена × Процент_возвратов% × Логистика_возврата)
      const commissionRate = row.commission ?? settings.commissionPercent;
      const commissionVal = commissionRate <= 100 ? (row.price * commissionRate) / 100 : commissionRate;
      
      const logisticsVal = row.logistics ?? settings.logisticsToWarehouse;
      const lastMileVal = row.lastMile ?? settings.lastMile;
      const storageVal = row.storage ?? settings.storagePerDay;
      const processingVal = row.processing ?? settings.processing;
      
      const ozonExpenses = commissionVal + logisticsVal + lastMileVal + storageVal + processingVal;
      
      const advRate = row.advertising ?? settings.advertisingPercent;
      const advertisingVal = (row.price * advRate) / 100;
      
      const vatRate = row.vat ?? settings.vatPercent;
      const vatVal = (row.price * vatRate) / 100;
      
      const retRate = row.returnRate ?? settings.returnRatePercent;
      // return logistics cost is flat fee per return
      const returnCostVal = (retRate / 100) * settings.returnLogisticsCost;
      
      const totalExpenses = row.cost + ozonExpenses + advertisingVal + row.packaging + vatVal + returnCostVal;
      
      const grossProfit = row.price - totalExpenses;
      const marginPercent = row.price > 0 ? (grossProfit / row.price) * 100 : 0;
      const roiPercent = row.cost > 0 ? (grossProfit / row.cost) * 100 : 0;
      
      // Break-even is minimum price where margin is 0. 
      // 0 = P - (Cost + P*Comm% + Log + LM + Stor + Proc + P*Adv% + Pack + P*VAT% + Ret%*RetLog)
      // P - P*(Comm% + Adv% + VAT%) = Cost + Log + LM + Stor + Proc + Pack + Ret%*RetLog
      // P = FixedCosts / (1 - VariableMargin%)
      const fixedCosts = row.cost + logisticsVal + lastMileVal + storageVal + processingVal + row.packaging + returnCostVal;
      const variableMarginPercent = ((commissionRate <= 100 ? commissionRate : 0) + advRate + vatRate) / 100;
      let breakEvenPrice = 0;
      if (variableMarginPercent < 1) {
        breakEvenPrice = fixedCosts / (1 - variableMarginPercent);
        if (commissionRate > 100) {
           breakEvenPrice = (fixedCosts + commissionRate) / (1 - variableMarginPercent);
        }
      }

      return {
        ...row,
        revenue: row.price,
        ozonExpenses,
        totalExpenses,
        grossProfit,
        marginPercent,
        roiPercent,
        breakEvenPrice,
        breakdown: {
          commissionVal,
          logisticsVal,
          lastMileVal,
          storageVal,
          processingVal,
          advertisingVal,
          vatVal,
          returnCostVal,
          packagingVal: row.packaging,
        }
      };
    }).filter(row => {
      if (filter === 'profitable') return row.grossProfit > 0;
      if (filter === 'unprofitable') return row.grossProfit <= 0;
      return true;
    });
  }, [rows, settings, filter]);

  const updateSetting = (key: keyof GlobalSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateRow = (id: string, key: keyof ProductRow, value: any) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
  };

  const loadDemoData = () => {
    setRows([
      {
        id: '1',
        name: 'T-Shirt Basic White',
        price: 1200,
        cost: 300,
        commission: null,
        logistics: null,
        lastMile: null,
        storage: null,
        processing: null,
        advertising: null,
        returnRate: null,
        vat: null,
        packaging: 20,
      },
      {
        id: '2',
        name: 'Running Shoes Pro',
        price: 3500,
        cost: 1500,
        commission: 10,
        logistics: 150,
        lastMile: null,
        storage: null,
        processing: null,
        advertising: 5,
        returnRate: 10,
        vat: null,
        packaging: 50,
      },
      {
        id: '3',
        name: 'Wireless Earbuds',
        price: 800,
        cost: 600,
        commission: null,
        logistics: null,
        lastMile: null,
        storage: null,
        processing: null,
        advertising: 15,
        returnRate: null,
        vat: null,
        packaging: 15,
      }
    ]);
  };

  return {
    settings,
    updateSetting,
    rows,
    setRows,
    updateRow,
    calculatedRows,
    loadDemoData,
    filter,
    setFilter
  };
}