import { WorkbookData } from '@/types';
import { TKey } from '@/src/i18n';

export function expoPrint(wb: WorkbookData, t: (k: TKey) => string): string {
  const dateStr = new Date().toLocaleDateString();

  let sheetRows = '';
  wb.sheets.forEach((sheet) => {
    const sheetRecords = wb.records.filter((r) => r._sheetName === sheet.name);
    sheetRows += `<tr><td style="padding:6px 12px;font-weight:600">${sheet.name}</td><td style="padding:6px 12px">${sheet.rowCount}</td><td style="padding:6px 12px">${sheet.colCount}</td><td style="padding:6px 12px">${sheetRecords.length}</td></tr>`;
  });

  let recordRows = '';
  wb.sheets.forEach((sheet) => {
    const sheetRecords = wb.records.filter((r) => r._sheetName === sheet.name);
    if (sheetRecords.length === 0) return;
    recordRows += `<tr><td colspan="${Math.min(sheet.headers.length, 5)}" style="padding:8px 12px;font-weight:700;background:#f0f0f0">${sheet.name}</td></tr>`;
    const headers = sheet.headers.slice(0, 5);
    recordRows += '<tr>' + headers.map((h) => `<th style="padding:6px 12px;text-align:left;border-bottom:2px solid #ddd;font-size:11px">${h}</th>`).join('') + '</tr>';
    sheetRecords.slice(0, 30).forEach((record) => {
      const cells = headers.map((_, colIdx) => {
        const colLetter = String.fromCharCode(65 + colIdx);
        return `<td style="padding:4px 12px;font-size:11px;border-bottom:1px solid #eee">${String(record[`${sheet.name}.${colLetter}`] ?? '')}</td>`;
      });
      recordRows += '<tr>' + cells.join('') + '</tr>';
    });
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:40px;color:#333}h1{font-size:24px;color:#0F4C81}h2{font-size:18px;color:#0F4C81;margin-top:24px}table{width:100%;border-collapse:collapse;margin-top:12px}.meta{color:#666;font-size:13px;margin-bottom:20px}</style></head><body>
<h1>${t('pdfSummaryTitle')}</h1>
<p class="meta">${t('generatedOn')}: ${dateStr}<br>${t('fileName')}: ${wb.fileName}</p>
<h2>${t('summary')}</h2>
<p>${t('totalRecords')}: ${wb.records.length}<br>${t('totalSheets')}: ${wb.sheets.length}<br>${t('totalFields')}: ${wb.mappings.length}</p>
<h2>${t('sheetBreakdown')}</h2>
<table><tr><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #0F4C81">${t('sheet')}</th><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #0F4C81">${t('rows')}</th><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #0F4C81">${t('columns')}</th><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #0F4C81">${t('records')}</th></tr>${sheetRows}</table>
<h2>${t('records')}</h2>
<table>${recordRows}</table>
</body></html>`;
}
