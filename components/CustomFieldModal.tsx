import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, Alert, FlatList } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { X, Plus } from 'lucide-react-native';
import { SheetTab, FieldMapping, FieldType } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';

interface Props {
  visible: boolean;
  sheets: SheetTab[];
  mappings: FieldMapping[];
  onClose: () => void;
  onCreate: (field: FieldMapping) => void;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function CustomFieldModal({ visible, sheets, mappings, onClose, onCreate }: Props) {
  const { t } = useLanguage();
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [sheetName, setSheetNameState] = useState(sheets[0]?.name || '');
  const [column, setColumn] = useState('');
  const [options, setOptions] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showSheetPicker, setShowSheetPicker] = useState(false);
  const [isNewColumn, setIsNewColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [errors, setErrors] = useState<{ label?: string; column?: string; options?: string }>({});

  const types = useMemo<FieldType[]>(() => ['text', 'number', 'date', 'select'], []);

  const availableColumns = useMemo(() => {
    const sheet = sheets.find((s) => s.name === sheetName);
    if (!sheet) return [];
    return sheet.headers.map((h, idx) => ({
      letter: ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'][idx] || String(idx),
      label: h || '',
    }));
  }, [sheets, sheetName]);

  const handleSetFieldType = useCallback((ft: FieldType) => {
    setFieldType(ft);
    setErrors((prev) => ({ ...prev }));
  }, []);

  const handleSetSheetName = useCallback((name: string) => {
    setSheetNameState(name);
    setColumn('');
    setIsNewColumn(false);
    setShowSheetPicker(false);
  }, []);

  const handleSelectColumn = useCallback((col: string) => {
    setColumn(col);
    setIsNewColumn(false);
    setShowColumnPicker(false);
    setErrors((prev) => ({ ...prev, column: undefined }));
  }, []);

  const handleCreateColumn = useCallback(() => {
    if (!newColumnName.trim()) {
      setErrors((prev) => ({ ...prev, column: 'Column name required' }));
      return;
    }
    setColumn(newColumnName.trim().toUpperCase());
    setIsNewColumn(true);
    setShowColumnPicker(false);
    setErrors((prev) => ({ ...prev, column: undefined }));
  }, [newColumnName]);

  const validate = useCallback((): boolean => {
    const errs: { label?: string; column?: string; options?: string } = {};
    if (!label.trim()) errs.label = 'Field label required';
    if (!sheetName) errs.column = 'Target sheet required';
    if (!column.trim()) errs.column = 'Target column required';
    const uniqueInSheet = mappings.filter((m) => m.sheetName === sheetName && m.labelEn === label.trim());
    if (uniqueInSheet.length > 0) errs.label = 'Label already exists in this sheet';
    if (fieldType === 'select' && (!options.trim() || options.split(',').filter((o) => o.trim()).length === 0)) {
      errs.options = 'At least one option required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [label, sheetName, column, fieldType, options, mappings]);

  const handleCreate = useCallback(() => {
    if (!validate()) return;
    onCreate({
      id: uid(),
      labelEn: label.trim(),
      labelAr: label.trim(),
      sheetName,
      column: column.trim().toUpperCase(),
      fieldType,
      isCustom: true,
      options: fieldType === 'select' && options.trim()
        ? options.split(',').map((o) => o.trim()).filter(Boolean)
        : undefined,
    });
    setLabel(''); setColumn(''); setOptions(''); setFieldType('text');
    setErrors({}); setIsNewColumn(false); setNewColumnName('');
    onClose();
  }, [label, sheetName, column, fieldType, options, onCreate, validate, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('addField')}</Text>
            <TouchableOpacity onPress={onClose}><X size={24} color="#999" strokeWidth={2} /></TouchableOpacity>
          </View>
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>{t('fieldLabel')}</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder={t('fieldLabel')} placeholderTextColor="#555" />
            {errors.label && <Text style={styles.errorText}>{errors.label}</Text>}

            <Text style={styles.label}>{t('fieldType')}</Text>
            <View style={styles.chipRow}>
              {types.map((ft) => (
                <TouchableOpacity key={ft} style={[styles.chip, fieldType === ft && styles.chipActive]} onPress={() => handleSetFieldType(ft)}>
                  <Text style={[styles.chipText, fieldType === ft && styles.chipTextActive]}>{t(ft)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t('targetSheet')}</Text>
            <TouchableOpacity style={styles.pickerTrigger} onPress={() => { setShowSheetPicker(true); setShowColumnPicker(false); }}>
              <Text style={styles.pickerText}>{sheetName || 'Select sheet...'}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>{t('targetColumn')}</Text>
            <View style={styles.columnSection}>
              <TouchableOpacity style={styles.pickerTrigger} onPress={() => { setShowColumnPicker(true); setShowSheetPicker(false); }}>
                <Text style={styles.pickerText}>{column || 'Select column...'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.newColumnBtn} onPress={() => { setIsNewColumn(!isNewColumn); setShowColumnPicker(false); }}>
                <Text style={styles.newColumnBtnText}>+ {t('createNewColumn') || 'Create new column'}</Text>
              </TouchableOpacity>
            </View>
            {isNewColumn && (
              <>
                <TextInput style={styles.input} value={newColumnName} onChangeText={setNewColumnName} placeholder="New column name" placeholderTextColor="#555" />
                <TouchableOpacity style={styles.createColBtn} onPress={handleCreateColumn}>
                  <Text style={styles.createColBtnText}>Create Column</Text>
                </TouchableOpacity>
              </>
            )}
            {errors.column && <Text style={styles.errorText}>{errors.column}</Text>}

            {fieldType === 'select' && (
              <>
                <Text style={styles.label}>{t('optionsHint')}</Text>
                <TextInput style={styles.input} value={options} onChangeText={setOptions} placeholder="Option1, Option2, Option3" placeholderTextColor="#555" />
                {errors.options && <Text style={styles.errorText}>{errors.options}</Text>}
              </>
            )}

            <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
              <Plus size={20} color="#0A0A0A" strokeWidth={2.5} />
              <Text style={styles.createBtnText}>{t('createField')}</Text>
            </TouchableOpacity>
          </ScrollView>

          {showColumnPicker && (
            <Modal visible animationType="slide" transparent onRequestClose={() => setShowColumnPicker(false)}>
              <View style={styles.overlay}>
                <View style={styles.pickerModal}>
                  <Text style={styles.pickerTitle}>Select Column</Text>
                  <FlatList
                    data={availableColumns}
                    keyExtractor={(item) => item.letter}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.pickerItem} onPress={() => handleSelectColumn(item.letter)}>
                        <Text style={styles.pickerItemText}>{item.letter} — {item.label || '(empty)'}</Text>
                      </TouchableOpacity>
                    )}
                  />
                  <TouchableOpacity style={styles.cancelPickerBtn} onPress={() => setShowColumnPicker(false)}>
                    <Text style={styles.cancelPickerText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {showSheetPicker && (
            <Modal visible animationType="slide" transparent onRequestClose={() => setShowSheetPicker(false)}>
              <View style={styles.overlay}>
                <View style={styles.pickerModal}>
                  <Text style={styles.pickerTitle}>Select Sheet</Text>
                  <FlatList
                    data={sheets}
                    keyExtractor={(item) => item.name}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.pickerItem} onPress={() => handleSetSheetName(item.name)}>
                        <Text style={styles.pickerItemText}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                  />
                  <TouchableOpacity style={styles.cancelPickerBtn} onPress={() => setShowSheetPicker(false)}>
                    <Text style={styles.cancelPickerText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default CustomFieldModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#121212', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
  title: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  body: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#888', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#FFF' },
  errorText: { fontSize: 12, color: '#FF4444', marginTop: 4, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A' },
  chipActive: { borderColor: '#00D9A3', backgroundColor: 'rgba(0,217,163,0.15)' },
  chipText: { fontSize: 14, color: '#999' },
  chipTextActive: { color: '#00D9A3', fontWeight: '600' },
  pickerTrigger: { paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A', borderRadius: 10 },
  pickerText: { fontSize: 16, color: '#FFF' },
  columnSection: { gap: 8 },
  newColumnBtn: { paddingVertical: 8, alignItems: 'center' },
  newColumnBtnText: { fontSize: 14, color: '#3B9EFF' },
  createColBtn: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(59,158,255,0.15)', borderRadius: 10, marginBottom: 8 },
  createColBtnText: { fontSize: 14, fontWeight: '600', color: '#3B9EFF' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00D9A3', borderRadius: 12, paddingVertical: 16, marginTop: 28 },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  pickerModal: { backgroundColor: '#121212', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', padding: 20 },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  pickerItemText: { fontSize: 16, color: '#E8E8E8' },
  cancelPickerBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  cancelPickerText: { fontSize: 14, color: '#666' },
});
