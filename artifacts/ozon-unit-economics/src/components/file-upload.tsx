import { UploadCloud } from 'lucide-react';
import { useCallback, useState } from 'react';
import { parseFile } from '@/lib/excel';
import { ProductRow } from '@/types';
import { Button } from '@/components/ui/button';

export function FileUpload({ onUpload, onDemo }: { onUpload: (rows: ProductRow[]) => void, onDemo: () => void }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const rows = await parseFile(file);
      onUpload(rows);
    }
  }, [onUpload]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const rows = await parseFile(file);
      onUpload(rows);
    }
  };

  return (
    <div className="flex gap-4 w-full">
      <div 
        className={`flex-1 border-2 border-dashed flex flex-col items-center justify-center p-8 transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <UploadCloud className="w-8 h-8 text-muted-foreground mb-4" />
        <p className="text-sm font-medium mb-1">Drag and drop Excel or CSV file</p>
        <p className="text-xs text-muted-foreground mb-4">.xlsx, .xls, .csv</p>
        
        <label>
          <span className="cursor-pointer bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-primary/90">
            Select File
          </span>
          <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
        </label>
      </div>
      <div className="w-64 border flex flex-col items-center justify-center p-8 bg-card">
        <p className="text-sm font-medium mb-4 text-center">No data?</p>
        <Button onClick={onDemo} variant="outline" className="w-full text-xs uppercase tracking-wider">
          Load Demo Data
        </Button>
      </div>
    </div>
  );
}