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
  headerRow: number;
  keptColumnIndexes: number[];
}


export interface RawCell {
  v: string | number | boolean | null;
  w?: string;
  styleIndex?: number;
  isMergedAnchor?: boolean;
  mergeSpan?: { rowSpan: number; colSpan: number };
}

export interface RawMerge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie';
  title: string;
  labels: string[];
  values: number[];
}

export interface RawImage {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  data: string;
  kind?: 'image' | 'chart';
  chart?: ChartSpec;
}

export interface RawSheet {
  name: string;
  rowCount: number;
  colCount: number;
  matrix: (RawCell | null)[][];
  merges: RawMerge[];
  colWidths?: number[];
  rowHeights?: number[];
  origin: { row: number; col: number };
  images?: RawImage[];
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
  rawSheets?: Record<string, RawSheet>;
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
