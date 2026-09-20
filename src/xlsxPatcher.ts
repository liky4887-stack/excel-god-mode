// ============================================================================
// src/xlsxPatcher.ts
//
// Surgical .xlsx patcher: instead of letting SheetJS rebuild the file (which
// strips styles, merges, drawings, print setup, and VBA), we open the original
// .xlsx as a raw ZIP and patch ONLY the value nodes inside each sheet's XML.
// Every other byte — styles, theme, merges, drawings, images, formulas — is
// copied through untouched.
// ============================================================================

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import type { WorkbookData, CellMerge } from '@/types';
import { createStyleRegistrar } from './xlsxStyles';
import { injectUserImages } from './xlsxImages';

// ---------------------------------------------------------------------------
// XML escaping
// ---------------------------------------------------------------------------

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Column helpers (A1 notation)
// ---------------------------------------------------------------------------

function colToIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function indexToCol(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function makeRef(row0: number, col0: number): string {
  return indexToCol(col0) + (row0 + 1);
}

function parseRef(ref: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: colToIndex(m[1].toUpperCase()), row: parseInt(m[2], 10) - 1 };
}

// ---------------------------------------------------------------------------
// Workbook structure discovery
// ---------------------------------------------------------------------------

interface SheetInfo {
  name: string;
  path: string;
}

function parseRels(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<Relationship\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) out[id] = target;
  }
  return out;
}

function findSheets(files: Record<string, Uint8Array>): SheetInfo[] {
  const wbPath = 'xl/workbook.xml';
  const relsPath = 'xl/_rels/workbook.xml.rels';
  if (!files[wbPath] || !files[relsPath]) return [];

  const wbXml = strFromU8(files[wbPath]);
  const rels = parseRels(strFromU8(files[relsPath]));

  const sheets: SheetInfo[] = [];
  const re = /<sheet\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wbXml))) {
    const name = /name="([^"]+)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name || !rid) continue;
    let target = rels[rid] || '';
    if (target.startsWith('/')) target = target.slice(1);
    else if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\//, '');
    sheets.push({ name, path: target });
  }
  return sheets;
}

// ---------------------------------------------------------------------------
// Cell content generation
// ---------------------------------------------------------------------------

interface CellContent {
  inner: string;
  typeAttr: string; // ' t="..."' or ''
}

function buildCellContent(value: string | number | boolean | null | undefined): CellContent {
  if (value === null || value === undefined) return { inner: '', typeAttr: '' };
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { inner: `<v>${value}</v>`, typeAttr: ' t="n"' };
  }
  if (typeof value === 'boolean') {
    return { inner: `<v>${value ? 1 : 0}</v>`, typeAttr: ' t="b"' };
  }
  const s = String(value);
  if (s === '') return { inner: '', typeAttr: '' };
  return {
    inner: `<is><t xml:space="preserve">${escXml(s)}</t></is>`,
    typeAttr: ' t="inlineStr"',
  };
}

// ---------------------------------------------------------------------------
// Cell-level patching
// ---------------------------------------------------------------------------

/**
 * Replace a cell in the sheet XML while preserving:
 * - the `s="..."` (style index) attribute
 * - all other attributes we don't recognize
 * Skip cells that have a formula (we don't want to break formulas).
 */
function patchCell(sheetXml: string, ref: string, value: any, skipIfFormula: boolean): string {
  const cellRe = new RegExp(
    `<c\\s+r="${ref}"([^>]*?)(\\/>|>([\\s\\S]*?)<\\/c>)`
  );
  const m = cellRe.exec(sheetXml);
  const { inner, typeAttr } = buildCellContent(value);

  if (m) {
    const attrs = m[1] || '';
    const closing = m[2] || '';
    const existingInner = m[3] ?? '';

    if (skipIfFormula && /<f[\s>]/.test(existingInner)) {
      return sheetXml; // leave formula cells alone
    }

    // Preserve s=... style attribute only
    const sMatch = /\ss="[^"]*"/.exec(attrs);
    const styleAttr = sMatch ? sMatch[0] : '';
    const newAttrStr = styleAttr + typeAttr;

    let newCell: string;
    if (inner === '') {
      newCell = `<c r="${ref}"${newAttrStr}/>`;
    } else {
      newCell = `<c r="${ref}"${newAttrStr}>${inner}</c>`;
    }

    return sheetXml.slice(0, m.index) + newCell + sheetXml.slice(m.index + m[0].length);
  }

  // Cell doesn't exist — insert it
  return insertCell(sheetXml, ref, value);
}

/**
 * Insert a brand new cell into an existing or new row.
 * Copies the style index from the nearest populated left-neighbor if possible.
 */
function insertCell(sheetXml: string, ref: string, value: any): string {
  const parsed = parseRef(ref);
  if (!parsed) return sheetXml;
  const excelRow = parsed.row + 1; // 1-based
  const { inner, typeAttr } = buildCellContent(value);

  const rowRe = new RegExp(`<row\\s+r="${excelRow}"([^>]*?)(\\/>|>([\\s\\S]*?)<\\/row>)`);
  const rowMatch = rowRe.exec(sheetXml);

  if (rowMatch) {
    const rowAttrs = rowMatch[1] || '';
    const isSelfClosing = rowMatch[2] === '/>';
    const rowInner = rowMatch[3] ?? '';

    // Find insertion position by column ordering
    const pos = findCellInsertPosition(rowInner, parsed.col);

    // Inherit style from nearest left-neighbor (or above if we must)
    const styleAttr = inheritStyleLeft(rowInner, parsed.col);

    const newCell = inner === ''
      ? `<c r="${ref}"${styleAttr}/>`
      : `<c r="${ref}"${styleAttr}${typeAttr}>${inner}</c>`;

    const newInner = rowInner.slice(0, pos) + newCell + rowInner.slice(pos);
    const newRow = `<row r="${excelRow}"${rowAttrs}>${newInner}</row>`;

    return sheetXml.slice(0, rowMatch.index) + newRow + sheetXml.slice(rowMatch.index + rowMatch[0].length);
  }

  // Row doesn't exist — insert a new one
  const newCell = inner === ''
    ? `<c r="${ref}"/>`
    : `<c r="${ref}"${typeAttr}>${inner}</c>`;
  const newRow = `<row r="${excelRow}">${newCell}</row>`;

  const insertRowRe = /<row\s+r="(\d+)"/g;
  let rm: RegExpExecArray | null;
  while ((rm = insertRowRe.exec(sheetXml))) {
    const r = parseInt(rm[1], 10);
    if (r > excelRow) {
      return sheetXml.slice(0, rm.index) + newRow + sheetXml.slice(rm.index);
    }
  }
  // Append before </sheetData>
  return sheetXml.replace('</sheetData>', newRow + '</sheetData>');
}

function findCellInsertPosition(cellsXml: string, col: number): number {
  const re = /<c\s+r="([A-Za-z]+)(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cellsXml))) {
    const c = colToIndex(m[1].toUpperCase());
    if (c > col) return m.index;
  }
  return cellsXml.length;
}

function inheritStyleLeft(cellsXml: string, col: number): string {
  const re = /<c\s+r="([A-Za-z]+)(\d+)"([^>]*?)(\/>|>)/g;
  let best: { col: number; style: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cellsXml))) {
    const c = colToIndex(m[1].toUpperCase());
    if (c >= col) continue;
    const sMatch = /\ss="([^"]*)"/.exec(m[3] || '');
    if (sMatch) {
      if (!best || c > best.col) best = { col: c, style: ` s="${sMatch[1]}"` };
    }
  }
  return best?.style || '';
}

// ---------------------------------------------------------------------------
// Merge patching
// ---------------------------------------------------------------------------

function applyMerges(sheetXml: string, merges: CellMerge[]): string {
  if (!merges.length) return sheetXml;

  // IMPORTANT: CellMerge.r1/r2 are 1-based Excel row numbers (what the app
  // stores). makeRef() wants 0-based rows. So subtract 1 from r1/r2.
  // c1/c2 are 0-based columns already (from grid column index).
  const refs = merges.map(
    (m) => `${makeRef(m.r1 - 1, m.c1)}:${makeRef(m.r2 - 1, m.c2)}`
  );
  if (__DEV__) console.log('[xlsxPatcher] applying merge refs:', refs.join(', '));

  const existingRe = /<mergeCells\s+count="(\d+)"[^>]*>([\s\S]*?)<\/mergeCells>/;
  const m = existingRe.exec(sheetXml);

  if (m) {
    const oldCount = parseInt(m[1], 10);
    const newCount = oldCount + refs.length;
    const appended = refs.map((r) => `<mergeCell ref="${r}"/>`).join('');
    const newBlock = `<mergeCells count="${newCount}">${m[2]}${appended}</mergeCells>`;
    return sheetXml.slice(0, m.index) + newBlock + sheetXml.slice(m.index + m[0].length);
  }

  const newBlock = `<mergeCells count="${refs.length}">${refs
    .map((r) => `<mergeCell ref="${r}"/>`)
    .join('')}</mergeCells>`;

  // Place after </sheetData> and before anything else
  if (sheetXml.includes('</sheetData>')) {
    return sheetXml.replace('</sheetData>', '</sheetData>' + newBlock);
  }
  return sheetXml.replace('</worksheet>', newBlock + '</worksheet>');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply all edits from the app's WorkbookData to the ORIGINAL .xlsx bytes.
 * Returns a new Uint8Array that can be written to disk and opened in Excel.
 *
 * What survives untouched:
 * - Every original cell that wasn't edited
 * - All styles, fonts, fills, borders, themes
 * - All formulas
 * - All original merges
 * - All images, drawings, charts embedded in the file
 * - Column widths, row heights, freeze panes, print areas
 * - Any VBA, macros, or custom XML parts
 */

function findCellOpen(sheetXml: string, ref: string): { start: number; end: number; selfClose: boolean; attrs: string } | null {
  const key = '<c r="' + ref + '"';
  const start = sheetXml.indexOf(key);
  if (start === -1) return null;
  const closeAngle = sheetXml.indexOf('>', start);
  if (closeAngle === -1) return null;
  const selfClose = sheetXml[closeAngle - 1] === '/';
  const attrsEnd = selfClose ? closeAngle - 1 : closeAngle;
  return { start, end: closeAngle + 1, selfClose, attrs: sheetXml.slice(start, attrsEnd) };
}

function readCellXf(sheetXml: string, ref: string): number {
  const info = findCellOpen(sheetXml, ref);
  if (!info) return 0;
  const m = /\bs="(\d+)"/.exec(info.attrs);
  return m ? parseInt(m[1], 10) : 0;
}

function setCellXf(sheetXml: string, ref: string, newXf: number): string {
  const info = findCellOpen(sheetXml, ref);
  if (!info) {
    if (__DEV__) console.warn('[setCellXf] no cell:', ref);
    return sheetXml;
  }
  const cleanAttrs = info.attrs.replace(/\s+s="[^"]*"/g, '');
  const newOpen = cleanAttrs + ' s="' + newXf + '"' + (info.selfClose ? '/>' : '>');
  if (__DEV__) console.log('[setCellXf]', ref, 's=', newXf, 'from', info.attrs);
  return sheetXml.slice(0, info.start) + newOpen + sheetXml.slice(info.end);
}

export interface AppStyleBundle {
  cellStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  rowStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  colStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  overlays?: Array<{
    id: string;
    sheetName: string;
    row: number;
    col: number;
    type: 'image' | 'chart';
    imageUri?: string;
    size?: 'small' | 'medium' | 'large';
    scalePercent?: number;
  }>;
}

export function patchXlsxWithEdits(
  originalBytes: Uint8Array,
  wbData: WorkbookData,
  userMerges: CellMerge[] = [],
  appStyles: AppStyleBundle = {}
): Uint8Array {
  const files = unzipSync(originalBytes) as Record<string, Uint8Array>;
  const sheets = findSheets(files);
  if (!sheets.length) return originalBytes;

  if (__DEV__) console.log('[xlsxPatcher] patch called with', userMerges.length, 'merges');

  const rawSheets = wbData.rawSheets || {};

  let styleRegistrar: ReturnType<typeof createStyleRegistrar> | null = null;
  if (files['xl/styles.xml']) {
    styleRegistrar = createStyleRegistrar(strFromU8(files['xl/styles.xml']));
  }

  const cellStyles = appStyles.cellStyles || {};
  const rowStyles = appStyles.rowStyles || {};
  const colStyles = appStyles.colStyles || {};

  for (const sheet of sheets) {
    const raw = rawSheets[sheet.name];
    if (!raw) continue;
    const sheetPath = sheet.path;
    if (!files[sheetPath]) continue;

    let sheetXml = strFromU8(files[sheetPath]);
    // origin.row / origin.col are 1-based (Excel row/col of the sheet's first cell)
    // We keep them 1-based so cellStyles key lookups match what the app stored.
    const originRow = raw.origin?.row ?? 1;
    const originCol = raw.origin?.col ?? 1;

    // Patch every cell that has a non-empty value in the app's matrix
    // ============================================================
    // PASS 1 — patch cell VALUES first (creates cells if needed)
    // ============================================================
    for (let r = 0; r < raw.matrix.length; r++) {
      const row = raw.matrix[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        const v = (cell as any).v;
        if (v === null || v === undefined || v === '') continue;

        const excelRow = originRow + r;
        const excelCol = originCol + c;
        const ref = makeRef(excelRow - 1, excelCol - 1);

        // Skip formula cells written as text
        if (typeof v === 'string' && v.startsWith('=')) continue;

        sheetXml = patchCell(sheetXml, ref, v, true);
      }
    }

    // ============================================================
    // PASS 2 — patch cell STYLES (bold/color/align) — includes empty cells
    // ============================================================
    if (styleRegistrar) {
      const sheetCells = cellStyles[sheet.name] || {};
      const sheetRows = rowStyles[sheet.name] || {};
      const sheetCols = colStyles[sheet.name] || {};

      // Build a set of (excelRow, excelCol) pairs that have any style.
      const styled = new Map<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>();

      Object.entries(sheetCells).forEach(([k, v]) => {
        styled.set(k, v as any);
      });

      // Rows: expand to every column present in the matrix
      Object.entries(sheetRows).forEach(([rowKey, style]) => {
        const er = parseInt(rowKey, 10);
        // Assume up to raw.colCount columns
        for (let c = 0; c < raw.colCount; c++) {
          const key = `${er}_${originCol + c}`;
          const existing = styled.get(key) || {};
          styled.set(key, { ...style, ...existing });
        }
      });

      // Cols: expand to every row present in the matrix
      Object.entries(sheetCols).forEach(([colKey, style]) => {
        const ec = parseInt(colKey, 10);
        for (let r = 0; r < raw.matrix.length; r++) {
          const key = `${originRow + r}_${ec}`;
          const existing = styled.get(key) || {};
          styled.set(key, { ...style, ...existing });
        }
      });

      for (const [key, style] of styled) {
        const [erStr, ecStr] = key.split('_');
        const excelRow = parseInt(erStr, 10);
        const col0 = parseInt(ecStr, 10);
        const bold = style.bold;
        const bg = style.bg;
        const align = style.align;
        if (!bold && !bg && !align) continue;

        // userMerges.c1/c2 are 0-based grid columns, matching the key convention
        const mergeForCell = userMerges.find(
          (m) => m.sheet === sheet.name &&
            excelRow >= m.r1 && excelRow <= m.r2 &&
            col0 >= m.c1 && col0 <= m.c2
        );
        let anchorRow0 = excelRow - 1;
        let anchorCol0 = col0;
        if (mergeForCell) {
          anchorRow0 = mergeForCell.r1 - 1;
          anchorCol0 = mergeForCell.c1;
        }

        const anchorRef = makeRef(anchorRow0, anchorCol0);
        const baseXf = readCellXf(sheetXml, anchorRef);
        const newXf = styleRegistrar.applyToXf(baseXf, !!bold, bg, align);
        sheetXml = setCellXf(sheetXml, anchorRef, newXf);

        if (__DEV__) {
          console.log(
            '[xlsxPatcher] style key', key,
            '-> row', excelRow,
            'col0', col0,
            'ref', anchorRef,
            'bold:', !!bold, 'bg:', bg || '-', 'align:', align || '-',
            'xf:', baseXf, '->', newXf
          );
        }
      }
    }


    // Apply merges for this sheet
    const sheetMerges = userMerges.filter((m) => m.sheet === sheet.name);
    if (sheetMerges.length) {
      if (__DEV__) console.log('[xlsxPatcher] sheet', sheet.name, '→', sheetMerges.length, 'merges');
      sheetXml = applyMerges(sheetXml, sheetMerges);
    }

    files[sheetPath] = strToU8(sheetXml);
  }

  // Write back modified styles.xml
  if (styleRegistrar) {
    files['xl/styles.xml'] = strToU8(styleRegistrar.finalize());
  }

  // Inject user-added images
  if (appStyles.overlays && appStyles.overlays.length > 0) {
    try {
      const result = injectUserImages(files, sheets, appStyles.overlays);
      if (__DEV__) {
        console.log('[xlsxPatcher] images injected:', result.injected.length, 'skipped:', result.skipped.length);
      }
    } catch (e) {
      if (__DEV__) console.warn('[xlsxPatcher] image injection failed:', e);
    }
  }

  // Re-zip — fflate only recompresses entries we touched
  return zipSync(files, { level: 6 });
}
