import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import { FieldMapping, SheetTab, WorkbookData, SearchResult, RawSheet, RawCell, RawMerge } from '@/types';

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



function u8ToBase64(u8: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    const sub = u8.subarray(i, Math.min(i + chunk, u8.length));
    bin += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(bin);
}

function readXmlFile(files: Record<string, any>, path: string): string | null {
  const f = files[path];
  if (!f) return null;
  const content = f.content;
  if (!content) return null;
  if (typeof content === 'string') return content;
  const u8 = content instanceof Uint8Array ? content : new Uint8Array(content);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const baseDir = base.substring(0, base.lastIndexOf('/'));
  const parts = (baseDir + '/' + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function extractImagesForSheet(files: Record<string, any>, sheetPath: string): import('@/types').RawImage[] {
  try {
    const images: import('@/types').RawImage[] = [];
    const sheetFileName = sheetPath.split('/').pop();
    if (!sheetFileName) return images;

    const sheetRelsPath = 'xl/worksheets/_rels/' + sheetFileName + '.rels';
    const sheetRels = readXmlFile(files, sheetRelsPath);
    if (!sheetRels) return images;

    const drawingMatch = /<Relationship[^>]*Type="[^"]*drawing[^"]*"[^>]*Target="([^"]+)"/.exec(sheetRels);
    if (!drawingMatch) return images;

    const drawingPath = resolvePath(sheetPath, drawingMatch[1]);
    const drawingXml = readXmlFile(files, drawingPath);
    if (!drawingXml) return images;

    const drawingFileName = drawingPath.split('/').pop();
    const drawingRelsPath = drawingPath.substring(0, drawingPath.lastIndexOf('/')) + '/_rels/' + drawingFileName + '.rels';
    const drawingRels = readXmlFile(files, drawingRelsPath);

    const anchors = drawingXml.match(/<xdr:(oneCellAnchor|twoCellAnchor)[\s\S]*?<\/xdr:\1>/g) || [];

    for (const anchor of anchors) {
      const fromCol = /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/.exec(anchor);
      const fromRow = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(anchor);
      const toCol = /<xdr:to>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/.exec(anchor);
      const toRow = /<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(anchor);
      const embed = /<a:blip[^>]*r:embed="([^"]+)"/.exec(anchor);
      if (!fromCol || !fromRow || !embed) continue;

      if (!drawingRels) continue;
      const relRegex = new RegExp('<Relationship[^>]*Id="' + embed[1] + '"[^>]*Target="([^"]+)"');
      const relMatch = relRegex.exec(drawingRels);
      if (!relMatch) continue;

      const imgPath = resolvePath(drawingPath, relMatch[1]);
      const imgFile = files[imgPath];
      if (!imgFile || !imgFile.content) continue;

      const bytes = imgFile.content instanceof Uint8Array ? imgFile.content : new Uint8Array(imgFile.content);
      const base64 = u8ToBase64(bytes);

      const startRow = parseInt(fromRow[1]);
      const startCol = parseInt(fromCol[1]);
      const endRow = toRow ? parseInt(toRow[1]) : startRow + 5;
      const endCol = toCol ? parseInt(toCol[1]) : startCol + 4;

      images.push({
        id: 'img_' + startRow + '_' + startCol,
        row: startRow,
        col: startCol,
        rowSpan: Math.max(1, endRow - startRow),
        colSpan: Math.max(1, endCol - startCol),
        data: 'data:image/png;base64,' + base64,
      });
    }
    return images;
  } catch {
    return [];
  }
}

export function readRawSheet(wb: XLSX.WorkBook, sheetName: string): RawSheet {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { name: sheetName, rowCount: 0, colCount: 0, matrix: [], merges: [], origin: { row: 1, col: 1 } };

  const ref = ws['!ref'] || 'A1';
  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;

  const merges: RawMerge[] = (ws['!merges'] || []).map((m: XLSX.Range) => ({
    s: { r: m.s.r, c: m.s.c },
    e: { r: m.e.r, c: m.e.c },
  }));

  const mergeMap = new Map<string, { rowSpan: number; colSpan: number; isAnchor: boolean; skip: boolean }>();
  merges.forEach((m) => {
    const rowSpan = m.e.r - m.s.r + 1;
    const colSpan = m.e.c - m.s.c + 1;
    mergeMap.set(`${m.s.r}-${m.s.c}`, { rowSpan, colSpan, isAnchor: true, skip: false });
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        mergeMap.set(`${r}-${c}`, { rowSpan: 1, colSpan: 1, isAnchor: false, skip: true });
      }
    }
  });

  const matrix: (RawCell | null)[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const row: (RawCell | null)[] = [];
    for (let c = 0; c < colCount; c++) {
      const excelR = range.s.r + r;
      const excelC = range.s.c + c;
      const addr = XLSX.utils.encode_cell({ r: excelR, c: excelC });
      const cell = ws[addr];
      const mInfo = mergeMap.get(`${excelR}-${excelC}`);

      if (mInfo && mInfo.skip) {
        row.push(null);
        continue;
      }

      const rawCell: RawCell = {
        v: cell ? (cell.v as string | number | boolean | null) : null,
        w: cell ? (cell.w || String(cell.v ?? '')) : undefined,
        styleIndex: cell ? (cell.s as number) : undefined,
        isMergedAnchor: mInfo ? mInfo.isAnchor : false,
        mergeSpan: mInfo ? { rowSpan: mInfo.rowSpan, colSpan: mInfo.colSpan } : undefined,
      };
      row.push(rawCell);
    }
    matrix.push(row);
  }

  const colWidths = (ws['!cols'] || []).map((col: XLSX.ColInfo) => col.wch || (col.wpx ? col.wpx / 7 : 120));
  const rowHeights: number[] = (ws['!rows'] || []).map((row: XLSX.RowInfo): number => row.hpt || (row.hpx ? row.hpx : 0)).filter((h: number) => h > 0);


  // Trim trailing fully-empty rows so user-added rows appear where expected
  while (matrix.length > 0) {
    const last = matrix[matrix.length - 1];
    const allEmpty = last.every((c: any) => !c || c.v === null || c.v === undefined || String(c.v).trim() === '');
    if (allEmpty) matrix.pop();
    else break;
  }

  const sheetIndex = wb.SheetNames.indexOf(sheetName);
  const sheetPath = 'xl/worksheets/sheet' + (sheetIndex + 1) + '.xml';
  const images = extractImagesForSheet((wb as any).files, sheetPath);

  return {
    name: sheetName,
    rowCount,
    colCount,
    matrix,
    merges,
    colWidths: colWidths.length > 0 ? colWidths : undefined,
    rowHeights: rowHeights.length > 0 ? rowHeights : undefined,
    origin: { row: range.s.r + 1, col: range.s.c + 1 },
    images: images.length > 0 ? images : undefined,
  };
}

export function readWorkbook(arrayBuffer: ArrayBuffer, fileName: string): WorkbookData {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, cellFormula: true, bookFiles: true } as any);

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

  const rawSheets: Record<string, RawSheet> = {};
  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (ws) rawSheets[sheetName] = readRawSheet(wb, sheetName);
  });

  return { id: uid(), fileName, sheets, mappings, records, rawSheets, originalBase64: '', createdAt: Date.now(), updatedAt: Date.now() };
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
  const wb = XLSX.read(originalBase64, { type: 'base64', cellStyles: true, cellFormula: true });

  // 1. Apply rawSheets matrix edits first (the grid the user edited)
  if (wbData.rawSheets) {
    for (const sheetName of wb.SheetNames) {
      const rawSheet = wbData.rawSheets[sheetName];
      if (!rawSheet || !rawSheet.matrix) continue;
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const originRow = rawSheet.origin?.row ? rawSheet.origin.row - 1 : 0;
      const originCol = rawSheet.origin?.col ? rawSheet.origin.col - 1 : 0;

      for (let r = 0; r < rawSheet.matrix.length; r++) {
        const row = rawSheet.matrix[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (!cell) continue;
          const v = (cell as any).v;
          if (v === undefined || v === null || v === '') continue;

          const addr = XLSX.utils.encode_cell({ r: originRow + r, c: originCol + c });
          const existing = ws[addr];
          if (existing && existing.f) {
            existing.v = v;
          } else {
            ws[addr] = {
              t: typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 's',
              v,
            };
          }
        }
      }

      // Recompute !ref to include any new rows/cols
      const newRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      newRange.e.r = Math.max(newRange.e.r, originRow + rawSheet.matrix.length - 1);
      newRange.e.c = Math.max(newRange.e.c, originCol + rawSheet.colCount - 1);
      ws['!ref'] = XLSX.utils.encode_range(newRange);
    }
  }

  // 2. Legacy: also write records array (backward compat)
  if (wbData.sheets) {
    wbData.sheets.forEach((sheet) => {
      const ws = wb.Sheets[sheet.name];
      if (!ws) return;
      const sheetRecords = (wbData.records || []).filter((r: any) => r._sheetName === sheet.name);
      sheetRecords.forEach((record: any, idx: number) => {
        const rowIndex = idx + 2;
        sheet.headers.forEach((_: any, colIdx: number) => {
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
  }

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true, bookSST: true } as any) as ArrayBuffer;
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
        .forEach((record) => {
          const val = String(record[`${sheet.name}.${cl}`] ?? '');
          if (val.toLowerCase().includes(q) || header.toLowerCase().includes(q)) {
            const actualRow = typeof record._rowIndex === 'number' ? record._rowIndex : 2;
            results.push({ sheet: sheet.name, row: actualRow, column: cl, header, value: val });
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
