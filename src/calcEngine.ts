import { WorkbookData, CalculationResult, FieldMapping } from '@/types';

export function evaluateFormula(
  formula: string,
  record: Record<string, string | number>,
  mappings: FieldMapping[]
): { result: string | number; isValid: boolean; error?: string } {
  try {
    let expr = formula;
    const refs = expr.match(/[A-Z]+\d+/g) || [];
    refs.forEach((ref) => {
      const col = ref.match(/[A-Z]+/)?.[0] || '';
      const mapping = mappings.find((m) => m.column === col);
      if (mapping) {
        const val = record[`${mapping.sheetName}.${col}`];
        const num = typeof val === 'number' ? val : Number(val) || 0;
        expr = expr.replace(new RegExp(ref, 'g'), String(num));
      }
    });

    expr = expr.replace(/SUM\(([^)]+)\)/gi, (_m, a) =>
      String(a.split(',').reduce((s: number, x: string) => s + (Number(x.trim()) || 0), 0))
    );
    expr = expr.replace(/AVERAGE\(([^)]+)\)/gi, (_m, a) => {
      const nums = a.split(',').map((x: string) => Number(x.trim()) || 0);
      return String(nums.reduce((s: number, n: number) => s + n, 0) / nums.length);
    });
    expr = expr.replace(/ROUND\(([^)]+)\)/gi, (_m, a) => {
      const p = a.split(',');
      return String(Math.round((Number(p[0]?.trim()) || 0) * Math.pow(10, Number(p[1]?.trim()) || 0)) / Math.pow(10, Number(p[1]?.trim()) || 0));
    });
    expr = expr.replace(/ABS\(([^)]+)\)/gi, (_m, a) => String(Math.abs(Number(a.trim()) || 0)));
    expr = expr.replace(/MAX\(([^)]+)\)/gi, (_m, a) => String(Math.max(...a.split(',').map((x: string) => Number(x.trim()) || 0))));
    expr = expr.replace(/MIN\(([^)]+)\)/gi, (_m, a) => String(Math.min(...a.split(',').map((x: string) => Number(x.trim()) || 0))));

    if (/^[\d\s+\-*/().,]+$/.test(expr)) {
      const result = Function(`"use strict"; return (${expr})`)();
      return { result: typeof result === 'number' ? result : String(result), isValid: true };
    }
    return { result: expr, isValid: true };
  } catch (e) {
    return { result: '#ERROR', isValid: false, error: String(e) };
  }
}

export function previewCalculations(wb: WorkbookData, record: Record<string, string | number>): CalculationResult[] {
  return wb.mappings
    .filter((m) => m.isFormula && m.formulaTemplate)
    .map((m) => {
      const { result, isValid, error } = evaluateFormula(m.formulaTemplate!, record, wb.mappings);
      return { fieldId: m.id, label: m.labelEn, formula: m.formulaTemplate!, result, isValid, error };
    });
}
