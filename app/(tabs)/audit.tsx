import { ScreenBoundary } from '@/components/ScreenBoundary';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useCallback, useState } from 'react';
import { Save, RotateCcw, Activity, Image as ImageIcon, BarChart3, Trash2 } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import VersionCard from '@/components/VersionCard';

function AuditScreenInner() {
  const { t } = useLanguage();
  const { activeTemplate, activeTemplateId, createVersion, doRollback, doDeleteVersion, activityLog } = useExcel();
  const [showSave, setShowSave] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [tab, setTab] = useState<'versions' | 'activity'>('versions');

  const handleSave = useCallback(async () => {
    if (!label.trim()) return;
    setSaving(true);
    try { await createVersion(label.trim()); setLabel(''); setShowSave(false); }
    finally { setSaving(false); }
  }, [label, createVersion]);

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

  const workbook = activeTemplate?.workbook;
  const versions = activeTemplate?.versions || [];

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
      <Text style={styles.title}>{tab === 'versions' ? t('versionHistory') : 'Activity'}</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'versions' && styles.tabBtnActive]}
          onPress={() => setTab('versions')}
        >
          <Text style={[styles.tabText, tab === 'versions' && styles.tabTextActive]}>
            {t('versionHistory')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'activity' && styles.tabBtnActive]}
          onPress={() => setTab('activity')}
        >
          <Text style={[styles.tabText, tab === 'activity' && styles.tabTextActive]}>
            Activity ({activityLog.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'activity' ? (
        <ScrollView style={styles.versions} showsVerticalScrollIndicator={false}>
          {activityLog.length === 0 ? (
            <View style={styles.noVersionsContainer}>
              <Activity size={32} color="#333" strokeWidth={1.5} />
              <Text style={styles.noVersionsText}>No activity yet</Text>
              <Text style={styles.activityHint}>Add an image, chart, row, or edit a cell</Text>
            </View>
          ) : (
            activityLog.map((entry) => {
              const Icon =
                entry.kind.startsWith('image') ? ImageIcon :
                entry.kind.startsWith('chart') ? BarChart3 :
                entry.kind.includes('delete') ? Trash2 : Activity;
              const color =
                entry.kind.includes('add') ? '#00D9A3' :
                entry.kind.includes('delete') ? '#FF4444' :
                entry.kind.includes('resize') ? '#3B9EFF' :
                '#FFB444';
              const when = new Date(entry.ts).toLocaleString();
              return (
                <View key={entry.id} style={styles.activityCard}>
                  <View style={[styles.activityIcon, { backgroundColor: color + '20' }]}>
                    <Icon size={16} color={color} strokeWidth={2.5} />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityTitle} numberOfLines={2}>{entry.summary}</Text>
                    <Text style={styles.activityMeta}>
                      {entry.sheetName} · {when}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 20 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  tabBtnActive: { borderColor: '#00D9A3', backgroundColor: 'rgba(0,217,163,0.12)' },
  tabText: { color: '#666', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#00D9A3', fontWeight: '700' },
  activityCard: { flexDirection: 'row', gap: 12, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'center' },
  activityIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  activityInfo: { flex: 1 },
  activityTitle: { color: '#E8E8E8', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  activityMeta: { color: '#5A5A60', fontSize: 11 },
  activityHint: { color: '#444', fontSize: 12, marginTop: 4 },
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

function AuditScreen() {
  return (
    <ScreenBoundary screenName="Audit">
      <AuditScreenInner />
    </ScreenBoundary>
  );
}

export default AuditScreen;
