import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Image } from 'react-native';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { X, Check, Plus } from 'lucide-react-native';
import { RawSheet, RawCell } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { ChartRenderer } from './ChartRenderer';

interface Props {
  rawSheet: RawSheet;
  onCellEdit: (row: number, col: number, newValue: string) => void;
  onAddRow?: () => void;
  onAddColumn?: () => void;
  onInsertRowAbove?: (row: number) => void;
  onInsertRowBelow?: (row: number) => void;
  onInsertColRight?: (col: number) => void;
  onUpdateImage?: (imageId: string, patch: { rowSpan?: number; colSpan?: number }) => void;
  onDeleteImage?: (imageId: string) => void;
  focusCell?: { row: number; col: number; nonce: number } | null;
  onAddImage?: (row: number, col: number) => void;
  onInsertChart?: (row: number, col: number, spec: import('@/types').ChartSpec) => void;
}

// ===== Palette =====
const SECTION_BG = '#0EA5E9';
const SECTION_TEXT = '#FFFFFF';
const HEADER_BG = '#F1F5F9';
const HEADER_TEXT = '#0F172A';
const DATA_BG_ODD = '#FFFFFF';
const DATA_BG_EVEN = '#F8FAFC';
const DATA_TEXT = '#1E293B';
const GRID_LINE = '#CBD5E1';
const ACCENT = '#0EA5E9';
const ACCENT_DIM = 'rgba(14,165,233,0.12)';
const ACCENT_BORDER = 'rgba(14,165,233,0.35)';
const ROW_NUM_BG = '#F1F5F9';
const ROW_NUM_TEXT = '#64748B';

// ===== Dimensions =====
const COL_DEFAULT = 130;
const COL_MIN = 80;
const COL_MAX = 200;
const COL_FIRST = 100;
const ROW_HEIGHT = 50;
const ROW_NUMBER_WIDTH = 40;      // <-- narrow
const COL_LETTER_HEIGHT = 28;
const MAX_VISIBLE_COLUMNS = 30;

function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function colWidthFor(rawSheet: RawSheet, colIdx: number): number {
  if (rawSheet.colWidths && rawSheet.colWidths[colIdx]) {
    return Math.min(COL_MAX, Math.max(COL_MIN, rawSheet.colWidths[colIdx] * 1.2));
  }
  return colIdx === 0 ? COL_FIRST : COL_DEFAULT;
}

function isSectionTitleRow(cells: (RawCell | null)[]): boolean {
  const nonEmpty = cells.filter((c) => c && c.v !== null && c.v !== undefined && String(c.v).trim() !== '');
  if (nonEmpty.length !== 1) return false;
  const cell = nonEmpty[0];
  return !!(cell && cell.isMergedAnchor && cell.mergeSpan && cell.mergeSpan.colSpan > 1);
}

function isBlankRow(cells: (RawCell | null)[]): boolean {
  return cells.every((c) => !c || c.v === null || c.v === undefined);
}

function lastNonEmptyRow(rawSheet: RawSheet): number {
  let last = 0;
  for (let r = rawSheet.matrix.length - 1; r >= 0; r--) {
    if (!isBlankRow(rawSheet.matrix[r])) { last = r; break; }
  }
  // Extend to cover images
  if (rawSheet.images) {
    for (const img of rawSheet.images) {
      const imgEnd = img.row + img.rowSpan - 1;
      if (imgEnd > last) last = imgEnd;
    }
  }
  return last;
}

function displayText(cell: RawCell | null): string {
  if (!cell) return '';
  const v = cell.v;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string' && (v === 'undefined' || v === 'null')) return '';
  return cell.w || String(v);
}

function visibleColumnRange(rawSheet: RawSheet, lastRow: number): { min: number; max: number } {
  let max = -1;
  const scanRows = Math.min(lastRow + 1, rawSheet.matrix.length);
  for (let r = 0; r < scanRows; r++) {
    const row = rawSheet.matrix[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const v = cell.v;
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'string' && (v === 'undefined' || v === 'null')) continue;
      if (c > max) max = c;
    }
  }
  // Extend to cover images so we can scroll to see them
  if (rawSheet.images) {
    for (const img of rawSheet.images) {
      const imgEnd = img.col + img.colSpan - 1;
      if (imgEnd > max) max = imgEnd;
    }
  }
  if (max < 0) return { min: 0, max: 0 };
  // No artificial cap when images extend the range
  const hardCap = rawSheet.images && rawSheet.images.length > 0 ? 999 : MAX_VISIBLE_COLUMNS - 1;
  return { min: 0, max: Math.min(max + 1, hardCap, rawSheet.colCount - 1 + (rawSheet.images?.length ? 50 : 0)) };
}

export function SheetGridView({
  rawSheet, onCellEdit, onAddRow, onAddColumn,
  onInsertRowAbove, onInsertRowBelow, onInsertColRight,
  onUpdateImage, onDeleteImage, focusCell, onAddImage, onInsertChart,
}: Props) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<{ row: number; col: number; value: string } | null>(null);
  const [imageMenu, setImageMenu] = useState<string | null>(null);

  const hTopRef = useRef<ScrollView>(null);
  const vLeftRef = useRef<ScrollView>(null);
  const bodyHRef = useRef<ScrollView>(null);
  const bodyVRef = useRef<ScrollView>(null);
  const bodyInnerRef = useRef<ScrollView>(null);

  const lastRow = useMemo(() => lastNonEmptyRow(rawSheet), [rawSheet]);
  const colRange = useMemo(() => visibleColumnRange(rawSheet, lastRow), [rawSheet, lastRow]);

  const visibleRows = useMemo(() => {
    const sliced = rawSheet.matrix.slice(0, lastRow + 1);
    const width = colRange.max - colRange.min + 1;
    return sliced.map((row) => {
      const padded: (RawCell | null)[] = row.slice(colRange.min, colRange.max + 1);
      while (padded.length < width) padded.push(null);
      return padded;
    });
  }, [rawSheet, lastRow, colRange]);

  const headerRowFlags = useMemo(() => {
    const flags: boolean[] = [];
    for (let i = 0; i < visibleRows.length; i++) {
      if (i === 0 && !isSectionTitleRow(visibleRows[i])) { flags.push(true); continue; }
      if (i > 0 && isSectionTitleRow(visibleRows[i - 1])) { flags.push(true); continue; }
      flags.push(false);
    }
    return flags;
  }, [visibleRows]);

  const totalGridWidth = useMemo(() => {
    let w = 0;
    for (let k = 0; k <= (colRange.max - colRange.min); k++) {
      w += colWidthFor(rawSheet, colRange.min + k);
    }
    return w;
  }, [rawSheet, colRange]);


  // Focus/scroll to a specific cell when focusCell changes
  useEffect(() => {
    if (!focusCell) return;
    const rowIdx = focusCell.row - rawSheet.origin.row;
    if (rowIdx < 0 || rowIdx > lastRow) return;

    // Compute Y offset (rows)
    const y = rowIdx * ROW_HEIGHT;
    // Compute X offset (columns before focusCell.col)
    let x = 0;
    for (let c = colRange.min; c < focusCell.col; c++) {
      x += colWidthFor(rawSheet, c);
    }

    setTimeout(() => {
      bodyVRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
      bodyHRef.current?.scrollTo({ x: Math.max(0, x - 60), animated: true });
    }, 100);
  }, [focusCell, rawSheet, colRange, lastRow]);

  const columnCount = colRange.max - colRange.min + 1;

  const onBodyHScroll = useCallback((e: any) => {
    hTopRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  }, []);
  const onBodyVScroll = useCallback((e: any) => {
    vLeftRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false });
  }, []);

  const openEditor = useCallback((row: number, col: number) => {
    const cell = rawSheet.matrix[row]?.[col];
    setEditing({ row, col, value: displayText(cell) });
  }, [rawSheet]);

  const saveEdit = useCallback(() => {
    if (editing) {
      onCellEdit(editing.row, editing.col, editing.value);
      setEditing(null);
    }
  }, [editing, onCellEdit]);

  const cancelEdit = useCallback(() => setEditing(null), []);

  if (rawSheet.matrix.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('noRecords')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ===== TOP: corner + column letters ===== */}
      <View style={styles.topBar}>
        <View style={styles.cornerCell} />
        <ScrollView ref={hTopRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <View style={styles.colLettersRow}>
            {Array.from({ length: columnCount }).map((_, k) => {
              const colIdx = colRange.min + k;
              return (
                <View key={`cl-${k}`} style={[styles.colLetterCell, { width: colWidthFor(rawSheet, colIdx) }]}>
                  <Text style={styles.colLetterText}>{colLetter(colIdx)}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* ===== BODY: row numbers + grid ===== */}
      <View style={styles.body}>
        <View style={styles.rowNumColumn}>
          <ScrollView ref={vLeftRef} scrollEnabled={false} showsVerticalScrollIndicator={false}>
            <View>
              {visibleRows.map((cells, rowIdx) => {
                const isSection = isSectionTitleRow(cells);
                return (
                  <View
                    key={`rn-${rowIdx}`}
                    style={[
                      styles.rowNumberCell,
                      isSection && styles.rowNumberCellSection,
                    ]}
                  >
                    {!isSection && (
                      <Text style={styles.rowNumberText}>{rawSheet.origin.row + rowIdx}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <ScrollView
          ref={bodyHRef}
          horizontal
          onScroll={onBodyHScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={bodyVRef}
            onScroll={onBodyVScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator
          >
            <View style={[styles.gridInner, { width: totalGridWidth, height: visibleRows.length * ROW_HEIGHT }]}>
              {visibleRows.map((cells, rowIdx) => {
                const isSection = isSectionTitleRow(cells);
                const isHeader = headerRowFlags[rowIdx];
                const rowBg = isSection ? SECTION_BG : isHeader ? HEADER_BG : rowIdx % 2 === 0 ? DATA_BG_ODD : DATA_BG_EVEN;

                return (
                  <View
                    key={`row-${rowIdx}`}
                    style={[styles.row, { backgroundColor: rowBg, height: ROW_HEIGHT }]}
                  >
                    {isSection ? (
                      <View style={[styles.sectionCell, { width: totalGridWidth }]}>
                        <Text style={styles.sectionText}>
                          {displayText(cells.find((c) => c && c.v) ?? null).toUpperCase()}
                        </Text>
                      </View>
                    ) : (
                      cells.map((cell, colIdx) => {
                        const width = colWidthFor(rawSheet, colRange.min + colIdx);
                        const actualCol = colRange.min + colIdx;
                        if (isHeader) {
                          return (
                            <View key={`cell-${rowIdx}-${colIdx}`} style={[styles.headerCell, { width }]}>
                              <Text style={styles.headerText} numberOfLines={2}>
                                {displayText(cell)}
                              </Text>
                            </View>
                          );
                        }
                        return (
                          <TouchableOpacity
                            key={`cell-${rowIdx}-${colIdx}`}
                            style={[styles.dataCell, { width }]}
                            activeOpacity={0.6}
                            onPress={() => openEditor(rowIdx, actualCol)}
                          >
                            <Text style={styles.dataText} numberOfLines={2}>
                              {displayText(cell)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                );
              })}

              {/* Floating images anchored to cells */}
              {rawSheet.images?.map((img, i) => {
                const top = img.row * ROW_HEIGHT;
                let left = 0;
                for (let k = 0; k < img.col - colRange.min; k++) {
                  left += colWidthFor(rawSheet, colRange.min + k);
                }
                let width = 0;
                for (let k = 0; k < img.colSpan; k++) {
                  width += colWidthFor(rawSheet, img.col + k);
                }
                const height = img.rowSpan * ROW_HEIGHT;
                const isChart = img.kind === 'chart' && img.chart;
                return (
                  <TouchableOpacity
                    key={`img-${i}`}
                    activeOpacity={0.85}
                    onLongPress={() => setImageMenu(img.id)}
                    onPress={() => setImageMenu(img.id)}
                    style={{ position: 'absolute', top, left, width, height, backgroundColor: isChart ? '#FFFFFF' : 'transparent' }}
                  >
                    {isChart ? (
                      <ChartRenderer spec={img.chart!} width={width} height={height} />
                    ) : (
                      <Image
                        source={{ uri: img.data }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {/* ===== Add row / column ===== */}


      {/* ===== Image options ===== */}
      <Modal visible={imageMenu !== null} transparent animationType="fade" onRequestClose={() => setImageMenu(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('imageOptions')}</Text>
              <TouchableOpacity style={styles.modalCloseBtn} activeOpacity={0.6} onPress={() => setImageMenu(null)}>
                <X size={18} color="#64748B" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <View style={styles.resizeBar}>
              <TouchableOpacity
                style={styles.resizeBtn}
                onPress={() => { if (imageMenu && onUpdateImage) onUpdateImage(imageMenu, { rowSpan: 5, colSpan: 5 }); setImageMenu(null); }}
              >
                <Text style={styles.resizeBtnText}>{t('resizeSmall')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resizeBtn}
                onPress={() => { if (imageMenu && onUpdateImage) onUpdateImage(imageMenu, { rowSpan: 8, colSpan: 8 }); setImageMenu(null); }}
              >
                <Text style={styles.resizeBtnText}>{t('resizeMedium')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resizeBtn}
                onPress={() => { if (imageMenu && onUpdateImage) { onUpdateImage(imageMenu, { rowSpan: 12, colSpan: 12 }); const img = rawSheet.images?.find((im) => im.id === imageMenu); if (img) { const y = img.row * ROW_HEIGHT; let x = 0; for (let c = colRange.min; c < img.col; c++) x += colWidthFor(rawSheet, c); setTimeout(() => { bodyVRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true }); bodyHRef.current?.scrollTo({ x: Math.max(0, x - 40), animated: true }); }, 200); } } setImageMenu(null); }}
              >
                <Text style={styles.resizeBtnText}>{t('resizeLarge')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                activeOpacity={0.6}
                onPress={() => setImageMenu(null)}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#EF4444' }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (imageMenu && onDeleteImage) onDeleteImage(imageMenu);
                  setImageMenu(null);
                }}
              >
                <Text style={styles.modalSaveText}>{t('deleteImage')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal ===== */}
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={cancelEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editing ? `${colLetter(editing.col)}${rawSheet.origin.row + editing.row}` : t('editCell')}
              </Text>
              <TouchableOpacity style={styles.modalCloseBtn} activeOpacity={0.6} onPress={cancelEdit}>
                <X size={18} color="#64748B" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              value={editing?.value ?? ''}
              onChangeText={(text) => setEditing((prev) => (prev ? { ...prev, value: text } : prev))}
              autoFocus
              multiline
              placeholderTextColor="#94A3B8"
            />

            {editing && (onInsertRowAbove || onInsertRowBelow || onInsertColRight) && (
              <View style={styles.insertBar}>
                {onInsertRowAbove && (
                  <TouchableOpacity style={styles.insertBtn} activeOpacity={0.7} onPress={() => { onInsertRowAbove(editing.row); cancelEdit(); }}>
                    <Text style={styles.insertBtnText}>↑ {t('insertRowAbove')}</Text>
                  </TouchableOpacity>
                )}
                {onInsertRowBelow && (
                  <TouchableOpacity style={styles.insertBtn} activeOpacity={0.7} onPress={() => { onInsertRowBelow(editing.row); cancelEdit(); }}>
                    <Text style={styles.insertBtnText}>↓ {t('insertRowBelow')}</Text>
                  </TouchableOpacity>
                )}
                {onInsertColRight && (
                  <TouchableOpacity style={styles.insertBtn} activeOpacity={0.7} onPress={() => { onInsertColRight(editing.col); cancelEdit(); }}>
                    <Text style={styles.insertBtnText}>→ {t('insertColRight')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} activeOpacity={0.6} onPress={cancelEdit}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} activeOpacity={0.7} onPress={saveEdit}>
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.modalSaveText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: { flexDirection: 'row', backgroundColor: ROW_NUM_BG, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: GRID_LINE, height: COL_LETTER_HEIGHT },
  cornerCell: { width: ROW_NUMBER_WIDTH, height: COL_LETTER_HEIGHT, backgroundColor: ROW_NUM_BG, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: GRID_LINE },
  colLettersRow: { flexDirection: 'row', height: COL_LETTER_HEIGHT },
  colLetterCell: { height: COL_LETTER_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: GRID_LINE },
  colLetterText: { color: ROW_NUM_TEXT, fontSize: 11, fontWeight: '700' },
  body: { flex: 1, flexDirection: 'row' },
  rowNumColumn: { width: ROW_NUMBER_WIDTH, backgroundColor: ROW_NUM_BG, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: GRID_LINE },
  rowNumberCell: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: GRID_LINE, backgroundColor: ROW_NUM_BG },
  rowNumberCellSection: { backgroundColor: SECTION_BG },
  rowNumberText: { color: ROW_NUM_TEXT, fontSize: 11, fontWeight: '700' },
  gridInner: { flexDirection: 'column', position: 'relative' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: GRID_LINE },
  sectionCell: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'flex-start' },
  sectionText: { color: SECTION_TEXT, fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
  headerCell: { paddingHorizontal: 10, justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: GRID_LINE },
  headerText: { color: HEADER_TEXT, fontSize: 12, fontWeight: '700' },
  dataCell: { paddingHorizontal: 10, justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: GRID_LINE },
  dataText: { color: DATA_TEXT, fontSize: 12 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#FFFFFF' },
  emptyText: { color: '#94A3B8', fontSize: 14 },
  addBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GRID_LINE, backgroundColor: '#F8FAFC' },
  addBarBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: ACCENT_BORDER, backgroundColor: ACCENT_DIM },
  addBarBtnText: { color: ACCENT, fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 18, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: '#E2E8F0' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  modalTitle: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalInput: { margin: 20, minHeight: 80, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: '#0F172A', fontSize: 15 },
  insertBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 12, flexWrap: 'wrap' },
  insertBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: ACCENT_BORDER, backgroundColor: ACCENT_DIM },
  insertBtnText: { color: ACCENT, fontSize: 12, fontWeight: '700' },
  resizeBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  resizeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: ACCENT_BORDER, backgroundColor: ACCENT_DIM, alignItems: 'center' },
  resizeBtnText: { color: ACCENT, fontSize: 13, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 20 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  modalSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: ACCENT },
  modalSaveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
