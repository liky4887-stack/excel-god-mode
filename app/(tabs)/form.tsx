import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import { SheetGridView } from '@/components/SheetGridView';
import { ChartBuilderModal } from '@/components/ChartBuilderModal';
import { ChartSpec } from '@/types';

export default function FormScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const {
    activeTemplate,
    updateRawCell,
    addRawRow,
    addRawColumn,
    insertRawRow,
    insertRawColumn,
    updateRawImage,
    deleteRawImage,
    addRawImage,
    addRawChart,
    navigationTarget,
    setNavigationTarget,
  } = useExcel();

  const [selectedSheet, setSelectedSheet] = useState('');
  const [focusCell, setFocusCell] = useState<{ row: number; col: number; nonce: number } | null>(null);
  const [imagePosition, setImagePosition] = useState<{ row: number; col: number } | null>(null);
  const [chartPosition, setChartPosition] = useState<{ row: number; col: number } | null>(null);

  const workbook = activeTemplate?.workbook;

  // Auto-select first sheet
  useMemo(() => {
    if (!selectedSheet && workbook?.sheets?.length) {
      setSelectedSheet(workbook.sheets[0].name);
    }
  }, [workbook, selectedSheet]);

  // React to navigation target from search
  useEffect(() => {
    if (navigationTarget) {
      setSelectedSheet(navigationTarget.sheet);
      setFocusCell({
        row: navigationTarget.row,
        col: navigationTarget.col,
        nonce: navigationTarget.nonce,
      });
      setNavigationTarget(null);
    }
  }, [navigationTarget, setNavigationTarget]);

  const handleSelectSheet = useCallback((name: string) => {
    setSelectedSheet(name);
    setFocusCell(null);
  }, []);

  const handleImport = useCallback(() => {
    router.push('/import');
  }, [router]);

  const selectedRawSheet = workbook?.rawSheets?.[selectedSheet] ?? null;

  const handleCellEdit = useCallback((row: number, col: number, newValue: string) => {
    updateRawCell(selectedSheet, row, col, newValue);
  }, [selectedSheet, updateRawCell]);

  const handleAddRow = useCallback(() => {
    if (selectedSheet) addRawRow(selectedSheet);
  }, [selectedSheet, addRawRow]);

  const handleAddColumn = useCallback(() => {
    if (selectedSheet) addRawColumn(selectedSheet);
  }, [selectedSheet, addRawColumn]);

  const handleInsertRowAbove = useCallback((row: number) => {
    if (selectedSheet) insertRawRow(selectedSheet, row);
  }, [selectedSheet, insertRawRow]);

  const handleInsertRowBelow = useCallback((row: number) => {
    if (selectedSheet) insertRawRow(selectedSheet, row + 1);
  }, [selectedSheet, insertRawRow]);

  const handleInsertColRight = useCallback((col: number) => {
    if (selectedSheet) insertRawColumn(selectedSheet, col + 1);
  }, [selectedSheet, insertRawColumn]);

  const handleUpdateImage = useCallback((imageId: string, patch: { rowSpan?: number; colSpan?: number }) => {
    if (selectedSheet) updateRawImage(selectedSheet, imageId, patch);
  }, [selectedSheet, updateRawImage]);

  const handleDeleteImage = useCallback((imageId: string) => {
    if (selectedSheet) deleteRawImage(selectedSheet, imageId);
  }, [selectedSheet, deleteRawImage]);

  const handleAddImage = useCallback(async () => {
    if (!selectedSheet || !imagePosition) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/jpg'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) { setImagePosition(null); return; }
      const asset = res.assets[0];
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime = asset.mimeType || 'image/png';
      const dataUri = `data:${mime};base64,${b64}`;
      await addRawImage(selectedSheet, imagePosition.row, imagePosition.col, dataUri);
    } catch {}
    setImagePosition(null);
  }, [selectedSheet, imagePosition, addRawImage]);

  const handleInsertChart = useCallback(async (spec: ChartSpec, position: { row: number; col: number }) => {
    if (!selectedSheet) return;
    await addRawChart(selectedSheet, position.row, position.col, spec);
    setChartPosition(null);
  }, [selectedSheet, addRawChart]);

  if (!workbook || workbook.sheets.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('quickEntry')}</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('noWorkbook')}</Text>
          <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
            <Text style={styles.importBtnText}>{t('importTemplate')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('quickEntry')}</Text>

      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleAddRow} activeOpacity={0.7}>
          <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
          <Text style={styles.headerBtnText}>{t('addRow')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={handleAddColumn} activeOpacity={0.7}>
          <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
          <Text style={styles.headerBtnText}>{t('addColumn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setImagePosition({ row: focusCell?.row ?? 0, col: focusCell?.col ?? 0 })}
          activeOpacity={0.7}
        >
          <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
          <Text style={styles.headerBtnText}>{t('addImage')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setChartPosition({ row: focusCell?.row ?? 0, col: focusCell?.col ?? 0 })}
          activeOpacity={0.7}
        >
          <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
          <Text style={styles.headerBtnText}>{t('addChart')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sheetTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {workbook.sheets.map((s) => (
            <TouchableOpacity
              key={s.name}
              style={[styles.sheetTab, selectedSheet === s.name && styles.sheetTabActive]}
              onPress={() => handleSelectSheet(s.name)}
            >
              <Text style={[styles.sheetTabText, selectedSheet === s.name && styles.sheetTabTextActive]}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.gridWrap}>
        {selectedRawSheet ? (
          <SheetGridView
            rawSheet={selectedRawSheet}
            onCellEdit={handleCellEdit}
            onInsertRowAbove={handleInsertRowAbove}
            onInsertRowBelow={handleInsertRowBelow}
            onInsertColRight={handleInsertColRight}
            onUpdateImage={handleUpdateImage}
            onDeleteImage={handleDeleteImage}
            focusCell={focusCell}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('noRecords')}</Text>
          </View>
        )}
      </View>

      {/* Image position picker */}
      <Modal visible={imagePosition !== null} transparent animationType="fade" onRequestClose={() => setImagePosition(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('addImage')}</Text>
            <Text style={styles.modalHint}>{t('positionRow')} / {t('positionCol')}</Text>
            <View style={styles.posRow}>
              <TextInput
                style={styles.posInput}
                value={String(imagePosition?.row ?? 0)}
                onChangeText={(v) => setImagePosition({ row: parseInt(v, 10) || 0, col: imagePosition?.col ?? 0 })}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#94A3B8"
              />
              <TextInput
                style={styles.posInput}
                value={String(imagePosition?.col ?? 0)}
                onChangeText={(v) => setImagePosition({ row: imagePosition?.row ?? 0, col: parseInt(v, 10) || 0 })}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setImagePosition(null)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleAddImage}>
                <Text style={styles.modalSaveText}>{t('addImage')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Chart builder */}
      <ChartBuilderModal
        visible={chartPosition !== null}
        initialPosition={chartPosition ?? { row: 0, col: 0 }}
        onClose={() => setChartPosition(null)}
        onInsert={handleInsertChart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  headerActions: { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.35)',
    backgroundColor: 'rgba(14,165,233,0.1)',
  },
  headerBtnText: { color: '#0EA5E9', fontSize: 11, fontWeight: '700' },
  sheetTabs: { marginBottom: 12 },
  sheetTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#121212',
    marginRight: 8,
  },
  sheetTabActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.12)' },
  sheetTabText: { fontSize: 14, color: '#666' },
  sheetTabTextActive: { color: '#0EA5E9', fontWeight: '600' },
  gridWrap: { flex: 1, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#222', marginBottom: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 18, color: '#666' },
  importBtn: { backgroundColor: '#0EA5E9', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  importBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#121212', borderRadius: 18, padding: 24, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#1E1E1E' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 6 },
  modalHint: { color: '#64748B', fontSize: 13, marginBottom: 16 },
  posRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  posInput: { flex: 1, backgroundColor: '#0A0A0A', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E1E', paddingHorizontal: 14, paddingVertical: 12, color: '#FFF', fontSize: 16, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1E1E1E', alignItems: 'center' },
  modalCancelText: { color: '#94A3B8', fontWeight: '600' },
  modalSaveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0EA5E9', alignItems: 'center' },
  modalSaveText: { color: '#FFFFFF', fontWeight: '700' },
});
