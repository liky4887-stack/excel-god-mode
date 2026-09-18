import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { WorkbookData, FieldMapping, SaveVersion, TemplateMeta, TemplateData, CalculationResult } from '@/types';
import {
  listTemplates, getActiveTemplateId, setActiveTemplateId,
  loadTemplateData, saveTemplateData, saveTemplateMeta,
  saveVersion as saveVersionLegacy, getVersions, deleteVersion as deleteVersionLegacy,
  saveCustomFields, loadCustomFields,
} from '@/src/storage';
import { readWorkbook, bufferToBase64 } from '@/src/excelBridge';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

interface ExcelContextValue {
  templates: TemplateMeta[];
  activeTemplateId: string | null;
  activeTemplate: TemplateData | null;
  isLoading: boolean;
  refreshTemplates: () => Promise<void>;
  importTemplate: (fileUri: string, fileName: string) => Promise<void>;
  switchTemplate: (id: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  renameTemplate: (id: string, name: string) => Promise<void>;
  addRecord: (record: Record<string, string | number>) => Promise<void>;
  updateRecord: (index: number, record: Record<string, string | number>) => Promise<void>;
  deleteRecord: (index: number) => Promise<void>;
  addCustomField: (field: FieldMapping) => Promise<void>;
  createVersion: (label: string) => Promise<string>;
  doRollback: (versionId: string) => Promise<boolean>;
  doDeleteVersion: (versionId: string) => Promise<void>;
}

const ExcelContext = createContext<ExcelContextValue | null>(null);

const AUTO_SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_VERSIONS = 20;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function ExcelProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [activeTemplateId, setActiveTemplateIdState] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<TemplateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load templates and active template on mount
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const tpls = await listTemplates();
      if (cancelled) return;
      setTemplates(tpls);

      const activeId = await getActiveTemplateId();
      if (cancelled) return;

      if (activeId && tpls.some((t) => t.id === activeId)) {
        const data = await loadTemplateData(activeId);
        if (cancelled) return;
        setActiveTemplateIdState(activeId);
        setActiveTemplate(data);
      }
      setIsLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Auto-snapshot is triggered by persistActiveTemplate via autoSnapshot()

  const persistActiveTemplate = useCallback(async (data: TemplateData) => {
    if (!activeTemplateId) return;
    await saveTemplateData(activeTemplateId, data);
    // Update index counts
    const meta = templates.find((t) => t.id === activeTemplateId);
    if (meta) {
      const updatedMeta: TemplateMeta = {
        ...meta,
        recordCount: data.records.length,
        columnCount: data.mappings.length,
        sheetCount: data.workbook.sheets.length,
        lastEditedAt: Date.now(),
      };
      await saveTemplateMeta(updatedMeta);
      setTemplates((prev) => prev.map((t) => t.id === activeTemplateId ? updatedMeta : t));
    }
  }, [activeTemplateId, templates]);

  const refreshTemplates = useCallback(async () => {
    const tpls = await listTemplates();
    setTemplates(tpls);
    if (activeTemplateId) {
      const data = await loadTemplateData(activeTemplateId);
      setActiveTemplate(data);
    }
  }, [activeTemplateId]);

  const importTemplate = useCallback(async (fileUri: string, fileName: string) => {
    const arrayBuffer = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const binary = atob(arrayBuffer);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const wb = readWorkbook(bytes.buffer, fileName);
    const base64 = bufferToBase64(bytes.buffer);

    const id = uid();
    const meta: TemplateMeta = {
      id,
      name: fileName.replace(/\.(xlsx|xls)$/, ''),
      fileName,
      originalFileUri: fileUri,
      importedAt: Date.now(),
      sheetCount: wb.sheets.length,
      columnCount: wb.mappings.length,
      recordCount: wb.records.length,
      lastEditedAt: Date.now(),
    };

    const data: TemplateData = {
      workbook: { ...wb, originalBase64: base64 },
      mappings: wb.mappings,
      records: wb.records,
      customFields: [],
      versions: [],
    };

    await saveTemplateMeta(meta);
    await saveTemplateData(id, data);
    await setActiveTemplateId(id);

    setTemplates((prev) => [meta, ...prev]);
    setActiveTemplateIdState(id);
    setActiveTemplate(data);
  }, []);

  const switchTemplate = useCallback(async (id: string) => {
    const data = await loadTemplateData(id);
    if (!data) return;
    await setActiveTemplateId(id);
    setActiveTemplateIdState(id);
    setActiveTemplate(data);
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    await deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (activeTemplateId === id) {
      setActiveTemplate(null);
      setActiveTemplateIdState(null);
    }
  }, [activeTemplateId]);

  const renameTemplate = useCallback(async (id: string, name: string) => {
    const templates = (await listTemplates()).map((t) => t.id === id ? { ...t, name, lastEditedAt: Date.now() } : t);
    const updated = templates.find((t) => t.id === id);
    if (updated) {
      await saveTemplateMeta(updated);
    }
    setTemplates(templates);
    if (activeTemplateId === id && activeTemplate) {
      const updatedData: TemplateData = { ...activeTemplate, workbook: { ...activeTemplate.workbook, fileName: name } };
      setActiveTemplate(updatedData);
      await saveTemplateData(id, updatedData);
    }
  }, [activeTemplateId, activeTemplate]);

  const addRecord = useCallback(async (record: Record<string, string | number>) => {
    if (!activeTemplateId || !activeTemplate) return;
    const newRecords = [...activeTemplate.records, record];
    const data: TemplateData = {
      ...activeTemplate,
      records: newRecords,
    };
    setActiveTemplate(data);
    await persistActiveTemplate(data);
    await autoSnapshot(data);
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const updateRecord = useCallback(async (index: number, record: Record<string, string | number>) => {
    if (!activeTemplateId || !activeTemplate) return;
    const records = [...activeTemplate.records];
    records[index] = record;
    const data: TemplateData = { ...activeTemplate, records };
    setActiveTemplate(data);
    await persistActiveTemplate(data);
    await autoSnapshot(data);
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const deleteRecord = useCallback(async (index: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const records = activeTemplate.records.filter((_, i) => i !== index);
    const data: TemplateData = { ...activeTemplate, records };
    setActiveTemplate(data);
    await persistActiveTemplate(data);
    await autoSnapshot(data);
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const addCustomField = useCallback(async (field: FieldMapping) => {
    if (!activeTemplateId || !activeTemplate) return;
    const customFields = [...activeTemplate.customFields, field];
    const mappings = [...activeTemplate.mappings, field];
    const data: TemplateData = { ...activeTemplate, customFields, mappings };
    setActiveTemplate(data);
    await persistActiveTemplate(data);
    await autoSnapshot(data);
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const lastSnapshotTimeRef = useRef<number>(0);

  const autoSnapshot = useCallback(async (data: TemplateData) => {
    if (!activeTemplateId) return;
    const now = Date.now();
    if (now - lastSnapshotTimeRef.current > AUTO_SNAPSHOT_INTERVAL) {
      lastSnapshotTimeRef.current = now;
      const versions = data.versions || [];
      await createVersionInternal(activeTemplateId, `Auto — ${new Date().toLocaleDateString()}`, data, versions);
    }
  }, [activeTemplateId]);

  const createVersionInternal = async (templateId: string, label: string, data: TemplateData, existingVersions: SaveVersion[]) => {
    const snapshot = JSON.stringify({
      records: data.records,
      mappings: data.mappings,
      customFields: data.customFields,
    });
    const v: SaveVersion = {
      id: uid(),
      workbookId: templateId,
      versionNumber: existingVersions.length + 1,
      label,
      data: snapshot,
      createdAt: Date.now(),
    };
    const newVersions = [v, ...existingVersions].slice(0, MAX_VERSIONS);
    const updatedData: TemplateData = { ...data, versions: newVersions };
    await saveTemplateData(templateId, updatedData);
    setActiveTemplate(updatedData);
    const meta = templates.find((t) => t.id === templateId);
    if (meta) {
      const updatedMeta = { ...meta, lastEditedAt: Date.now() };
      await saveTemplateMeta(updatedMeta);
      setTemplates((prev) => prev.map((t) => t.id === templateId ? updatedMeta : t));
    }
    return v.id;
  };

  const createVersion = useCallback(async (label: string): Promise<string> => {
    if (!activeTemplateId || !activeTemplate) return '';
    const versions = activeTemplate.versions || [];
    return createVersionInternal(activeTemplateId, label, activeTemplate, versions);
  }, [activeTemplateId, activeTemplate, templates]);

  const doRollback = useCallback(async (versionId: string): Promise<boolean> => {
    if (!activeTemplateId || !activeTemplate) return false;
    const version = activeTemplate.versions.find((v) => v.id === versionId);
    if (!version) return false;
    try {
      const snapshot = JSON.parse(version.data);
      const data: TemplateData = {
        ...activeTemplate,
        records: snapshot.records || [],
        mappings: snapshot.mappings || [],
        customFields: snapshot.customFields || [],
      };
      await saveTemplateData(activeTemplateId, data);
      setActiveTemplate(data);
      await persistActiveTemplate(data);
      return true;
    } catch {
      return false;
    }
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const doDeleteVersion = useCallback(async (versionId: string) => {
    if (!activeTemplateId || !activeTemplate) return;
    const versions = activeTemplate.versions.filter((v) => v.id !== versionId);
    const data: TemplateData = { ...activeTemplate, versions };
    setActiveTemplate(data);
    await saveTemplateData(activeTemplateId, data);
  }, [activeTemplateId, activeTemplate]);

  return (
    <ExcelContext.Provider value={{
      templates,
      activeTemplateId,
      activeTemplate,
      isLoading,
      refreshTemplates,
      importTemplate,
      switchTemplate,
      deleteTemplate,
      renameTemplate,
      addRecord,
      updateRecord,
      deleteRecord,
      addCustomField,
      createVersion,
      doRollback,
      doDeleteVersion,
    }}>
      {children}
    </ExcelContext.Provider>
  );
}

export function useExcel() {
  const ctx = useContext(ExcelContext);
  if (!ctx) throw new Error('useExcel must be used within ExcelProvider');
  return ctx;
}
