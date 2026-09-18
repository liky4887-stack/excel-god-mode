import * as XLSX from 'xlsx';
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

export function readWorkbook(arrayBuffer: ArrayBuffer, fileName: string): WorkbookData {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, cellFormula: true });

  const sheets: SheetTab[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
      const cell = ws[addr];
      headers.push(cell ? String(cell.v ?? '') : colLetter(c));
    }
    return { name, rowCount: range.e.r - range.s.r + 1, colCount: range.e.c - range.s.c + 1, headers };
  });

  const mappings: FieldMapping[] = [];
  const records: Record<string, string | number>[] = [];

  sheets.forEach((sheet) => {
    const ws = wb.Sheets[sheet.name];
    if (!ws) return;
    const jsonData = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' });

    if (jsonData.length > 0) {
      sheet.headers.forEach((header, colIdx) => {
        if (!header) return;
        const cl = colLetter(colIdx);
        const hasFormula = checkFormulas(ws, colIdx, jsonData.length);
        mappings.push({
          id: uid(),
          labelEn: header,
          labelAr: header,
          sheetName: sheet.name,
          column: cl,
          fieldType: detectType(jsonData, header),
          isFormula: hasFormula,
          formulaTemplate: hasFormula ? getFormula(ws, colIdx, jsonData.length) : undefined,
        });
      });

      jsonData.forEach((row, rowIdx) => {
        const rec: Record<string, string | number> = {};
        sheet.headers.forEach((_, colIdx) => {
          const cl = colLetter(colIdx);
          const key = `${sheet.name}.${cl}`;
          rec[key] = row[sheet.headers[colIdx]] ?? '';
        });
        rec._sheetName = sheet.name;
        rec._rowIndex = rowIdx + 2;
        records.push(rec);
      });
    }
  });

  return { id: uid(), fileName, sheets, mappings, records, originalBase64: '', createdAt: Date.now(), updatedAt: Date.now() };
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
