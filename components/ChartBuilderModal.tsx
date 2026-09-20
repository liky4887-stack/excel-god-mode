import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { X, Check, Plus, Trash2 } from 'lucide-react-native';
import Svg from 'react-native-svg';
import { ChartRenderer } from './ChartRenderer';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreate: (config: any, pngDataUri?: string) => void | Promise<void>;
}

type SimpleType = 'bar' | 'line' | 'pie';
type ValueMode = 'number' | 'percent';

interface DataRow { id: string; label: string; value: string; }

let rowCounter = 0;
function newRow(): DataRow {
  rowCounter += 1;
  return { id: 'r' + Date.now() + '_' + rowCounter, label: '', value: '' };
}

export function ChartBuilderModal({ visible, onClose, onCreate }: Props) {
  const [chartType, setChartType] = useState<SimpleType>('bar');
  const [valueMode, setValueMode] = useState<ValueMode>('number');
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<DataRow[]>([newRow(), newRow(), newRow()]);
  const svgRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setRows([newRow(), newRow(), newRow()]);
      setChartType('bar');
      setValueMode('number');
    }
  }, [visible]);

  const addRow = useCallback(() => setRows((p) => [...p, newRow()]), []);
  const removeRow = useCallback((id: string) => setRows((p) => p.length > 1 ? p.filter((r) => r.id !== id) : p), []);
  const updateRow = useCallback((id: string, field: 'label' | 'value', text: string) => {
    setRows((p) => p.map((r) => r.id === id ? { ...r, [field]: text } : r));
  }, []);

  const parsed = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (const r of rows) {
      const lbl = r.label.trim();
      const num = parseFloat(r.value.replace(/[%,$\s]/g, ''));
      if (lbl && Number.isFinite(num)) { labels.push(lbl); values.push(num); }
    }
    return { labels, values };
  }, [rows]);

  const finalValues = useMemo(() => {
    if (valueMode === 'percent') {
      const total = parsed.values.reduce((a, b) => a + b, 0) || 1;
      return parsed.values.map((v) => (v / total) * 100);
    }
    return parsed.values;
  }, [parsed.values, valueMode]);

  const config = useMemo(() => ({
    id: 'chart_' + Date.now(),
    type: chartType,
    title: title.trim() || 'Chart',
    labels: parsed.labels,
    values: finalValues,
    series: [{
      id: 's1',
      label: 'Series 1',
      color: '#0EA5E9',
      data: parsed.labels.map((label, i) => ({ label, value: finalValues[i] })),
    }],
  }), [chartType, title, parsed.labels, finalValues]);

  const canInsert = parsed.labels.length >= 1;

  const handleInsert = useCallback(async () => {
    if (!canInsert) return;

    // Capture the rendered SVG as a PNG so the chart survives Excel export.
    // react-native-svg's toDataURL uses a CALLBACK, not a Promise.
    let pngDataUri: string | undefined;
    try {
      if (svgRef.current && typeof svgRef.current.toDataURL === 'function') {
        const b64 = await new Promise<string>((resolve, reject) => {
          try {
            svgRef.current.toDataURL((data: string) => {
              if (data && typeof data === 'string') resolve(data);
              else reject(new Error('toDataURL returned empty'));
            });
          } catch (e) {
            reject(e);
          }
        });
        if (b64) pngDataUri = 'data:image/png;base64,' + b64;
        if (__DEV__) console.log('[chart] captured PNG bytes:', Math.round(b64.length * 0.75));
      }
    } catch (e) {
      if (__DEV__) console.warn('[chart] toDataURL failed:', e);
    }

    await onCreate(config, pngDataUri);
    onClose();
  }, [canInsert, config, onCreate, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Create Chart</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#64748B" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>CHART TYPE</Text>
            <View style={styles.chipRow}>
              {(['bar', 'line', 'pie'] as SimpleType[]).map((type) => (
                <TouchableOpacity key={type} style={[styles.chip, chartType === type && styles.chipActive]} onPress={() => setChartType(type)}>
                  <Text style={[styles.chipText, chartType === type && styles.chipTextActive]}>
                    {type === 'bar' ? 'Bar' : type === 'line' ? 'Line' : 'Pie'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>TITLE</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="My Chart" placeholderTextColor="#94A3B8" />

            <Text style={styles.label}>VALUES</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity style={[styles.chip, valueMode === 'number' && styles.chipActive]} onPress={() => setValueMode('number')}>
                <Text style={[styles.chipText, valueMode === 'number' && styles.chipTextActive]}>Numbers</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, valueMode === 'percent' && styles.chipActive]} onPress={() => setValueMode('percent')}>
                <Text style={[styles.chipText, valueMode === 'percent' && styles.chipTextActive]}>Percentage</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dataHeader}>
              <Text style={styles.label}>DATA</Text>
              <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
                <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
                <Text style={styles.addRowText}>Add row</Text>
              </TouchableOpacity>
            </View>

            {rows.map((row) => (
              <View key={row.id} style={styles.dataRow}>
                <TextInput style={styles.dataLabel} value={row.label} onChangeText={(v) => updateRow(row.id, 'label', v)} placeholder="Name" placeholderTextColor="#94A3B8" />
                <TextInput style={styles.dataValue} value={row.value} onChangeText={(v) => updateRow(row.id, 'value', v)} placeholder="0" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />
                <TouchableOpacity style={styles.delRowBtn} onPress={() => removeRow(row.id)}>
                  <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))}

            <Text style={styles.label}>PREVIEW</Text>
            <View style={styles.previewBox}>
              {canInsert ? (
                <ChartRenderer ref={svgRef} config={config} width={280} height={200} />
              ) : (
                <Text style={styles.emptyPreview}>Type a name and number to see the chart</Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, !canInsert && styles.saveBtnDisabled]} onPress={handleInsert} disabled={!canInsert}>
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.saveText}>Insert Chart</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '92%', borderWidth: 1, borderColor: '#E2E8F0' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  headerTitle: { color: '#0F172A', fontSize: 18, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 12 },
  label: { color: '#64748B', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', fontSize: 15, backgroundColor: '#F8FAFC' },
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
  previewBox: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 8, alignItems: 'center', minHeight: 216, justifyContent: 'center', marginBottom: 12 },
  emptyPreview: { color: '#94A3B8', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, padding: 20 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelText: { color: '#64748B', fontWeight: '600' },
  saveBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: '#FFFFFF', fontWeight: '700' },
});
