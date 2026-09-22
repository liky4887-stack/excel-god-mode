import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Check, FileSpreadsheet } from 'lucide-react-native';
import { useExcel } from '@/hooks/ExcelProvider';
import { useLanguage } from '@/hooks/useLanguage';

interface DraftSheet {
  id: string;
  name: string;
  headersText: string; // comma-separated
}

let rowCounter = 0;
function newDraftSheet(idx: number): DraftSheet {
  rowCounter += 1;
  return {
    id: `s${Date.now()}_${rowCounter}`,
    name: idx === 0 ? 'Sheet1' : `Sheet${idx + 1}`,
    headersText: '',
  };
}

export default function CreateTemplateScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { createTemplate } = useExcel();

  const [name, setName] = useState('');
  const [sheets, setSheets] = useState<DraftSheet[]>([newDraftSheet(0)]);
  const [busy, setBusy] = useState(false);

  const addSheetRow = useCallback(() => {
    setSheets((prev) => [...prev, newDraftSheet(prev.length)]);
  }, []);

  const removeSheet = useCallback((id: string) => {
    setSheets((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }, []);

  const updateSheet = useCallback((id: string, field: 'name' | 'headersText', text: string) => {
    setSheets((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: text } : s)));
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please give the template a name.');
      return;
    }
    const validSheets = sheets
      .map((s) => ({
        name: s.name.trim(),
        headers: s.headersText
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean),
      }))
      .filter((s) => s.name.length > 0);

    if (validSheets.length === 0) {
      Alert.alert('At least one sheet', 'Please add at least one named sheet.');
      return;
    }

    setBusy(true);
    try {
      await createTemplate(trimmedName, validSheets);
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Create failed', e?.message || 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [name, sheets, createTemplate, router]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#FFF" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.title}>New Template</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>TEMPLATE NAME</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Daily Truck Log"
          placeholderTextColor="#5A6577"
          autoCapitalize="words"
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.label}>SHEETS</Text>
          <TouchableOpacity style={styles.addSheetBtn} onPress={addSheetRow} activeOpacity={0.7}>
            <Plus size={14} color="#0EA5E9" strokeWidth={2.5} />
            <Text style={styles.addSheetText}>Add sheet</Text>
          </TouchableOpacity>
        </View>

        {sheets.map((s, i) => (
          <View key={s.id} style={styles.sheetCard}>
            <View style={styles.sheetHeaderRow}>
              <FileSpreadsheet size={16} color="#0EA5E9" strokeWidth={2} />
              <Text style={styles.sheetIndex}>Sheet {i + 1}</Text>
              <View style={{ flex: 1 }} />
              {sheets.length > 1 && (
                <TouchableOpacity onPress={() => removeSheet(s.id)} hitSlop={8}>
                  <Trash2 size={16} color="#FF4D5E" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.subLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={s.name}
              onChangeText={(v) => updateSheet(s.id, 'name', v)}
              placeholder="Sheet name"
              placeholderTextColor="#5A6577"
              autoCapitalize="words"
            />

            <Text style={styles.subLabel}>Column headers (comma-separated)</Text>
            <TextInput
              style={[styles.input, styles.multi]}
              value={s.headersText}
              onChangeText={(v) => updateSheet(s.id, 'headersText', v)}
              placeholder="Date, Truck ID, Fuel Amount, Cost"
              placeholderTextColor="#5A6577"
              multiline
            />
          </View>
        ))}

        <View style={{ height: 24 }} />

        <TouchableOpacity
          style={[styles.primary, busy && styles.primaryDisabled]}
          onPress={handleCreate}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? (
            <ActivityIndicator color="#00251A" />
          ) : (
            <>
              <Check size={18} color="#00251A" strokeWidth={2.5} />
              <Text style={styles.primaryText}>Create Template</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07090D' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#161C26',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#252E3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#EDF1F8', fontSize: 22, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 20 },
  label: {
    color: '#8894A8',
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12,
  },
  subLabel: { color: '#5A6577', fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: '#0F131A',
    borderWidth: 1,
    borderColor: '#252E3D',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#EDF1F8',
    fontSize: 15,
  },
  multi: { minHeight: 52, textAlignVertical: 'top' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  addSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.35)',
    backgroundColor: 'rgba(14,165,233,0.1)',
  },
  addSheetText: { color: '#0EA5E9', fontSize: 12, fontWeight: '700' },
  sheetCard: {
    backgroundColor: '#0F131A',
    borderWidth: 1,
    borderColor: '#252E3D',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sheetIndex: { color: '#EDF1F8', fontSize: 13, fontWeight: '700' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00E5A0',
    borderRadius: 14,
    paddingVertical: 18,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: '#00251A', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
