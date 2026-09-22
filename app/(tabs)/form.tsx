import { ScreenBoundary } from '@/components/ScreenBoundary';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, Alert} from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import { SheetGridView } from '@/components/SheetGridView';
import { ChartBuilderModal } from '@/components/ChartBuilderModal';
import { ChartSpec } from '@/types';

function FormScreenInner() {
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
    setNavigationTarget, updateOverlay, deleteOverlay, addOverlay, overlays, updateCellStyle, cellStyles, updateRowStyle, updateColStyle, moveRow, moveColumn, rowStyles, colStyles, addMerge, removeMerge, merges, updateCellAndStyle, addSheet, deleteSheet} = useExcel();

  const [selectedSheet, setSelectedSheet] = useState('');
  const [focusCell, setFocusCell] = useState<{ row: number; col: number; nonce: number } | null>(null);
  const [imagePosition, setImagePosition] = useState<{ row: number; col: number } | null>(null);
  const [chartPosition, setChartPosition] = useState<{ row: number; col: number } | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [newSheetHeaders, setNewSheetHeaders] = useState('');

  const workbook = activeTemplate?.workbook;

  const sheetOverlays = useMemo(() => {
    return (overlays || []).filter((o: any) => o.sheetName === selectedSheet);
  }, [overlays, selectedSheet]);

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

  const handleOpenAddSheet = useCallback(() => {
    setNewSheetName('');
    setNewSheetHeaders('');
    setShowAddSheet(true);
  }, []);

  const handleConfirmAddSheet = useCallback(async () => {
    const name = newSheetName.trim();
    if (!name) {
      Alert.alert('Sheet name required', 'Please enter a name for the new sheet.');
      return;
    }
    const existing = (workbook?.sheets || []).map((s) => s.name.toLowerCase());
    if (existing.includes(name.toLowerCase())) {
      Alert.alert('Name already used', 'A sheet with that name already exists.');
      return;
    }
    const headers = newSheetHeaders
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);

    await addSheet(name, headers);
    setShowAddSheet(false);
    setSelectedSheet(name); // switch to the new sheet
  }, [newSheetName, newSheetHeaders, workbook, addSheet]);

  const handleDeleteSheet = useCallback((sheetName: string) => {
    if (!workbook || workbook.sheets.length <= 1) {
      Alert.alert('Cannot delete', 'You need at least one sheet.');
      return;
    }
    Alert.alert(
      'Delete sheet?',
      `"${sheetName}" and all its data will be removed from the export.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSheet(sheetName);
            if (selectedSheet === sheetName) {
              const remaining = workbook.sheets.filter((s) => s.name !== sheetName);
              if (remaining.length) setSelectedSheet(remaining[0].name);
            }
          },
        },
      ]
    );
  }, [workbook, deleteSheet, selectedSheet]);

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
    if (!selectedSheet || !addOverlay) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/jpg'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];

      // Size guard — reject anything over 15MB before we even try to compress
      if (asset.size && asset.size > 15 * 1024 * 1024) {
        Alert.alert('Image too large', 'Please use an image under 15 MB.');
        return;
      }

      // Compress: resize to max 1400px wide, JPEG quality 0.75
      // Typical result: 4MB phone photo -> ~180KB (a ~20x reduction)
      const manipResult = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1400 } }],
        {
          compress: 0.75,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      if (!manipResult.base64) {
        Alert.alert('Compression failed', 'Could not process the image.');
        return;
      }

      const dataUri = 'data:image/jpeg;base64,' + manipResult.base64;

      if (__DEV__) {
        const origKB = asset.size ? Math.round(asset.size / 1024) : '?';
        const newKB = Math.round(manipResult.base64.length * 0.75 / 1024);
        console.log('[image] compressed', origKB + 'KB ->', newKB + 'KB');
      }

      // Auto-offset: stack new images below existing ones on the same sheet
      const existingOnSheet = (overlays || []).filter(
        (o: any) => o.sheetName === selectedSheet
      );
      const nextRow = 2 + existingOnSheet.length * 5;  // 5 rows apart

      await addOverlay({
        id: 'img_' + Date.now(),
        sheetName: selectedSheet,
        row: nextRow,
        col: 2,
        type: 'image',
        imageUri: dataUri,
        size: 'medium',
        createdAt: Date.now(),
      });
    } catch (e: any) {
      Alert.alert('Image error', e?.message || 'Failed to add image');
    }
  }, [selectedSheet, addOverlay]);

  const handleInsertChart = useCallback(async (spec: ChartSpec, position: { row: number; col: number }) => {
    if (!selectedSheet) return;
    await addRawChart(selectedSheet, position.row, position.col, spec);
    setChartPosition(null);
  }, [selectedSheet, addRawChart]);

  const handleAddChart = useCallback(async (config: any, pngDataUri?: string) => {
    if (!selectedSheet || !addOverlay) return;
    await addOverlay({
      id: 'chart_' + Date.now(),
      sheetName: selectedSheet,
      row: 5,
      col: 5,
      type: 'chart',
      chartConfig: config,
      imageUri: pngDataUri,
      size: 'medium',
      createdAt: Date.now(),
    });
    setShowChartModal(false);
  }, [selectedSheet, addOverlay]);

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
          onPress={() => handleAddImage()}
          activeOpacity={0.7}
        >
          <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
          <Text style={styles.headerBtnText}>{t('addImage')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setShowChartModal(true)}
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
              onLongPress={() => handleDeleteSheet(s.name)}
            >
              <Text style={[styles.sheetTabText, selectedSheet === s.name && styles.sheetTabTextActive]}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.addSheetTab}
            onPress={handleOpenAddSheet}
            activeOpacity={0.7}
          >
            <Plus size={16} color="#0EA5E9" strokeWidth={2.5} />
            <Text style={styles.addSheetTabText}>Sheet</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.gridWrap}>
        {selectedRawSheet ? (
          <SheetGridView
              rawSheet={selectedRawSheet}
              onCellEdit={handleCellEdit}
              overlays={sheetOverlays}
              onAddOverlay={addOverlay}
              onUpdateOverlay={updateOverlay}
              onDeleteOverlay={deleteOverlay}
              focusCell={focusCell}
              cellStyles={cellStyles}
              onSetCellStyle={updateCellStyle}
              onUpdateCellAndStyle={updateCellAndStyle}
              rowStyles={rowStyles}
              colStyles={colStyles}
              onSetRowStyle={updateRowStyle}
              onSetColStyle={updateColStyle}
              onMoveRow={moveRow}
              onMoveColumn={moveColumn}
              merges={merges}
              onAddMerge={addMerge}
              onRemoveMerge={removeMerge}
            />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('noRecords')}</Text>
          </View>
        )}
      </View>

      {/* Add Sheet modal */}
      <Modal visible={showAddSheet} transparent animationType="fade" onRequestClose={() => setShowAddSheet(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.addSheetOverlay}
        >
          <View style={styles.addSheetCard}>
            <Text style={styles.addSheetTitle}>Add Sheet</Text>

            <Text style={styles.addSheetLabel}>SHEET NAME</Text>
            <TextInput
              style={styles.addSheetInput}
              value={newSheetName}
              onChangeText={setNewSheetName}
              placeholder="e.g. Fuel Log"
              placeholderTextColor="#5A6577"
              autoCapitalize="words"
              autoFocus
            />

            <Text style={styles.addSheetLabel}>COLUMN HEADERS (comma-separated, optional)</Text>
            <TextInput
              style={[styles.addSheetInput, { minHeight: 60, textAlignVertical: 'top' }]}
              value={newSheetHeaders}
              onChangeText={setNewSheetHeaders}
              placeholder="Date, Truck ID, Fuel, Cost"
              placeholderTextColor="#5A6577"
              multiline
            />

            <View style={styles.addSheetActions}>
              <TouchableOpacity
                style={styles.addSheetCancelBtn}
                onPress={() => setShowAddSheet(false)}
              >
                <Text style={styles.addSheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addSheetConfirmBtn}
                onPress={handleConfirmAddSheet}
              >
                <Text style={styles.addSheetConfirmText}>Add Sheet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
        visible={showChartModal}
        onClose={() => setShowChartModal(false)}
        onCreate={handleAddChart}
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
  addSheetTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(14,165,233,0.4)',
    backgroundColor: 'rgba(14,165,233,0.05)',
    marginRight: 8,
  },
  addSheetTabText: { fontSize: 13, color: '#0EA5E9', fontWeight: '700' },
  addSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7,9,13,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  addSheetCard: {
    backgroundColor: '#0F131A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#252E3D',
    padding: 20,
    width: '100%',
    maxWidth: 420,
  },
  addSheetTitle: { color: '#EDF1F8', fontSize: 20, fontWeight: '800', marginBottom: 16 },
  addSheetLabel: { color: '#8894A8', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginTop: 12, marginBottom: 6 },
  addSheetInput: {
    backgroundColor: '#07090D',
    borderWidth: 1,
    borderColor: '#252E3D',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#EDF1F8',
    fontSize: 15,
  },
  addSheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  addSheetCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252E3D',
    alignItems: 'center',
  },
  addSheetCancelText: { color: '#8894A8', fontSize: 15, fontWeight: '600' },
  addSheetConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
  },
  addSheetConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

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

function FormScreen() {
  return (
    <ScreenBoundary screenName="Quick Entry">
      <FormScreenInner />
    </ScreenBoundary>
  );
}

export default FormScreen;
