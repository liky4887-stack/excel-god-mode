import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Plus, Save, Calculator, Trash2 } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import FormField from '@/components/FormField';
import CalculationPreview from '@/components/CalculationPreview';
import { CustomFieldModal } from '@/components/CustomFieldModal';
import { previewCalculations } from '@/src/calcEngine';
import { FieldMapping } from '@/types';

export default function FormScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { workbook, addRecord, updateRecord, deleteRecord, addCustomField } = useExcel();
  const [selectedSheet, setSelectedSheet] = useState(workbook?.sheets[0]?.name || '');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [showCalc, setShowCalc] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const sheetMappings = useMemo(() =>
    workbook ? workbook.mappings.filter((m) => m.sheetName === selectedSheet) : [],
  [workbook, selectedSheet]);

  const sheetRecords = useMemo(() =>
    workbook ? workbook.records.map((r, i) => ({ record: r, index: i })).filter(({ record }) => record._sheetName === selectedSheet) : [],
  [workbook, selectedSheet]);

  const calcResults = useMemo(() =>
    workbook && Object.keys(formData).length > 0 ? previewCalculations(workbook, formData) : [],
  [workbook, formData]);

  const handleSelectSheet = useCallback((name: string) => {
    setSelectedSheet(name);
    setFormData({});
    setEditingIndex(null);
  }, []);

  const handleImport = useCallback(() => {
    router.push('/import');
  }, [router]);

  const handleStartNew = useCallback(() => {
    setEditingIndex(null);
    const init: Record<string, string | number> = { _sheetName: selectedSheet };
    sheetMappings.forEach((m) => { init[`${m.sheetName}.${m.column}`] = m.fieldType === 'number' ? 0 : ''; });
    setFormData(init);
  }, [selectedSheet, sheetMappings]);

  const handleStartEdit = useCallback((index: number) => {
    setEditingIndex(index);
    if (!workbook) return; setFormData({ ...workbook.records[index] });
  }, [workbook]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (editingIndex !== null) await updateRecord(editingIndex, formData);
      else await addRecord(formData);
      setFormData({}); setEditingIndex(null);
      Alert.alert(t('save'), t('done'));
    } finally { setSaving(false); }
  }, [editingIndex, formData, addRecord, updateRecord, t]);

  const handleDelete = useCallback((index: number) => {
    Alert.alert(t('delete'), t('confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => deleteRecord(index) },
    ]);
  }, [t, deleteRecord]);

  const handleToggleCalc = useCallback(() => {
    setShowCalc((prev) => !prev);
  }, []);

  const handleOpenModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setFormData({});
    setEditingIndex(null);
  }, []);

  if (!workbook || workbook.sheets.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('quickEntry')}</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('noWorkbook')}</Text>
          <TouchableOpacity style={styles.importBtn} onPress={() => router.push('/import')}>
            <Text style={styles.importBtnText}>{t('importTemplate')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('quickEntry')}</Text>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.sheetTabs}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {workbook.sheets.map((s) => (
              <TouchableOpacity key={s.name} style={[styles.sheetTab, selectedSheet === s.name && styles.sheetTabActive]} onPress={() => handleSelectSheet(s.name)}>
                <Text style={[styles.sheetTabText, selectedSheet === s.name && styles.sheetTabTextActive]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {Object.keys(formData).length > 0 && (
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>{editingIndex !== null ? t('editRecord') : t('newRecord')}</Text>
            {sheetMappings.map((m) => {
              const key = `${m.sheetName}.${m.column}`;
              return (
                <FormField key={m.id} mapping={m} value={formData[key] ?? ''} onChangeText={(text: string) => {
                  const val = m.fieldType === 'number' ? (Number(text) || 0) : text;
                  setFormData((prev) => ({ ...prev, [key]: val }));
                }} />
              );
            })}
            {calcResults.length > 0 && (
              <TouchableOpacity style={styles.calcToggle} onPress={handleToggleCalc}>
                <Calculator size={18} color="#00D9A3" strokeWidth={2} />
                <Text style={styles.calcToggleText}>{t('calculationPreview')}</Text>
              </TouchableOpacity>
            )}
            {showCalc && calcResults.length > 0 && <CalculationPreview results={calcResults} />}
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                <Save size={18} color="#0A0A0A" strokeWidth={2.5} />
                <Text style={styles.saveBtnText}>{saving ? t('saving') : t('save')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelEdit}>
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={handleStartNew}>
          <Plus size={18} color="#00D9A3" strokeWidth={2} />
          <Text style={styles.addBtnText}>{t('addRecord')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.customFieldBtn} onPress={handleOpenModal}>
          <Plus size={18} color="#3B9EFF" strokeWidth={2} />
          <Text style={styles.customFieldBtnText}>{t('addField')}</Text>
        </TouchableOpacity>

        <View style={styles.recordsSection}>
          <Text style={styles.sectionTitle}>{t('records')} ({sheetRecords.length})</Text>
          {sheetRecords.length === 0 ? (
            <Text style={styles.noRecords}>{t('noRecords')}</Text>
          ) : (
            sheetRecords.map(({ record, index }) => (
              <View key={index} style={styles.recordCard}>
                <TouchableOpacity style={styles.recordInfo} onPress={() => handleStartEdit(index)}>
                  {sheetMappings.slice(0, 3).map((m) => {
                    const key = `${m.sheetName}.${m.column}`;
                    return (
                      <View key={m.id} style={styles.recordField}>
                        <Text style={styles.recordFieldLabel} numberOfLines={1}>{m.labelEn}</Text>
                        <Text style={styles.recordFieldValue} numberOfLines={1}>{String(record[key] ?? '')}</Text>
                      </View>
                    );
                  })}
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteRecordBtn} onPress={() => handleDelete(index)}>
                  <Trash2 size={16} color="#FF4444" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <CustomFieldModal visible={showModal} sheets={workbook.sheets} onClose={() => setShowModal(false)} onCreate={(f: FieldMapping) => addCustomField(f)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 20 },
  scroll: { flex: 1 },
  sheetTabs: { marginBottom: 20 },
  sheetTab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#222', backgroundColor: '#121212', marginRight: 8 },
  sheetTabActive: { borderColor: '#00D9A3', backgroundColor: 'rgba(0,217,163,0.12)' },
  sheetTabText: { fontSize: 14, color: '#666' },
  sheetTabTextActive: { color: '#00D9A3', fontWeight: '600' },
  formSection: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 16, padding: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#E8E8E8', marginBottom: 12 },
  calcToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,217,163,0.2)', backgroundColor: 'rgba(0,217,163,0.06)' },
  calcToggleText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#00D9A3' },
  calcContainer: { marginTop: 12 },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00D9A3', borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  cancelBtnText: { fontSize: 16, color: '#666' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderColor: 'rgba(0,217,163,0.3)', borderStyle: 'dashed', borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
  addBtnText: { fontSize: 16, fontWeight: '600', color: '#00D9A3' },
  customFieldBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(59,158,255,0.3)', backgroundColor: 'rgba(59,158,255,0.06)', marginBottom: 24 },
  customFieldBtnText: { fontSize: 14, fontWeight: '600', color: '#3B9EFF' },
  recordsSection: { marginBottom: 40 },
  noRecords: { fontSize: 14, color: '#555', textAlign: 'center', paddingVertical: 24 },
  recordCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 14, marginBottom: 8 },
  recordInfo: { flex: 1, flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  recordField: { flex: 1, minWidth: 80 },
  recordFieldLabel: { fontSize: 11, color: '#555', marginBottom: 2 },
  recordFieldValue: { fontSize: 14, fontWeight: '600', color: '#CCC' },
  deleteRecordBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 18, color: '#666' },
  importBtn: { backgroundColor: '#00D9A3', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  importBtnText: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
});
