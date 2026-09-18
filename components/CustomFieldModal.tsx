import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, Alert } from 'react-native';
import { useState } from 'react';
import { X, Plus } from 'lucide-react-native';
import { SheetTab, FieldMapping, FieldType } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';

interface Props {
  visible: boolean;
  sheets: SheetTab[];
  onClose: () => void;
  onCreate: (field: FieldMapping) => void;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function CustomFieldModal({ visible, sheets, onClose, onCreate }: Props) {
  const { t } = useLanguage();
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [sheetName, setSheetName] = useState(sheets[0]?.name || '');
  const [column, setColumn] = useState('');
  const [options, setOptions] = useState('');

  const handleCreate = () => {
    if (!label.trim() || !sheetName || !column.trim()) {
      Alert.alert(t('createField'), t('fieldLabel'));
      return;
    }
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
    onClose();
  };

  const types: FieldType[] = ['text', 'number', 'date', 'select'];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('addField')}</Text>
            <TouchableOpacity onPress={onClose}><X size={24} color="#999" strokeWidth={2} /></TouchableOpacity>
          </View>
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>{t('fieldLabel')}</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder={t('fieldLabel')} placeholderTextColor="#555" />
            <Text style={styles.label}>{t('fieldType')}</Text>
            <View style={styles.chipRow}>
              {types.map((ft) => (
                <TouchableOpacity key={ft} style={[styles.chip, fieldType === ft && styles.chipActive]} onPress={() => setFieldType(ft)}>
                  <Text style={[styles.chipText, fieldType === ft && styles.chipTextActive]}>{t(ft)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('targetSheet')}</Text>
            <View style={styles.chipRow}>
              {sheets.map((s) => (
                <TouchableOpacity key={s.name} style={[styles.chip, sheetName === s.name && styles.chipActive]} onPress={() => setSheetName(s.name)}>
                  <Text style={[styles.chipText, sheetName === s.name && styles.chipTextActive]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('targetColumn')}</Text>
            <TextInput style={styles.input} value={column} onChangeText={setColumn} placeholder="A, B, C..." placeholderTextColor="#555" autoCapitalize="characters" />
            {fieldType === 'select' && (
              <>
                <Text style={styles.label}>{t('optionsHint')}</Text>
                <TextInput style={styles.input} value={options} onChangeText={setOptions} placeholder="Option1, Option2, Option3" placeholderTextColor="#555" />
              </>
            )}
            <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
              <Plus size={20} color="#0A0A0A" strokeWidth={2.5} />
              <Text style={styles.createBtnText}>{t('createField')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#121212', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
  title: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  body: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#888', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#FFF' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A' },
  chipActive: { borderColor: '#00D9A3', backgroundColor: 'rgba(0,217,163,0.15)' },
  chipText: { fontSize: 14, color: '#999' },
  chipTextActive: { color: '#00D9A3', fontWeight: '600' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00D9A3', borderRadius: 12, paddingVertical: 16, marginTop: 28 },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
});
