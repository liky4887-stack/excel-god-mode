import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Image } from 'react-native';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { X, Check, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { RawSheet, RawCell, GridOverlay } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { ChartRenderer } from './ChartRenderer';

const ACCENT = '#0EA5E9';
const SECTION_BG = '#0EA5E9';
const HEADER_BG = '#F1F5F9';
const DATA_BG_ODD = '#FFFFFF';
const DATA_BG_EVEN = '#F8FAFC';
const GRID_LINE = '#CBD5E1';
const TEXT_HEADER = '#0F172A';
const TEXT_DATA = '#1E293B';
const ROW_NUM_BG = '#F1F5F9';
const ROW_NUM_TEXT = '#64748B';
const ROW_NUMBER_WIDTH = 20;
const COL_LETTER_HEIGHT = 22;
const ROW_HEIGHT = 38;
const COL_DEFAULT = 120;
const COL_MIN = 80;
const COL_MAX = 200;
const MAX_ROWS = 80;
const MAX_COLS = 40;
const OVERLAY_BASE_PX = 100;
const OVERLAY_MIN_PCT = 10;
const OVERLAY_MAX_PCT = 5000;

interface Props {
  rawSheet: RawSheet;
  onCellEdit: (row: number, col: number, newValue: string) => void;
  overlays: GridOverlay[];
  onAddOverlay: (overlay: GridOverlay) => void;
  onUpdateOverlay: (id: string, updates: Partial<GridOverlay>) => void;
  onDeleteOverlay: (id: string) => void;
  focusCell?: { row: number; col: number; nonce: number } | null;
  cellStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  onSetCellStyle?: (sheetName: string, row: number, col: number, style: { bold?: boolean; bg?: string }) => void;
  onUpdateCellAndStyle?: (sheetName: string, row0: number, col0: number, value: string, style: { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }) => void;
  rowStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  colStyles?: Record<string, Record<string, { bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' }>>;
  onSetRowStyle?: (sheetName: string, row: number, style: { bold?: boolean; bg?: string }) => void;
  onSetColStyle?: (sheetName: string, col: number, style: { bold?: boolean; bg?: string }) => void;
  onMoveRow?: (sheetName: string, row: number, delta: number) => void;
  onMoveColumn?: (sheetName: string, col: number, delta: number) => void;
  merges?: import('@/types').CellMerge[];
  onAddMerge?: (sheetName: string, r1: number, c1: number, r2: number, c2: number) => void;
  onRemoveMerge?: (sheetName: string, r1: number, c1: number) => void;
}

function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

function overlayPx(scalePercent: number | undefined, fallback: string | undefined): number {
  let pct = 100;
  if (typeof scalePercent === 'number') pct = scalePercent;
  else if (fallback === 'small') pct = 50;
  else if (fallback === 'large') pct = 200;
  pct = Math.max(OVERLAY_MIN_PCT, Math.min(OVERLAY_MAX_PCT, pct));
  return Math.round(OVERLAY_BASE_PX * (pct / 100));
}

function colWidthFor(rawSheet: RawSheet, colIdx: number): number {
  if (rawSheet.colWidths && rawSheet.colWidths[colIdx]) {
    return Math.min(COL_MAX, Math.max(COL_MIN, rawSheet.colWidths[colIdx] * 1.2));
  }
  return COL_DEFAULT;
}

function isSectionTitleRow(cells: (RawCell | null)[]): boolean {
  const nonEmpty = cells.filter((c) => c && c.v !== null && c.v !== undefined && String(c.v).trim() !== '');
  if (nonEmpty.length !== 1) return false;
  const cell = nonEmpty[0];
  return !!(cell && cell.isMergedAnchor && cell.mergeSpan && cell.mergeSpan.colSpan > 1);
}

function displayText(cell: RawCell | null): string {
  if (!cell) return '';
  const v = cell.v;
  if (v === null || v === undefined) return '';
  const s = cell.w || String(v);
  if (s === 'undefined' || s === 'null') return '';
  return s;
}

export function SheetGridView({
  rawSheet, onCellEdit, overlays, onAddOverlay, onUpdateOverlay, onDeleteOverlay, focusCell, cellStyles, onSetCellStyle, onUpdateCellAndStyle, rowStyles, colStyles, onSetRowStyle, onSetColStyle, onMoveRow, onMoveColumn, merges, onAddMerge, onRemoveMerge,
}: Props) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<{ row: number; col: number; value: string; bold?: boolean; bg?: string; align?: 'left' | 'center' | 'right' } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ row: number; col: number } | null>(null);
  const [menu, setMenu] = useState<{ kind: 'row' | 'col'; index: number } | null>(null);
  const [menuBold, setMenuBold] = useState(false);
  const [menuBg, setMenuBg] = useState<string | undefined>(undefined);
  const [mergeAnchor, setMergeAnchor] = useState<{ row: number; col: number } | null>(null);
  const [mergePending, setMergePending] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const [scaleModal, setScaleModal] = useState<string | null>(null);
  const [scaleInput, setScaleInput] = useState('100');

  const topRef = useRef<ScrollView>(null);
  const leftRef = useRef<ScrollView>(null);
  const bodyHRef = useRef<ScrollView>(null);
  const bodyVRef = useRef<ScrollView>(null);

  const lastRow = useMemo(() => Math.min(rawSheet.matrix.length - 1, MAX_ROWS - 1), [rawSheet]);
  const maxCol = useMemo(() => Math.min(Math.max(rawSheet.colCount - 1, 4), MAX_COLS - 1), [rawSheet]);
  const colCount = maxCol + 1;

  const visibleRows = useMemo(() => {
    const sliced = rawSheet.matrix.slice(0, lastRow + 1);
    return sliced.map((row) => {
      const padded: (RawCell | null)[] = row.slice(0, colCount);
      while (padded.length < colCount) padded.push(null);
      return padded;
    });
  }, [rawSheet, lastRow, colCount]);

  const headerRowFlags = useMemo(() => {
    const flags: boolean[] = [];
    for (let i = 0; i < visibleRows.length; i++) {
      if (i === 0 && !isSectionTitleRow(visibleRows[i])) { flags.push(true); continue; }
      if (i > 0 && isSectionTitleRow(visibleRows[i - 1])) { flags.push(true); continue; }
      flags.push(false);
    }
    return flags;
  }, [visibleRows]);

  const mergeLookup = useMemo(() => {
    const anchorByKey: Record<string, { r1: number; c1: number; r2: number; c2: number }> = {};
    const memberOf: Record<string, { r1: number; c1: number; r2: number; c2: number }> = {};
    (merges || []).forEach((m) => {
      if (m.sheet !== rawSheet.name) return;
      anchorByKey[`${m.r1}_${m.c1}`] = m;
      for (let r = m.r1; r <= m.r2; r++) {
        for (let c = m.c1; c <= m.c2; c++) {
          memberOf[`${r}_${c}`] = m;
        }
      }
    });
    return { anchorByKey, memberOf };
  }, [merges, rawSheet.name]);

  // Grid rows that are covered by a vertical merge (should not render)
  const skipRows = useMemo(() => {
    const skip = new Set<number>();
    const originRow = rawSheet.origin?.row ?? 1;
    (merges || []).forEach((m) => {
      if (m.sheet !== rawSheet.name) return;
      // m.r1 / m.r2 are 1-based Excel row numbers
      // grid row index = (excelRow - originRow)
      const gridR1 = (m.r1 - 1) - (originRow - 1);
      const gridR2 = (m.r2 - 1) - (originRow - 1);
      for (let r = gridR1 + 1; r <= gridR2; r++) skip.add(r);
    });
    return skip;
  }, [merges, rawSheet.name, rawSheet.origin?.row]);

  // Anchor row index -> span in ROW_HEIGHT units (for tall vertical merges)
  const mergeRowSpan = useMemo(() => {
    const spans = new Map<number, number>();
    const originRow = rawSheet.origin?.row ?? 1;
    (merges || []).forEach((m) => {
      if (m.sheet !== rawSheet.name) return;
      const span = m.r2 - m.r1 + 1;
      if (span <= 1) return;
      const gridR1 = (m.r1 - 1) - (originRow - 1);
      spans.set(gridR1, Math.max(spans.get(gridR1) ?? 1, span));
    });
    return spans;
  }, [merges, rawSheet.name, rawSheet.origin?.row]);

  const colWidths = useMemo(
    () => Array.from({ length: colCount }, (_, k) => colWidthFor(rawSheet, k)),
    [rawSheet, colCount]
  );
  const totalGridWidth = useMemo(() => colWidths.reduce((a, b) => a + b, 0), [colWidths]);

  // Auto-convert Excel-embedded images to movable overlays
  useEffect(() => {
    if (!rawSheet.images || rawSheet.images.length === 0) return;
    const existingIds = new Set(overlays.map((o) => o.id));
    rawSheet.images.forEach((img) => {
      const ovId = 'xlimg_' + img.id;
      if (existingIds.has(ovId)) return;
      onAddOverlay({
        id: ovId,
        sheetName: rawSheet.name,
        row: img.row,
        col: img.col,
        type: 'image',
        imageUri: (img as any).dataUri || (img as any).data || '',
        size: 'medium',
        createdAt: Date.now(),
      });
    });
  }, [rawSheet.name, rawSheet.images, overlays.length]);


  // Scroll to focusCell when it changes (search → grid navigation)
  // Track which nonce we've already scrolled to, so mount also fires when set
  const lastScrolledNonce = useRef<number | null>(null);

  useEffect(() => {
    if (!focusCell) return;
    if (lastScrolledNonce.current === focusCell.nonce) return;
    lastScrolledNonce.current = focusCell.nonce;

    const rowIdx = focusCell.row - (rawSheet.origin?.row ?? 1);
    if (rowIdx < 0 || rowIdx > lastRow) return;

    const y = rowIdx * ROW_HEIGHT;
    let x = 0;
    for (let c = 0; c < focusCell.col && c < colWidths.length; c++) {
      x += colWidths[c] ?? COL_DEFAULT;
    }

    // Set the highlight immediately so it's visible when the scroll lands
    setHighlight({ row: focusCell.row, col: focusCell.col });

    // Try at 150ms and 450ms — layout may take a moment on cold mount
    const t1 = setTimeout(() => {
      bodyVRef.current?.scrollTo({ y: Math.max(0, y - ROW_HEIGHT), animated: false });
      bodyHRef.current?.scrollTo({ x: Math.max(0, x - COL_DEFAULT), animated: false });
    }, 150);
    const t2 = setTimeout(() => {
      bodyVRef.current?.scrollTo({ y: Math.max(0, y - ROW_HEIGHT), animated: true });
      bodyHRef.current?.scrollTo({ x: Math.max(0, x - COL_DEFAULT), animated: true });
    }, 450);

    // Fade the highlight after 2 seconds
    const t3 = setTimeout(() => setHighlight(null), 2200);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [focusCell?.nonce, lastRow, rawSheet.origin?.row, colWidths]);

  const onBodyHScroll = useCallback((e: any) => {
    topRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  }, []);
  const onBodyVScroll = useCallback((e: any) => {
    leftRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false });
  }, []);

  const openRowMenu = useCallback((rowIdx: number) => {
    const excelRow = rawSheet.origin.row + rowIdx;
    const style = rowStyles?.[rawSheet.name]?.[String(excelRow)] || {};
    setMenuBold(style.bold === true);
    setMenuBg(style.bg);
    setMenu({ kind: 'row', index: excelRow });
  }, [rawSheet, rowStyles]);

  const openColMenu = useCallback((colIdx: number) => {
    const style = colStyles?.[rawSheet.name]?.[String(colIdx)] || {};
    setMenuBold(style.bold === true);
    setMenuBg(style.bg);
    setMenu({ kind: 'col', index: colIdx });
  }, [rawSheet, colStyles]);

  const applyMenu = useCallback(() => {
    if (!menu) return;
    if (menu.kind === 'row' && onSetRowStyle) {
      onSetRowStyle(rawSheet.name, menu.index, { bold: menuBold, bg: menuBg });
    } else if (menu.kind === 'col' && onSetColStyle) {
      onSetColStyle(rawSheet.name, menu.index, { bold: menuBold, bg: menuBg });
    }
    setMenu(null);
  }, [menu, menuBold, menuBg, onSetRowStyle, onSetColStyle, rawSheet]);

  const unmergeAt = useCallback((excelRow: number, col: number) => {
    const m = mergeLookup.memberOf[`${excelRow}_${col}`];
    if (m && onRemoveMerge) onRemoveMerge(rawSheet.name, m.r1, m.c1);
  }, [mergeLookup, onRemoveMerge, rawSheet]);

  const openEditor = useCallback((row: number, col: number) => {
    const cell = rawSheet.matrix[row]?.[col];
    const excelRow = rawSheet.origin.row + row;
    const style = cellStyles?.[rawSheet.name]?.[`${excelRow}_${col}`] || {};
    setEditing({
      row,
      col,
      value: displayText(cell),
      bold: style.bold,
      bg: style.bg,
      align: style.align,
    });
  }, [rawSheet, cellStyles]);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    if (onUpdateCellAndStyle) {
      // Single atomic call — avoids the race between value write and style write
      onUpdateCellAndStyle(
        rawSheet.name,
        editing.row,
        editing.col,
        editing.value,
        { bold: editing.bold, bg: editing.bg, align: editing.align }
      );
    } else {
      // Fallback if the atomic method isn't wired
      onCellEdit(editing.row, editing.col, editing.value);
    }
    setEditing(null);
  }, [editing, onCellEdit, onUpdateCellAndStyle, rawSheet]);

  const cancelEdit = useCallback(() => setEditing(null), []);
  const selected = overlays.find((o) => o.id === selectedId) || null;

  if (rawSheet.matrix.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('noRecords')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* TOP: corner + column letters */}
      <View style={styles.topBar}>
        <View style={styles.cornerCell} />
        <ScrollView ref={topRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <View style={styles.colLettersRow}>
            {Array.from({ length: colCount }).map((_, k) => (
              <TouchableOpacity
                key={`cl-${k}`}
                style={[
                  styles.colLetterCell,
                  { width: colWidths[k] },
                  colStyles?.[rawSheet.name]?.[String(k)]?.bg && {
                    backgroundColor: colStyles[rawSheet.name][String(k)].bg,
                  },
                ]}
                onPress={() => openColMenu(k)}
              >
                <Text
                  style={[
                    styles.colLetterText,
                    colStyles?.[rawSheet.name]?.[String(k)]?.bold && { fontWeight: '900' },
                  ]}
                >
                  {colLetter(k)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* BODY */}
      <View style={styles.bodyRow}>
        <ScrollView ref={leftRef} scrollEnabled={false} showsVerticalScrollIndicator={false} style={styles.rowNumColumn} contentContainerStyle={{ width: ROW_NUMBER_WIDTH }}>
          <View style={{ width: ROW_NUMBER_WIDTH }}>
            {visibleRows.map((cells, rowIdx) => {
              const isSection = isSectionTitleRow(cells);
              return (
                <TouchableOpacity
                  key={`rn-${rowIdx}`}
                  style={[
                    styles.rowNumberCell,
                    isSection && styles.rowNumberCellSection,
                    rowStyles?.[rawSheet.name]?.[String(rawSheet.origin.row + rowIdx)]?.bg && {
                      backgroundColor: rowStyles[rawSheet.name][String(rawSheet.origin.row + rowIdx)].bg,
                    },
                  ]}
                  onPress={() => !isSection && openRowMenu(rowIdx)}
                  disabled={isSection}
                >
                  {!isSection && (
                    <Text
                      style={[
                        styles.rowNumberText,
                        rowStyles?.[rawSheet.name]?.[String(rawSheet.origin.row + rowIdx)]?.bold && { fontWeight: '900' },
                      ]}
                    >
                      {rawSheet.origin.row + rowIdx}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <ScrollView ref={bodyHRef} horizontal onScroll={onBodyHScroll} scrollEventThrottle={16} showsHorizontalScrollIndicator bounces={false} overScrollMode="never" style={styles.hScroll}>
          <ScrollView ref={bodyVRef} onScroll={onBodyVScroll} scrollEventThrottle={16} showsVerticalScrollIndicator>
            <View style={{ width: totalGridWidth }}>
              {visibleRows.map((cells, rowIdx) => {
                // Skip rows covered by a vertical merge — the anchor above
                // already stretches down to cover this row's space.
                if (skipRows.has(rowIdx)) return null;

                const isSection = isSectionTitleRow(cells);
                const isHeader = headerRowFlags[rowIdx];
                const rowBg = isSection ? SECTION_BG : isHeader ? HEADER_BG : rowIdx % 2 === 0 ? DATA_BG_ODD : DATA_BG_EVEN;
                const rowSpan = mergeRowSpan.get(rowIdx) ?? 1;
                const rowHeight = rowSpan * ROW_HEIGHT;
                return (
                  <View key={`row-${rowIdx}`} style={[styles.row, { backgroundColor: rowBg, width: totalGridWidth, height: rowHeight }]}>
                    {isSection ? (
                      <View style={styles.sectionCell}>
                        <Text style={styles.sectionText}>{displayText(cells.find((c) => c && c.v) ?? null).toUpperCase()}</Text>
                      </View>
                    ) : (
                      cells.map((cell, colIdx) => {
                        const width = colWidths[colIdx] ?? COL_DEFAULT;
                        if (isHeader) {
                          return (
                            <View key={`hc-${rowIdx}-${colIdx}`} style={[styles.headerCell, { width }]}>
                              <Text style={styles.headerText} numberOfLines={2}>{displayText(cell)}</Text>
                            </View>
                          );
                        }
                        const excelRow = rawSheet.origin.row + rowIdx;
                        const isHighlighted =
                          highlight !== null &&
                          highlight.row === excelRow &&
                          highlight.col === colIdx;
                        const excelRowNum = rawSheet.origin.row + rowIdx;
                        const mergeKey = `${excelRowNum}_${colIdx}`;
                        const myMerge = mergeLookup.memberOf[mergeKey];
                        const isMergeAnchor = myMerge && myMerge.r1 === excelRowNum && myMerge.c1 === colIdx;
                        // Skip hidden merge members (non-anchor)
                        if (myMerge && !isMergeAnchor) return null;

                        // Compute total width + height if this is a merge anchor
                        let totalWidth = width;
                        let totalHeight: number | undefined = undefined;
                        if (isMergeAnchor && myMerge) {
                          totalWidth = 0;
                          for (let c = colIdx; c <= colIdx + (myMerge.c2 - myMerge.c1); c++) {
                            totalWidth += colWidths[c] ?? COL_DEFAULT;
                          }
                          totalHeight = (myMerge.r2 - myMerge.r1 + 1) * ROW_HEIGHT;
                        }

                        const fmt = cellStyles?.[rawSheet.name]?.[`${excelRowNum}_${colIdx}`] || {};
                        const rfmt = rowStyles?.[rawSheet.name]?.[String(excelRowNum)] || {};
                        const cfmt = colStyles?.[rawSheet.name]?.[String(colIdx)] || {};
                        const cellBg = fmt.bg || rfmt.bg || cfmt.bg || undefined;
                        const isBold = fmt.bold === true || rfmt.bold === true || cfmt.bold === true;
                        const cellAlign = (fmt.align || rfmt.align || cfmt.align) as 'left' | 'center' | 'right' | undefined;

                        const mergeActive = mergeAnchor !== null;

                        // If this is a vertical merge anchor (r2 > r1), the row
                        // already carries the tall height via rowSpan. Cell fills
                        // the full width and stretches to match row height.
                        const isVerticalAnchor =
                          isMergeAnchor && myMerge && myMerge.r2 > myMerge.r1;

                        return (
                          <TouchableOpacity
                            key={`dc-${rowIdx}-${colIdx}`}
                            style={[
                              styles.dataCell,
                              { width: totalWidth },
                              isVerticalAnchor && { flex: 1, alignSelf: 'stretch' },
                              cellBg && { backgroundColor: cellBg },
                              isMergeAnchor && { borderColor: '#0EA5E9', borderWidth: 1 },
                              isHighlighted && styles.dataCellHighlighted,
                              mergeAnchor?.row === excelRowNum && mergeAnchor?.col === colIdx && { backgroundColor: 'rgba(14,165,233,0.35)' },
                            ]}
                            activeOpacity={0.5}
                            onPress={() => {
                              if (mergeActive) {
                                // Completing a merge selection
                                const a = mergeAnchor!;
                                setMergePending({
                                  r1: Math.min(a.row, excelRowNum),
                                  c1: Math.min(a.col, colIdx),
                                  r2: Math.max(a.row, excelRowNum),
                                  c2: Math.max(a.col, colIdx),
                                });
                                setMergeAnchor(null);
                              } else {
                                openEditor(rowIdx, colIdx);
                              }
                            }}
                            onLongPress={() => {
                              setMergeAnchor({ row: excelRowNum, col: colIdx });
                            }}
                            delayLongPress={400}
                          >
                            <Text
                              style={[
                                styles.dataText,
                                isBold && { fontWeight: '700' },
                                cellAlign && { textAlign: cellAlign },
                                isHighlighted && styles.dataTextHighlighted,
                              ]}
                              numberOfLines={2}
                            >
                              {displayText(cell)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                );
              })}

              {/* Overlays — user-uploaded + auto-converted Excel images + charts */}
              {overlays.map((o) => {
                if (o.col >= colCount) return null;
                let left = 0;
                for (let c = 0; c < o.col; c++) left += colWidths[c] ?? COL_DEFAULT;
                const top = o.row * ROW_HEIGHT;
                const size = overlayPx((o as any).scalePercent, o.size);
                const isSelected = selectedId === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    activeOpacity={0.9}
                    onPress={() => setSelectedId(o.id)}
                    style={{ position: 'absolute', top, left, width: size + 20, height: size + 20 }}
                  >
                    {o.type === 'image' && o.imageUri ? (
                      <Image source={{ uri: o.imageUri }} style={{ width: size, height: size }} resizeMode="contain" />
                    ) : o.type === 'chart' && o.chartConfig ? (
                      <ChartRenderer config={o.chartConfig} width={size * 2} height={size * 1.4} />
                    ) : null}
                    {isSelected && (
                      <View style={[styles.overlayBorder, { width: size + 20, height: size + 20 }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {/* Overlay toolbar — appears when an overlay is selected */}
      {selected && (
        <View style={styles.overlayToolbar}>
          <TouchableOpacity style={styles.toolBtn} onPress={() => onUpdateOverlay(selected.id, { row: Math.max(0, selected.row - 1) })}>
            <ChevronUp size={16} color={ACCENT} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => onUpdateOverlay(selected.id, { row: selected.row + 1 })}>
            <ChevronDown size={16} color={ACCENT} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => onUpdateOverlay(selected.id, { col: Math.max(0, selected.col - 1) })}>
            <ChevronLeft size={16} color={ACCENT} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => onUpdateOverlay(selected.id, { col: selected.col + 1 })}>
            <ChevronRight size={16} color={ACCENT} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.toolDivider} />
          <TouchableOpacity style={styles.toolBtn} onPress={() => onUpdateOverlay(selected.id, { size: 'small', scalePercent: 50 } as any)}>
            <Text style={styles.toolBtnText}>50%</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => onUpdateOverlay(selected.id, { size: 'medium', scalePercent: 100 } as any)}>
            <Text style={styles.toolBtnText}>100%</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => onUpdateOverlay(selected.id, { size: 'large', scalePercent: 200 } as any)}>
            <Text style={styles.toolBtnText}>200%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, styles.toolBtnWide]}
            onPress={() => {
              setScaleInput(String((selected as any).scalePercent ?? 100));
              setScaleModal(selected.id);
            }}
          >
            <Text style={styles.toolBtnText}>
              {(selected as any).scalePercent ?? (selected.size === 'small' ? 50 : selected.size === 'large' ? 200 : 100)}%
            </Text>
          </TouchableOpacity>
          <View style={styles.toolDivider} />
          <TouchableOpacity style={[styles.toolBtn, { borderColor: 'rgba(239,68,68,0.4)' }]} onPress={() => { onDeleteOverlay(selected.id); setSelectedId(null); }}>
            <Trash2 size={14} color="#EF4444" strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setSelectedId(null)}>
            <X size={14} color="#64748B" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {/* Scale percentage modal */}
      <Modal visible={scaleModal !== null} transparent animationType="fade" onRequestClose={() => setScaleModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scale %</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setScaleModal(null)}>
                <X size={18} color="#8E8E94" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              value={scaleInput}
              onChangeText={setScaleInput}
              keyboardType="number-pad"
              autoFocus
              placeholder="100"
              placeholderTextColor="#5A5A60"
            />
            <Text style={styles.scaleHint}>10 – 5000. Examples: 25, 150, 500, 1000</Text>
            <View style={styles.scaleQuickRow}>
              {[25, 50, 100, 200, 300, 500, 1000].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.scaleChip}
                  onPress={() => setScaleInput(String(p))}
                >
                  <Text style={styles.scaleChipText}>{p}%</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setScaleModal(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => {
                  const pct = Math.max(OVERLAY_MIN_PCT, Math.min(OVERLAY_MAX_PCT, parseInt(scaleInput, 10) || 100));
                  if (scaleModal) onUpdateOverlay(scaleModal, { scalePercent: pct } as any);
                  setScaleModal(null);
                }}
              >
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.modalSaveText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Merge banner — shown while selecting */}
      {mergeAnchor && (
        <View style={styles.mergeBanner}>
          <Text style={styles.mergeBannerText}>
            Merge mode: starting at {colLetter(mergeAnchor.col)}{mergeAnchor.row}. Tap another cell to complete.
          </Text>
          <TouchableOpacity
            style={styles.mergeBannerCancel}
            onPress={() => setMergeAnchor(null)}
          >
            <Text style={styles.mergeBannerCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Merge confirmation modal */}
      <Modal visible={mergePending !== null} transparent animationType="fade" onRequestClose={() => setMergePending(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Merge cells</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setMergePending(null)}>
                <X size={18} color="#8E8E94" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <Text style={styles.mergeInfo}>
              {mergePending
                ? `Range: ${colLetter(mergePending.c1)}${mergePending.r1} → ${colLetter(mergePending.c2)}${mergePending.r2}`
                : ''}
            </Text>
            <Text style={styles.mergeInfoSub}>
              {mergePending ? `${(mergePending.r2 - mergePending.r1 + 1) * (mergePending.c2 - mergePending.c1 + 1)} cells will become one.` : ''}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setMergePending(null)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => {
                  if (mergePending && onAddMerge) {
                    onAddMerge(rawSheet.name, mergePending.r1, mergePending.c1, mergePending.r2, mergePending.c2);
                  }
                  setMergePending(null);
                }}
              >
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.modalSaveText}>Merge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Row/Column menu modal */}
      <Modal visible={menu !== null} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {menu?.kind === 'row' ? 'Row ' + menu.index : 'Column ' + (menu ? colLetter(menu.index) : '')}
              </Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setMenu(null)}>
                <X size={18} color="#8E8E94" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Move up/down or left/right */}
            <View style={styles.moveRow}>
              <TouchableOpacity
                style={styles.moveBtn}
                onPress={() => {
                  if (!menu) return;
                  if (menu.kind === 'row' && onMoveRow) onMoveRow(rawSheet.name, menu.index, -1);
                  else if (menu.kind === 'col' && onMoveColumn) onMoveColumn(rawSheet.name, menu.index, -1);
                  setMenu(null);
                }}
              >
                <ChevronUp size={18} color="#0EA5E9" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moveBtn}
                onPress={() => {
                  if (!menu) return;
                  if (menu.kind === 'row' && onMoveRow) onMoveRow(rawSheet.name, menu.index, 1);
                  else if (menu.kind === 'col' && onMoveColumn) onMoveColumn(rawSheet.name, menu.index, 1);
                  setMenu(null);
                }}
              >
                <ChevronDown size={18} color="#0EA5E9" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <Text style={styles.moveHint}>
              {menu?.kind === 'row' ? 'Move row up or down' : 'Move column left or right'}
            </Text>

            {/* Bold + color picker */}
            <View style={styles.formatRow}>
              <TouchableOpacity
                style={[styles.formatBtn, menuBold && styles.formatBtnActive]}
                onPress={() => setMenuBold((b) => !b)}
              >
                <Text style={[styles.formatBtnText, menuBold && styles.formatBtnTextActive]}>B</Text>
              </TouchableOpacity>
              <View style={styles.formatSpacer} />
              {[
                { label: 'None', value: undefined },
                { label: 'Yellow', value: '#FEF08A' },
                { label: 'Green', value: '#BBF7D0' },
                { label: 'Red', value: '#FECACA' },
                { label: 'Blue', value: '#BFDBFE' },
                { label: 'Purple', value: '#DDD6FE' },
              ].map((c) => (
                <TouchableOpacity
                  key={c.label}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c.value || '#FFFFFF', borderWidth: 2, borderColor: menuBg === c.value ? '#0EA5E9' : '#E2E8F0' },
                  ]}
                  onPress={() => setMenuBg(c.value)}
                >
                  {!c.value && <Text style={{ fontSize: 10, color: '#94A3B8' }}>×</Text>}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setMenu(null)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={applyMenu}>
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.modalSaveText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={cancelEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('editCell')}</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={cancelEdit}><X size={18} color="#8E8E94" strokeWidth={2.5} /></TouchableOpacity>
            </View>
            <TextInput style={styles.modalInput} value={editing?.value ?? ''} onChangeText={(text) => setEditing((prev) => prev ? { ...prev, value: text } : prev)} autoFocus multiline placeholderTextColor="#5A5A60" />

            {/* Alignment row */}
            <View style={styles.formatRow}>
              {(['left', 'center', 'right'] as const).map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.formatBtn, editing?.align === a && styles.formatBtnActive]}
                  onPress={() =>
                    setEditing((prev) =>
                      prev ? { ...prev, align: prev.align === a ? undefined : a } : prev
                    )
                  }
                >
                  <Text
                    style={[
                      styles.formatBtnText,
                      editing?.align === a && styles.formatBtnTextActive,
                    ]}
                  >
                    {a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Formatting row */}
            <View style={styles.formatRow}>
              <TouchableOpacity
                style={[styles.formatBtn, editing?.bold && styles.formatBtnActive]}
                onPress={() => setEditing((prev) => prev ? { ...prev, bold: !prev.bold } : prev)}
              >
                <Text style={[styles.formatBtnText, editing?.bold && styles.formatBtnTextActive]}>B</Text>
              </TouchableOpacity>
              <View style={styles.formatSpacer} />
              {[
                { label: 'None', value: undefined },
                { label: 'Yellow', value: '#FEF08A' },
                { label: 'Green', value: '#BBF7D0' },
                { label: 'Red', value: '#FECACA' },
                { label: 'Blue', value: '#BFDBFE' },
                { label: 'Purple', value: '#DDD6FE' },
              ].map((c) => (
                <TouchableOpacity
                  key={c.label}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c.value || '#FFFFFF', borderWidth: 2, borderColor: editing?.bg === c.value ? '#0EA5E9' : '#E2E8F0' },
                  ]}
                  onPress={() => setEditing((prev) => prev ? { ...prev, bg: c.value } : prev)}
                >
                  {!c.value && <Text style={{ fontSize: 10, color: '#94A3B8' }}>×</Text>}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelEdit}><Text style={styles.modalCancelText}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEdit}><Check size={18} color="#FFFFFF" strokeWidth={2.5} /><Text style={styles.modalSaveText}>{t('save')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: { flexDirection: 'row', height: COL_LETTER_HEIGHT, backgroundColor: ROW_NUM_BG, borderBottomWidth: 0.5, borderBottomColor: GRID_LINE },
  cornerCell: { width: 20, height: COL_LETTER_HEIGHT, backgroundColor: ROW_NUM_BG, borderRightWidth: 0.5, borderRightColor: GRID_LINE },
  colLettersRow: { flexDirection: 'row', height: COL_LETTER_HEIGHT },
  colLetterCell: { height: COL_LETTER_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: GRID_LINE },
  colLetterText: { color: ROW_NUM_TEXT, fontSize: 8, fontWeight: '700' },
  bodyRow: { flex: 1, flexDirection: 'row' },
  rowNumColumn: { width: 20, minWidth: 20, maxWidth: 20, flexShrink: 0, flexGrow: 0, backgroundColor: ROW_NUM_BG, borderRightWidth: 0.5, borderRightColor: GRID_LINE, overflow: 'hidden' },
  rowNumberCell: { width: 20, minWidth: 20, maxWidth: 20, height: ROW_HEIGHT, minHeight: ROW_HEIGHT, maxHeight: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', backgroundColor: ROW_NUM_BG, borderBottomWidth: 0.5, borderBottomColor: GRID_LINE },
  rowNumberCellSection: { backgroundColor: SECTION_BG },
  rowNumberText: { color: ROW_NUM_TEXT, fontSize: 9, fontWeight: '600', textAlign: 'center' },
  hScroll: { flex: 1 },
  row: { flexDirection: 'row', height: ROW_HEIGHT, minHeight: ROW_HEIGHT, maxHeight: ROW_HEIGHT, borderBottomWidth: 0.5, borderBottomColor: GRID_LINE },
  sectionCell: { flex: 1, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'flex-start' },
  sectionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  headerCell: { paddingHorizontal: 8, justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: GRID_LINE, backgroundColor: HEADER_BG },
  headerText: { color: TEXT_HEADER, fontSize: 11, fontWeight: '700' },
  dataCell: { paddingHorizontal: 6, paddingVertical: 4, justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: GRID_LINE },
  dataText: { color: TEXT_DATA, fontSize: 10 },
  dataCellHighlighted: {
    backgroundColor: 'rgba(14,165,233,0.22)',
    borderWidth: 2,
    borderColor: '#0EA5E9',
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  dataTextHighlighted: {
    color: '#0F172A',
    fontWeight: '700',
  },
  overlayBorder: { position: 'absolute', top: -2, left: -2, borderWidth: 2, borderColor: ACCENT, borderRadius: 4, borderStyle: 'dashed' },
  overlayToolbar: { flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: GRID_LINE, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  toolBtn: { minWidth: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(14,165,233,0.35)', backgroundColor: '#FFFFFF' },
  toolBtnWide: { minWidth: 56, paddingHorizontal: 6 },
  scaleHint: { color: '#94A3B8', fontSize: 11, textAlign: 'center', marginTop: -10, marginBottom: 12, paddingHorizontal: 20 },
  scaleQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, marginBottom: 16 },
  scaleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(14,165,233,0.35)', backgroundColor: 'rgba(14,165,233,0.08)' },
  scaleChipText: { color: ACCENT, fontSize: 12, fontWeight: '700' },
  toolBtnText: { color: ACCENT, fontSize: 12, fontWeight: '700' },
  toolDivider: { width: 1, height: 24, backgroundColor: GRID_LINE, marginHorizontal: 4 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { color: '#94A3B8', fontSize: 14 },
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 12, flexWrap: 'wrap' },
  formatSpacer: { width: 1, height: 24, backgroundColor: '#E2E8F0' },
  formatBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  formatBtnActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.12)' },
  formatBtnText: { color: '#0F172A', fontSize: 16, fontWeight: '500' },
  formatBtnTextActive: { color: '#0EA5E9', fontWeight: '900' },
  colorChip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moveRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, justifyContent: 'center' },
  moveBtn: { width: 60, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(14,165,233,0.35)', backgroundColor: 'rgba(14,165,233,0.08)', alignItems: 'center', justifyContent: 'center' },
  moveHint: { color: '#94A3B8', fontSize: 12, textAlign: 'center', paddingBottom: 12 },
  mergeBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(14,165,233,0.15)', borderTopWidth: 1, borderTopColor: '#0EA5E9', paddingHorizontal: 12, paddingVertical: 10 },
  mergeBannerText: { flex: 1, color: '#0F172A', fontSize: 12, fontWeight: '600' },
  mergeBannerCancel: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#0EA5E9' },
  mergeBannerCancelText: { color: '#0EA5E9', fontSize: 12, fontWeight: '700' },
  mergeInfo: { color: '#0F172A', fontSize: 15, fontWeight: '700', paddingHorizontal: 20, paddingTop: 12 },
  mergeInfoSub: { color: '#64748B', fontSize: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 18, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#E2E8F0' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  modalTitle: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalInput: { margin: 20, minHeight: 80, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: '#0F172A', fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 20 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  modalCancelText: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  modalSaveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: ACCENT },
  modalSaveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
