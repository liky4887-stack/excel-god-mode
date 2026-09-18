export type Language = 'ar' | 'en';

export type FieldType = 'text' | 'number' | 'date' | 'select';

export interface FieldMapping {
  id: string;
  labelEn: string;
  labelAr: string;
  sheetName: string;
  column: string;
  fieldType: FieldType;
  isFormula?: boolean;
  formulaTemplate?: string;
  options?: string[];
  isCustom?: boolean;
}

export interface SheetTab {
  name: string;
  rowCount: number;
  colCount: number;
  headers: string[];
}

export interface WorkbookData {
  id: string;
  fileName: string;
  sheets: SheetTab[];
  mappings: FieldMapping[];
  records: Record<string, string | number>[];
  originalBase64: string;
  createdAt: number;
  updatedAt: number;
}

export interface SaveVersion {
  id: string;
  workbookId: string;
  versionNumber: number;
  label: string;
  data: string;
  createdAt: number;
}

export interface CalculationResult {
  fieldId: string;
  label: string;
  formula: string;
  result: string | number;
  isValid: boolean;
  error?: string;
}

export interface SearchResult {
  sheet: string;
  row: number;
  column: string;
  header: string;
  value: string;
}

// ===== Multi-Template Types =====

export interface TemplateMeta {
  id: string;
  name: string;
  fileName: string;
  originalFileUri: string;
  importedAt: number;
  sheetCount: number;
  columnCount: number;
  recordCount: number;
  lastEditedAt: number;
}

export interface TemplateData {
  workbook: WorkbookData;
  mappings: FieldMapping[];
  records: Record<string, string | number>[];
  customFields: FieldMapping[];
  versions: SaveVersion[];
}

export interface TemplateSnapshot {
  meta: TemplateMeta;
  data: TemplateData;
}
