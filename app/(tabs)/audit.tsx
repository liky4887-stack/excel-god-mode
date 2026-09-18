import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useCallback, useState } from 'react';
import { Save, RotateCcw } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import VersionCard from '@/components/VersionCard';

export default function AuditScreen() {
  const { t } = useLanguage();
  const { workbook, versions, createSaveVersion, doRollback, doDeleteVersion } = useExcel();
  const [showSave, setShowSave] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!label.trim()) return;
    setSaving(true);
    try { await createSaveVersion(label.trim()); setLabel(''); setShowSave(false); }
    finally { setSaving(false); }
  }, [label, createSaveVersion]);

  const handleRollback = useCallback((id: string) => {
    Alert.alert(t('rollback'), t('rollbackConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('confirm'), style: 'destructive', onPress: async () => {
        setRollingBack(id);
        const ok = await doRollback(id);
        setRollingBack(null);
        if (ok) Alert.alert(t('rollbackSuccess'), '');
      }},
    ]);
  }, [t, doRollback]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t('delete'), t('confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => doDeleteVersion(id) },
    ]);
  }, [t, doDeleteVersion]);

  const handleToggleSave = useCallback(() => {
    setShowSave((prev) => !prev);
  }, []);

  const handleCancelSave = useCallback(() => {
    setShowSave(false);
    setLabel('');
  }, []);

  if (!workbook || workbook.sheets.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('auditView')}</Text>
        <View style={styles.empty}><Text style={styles.emptyText}>{t('noWorkbook')}</Text></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('versionHistory')}</Text>
      <View style={styles.saveSection}>
        {showSave ? (
          <View style={styles.saveInputRow}>
            <TextInput style={styles.saveInput} value={label} onChangeText={setLabel} placeholder={t('versionLabel')} placeholderTextColor="#555" autoFocus />
            <TouchableOpacity style={styles.saveConfirmBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#0A0A0A" /> : <Save size={18} color="#0A0A0A" strokeWidth={2.5} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelSmallBtn} onPress={handleCancelSave}>
              <Text style={styles.cancelSmallText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.saveVersionBtn} onPress={handleToggleSave}>
            <Save size={18} color="#00D9A3" strokeWidth={2.5} />
            <Text style={styles.saveVersionText}>{t('saveVersion')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.versions} showsVerticalScrollIndicator={false}>
        {versions.length === 0 ? (
          <View style={styles.noVersionsContainer}>
            <RotateCcw size={32} color="#333" strokeWidth={1.5} />
            <Text style={styles.noVersionsText}>{t('noVersions')}</Text>
          </View>
        ) : (
          versions.map((v) => (
            <View key={v.id} style={rollingBack === v.id && styles.rollingBack}>
              {rollingBack === v.id ? (
                <View style={styles.rollingCard}><ActivityIndicator size="small" color="#00D9A3" /></View>
              ) : (
                <VersionCard version={v} onRollback={() => handleRollback(v.id)} onDelete={() => handleDelete(v.id)} />
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 20 },
  saveSection: { marginBottom: 20 },
  saveVersionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderColor: 'rgba(0,217,163,0.3)', borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14 },
  saveVersionText: { fontSize: 16, fontWeight: '600', color: '#00D9A3' },
  saveInputRow: { flexDirection: 'row', gap: 8 },
  saveInput: { flex: 1, borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#FFF' },
  saveConfirmBtn: { width: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00D9A3', borderRadius: 10 },
  cancelSmallBtn: { paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333', borderRadius: 10 },
  cancelSmallText: { fontSize: 14, color: '#666' },
  versions: { flex: 1 },
  noVersionsContainer: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  noVersionsText: { fontSize: 16, color: '#555' },
  rollingBack: { opacity: 0.6 },
  rollingCard: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, color: '#666' },
});
