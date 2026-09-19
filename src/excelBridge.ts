import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import { FieldMapping, SheetTab, WorkbookData, SearchResult } from '@/types';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function colLetter(col: number): string {
  let r = '';
  let n = col;
  while (n >= 0) {
    r = String.fromCharCode(65 + (n % 26)) + r;
    n = Math.floor(n / 26) - 1;
  }
  return r;
}

function isMeaningfulHeader(header: string, colIdx: number): boolean {
  // A header is meaningful if it is NOT just the letter fallback for its column
  const letters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const base = letters[colIdx % 26];
  return header !== base;
}

function columnHasData(ws: XLSX.WorkSheet, colIdx: number, headerRow: number, range: XLSX.Range): boolean {
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: colIdx });
    const cell = ws[addr];
    if (cell && cell.v != null && String(cell.v).trim() !== '') return true;
  }
  return false;
}

function detectHeaderRow(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  const maxScan = Math.min(range.e.r - range.s.r, 12);
  let bestRow = range.s.r;
  let bestScore = -1;
  for (let i = 0; i <= maxScan; i++) {
    const r = range.s.r + i;
    let stringCells = 0;
    let numericCells = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell || cell.v == null || cell.v === '') continue;
      const v = cell.v;
      if (typeof v === 'number') numericCells++;
      else if (typeof v === 'string' && isNaN(Number(v))) stringCells++;
    }
    if (stringCells >= 2) {
      const score = stringCells * 2 - numericCells * 5;
      if (score > bestScore) { bestScore = score; bestRow = r; }
    }
  }
  return bestRow;
}

export function readWorkbook(arrayBuffer: ArrayBuffer, fileName: string): WorkbookData {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, cellFormula: true });

  const sheets: SheetTab[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);
    const headerRow = detectHeaderRow(ws, range);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRow, c });
      const cell = ws[addr];
      const v = cell && cell.v != null && String(cell.v).trim() ? String(cell.v).trim() : colLetter(c);
      headers.push(v);
    }
    // Keep only columns that have a real header AND at least one data cell
    const keptIndexes: number[] = [];
    const keptHeaders: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      const colIdx = range.s.c + i;
      if (isMeaningfulHeader(headers[i], colIdx) && columnHasData(ws, colIdx, headerRow, range)) {
        keptIndexes.push(colIdx);
        keptHeaders.push(headers[i]);
      }
    }
    return {
      name,
      rowCount: range.e.r - range.s.r + 1,
      colCount: keptHeaders.length,
      headers: keptHeaders,
      headerRow,
      keptColumnIndexes: keptIndexes,
    };
  });

  const mappings: FieldMapping[] = [];
  const records: Record<string, string | number>[] = [];

  sheets.forEach((sheet) => {
    const ws = wb.Sheets[sheet.name];
    if (!ws) return;
    const ref = ws['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);
    const keptIdx = sheet.keptColumnIndexes || [];

    if (keptIdx.length === 0) return;

    // Read rows manually using only kept columns
    const rowsData: Record<string, string | number>[] = [];
    for (let r = sheet.headerRow + 1; r <= range.e.r; r++) {
      const row: Record<string, string | number> = {};
      let hasAny = false;
      keptIdx.forEach((colIdx) => {
        const cl = colLetter(colIdx);
        const key = sheet.headers[keptIdx.indexOf(colIdx)];
        const addr = XLSX.utils.encode_cell({ r, c: colIdx });
        const cell = ws[addr];
        const v = cell && cell.v != null ? cell.v : '';
        row[key] = v as string | number;
        if (v !== '' && v != null) hasAny = true;
      });
      if (hasAny) rowsData.push(row);
    }

    if (rowsData.length > 0) {
      // Build mappings from kept headers only
      sheet.headers.forEach((header, hIdx) => {
        const colIdx = keptIdx[hIdx];
        const cl = colLetter(colIdx);
        const hasFormula = checkFormulas(ws, colIdx, rowsData.length);
        mappings.push({
          id: uid(),
          labelEn: header,
          labelAr: header,
          sheetName: sheet.name,
          column: cl,
          fieldType: detectType(rowsData, header),
          isFormula: hasFormula,
          formulaTemplate: hasFormula ? getFormula(ws, colIdx, rowsData.length) : undefined,
        });
      });

      // Build records using the same headers as keys
      rowsData.forEach((row, rowIdx) => {
        const rec: Record<string, string | number> = {};
        keptIdx.forEach((colIdx, hIdx) => {
          const cl = colLetter(colIdx);
          const key = `${sheet.name}.${cl}`;
          rec[key] = row[sheet.headers[hIdx]] ?? '';
        });
        rec._sheetName = sheet.name;
        rec._rowIndex = rowIdx + 2;
        records.push(rec);
      });
    }
  });

  return { id: uid(), fileName, sheets, mappings, records, originalBase64: '', createdAt: Date.now(), updatedAt: Date.now() };
}

export async function pickAndParseWorkbook(): Promise<{ arrayBuffer: ArrayBuffer; fileName: string } | null> {
  try {
    const fs = await import('expo-file-system/legacy');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    const file = result.assets[0];
    const fileContent = await fs.readAsStringAsync(file.uri, { encoding: fs.EncodingType.Base64 });
    const binary = atob(fileContent);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { arrayBuffer: bytes.buffer as ArrayBuffer, fileName: file.name };
  } catch {
    return null;
  }
}

function detectType(data: Record<string, string | number>[], header: string): FieldMapping['fieldType'] {
  if (data.length === 0) return 'text';
  const vals = data.slice(0, 20).map((r) => r[header]);
  const numericCount = vals.filter((v) => typeof v === 'number' || (!isNaN(Number(v)) && v !== '')).length;
  if (numericCount > vals.length * 0.7) return 'number';
  const dateCount = vals.filter((v) => typeof v === 'string' && /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(v)).length;
  if (dateCount > vals.length * 0.5) return 'date';
  const unique = new Set(vals.map(String));
  if (unique.size > 0 && unique.size <= 10 && unique.size < vals.length * 0.5) return 'select';
  return 'text';
}

function checkFormulas(ws: XLSX.WorkSheet, colIdx: number, rowCount: number): boolean {
  for (let r = 1; r <= Math.min(rowCount, 5); r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
    if (cell && cell.f) return true;
  }
  return false;
}

function getFormula(ws: XLSX.WorkSheet, colIdx: number, rowCount: number): string {
  for (let r = 1; r <= Math.min(rowCount, 5); r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
    if (cell && cell.f) return cell.f;
  }
  return '';
}

export function writeWorkbook(wbData: WorkbookData, originalBase64: string): ArrayBuffer {
  const binary = atob(originalBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const wb = XLSX.read(bytes.buffer, { type: 'array', cellStyles: true, cellFormula: true });

  wbData.sheets.forEach((sheet) => {
    const ws = wb.Sheets[sheet.name];
    if (!ws) return;
    wbData.records
      .filter((r) => r._sheetName === sheet.name)
      .forEach((record, idx) => {
        const rowIndex = idx + 2;
        sheet.headers.forEach((_, colIdx) => {
          const cl = colLetter(colIdx);
          const key = `${sheet.name}.${cl}`;
          const value = record[key];
          if (value !== undefined && value !== '') {
            const addr = XLSX.utils.encode_cell({ r: rowIndex - 1, c: colIdx });
            if (!ws[addr] || !ws[addr].f) {
              ws[addr] = { t: typeof value === 'number' ? 'n' : 's', v: value };
            }
          }
        });
      });
  });

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true }) as ArrayBuffer;
}

export function searchInWorkbook(wbData: WorkbookData, query: string): SearchResult[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  wbData.sheets.forEach((sheet) => {
    sheet.headers.forEach((header, colIdx) => {
      const cl = colLetter(colIdx);
      wbData.records
        .filter((r) => r._sheetName === sheet.name)
        .forEach((record, rowIdx) => {
          const val = String(record[`${sheet.name}.${cl}`] ?? '');
          if (val.toLowerCase().includes(q) || header.toLowerCase().includes(q)) {
            results.push({ sheet: sheet.name, row: rowIdx + 2, column: cl, header, value: val });
          }
        });
    });
  });
  return results;
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const c = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(c));
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
