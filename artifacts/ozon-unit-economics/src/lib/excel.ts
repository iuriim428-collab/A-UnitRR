import * as XLSX from 'xlsx';
import { ProductRow } from '../types';

export async function parseFile(file: File): Promise<ProductRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(firstSheet);
        
        const parsedRows = rows.map((row, index) => {
          const getVal = (keys: string[]) => {
            for (const key of Object.keys(row)) {
              if (keys.some(k => key.toLowerCase().includes(k))) {
                const val = parseFloat(row[key]);
                return isNaN(val) ? null : val;
              }
            }
            return null;
          };

          const getStringVal = (keys: string[]) => {
            for (const key of Object.keys(row)) {
              if (keys.some(k => key.toLowerCase().includes(k))) {
                return String(row[key]);
              }
            }
            return null;
          };

          return {
            id: Math.random().toString(36).substr(2, 9),
            name: getStringVal(['название', 'name', 'product']) || `Product ${index + 1}`,
            price: getVal(['цена', 'price', 'selling']) || 0,
            cost: getVal(['себестоимость', 'cost', 'purchase']) || 0,
            commission: getVal(['комиссия', 'commission']),
            logistics: getVal(['логистика', 'delivery']),
            lastMile: getVal(['последняя миля', 'last_mile']),
            storage: getVal(['хранение', 'storage']),
            processing: getVal(['обработка', 'processing']),
            advertising: getVal(['реклама', 'ads', 'advertising']),
            returnRate: getVal(['возврат', 'return']),
            vat: getVal(['ндс', 'vat']),
            packaging: getVal(['упаковка', 'packaging']) || 0,
          };
        });
        resolve(parsedRows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
