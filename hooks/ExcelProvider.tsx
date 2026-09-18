import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { WorkbookData, FieldMapping, SaveVersion } from '@/types';
import { loadWorkbook, saveWorkbook, getVersions, saveVersion, rollbackToVersion, deleteVersion, saveCustomFields, loadCustomFields } from '@/src/storage';
import { useLanguage } from '@/hooks/useLanguage';

interface ExcelContextValue {
  workbook: WorkbookData | null;
  versions: SaveVersion[];
  customFields: FieldMapping[];
  isLoading: boolean;
  setWorkbookData: (wb: WorkbookData, originalBase64?: string) => Promise<void>;
  addRecord: (record: Record<string, string | number>) => Promise<void>;
  updateRecord: (index: number, record: Record<string, string | number>) => Promise<void>;
  deleteRecord: (index: number) => Promise<void>;
  addCustomField: (field: FieldMapping) => Promise<void>;
  createSaveVersion: (label: string) => Promise<void>;
  doRollback: (versionId: string) => Promise<boolean>;
  doDeleteVersion: (versionId: string) => Promise<void>;
}

const ExcelContext = createContext<ExcelContextValue | null>(null);

export function ExcelProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [workbook, setWorkbook] = useState<WorkbookData | null>(null);
  const [versions, setVersions] = useState<SaveVersion[]>([]);
  const [customFields, setCustomFields] = useState<FieldMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const wb = await loadWorkbook();
      if (wb) {
        setWorkbook(wb);
        setVersions(await getVersions(wb.id));
      }
      setCustomFields(await loadCustomFields());
      setIsLoading(false);
    })();
  }, []);

  const setWorkbookData = async (wb: WorkbookData, originalBase64?: string) => {
    await saveWorkbook(wb, originalBase64);
    setWorkbook(wb);
    setVersions(await getVersions(wb.id));
  };

  const persistAndSet = async (wb: WorkbookData) => {
    await saveWorkbook(wb);
    setWorkbook(wb);
  };

  const addRecord = async (record: Record<string, string | number>) => {
    if (!workbook) return;
    await persistAndSet({ ...workbook, records: [...workbook.records, record], updatedAt: Date.now() });
  };

  const updateRecord = async (index: number, record: Record<string, string | number>) => {
    if (!workbook) return;
    const records = [...workbook.records];
    records[index] = record;
    await persistAndSet({ ...workbook, records, updatedAt: Date.now() });
  };

  const deleteRecord = async (index: number) => {
    if (!workbook) return;
    const records = workbook.records.filter((_, i) => i !== index);
    await persistAndSet({ ...workbook, records, updatedAt: Date.now() });
  };

  const addCustomField = async (field: FieldMapping) => {
    const updated = [...customFields, field];
    setCustomFields(updated);
    await saveCustomFields(updated);
    if (workbook) {
      await persistAndSet({ ...workbook, mappings: [...workbook.mappings, field], updatedAt: Date.now() });
    }
  };

  const createSaveVersion = async (label: string) => {
    if (!workbook) return;
    await saveVersion(workbook.id, label, JSON.stringify(workbook));
    setVersions(await getVersions(workbook.id));
  };

  const doRollback = async (versionId: string): Promise<boolean> => {
    if (!workbook) return false;
    const wb = await rollbackToVersion(workbook.id, versionId);
    if (wb) { setWorkbook(wb); return true; }
    return false;
  };

  const doDeleteVersion = async (versionId: string) => {
    if (!workbook) return;
    await deleteVersion(workbook.id, versionId);
    setVersions(await getVersions(workbook.id));
  };

  return (
    <ExcelContext.Provider value={{ workbook, versions, customFields, isLoading, setWorkbookData, addRecord, updateRecord, deleteRecord, addCustomField, createSaveVersion, doRollback, doDeleteVersion }}>
      {children}
    </ExcelContext.Provider>
  );
}

export function useExcel() {
  const ctx = useContext(ExcelContext);
  if (!ctx) throw new Error('useExcel must be used within ExcelProvider');
  return ctx;
}
