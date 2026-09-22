// ============================================================================
// src/xlsxCreate.ts
// Builds a blank .xlsx from scratch using SheetJS. SheetJS community edition
// writes a valid OOXML zip even though it strips styles — irrelevant here
// because we start with nothing.
// ============================================================================

import * as XLSX from 'xlsx';

export interface NewSheetDef {
  name: string;
  headers?: string[];
}

const ILLEGAL = /[:\\/?*\[\]]/g;
const MAX_NAME = 31;

function sanitize(name: string, fallbackIdx: number): string {
  let n = (name || '').replace(ILLEGAL, '_').trim();
  if (!n) n = `Sheet${fallbackIdx}`;
  if (n.length > MAX_NAME) n = n.slice(0, MAX_NAME);
  return n;
}

function uniqueNames(defs: NewSheetDef[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < defs.length; i++) {
    let base = sanitize(defs[i].name, i + 1);
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      name = `${base.slice(0, MAX_NAME - 3)}_${n++}`;
    }
    used.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

const DEFAULT_COLS = 6;
const BLANK_ROWS = 15;

function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function createBlankXlsx(sheets: NewSheetDef[]): Uint8Array {
  const defs: NewSheetDef[] = sheets.length ? sheets : [{ name: 'Sheet1' }];
  const names = uniqueNames(defs);

  const wb = XLSX.utils.book_new();

  for (let i = 0; i < defs.length; i++) {
    const headers = (defs[i].headers || []).slice();
    const colCount = Math.max(headers.length, DEFAULT_COLS);

    // Pad the header row so every column has a header cell (empty if unused)
    while (headers.length < colCount) headers.push('');

    const aoa: any[][] = [headers];
    for (let j = 0; j < BLANK_ROWS; j++) {
      aoa.push(new Array(colCount).fill(''));
    }

    // Build the sheet cell-by-cell so EVERY position has a real cell.
    // aoa_to_sheet() skips empty strings, which would collapse the range.
    const ws: XLSX.WorkSheet = {};
    for (let r = 0; r < aoa.length; r++) {
      for (let c = 0; c < colCount; c++) {
        const ref = `${colLetter(c)}${r + 1}`;
        const v = aoa[r][c];
        if (v === null || v === undefined || v === '') {
          ws[ref] = { t: 's', v: '' };
        } else if (typeof v === 'number') {
          ws[ref] = { t: 'n', v };
        } else {
          ws[ref] = { t: 's', v: String(v) };
        }
      }
    }
    ws['!ref'] = `A1:${colLetter(colCount - 1)}${aoa.length}`;

    XLSX.utils.book_append_sheet(wb, ws, names[i]);
  }

  const out = XLSX.write(wb, {
    type: 'array',
    bookType: 'xlsx',
    bookSST: true,
  }) as ArrayBuffer;

  return new Uint8Array(out);
}
