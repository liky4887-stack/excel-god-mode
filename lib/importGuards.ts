export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_SHEETS = 30;
export const MAX_CELLS = 200000;

export function assertFileSize(bytes: number): void {
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${(bytes / 1e6).toFixed(1)} MB (max ${MAX_FILE_BYTES / 1e6} MB)`);
  }
}

export function assertImageSize(bytes: number): void {
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large: ${(bytes / 1e6).toFixed(1)} MB (max ${MAX_IMAGE_BYTES / 1e6} MB)`);
  }
}

export function assertWorkbookShape(sheetCount: number, totalCells: number): void {
  if (sheetCount > MAX_SHEETS) {
    throw new Error(`Too many sheets: ${sheetCount} (max ${MAX_SHEETS})`);
  }
  if (totalCells > MAX_CELLS) {
    throw new Error(`Workbook too large: ${totalCells.toLocaleString()} cells (max ${MAX_CELLS.toLocaleString()})`);
  }
}
