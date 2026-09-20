import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { WorkbookData, FieldMapping, SaveVersion, TemplateMeta, TemplateData, CalculationResult, RawCell, GridOverlay, ActivityEntry, CellMerge } from '@/types';
import {
  listTemplates, getActiveTemplateId, setActiveTemplateId,
  loadTemplateData, saveTemplateData, saveTemplateMeta, saveOverlays, loadOverlays,
  saveVersion as saveVersionLegacy, getVersions, deleteVersion as deleteVersionLegacy,
  saveCustomFields, loadCustomFields,
  deleteTemplate as deleteTemplateStorage,
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
  updateRawCell: (sheetName: string, row: number, col: number, value: string) => Promise<void>;
  addRawRow: (sheetName: string) => Promise<void>;
  addRawColumn: (sheetName: string) => Promise<void>;
  addRawColumnNamed: (sheetName: string, name: string) => Promise<void>;
  insertRawRow: (sheetName: string, atRow: number) => Promise<void>;
  insertRawColumn: (sheetName: string, atCol: number) => Promise<void>;
  updateRawImage: (sheetName: string, imageId: string, patch: { rowSpan?: number; colSpan?: number }) => Promise<void>;
  deleteRawImage: (sheetName: string, imageId: string) => Promise<void>;
  addRawImage: (sheetName: string, row: number, col: number, dataUri: string) => Promise<void>;
  addRawChart: (sheetName: string, row: number, col: number, spec: import('@/types').ChartSpec) => Promise<void>;
  navigationTarget: { sheet: string; row: number; col: number; nonce: number } | null;
  setNavigationTarget: (t: { sheet: string; row: number; col: number; nonce: number } | null) => void;
  addOverlay: (overlay: GridOverlay) => Promise<void>;
  overlays: GridOverlay[];
  updateOverlay: (id: string, updates: Partial<GridOverlay>) => Promise<void>;
  deleteOverlay: (id: string) => Promise<void>;
  activityLog: import('@/types').ActivityEntry[];
  updateCellStyle: (sheetName: string, row: number, col: number, style: { bold?: boolean; bg?: string }) => Promise<void>;
  updateCellAndStyle: (sheetName: string, row0: number, col0: number, value: string, style: { bold?: boolean; bg?: string }) => Promise<void>;
  updateRowStyle: (sheetName: string, row: number, style: { bold?: boolean; bg?: string }) => Promise<void>;
  updateColStyle: (sheetName: string, col: number, style: { bold?: boolean; bg?: string }) => Promise<void>;
  moveRow: (sheetName: string, row: number, delta: number) => Promise<void>;
  moveColumn: (sheetName: string, col: number, delta: number) => Promise<void>;
  rowStyles: Record<string, Record<string, { bold?: boolean; bg?: string }>>;
  colStyles: Record<string, Record<string, { bold?: boolean; bg?: string }>>;
  addMerge: (sheetName: string, r1: number, c1: number, r2: number, c2: number) => Promise<void>;
  removeMerge: (sheetName: string, r1: number, c1: number) => Promise<void>;
  merges: CellMerge[];
  cellStyles: Record<string, Record<string, { bold?: boolean; bg?: string }>>;
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
  const [navigationTarget, setNavigationTarget] = useState<{ sheet: string; row: number; col: number; nonce: number } | null>(null);
  const [overlays, setOverlays] = useState<GridOverlay[]>([]);
  const overlaysRef = useRef<GridOverlay[]>([]);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ id: string; data: any } | null>(null);
  const originalBase64Ref = useRef<string>('');

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
        let data = await loadTemplateData(activeId);
        // Migration: if rawSheets is missing, re-parse the stored original file
        if (data && !data.workbook.rawSheets && data.workbook.originalBase64) {
          try {
            const bin = atob(data.workbook.originalBase64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const fresh = readWorkbook(bytes.buffer as ArrayBuffer, data.workbook.fileName);
            data = {
              ...data,
              workbook: { ...fresh, originalBase64: data.workbook.originalBase64 },
            };
            try { const wb: any = data.workbook || {}; const { originalBase64: _o, ...sw } = wb; await saveTemplateData(activeId, { ...data, workbook: sw } as any); } catch {}
          } catch {}
        }
        if (cancelled) return;
        setActiveTemplateIdState(activeId);
        setActiveTemplate(data);
        const loaded = await loadOverlays(activeId);
        overlaysRef.current = loaded;
        setOverlays(loaded);
      }
      setIsLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Auto-snapshot is triggered by persistActiveTemplate via autoSnapshot()

  const persistRef = useRef<((data: TemplateData, opts?: { immediate?: boolean }) => void) | null>(null);

    const logActivity = useCallback(async (entry: Omit<ActivityEntry, 'id' | 'ts'>) => {
    if (!activeTemplateId || !activeTemplate) return;
    const newEntry: ActivityEntry = {
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      ...entry,
    };
    const next = [newEntry, ...(activeTemplate.activityLog || [])].slice(0, 500);
    const data: TemplateData = { ...activeTemplate, activityLog: next };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: false });
  }, [activeTemplateId, activeTemplate]);

    const addMerge = useCallback(async (sheetName: string, r1: number, c1: number, r2: number, c2: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const current = activeTemplate.merges || [];
    const rowLo = Math.min(r1, r2), rowHi = Math.max(r1, r2);
    const colLo = Math.min(c1, c2), colHi = Math.max(c1, c2);

    // Reject single-cell (1x1) merges
    if (rowLo === rowHi && colLo === colHi) {
      if (__DEV__) console.log('[addMerge] rejected 1x1 merge');
      return;
    }

    // Reject if overlapping any existing merge
    const overlaps = current.some((m) =>
      m.sheet === sheetName &&
      !(m.r2 < rowLo || m.r1 > rowHi || m.c2 < colLo || m.c1 > colHi)
    );
    if (overlaps) {
      if (__DEV__) console.log('[addMerge] rejected overlapping merge');
      return;
    }

    const next = [...current, { sheet: sheetName, r1: rowLo, c1: colLo, r2: rowHi, c2: colHi }];
    const data: TemplateData = { ...activeTemplate, merges: next };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
    if (__DEV__) console.log('[addMerge]', sheetName, `${rowLo}_${colLo}`, 'to', `${rowHi}_${colHi}`);
  }, [activeTemplateId, activeTemplate]);

  const removeMerge = useCallback(async (sheetName: string, r1: number, c1: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const current = activeTemplate.merges || [];
    const next = current.filter((m) => !(m.sheet === sheetName && m.r1 === r1 && m.c1 === c1));
    const data: TemplateData = { ...activeTemplate, merges: next };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate]);

  const updateRowStyle = useCallback(async (sheetName: string, row: number, style: { bold?: boolean; bg?: string }) => {
    if (!activeTemplateId || !activeTemplate) return;
    const current = activeTemplate.rowStyles || {};
    const sheetStyles = { ...(current[sheetName] || {}) };
    const key = String(row);
    const existing = sheetStyles[key] || {};
    const next = { ...existing, ...style };
    if (next.bold === false) delete (next as any).bold;
    if (!next.bg || next.bg === 'none') delete (next as any).bg;
    if (Object.keys(next).length === 0) delete sheetStyles[key];
    else sheetStyles[key] = next;
    const nextAll = { ...current };
    if (Object.keys(sheetStyles).length === 0) delete nextAll[sheetName];
    else nextAll[sheetName] = sheetStyles;
    const data: TemplateData = { ...activeTemplate, rowStyles: nextAll };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate]);

  const updateColStyle = useCallback(async (sheetName: string, col: number, style: { bold?: boolean; bg?: string }) => {
    if (!activeTemplateId || !activeTemplate) return;
    const current = activeTemplate.colStyles || {};
    const sheetStyles = { ...(current[sheetName] || {}) };
    const key = String(col);
    const existing = sheetStyles[key] || {};
    const next = { ...existing, ...style };
    if (next.bold === false) delete (next as any).bold;
    if (!next.bg || next.bg === 'none') delete (next as any).bg;
    if (Object.keys(next).length === 0) delete sheetStyles[key];
    else sheetStyles[key] = next;
    const nextAll = { ...current };
    if (Object.keys(sheetStyles).length === 0) delete nextAll[sheetName];
    else nextAll[sheetName] = sheetStyles;
    const data: TemplateData = { ...activeTemplate, colStyles: nextAll };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate]);

  const moveRow = useCallback(async (sheetName: string, row: number, delta: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const matrix = sheet.matrix.map((r: any[]) => [...r]);
    const fromIdx = row - (sheet.origin?.row ?? 1);
    const toIdx = fromIdx + delta;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= matrix.length || toIdx >= matrix.length) return;
    const tmp = matrix[fromIdx];
    matrix[fromIdx] = matrix[toIdx];
    matrix[toIdx] = tmp;
    rawSheets[sheetName] = { ...sheet, matrix };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate]);

  const moveColumn = useCallback(async (sheetName: string, col: number, delta: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const fromIdx = col;
    const toIdx = col + delta;
    if (fromIdx < 0 || toIdx < 0 || toIdx >= sheet.colCount) return;
    const matrix = sheet.matrix.map((r: any[]) => {
      const nr = [...r];
      const tmp = nr[fromIdx];
      nr[fromIdx] = nr[toIdx];
      nr[toIdx] = tmp;
      return nr;
    });
    rawSheets[sheetName] = { ...sheet, matrix };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate]);

  const updateCellAndStyle = useCallback(async (
    sheetName: string,
    row0: number,
    col0: number,
    value: string,
    style: { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }
  ) => {
    if (!activeTemplateId || !activeTemplate) return;

    // 1. Update cell value in rawSheets
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (sheet) {
      const matrix = sheet.matrix.map((r: any[]) => [...r]);
      if (matrix[row0]) {
        const existing = matrix[row0][col0];
        matrix[row0][col0] = existing
          ? { ...existing, v: value, w: value }
          : { v: value, w: value };
        rawSheets[sheetName] = { ...sheet, matrix };
      }
    }

    // 2. Update cell style — convert grid row index to Excel row number
    const originRow = sheet?.origin?.row ?? 1;
    const excelRow = originRow + row0;
    const current = activeTemplate.cellStyles || {};
    const sheetStyles = { ...(current[sheetName] || {}) };
    const key = `${excelRow}_${col0}`;
    const existingStyle = sheetStyles[key] || {};
    const nextStyle = { ...existingStyle, ...style };
    if (nextStyle.bold === false) delete (nextStyle as any).bold;
    if (!nextStyle.bg || nextStyle.bg === 'none') delete (nextStyle as any).bg;
    if (!nextStyle.align) delete (nextStyle as any).align;
    if (Object.keys(nextStyle).length === 0) {
      delete sheetStyles[key];
    } else {
      sheetStyles[key] = nextStyle;
    }
    const nextAll = { ...current };
    if (Object.keys(sheetStyles).length === 0) {
      delete nextAll[sheetName];
    } else {
      nextAll[sheetName] = sheetStyles;
    }

    // 3. Single atomic write — no clobbering
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
      cellStyles: nextAll,
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate]);

  const updateCellStyle = useCallback(async (sheetName: string, row: number, col: number, style: { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }) => {
    if (!activeTemplateId || !activeTemplate) return;
    const current = activeTemplate.cellStyles || {};
    const sheetStyles = { ...(current[sheetName] || {}) };
    const key = `${row}_${col}`;
    const existing = sheetStyles[key] || {};
    const next = { ...existing, ...style };
    // Remove keys that are false/empty to keep the map small
    if (next.bold === false) delete (next as any).bold;
    if (!next.bg || next.bg === 'none') delete (next as any).bg;
    if (Object.keys(next).length === 0) {
      delete sheetStyles[key];
    } else {
      sheetStyles[key] = next;
    }
    const nextAll = { ...current };
    if (Object.keys(sheetStyles).length === 0) {
      delete nextAll[sheetName];
    } else {
      nextAll[sheetName] = sheetStyles;
    }
    const data: TemplateData = { ...activeTemplate, cellStyles: nextAll };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate]);

  const addOverlay = useCallback(async (overlay: GridOverlay) => {
    if (!activeTemplateId) return;
    const next = [...overlaysRef.current, overlay];
    overlaysRef.current = next;
    setOverlays(next);
    try { await saveOverlays(activeTemplateId, next); } catch (e) {}
    logActivity({
      kind: overlay.type === 'image' ? 'image_add' : 'chart_add',
      sheetName: overlay.sheetName,
      summary: (overlay.type === 'image' ? 'Added image' : 'Added chart') + ' at ' + overlay.row + ',' + overlay.col,
    });
  }, [activeTemplateId, logActivity]);

  const updateOverlay = useCallback(async (id: string, updates: Partial<GridOverlay>) => {
    if (!activeTemplateId) return;
    const existing = overlaysRef.current.find((o) => o.id === id);
    const next = overlaysRef.current.map((o) => o.id === id ? { ...o, ...updates } : o);
    overlaysRef.current = next;
    setOverlays(next);
    try { await saveOverlays(activeTemplateId, next); } catch (e) {}
    if (existing) {
      const isResize = 'size' in updates || 'scalePercent' in updates;
      const isMove = 'row' in updates || 'col' in updates;
      logActivity({
        kind: existing.type === 'image' ? (isResize ? 'image_resize' : 'image_move') : (isResize ? 'chart_resize' : 'chart_move'),
        sheetName: existing.sheetName,
        summary: (existing.type === 'image' ? 'Image' : 'Chart') + (isResize ? ' resized' : ' moved to ' + (updates.row ?? existing.row) + ',' + (updates.col ?? existing.col)),
      });
    }
  }, [activeTemplateId, logActivity]);

  const deleteOverlay = useCallback(async (id: string) => {
    if (!activeTemplateId) return;
    const existing = overlaysRef.current.find((o) => o.id === id);
    const next = overlaysRef.current.filter((o) => o.id !== id);
    overlaysRef.current = next;
    setOverlays(next);
    try { await saveOverlays(activeTemplateId, next); } catch (e) {}
    if (existing) {
      logActivity({
        kind: existing.type === 'image' ? 'image_delete' : 'chart_delete',
        sheetName: existing.sheetName,
        summary: (existing.type === 'image' ? 'Image' : 'Chart') + ' deleted',
      });
    }
  }, [activeTemplateId, logActivity]);

  const flushPersist = useCallback(async () => {
    const pending = pendingPersistRef.current;
    if (!pending) return;
    pendingPersistRef.current = null;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    try {
      await saveTemplateData(pending.id, pending.data);
      const meta = templates.find((t) => t.id === pending.id);
      if (meta) {
        const updatedMeta: TemplateMeta = {
          ...meta,
          recordCount: pending.data.records.length,
          columnCount: pending.data.mappings.length,
          sheetCount: pending.data.workbook.sheets.length,
          lastEditedAt: Date.now(),
        };
        await saveTemplateMeta(updatedMeta);
        setTemplates((prev) => prev.map((t) => t.id === pending.id ? updatedMeta : t));
      }
    } catch (e) {
      if (__DEV__) console.warn('[persist] save failed:', e);
    }
  }, [templates]);

  const persistActiveTemplate = useCallback((data: TemplateData, opts?: { immediate?: boolean }) => {
    if (!activeTemplateId) return;
    pendingPersistRef.current = { id: activeTemplateId, data };

    if (opts?.immediate) {
      flushPersist();
      return;
    }

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      flushPersist();
    }, 300);
  }, [activeTemplateId, flushPersist]);

  useEffect(() => {
    persistRef.current = persistActiveTemplate;
  }, [persistActiveTemplate]);

  // Flush pending saves when the app goes to background (user leaves the app)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        flushPersist();
      }
    });
    return () => sub.remove();
  }, [flushPersist]);

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

    // Copy the picked .xlsx into PERMANENT storage so it survives cache cleanup.
    // The document picker returns a temp/cache URI that the OS clears.
    let permanentUri = fileUri;
    try {
      const dir = `${FileSystem.documentDirectory}templates/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      permanentUri = `${dir}${id}.xlsx`;
      await FileSystem.copyAsync({ from: fileUri, to: permanentUri });
    } catch (e) {
      // If copy fails, fall back to original URI — export will still try
      if (__DEV__) console.warn('[import] failed to copy source file:', e);
    }
    const meta: TemplateMeta = {
      id,
      name: fileName.replace(/\.(xlsx|xls)$/, ''),
      fileName,
      originalFileUri: permanentUri,
      importedAt: Date.now(),
      sheetCount: wb.sheets.length,
      columnCount: wb.mappings.length,
      recordCount: wb.records.length,
      lastEditedAt: Date.now(),
    };

    // Keep the base64 outside React state so re-renders stay light.
    originalBase64Ref.current = base64;

    const data: TemplateData = {
      workbook: { ...wb, originalBase64: '', originalFileUri: permanentUri } as any,
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
    const loaded = await loadOverlays(id);
    overlaysRef.current = loaded;
    setOverlays(loaded);
  }, []);

  const switchTemplate = useCallback(async (id: string) => {
    const data = await loadTemplateData(id);
    if (!data) return;
    await setActiveTemplateId(id);
    setActiveTemplateIdState(id);
    setActiveTemplate(data);
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    await deleteTemplateStorage(id);
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
    persistRef.current?.(data, { immediate: true });
    await autoSnapshot(data);
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const updateRecord = useCallback(async (index: number, record: Record<string, string | number>) => {
    if (!activeTemplateId || !activeTemplate) return;
    const records = [...activeTemplate.records];
    records[index] = record;
    const data: TemplateData = { ...activeTemplate, records };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
    await autoSnapshot(data);
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const deleteRecord = useCallback(async (index: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const records = activeTemplate.records.filter((_, i) => i !== index);
    const data: TemplateData = { ...activeTemplate, records };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
    await autoSnapshot(data);
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const updateRawCell = useCallback(async (sheetName: string, row: number, col: number, value: string) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const matrix = sheet.matrix.map((r) => r.slice());
    if (!matrix[row]) return;
    const cell = matrix[row][col];
    if (cell) {
      matrix[row][col] = { ...cell, v: value, w: value };
    } else {
      matrix[row][col] = { v: value, w: value };
    }
    rawSheets[sheetName] = { ...sheet, matrix };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const addRawRow = useCallback(async (sheetName: string) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const matrix = sheet.matrix.map((r) => r.slice());
    const newRow: (RawCell | null)[] = Array.from({ length: sheet.colCount }, () => ({ v: '' }));
    matrix.push(newRow);
    rawSheets[sheetName] = { ...sheet, matrix, rowCount: sheet.rowCount + 1 };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const addRawColumn = useCallback(async (sheetName: string) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;

    // Find header row: first row with 2+ non-empty cells
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(sheet.matrix.length, 5); r++) {
      const nonEmpty = (sheet.matrix[r] || []).filter(
        (c) => c && c.v !== null && c.v !== undefined && String(c.v).trim() !== ''
      ).length;
      if (nonEmpty >= 2) { headerRowIdx = r; break; }
    }

    const matrix = sheet.matrix.map((r) => {
      const nr = r.slice();
      nr.push({ v: '' });
      return nr;
    });
    const colWidths = [...(sheet.colWidths || []), 120];
    rawSheets[sheetName] = { ...sheet, matrix, colCount: sheet.colCount + 1, colWidths };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const insertRawRow = useCallback(async (sheetName: string, atRow: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const matrix = sheet.matrix.map((r) => r.slice());
    const newRow: (RawCell | null)[] = Array.from({ length: sheet.colCount }, () => ({ v: '' }));
    matrix.splice(atRow, 0, newRow);
    rawSheets[sheetName] = { ...sheet, matrix, rowCount: sheet.rowCount + 1 };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const insertRawColumn = useCallback(async (sheetName: string, atCol: number) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const matrix = sheet.matrix.map((r) => {
      const nr = r.slice();
      nr.splice(atCol, 0, { v: '' });
      return nr;
    });
    const colWidths = [...(sheet.colWidths || [])];
    colWidths.splice(atCol, 0, 120);
    rawSheets[sheetName] = { ...sheet, matrix, colCount: sheet.colCount + 1, colWidths };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const updateRawImage = useCallback(async (sheetName: string, imageId: string, patch: { rowSpan?: number; colSpan?: number }) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet || !sheet.images) return;
    const images = sheet.images.map((img) => img.id === imageId ? { ...img, ...patch } : img);
    rawSheets[sheetName] = { ...sheet, images };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const deleteRawImage = useCallback(async (sheetName: string, imageId: string) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet || !sheet.images) return;
    const images = sheet.images.filter((img) => img.id !== imageId);
    rawSheets[sheetName] = { ...sheet, images };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const addRawColumnNamed = useCallback(async (sheetName: string, name: string) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;

    // Find the header row: first row with 2+ non-empty cells
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(sheet.matrix.length, 10); r++) {
      const nonEmpty = (sheet.matrix[r] || []).filter(
        (c) => c && c.v !== null && c.v !== undefined && String(c.v).trim() !== ''
      ).length;
      if (nonEmpty >= 2) { headerRowIdx = r; break; }
    }

    const matrix = sheet.matrix.map((r, rIdx) => {
      const nr = r.slice();
      nr.push(rIdx === headerRowIdx ? { v: name } : { v: '' });
      return nr;
    });
    const colWidths = [...(sheet.colWidths || []), 140];
    rawSheets[sheetName] = { ...sheet, matrix, colCount: sheet.colCount + 1, colWidths };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const addRawImage = useCallback(async (sheetName: string, row: number, col: number, dataUri: string) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const images = [...(sheet.images || []), {
      id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      row, col,
      rowSpan: 6,
      colSpan: 6,
      data: dataUri,
    }];
    rawSheets[sheetName] = { ...sheet, images };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const addRawChart = useCallback(async (sheetName: string, row: number, col: number, spec: import('@/types').ChartSpec) => {
    if (!activeTemplateId || !activeTemplate) return;
    const rawSheets = { ...(activeTemplate.workbook.rawSheets || {}) };
    const sheet = rawSheets[sheetName];
    if (!sheet) return;
    const images = [...(sheet.images || []), {
      id: 'chart_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      row, col,
      rowSpan: 8,
      colSpan: 8,
      data: '',
      kind: 'chart' as const,
      chart: spec,
    }];
    rawSheets[sheetName] = { ...sheet, images };
    const data: TemplateData = {
      ...activeTemplate,
      workbook: { ...activeTemplate.workbook, rawSheets },
    };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
  }, [activeTemplateId, activeTemplate, persistActiveTemplate]);

  const addCustomField = useCallback(async (field: FieldMapping) => {
    if (!activeTemplateId || !activeTemplate) return;
    const customFields = [...activeTemplate.customFields, field];
    const mappings = [...activeTemplate.mappings, field];
    const data: TemplateData = { ...activeTemplate, customFields, mappings };
    setActiveTemplate(data);
    persistRef.current?.(data, { immediate: true });
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
      persistRef.current?.(data, { immediate: true });
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
      updateRawCell,
      addRawRow,
      addRawColumn,
      addRawColumnNamed,
      insertRawRow,
      insertRawColumn,
      updateRawImage,
      deleteRawImage,
      addRawImage,
      addRawChart,
      navigationTarget,
      setNavigationTarget,
      activityLog: (activeTemplate?.activityLog || []),
      updateCellStyle,
      updateCellAndStyle,
      addMerge,
      removeMerge,
      merges: (activeTemplate?.merges || []),
      updateRowStyle,
      updateColStyle,
      moveRow,
      moveColumn,
      rowStyles: (activeTemplate?.rowStyles || {}),
      colStyles: (activeTemplate?.colStyles || {}),
      cellStyles: (activeTemplate?.cellStyles || {}),
      addOverlay,
      updateOverlay,
      deleteOverlay,
      overlays,
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
