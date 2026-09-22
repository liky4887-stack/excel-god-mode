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
  dataUri?: string;
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
  overlays?: GridOverlay[];
  activityLog?: ActivityEntry[];
  cellStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  rowStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  colStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  merges?: CellMerge[];
  newSheets?: Array<{ name: string; headers: string[] }>;
}

export interface TemplateSnapshot {
  meta: TemplateMeta;
  data: TemplateData;
}

export interface GridOverlay {
  id: string;
  sheetName: string;
  row: number;
  col: number;
  type: 'image' | 'chart';
  imageUri?: string;
  chartConfig?: any;
  size?: 'small' | 'medium' | 'large';
  createdAt?: number;
  scalePercent?: number;
}

export interface ActivityEntry {
  id: string;
  ts: number;
  kind: 'image_add' | 'image_move' | 'image_resize' | 'image_delete' | 'chart_add' | 'chart_move' | 'chart_resize' | 'chart_delete' | 'row_add' | 'column_add' | 'cell_edit';
  sheetName: string;
  summary: string;
}

export interface CellMerge {
  sheet: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface NewSheetDef {
  name: string;
  headers?: string[];
}
