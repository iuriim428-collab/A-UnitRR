import { GlobalSettings } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SettingsPanel({ settings, onChange }: { settings: GlobalSettings, onChange: (key: keyof GlobalSettings, val: number) => void }) {
  const fields: { key: keyof GlobalSettings, label: string, suffix: string }[] = [
    { key: 'commissionPercent', label: 'Commission', suffix: '%' },
    { key: 'logisticsToWarehouse', label: 'Logistics to WH', suffix: '₽' },
    { key: 'lastMile', label: 'Last Mile', suffix: '₽' },
    { key: 'storagePerDay', label: 'Storage/day', suffix: '₽' },
    { key: 'processing', label: 'Processing', suffix: '₽' },
    { key: 'returnRatePercent', label: 'Return Rate', suffix: '%' },
    { key: 'vatPercent', label: 'VAT', suffix: '%' },
    { key: 'returnLogisticsCost', label: 'Return Logistics', suffix: '₽' },
    { key: 'advertisingPercent', label: 'Advertising', suffix: '%' },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-4 p-4 bg-card border">
      {fields.map(field => (
        <div key={field.key} className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{field.label}</Label>
          <div className="relative">
            <Input 
              type="number" 
              value={settings[field.key]} 
              onChange={e => onChange(field.key, parseFloat(e.target.value) || 0)}
              className="h-8 text-xs pr-6 bg-background rounded-none"
            />
            <span className="absolute right-2 top-2 text-[10px] text-muted-foreground">{field.suffix}</span>
          </div>
        </div>
      ))}
    </div>
  );
}