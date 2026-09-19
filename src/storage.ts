import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { WorkbookData, SaveVersion, FieldMapping, TemplateMeta, TemplateData } from '@/types';

// ===== Legacy keys (backward compat) =====
const WB_KEY = 'egm_workbook';
const VER_PREFIX = 'egm_versions_';
const CF_KEY = 'egm_custom_fields';

// ===== Multi-Template keys =====
const TEMPLATES_INDEX_KEY = 'egm_templates_index';
const ACTIVE_TEMPLATE_KEY = 'egm_active_template_id';
const TEMPLATE_DATA_PREFIX = 'egm_template_data_';

// ===== File-system storage for large template payloads =====
// AsyncStorage on Android is SQLite-backed with a ~2MB per-key CursorWindow
// limit. Template data (rawSheets + originalBase64) routinely exceeds it,
// so we store the full payload as a JSON file and keep only small metadata
// (index + active id) in AsyncStorage.
const TEMPLATE_DIR = `${FileSystem.documentDirectory}templates/`;

async function ensureTemplateDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(TEMPLATE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(TEMPLATE_DIR, { intermediates: true });
    }
  } catch {}
}

function templateDataPath(id: string): string {
  return `${TEMPLATE_DIR}${id}.json`;
}

// ===== Legacy functions =====
export async function saveWorkbook(wb: WorkbookData, originalBase64?: string): Promise<void> {
  const toSave = originalBase64 ? { ...wb, originalBase64, updatedAt: Date.now() } : { ...wb, updatedAt: Date.now() };
  await AsyncStorage.setItem(WB_KEY, JSON.stringify(toSave));
}

export async function loadWorkbook(): Promise<WorkbookData | null> {
  const data = await AsyncStorage.getItem(WB_KEY);
  return data ? (JSON.parse(data) as WorkbookData) : null;
}

export async function saveVersion(workbookId: string, label: string, data: string): Promise<SaveVersion> {
  const versions = await getVersions(workbookId);
  const v: SaveVersion = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9), workbookId, versionNumber: versions.length + 1, label, data, createdAt: Date.now() };
  versions.unshift(v);
  await AsyncStorage.setItem(`${VER_PREFIX}${workbookId}`, JSON.stringify(versions));
  return v;
}

export async function getVersions(workbookId: string): Promise<SaveVersion[]> {
  const data = await AsyncStorage.getItem(`${VER_PREFIX}${workbookId}`);
  return data ? (JSON.parse(data) as SaveVersion[]) : [];
}

export async function deleteVersion(workbookId: string, versionId: string): Promise<void> {
  const versions = (await getVersions(workbookId)).filter((v) => v.id !== versionId);
  await AsyncStorage.setItem(`${VER_PREFIX}${workbookId}`, JSON.stringify(versions));
}

export async function rollbackToVersion(workbookId: string, versionId: string): Promise<WorkbookData | null> {
  const v = (await getVersions(workbookId)).find((v) => v.id === versionId);
  if (!v) return null;
  const wb = JSON.parse(v.data) as WorkbookData;
  await saveWorkbook(wb);
  return wb;
}

export async function saveCustomFields(fields: FieldMapping[]): Promise<void> {
  await AsyncStorage.setItem(CF_KEY, JSON.stringify(fields));
}

export async function loadCustomFields(): Promise<FieldMapping[]> {
  const data = await AsyncStorage.getItem(CF_KEY);
  return data ? (JSON.parse(data) as FieldMapping[]) : [];
}

// ===== Multi-Template Functions =====

export async function listTemplates(): Promise<TemplateMeta[]> {
  const data = await AsyncStorage.getItem(TEMPLATES_INDEX_KEY);
  return data ? (JSON.parse(data) as TemplateMeta[]) : [];
}

export async function getActiveTemplateId(): Promise<string | null> {
  const id = await AsyncStorage.getItem(ACTIVE_TEMPLATE_KEY);
  return id || null;
}

export async function setActiveTemplateId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_TEMPLATE_KEY, id);
}

export async function loadTemplateData(id: string): Promise<TemplateData | null> {
  // 1. Try file on disk first (this is the only path that works for big payloads)
  try {
    const path = templateDataPath(id);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const json = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return JSON.parse(json) as TemplateData;
    }
  } catch {}

  // 2. Fall back to legacy AsyncStorage key — this will throw for >2MB
  //    payloads, which we swallow so the app boots. If it succeeds, migrate
  //    to disk and drop the old key.
  try {
    const raw = await AsyncStorage.getItem(`${TEMPLATE_DATA_PREFIX}${id}`);
    if (raw) {
      const parsed = JSON.parse(raw) as TemplateData;
      try {
        await saveTemplateData(id, parsed);
        await AsyncStorage.removeItem(`${TEMPLATE_DATA_PREFIX}${id}`);
      } catch {}
      return parsed;
    }
  } catch {}

  return null;
}

export async function saveTemplateData(id: string, data: TemplateData): Promise<void> {
  await ensureTemplateDir();
  const json = JSON.stringify(data);
  await FileSystem.writeAsStringAsync(templateDataPath(id), json, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  // Remove template data file
  try {
    await FileSystem.deleteAsync(templateDataPath(id), { idempotent: true });
  } catch {}
  // Remove legacy AsyncStorage key if still present (may fail silently if huge)
  try {
    await AsyncStorage.removeItem(`${TEMPLATE_DATA_PREFIX}${id}`);
  } catch {}
  // Remove from index
  const templates = (await listTemplates()).filter((t) => t.id !== id);
  await AsyncStorage.setItem(TEMPLATES_INDEX_KEY, JSON.stringify(templates));
  // If active, clear active
  const active = await getActiveTemplateId();
  if (active === id) {
    await setActiveTemplateId('');
  }
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  const templates = (await listTemplates()).map((t) => t.id === id ? { ...t, name, lastEditedAt: Date.now() } : t);
  await AsyncStorage.setItem(TEMPLATES_INDEX_KEY, JSON.stringify(templates));
}

export async function saveTemplateMeta(meta: TemplateMeta): Promise<void> {
  const templates = (await listTemplates()).filter((t) => t.id !== meta.id);
  templates.unshift(meta);
  await AsyncStorage.setItem(TEMPLATES_INDEX_KEY, JSON.stringify(templates));
}
