import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Check, Plus, Trash2 } from 'lucide-react-native';
import { ChartSpec } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';
import { ChartRenderer } from './ChartRenderer';

interface Props {
  visible: boolean;
  initialPosition: { row: number; col: number };
  onClose: () => void;
  onInsert: (spec: ChartSpec, position: { row: number; col: number }) => void;
}

type ChartType = 'bar' | 'line' | 'pie';
type ValueMode = 'number' | 'percent';

interface DataRow {
  id: string;
  label: string;
  value: string;
}

let rowCounter = 0;
function newRow(): DataRow {
  rowCounter += 1;
  return { id: `r${Date.now()}_${rowCounter}`, label: '', value: '' };
}

export function ChartBuilderModal({ visible, initialPosition, onClose, onInsert }: Props) {
  const { t } = useLanguage();
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [valueMode, setValueMode] = useState<ValueMode>('number');
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<DataRow[]>([newRow(), newRow()]);
  const [position, setPosition] = useState(initialPosition);

  useEffect(() => {
    if (visible) {
      setPosition(initialPosition);
      setTitle('');
      setRows([newRow(), newRow()]);
      setChartType('bar');
      setValueMode('number');
    }
  }, [visible, initialPosition.row, initialPosition.col]);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev);
  }, []);

  const updateRow = useCallback((id: string, field: 'label' | 'value', text: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: text } : r));
  }, []);

  const parsed = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (const r of rows) {
      const lbl = r.label.trim();
      const num = parseFloat(r.value.replace(/[%,$\s]/g, ''));
      if (lbl && Number.isFinite(num)) {
        labels.push(lbl);
        values.push(num);
      }
    }
    return { labels, values };
  }, [rows]);

  const spec: ChartSpec = useMemo(() => {
    let vals = parsed.values;
    if (valueMode === 'percent') {
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      vals = vals.map((v) => (v / total) * 100);
    }
    return {
      type: chartType,
      title: title.trim() || 'Chart',
      labels: parsed.labels,
      values: vals,
    };
  }, [chartType, title, parsed, valueMode]);

  const canInsert = parsed.labels.length >= 1;

  const handleInsert = useCallback(() => {
    if (!canInsert) return;
    onInsert(spec, position);
    onClose();
  }, [canInsert, spec, position, onInsert, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('createChart')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#64748B" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Position */}
            <Text style={styles.label}>{t('positionRow')} / {t('positionCol')}</Text>
            <View style={styles.posRow}>
              <TextInput
                style={styles.posInput}
                value={String(position.row)}
                onChangeText={(v) => setPosition({ ...position, row: parseInt(v, 10) || 0 })}
                keyboardType="number-pad"
                placeholderTextColor="#94A3B8"
                placeholder="0"
              />
              <TextInput
                style={styles.posInput}
                value={String(position.col)}
                onChangeText={(v) => setPosition({ ...position, col: parseInt(v, 10) || 0 })}
                keyboardType="number-pad"
                placeholderTextColor="#94A3B8"
                placeholder="0"
              />
            </View>

            {/* Title */}
            <Text style={styles.label}>{t('chartTitle')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('chartTitle')}
              placeholderTextColor="#94A3B8"
            />

            {/* Type */}
            <Text style={styles.label}>{t('chartType')}</Text>
            <View style={styles.chipRow}>
              {(['bar', 'line', 'pie'] as ChartType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, chartType === type && styles.chipActive]}
                  onPress={() => setChartType(type)}
                >
                  <Text style={[styles.chipText, chartType === type && styles.chipTextActive]}>
                    {type === 'bar' ? t('chartBar') : type === 'line' ? t('chartLine') : t('chartPie')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Value mode */}
            <Text style={styles.label}>{t('chartValues')}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, valueMode === 'number' && styles.chipActive]}
                onPress={() => setValueMode('number')}
              >
                <Text style={[styles.chipText, valueMode === 'number' && styles.chipTextActive]}>
                  {t('chartAsNumber')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, valueMode === 'percent' && styles.chipActive]}
                onPress={() => setValueMode('percent')}
              >
                <Text style={[styles.chipText, valueMode === 'percent' && styles.chipTextActive]}>
                  {t('chartAsPercent')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Data rows */}
            <View style={styles.dataHeader}>
              <Text style={styles.label}>{t('chartData')}</Text>
              <TouchableOpacity style={styles.addRowBtn} onPress={addRow} activeOpacity={0.7}>
                <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
                <Text style={styles.addRowText}>{t('addDataRow')}</Text>
              </TouchableOpacity>
            </View>

            {rows.map((row) => (
              <View key={row.id} style={styles.dataRow}>
                <TextInput
                  style={styles.dataLabel}
                  value={row.label}
                  onChangeText={(v) => updateRow(row.id, 'label', v)}
                  placeholder={t('labelPlaceholder')}
                  placeholderTextColor="#94A3B8"
                />
                <TextInput
                  style={styles.dataValue}
                  value={row.value}
                  onChangeText={(v) => updateRow(row.id, 'value', v)}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity style={styles.delRowBtn} onPress={() => removeRow(row.id)}>
                  <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Preview */}
            <Text style={styles.label}>{t('preview')}</Text>
            <View style={styles.previewBox}>
              {parsed.labels.length > 0 ? (
                <ChartRenderer spec={spec} width={300} height={200} />
              ) : (
                <Text style={styles.emptyPreview}>{t('chartNoData')}</Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !canInsert && styles.saveBtnDisabled]}
              onPress={handleInsert}
              disabled={!canInsert}
            >
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.saveText}>{t('insertChart')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '92%', borderWidth: 1, borderColor: '#E2E8F0' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  headerTitle: { color: '#0F172A', fontSize: 18, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 12 },
  label: { color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', fontSize: 15, backgroundColor: '#F8FAFC' },
  posRow: { flexDirection: 'row', gap: 8 },
  posInput: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#0F172A', fontSize: 15, backgroundColor: '#F8FAFC', textAlign: 'center' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  chipActive: { borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.12)' },
  chipText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#0EA5E9', fontWeight: '700' },
  dataHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(14,165,233,0.35)', backgroundColor: 'rgba(14,165,233,0.1)' },
  addRowText: { color: '#0EA5E9', fontSize: 12, fontWeight: '700' },
  dataRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  dataLabel: { flex: 2, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#0F172A', fontSize: 14, backgroundColor: '#F8FAFC' },
  dataValue: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#0F172A', fontSize: 14, backgroundColor: '#F8FAFC', textAlign: 'center' },
  delRowBtn: { padding: 8 },
  previewBox: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 8, alignItems: 'center', minHeight: 216, justifyContent: 'center' },
  emptyPreview: { color: '#94A3B8', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, padding: 20 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelText: { color: '#64748B', fontWeight: '600' },
  saveBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: '#FFFFFF', fontWeight: '700' },
});
