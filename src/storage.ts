import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkbookData, SaveVersion, FieldMapping } from '@/types';

const WB_KEY = 'egm_workbook';
const VER_PREFIX = 'egm_versions_';
const CF_KEY = 'egm_custom_fields';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

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
  const v: SaveVersion = { id: uid(), workbookId, versionNumber: versions.length + 1, label, data, createdAt: Date.now() };
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
