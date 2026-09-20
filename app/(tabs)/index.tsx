import { ScreenBoundary } from '@/components/ScreenBoundary';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { FileSpreadsheet, Zap, History, Download, Upload, Search, Database, Shield, TrendingUp, Plus, Trash2 } from 'lucide-react-native';
import { Alert } from 'react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import { TemplateMeta } from '@/types';

function HomeScreenInner() {
  const { t } = useLanguage();
  const { templates, activeTemplateId, activeTemplate, isLoading, switchTemplate, importTemplate, deleteTemplate } = useExcel();
  const router = useRouter();

  const handlePickAndImport = useCallback(async () => {
    router.push('/import');
  }, [router]);

  const handleTemplatePress = useCallback((id: string) => {
    switchTemplate(id);
  }, [switchTemplate]);

  const confirmDelete = useCallback((id: string, name: string) => {
    Alert.alert(
      'Delete template?',
      `"${name}" will be permanently deleted, including the original .xlsx file, all edits, overlays, and history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => { deleteTemplate(id); },
        },
      ]
    );
  }, [deleteTemplate]);

  const activeMeta = templates.find((t) => t.id === activeTemplateId) || null;
  const hasActive = activeTemplate !== null && activeTemplate.workbook && activeTemplate.workbook.sheets.length > 0;

  const stats = hasActive ? [
    { label: t('totalRecords'), value: activeTemplate.records.length, icon: Database, color: '#00D9A3' },
    { label: t('totalSheets'), value: activeTemplate.workbook.sheets.length, icon: FileSpreadsheet, color: '#3B9EFF' },
    { label: t('totalFields'), value: activeTemplate.mappings.length, icon: TrendingUp, color: '#FFB444' },
  ] : [];

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#00D9A3" /></View>;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <FileSpreadsheet size={28} color="#00D9A3" strokeWidth={2} />
          <Text style={styles.appName}>{t('appName')}</Text>
        </View>
        <Text style={styles.tagline}>{t('tagline')}</Text>
        <View style={styles.offlineBadge}>
          <Shield size={14} color="#00D9A3" strokeWidth={2} />
          <Text style={styles.offlineText}>{t('offlineMode')}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Templates</Text>
      <FlatList
        horizontal
        data={templates}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }: { item: TemplateMeta }) => (
          <TouchableOpacity
            style={[styles.templateCard, item.id === activeTemplateId && styles.templateCardActive]}
            onPress={() => handleTemplatePress(item.id)}
          >
            <View style={styles.templateIconWrap}>
              <FileSpreadsheet size={20} color={item.id === activeTemplateId ? '#00D9A3' : '#666'} strokeWidth={2} />
            </View>
            <Text style={[styles.templateName, item.id === activeTemplateId && styles.templateNameActive]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.templateMeta}>{item.recordCount} records · {item.sheetCount} sheets</Text>
            {item.id === activeTemplateId && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Active</Text></View>}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={(e) => { e.stopPropagation?.(); confirmDelete(item.id, item.name); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2 size={14} color="#FF4444" strokeWidth={2.5} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.importNewBtn} onPress={handlePickAndImport}>
        <Plus size={18} color="#3B9EFF" strokeWidth={2} />
        <Text style={styles.importNewBtnText}>Import New Template</Text>
      </TouchableOpacity>

      {hasActive && (
        <View style={styles.statsRow}>
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <View key={s.label} style={styles.statCard}>
                <Icon size={20} color={s.color} strokeWidth={2} />
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        {[
          { icon: Upload, label: 'Import Template', color: '#3B9EFF', route: '/import' as const },
          { icon: Zap, label: 'Quick Entry', color: '#00D9A3', route: '/(tabs)/form' as const },
          { icon: Search, label: 'Search', color: '#FFB444', route: '/(tabs)/search' as const },
          { icon: History, label: 'Audit View', color: '#FF6B6B', route: '/(tabs)/audit' as const },
          { icon: Download, label: 'Export File', color: '#9B59FF', route: '/export' as const },
        ].map((a) => {
          const Icon = a.icon;
          return (
            <TouchableOpacity key={a.label} style={styles.actionCard} activeOpacity={0.7} onPress={() => router.push(a.route)}>
              <View style={[styles.actionIcon, { backgroundColor: `${a.color}15` }]}>
                <Icon size={24} color={a.color} strokeWidth={2} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!hasActive && (
        <View style={styles.emptyState}>
          <FileSpreadsheet size={48} color="#333" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No template selected</Text>
          <Text style={styles.emptyHint}>Import or select a template from above</Text>
          <TouchableOpacity style={styles.importBtn} activeOpacity={0.7} onPress={handlePickAndImport}>
            <Upload size={20} color="#0A0A0A" strokeWidth={2.5} />
            <Text style={styles.importBtnText}>Import Template</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}><Text style={styles.footerText}>Your data stays on device</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  loading: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 28 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  appName: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  tagline: { fontSize: 14, color: '#666', marginBottom: 12 },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,217,163,0.12)', borderWidth: 1, borderColor: 'rgba(0,217,163,0.25)' },
  offlineText: { fontSize: 12, fontWeight: '600', color: '#00D9A3' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#E8E8E8', marginBottom: 14 },
  templateCard: { width: 180, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, padding: 14, marginRight: 12, alignItems: 'center', gap: 6 },
  deleteBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,68,68,0.12)' },
  templateCardActive: { borderColor: '#00D9A3', backgroundColor: 'rgba(0,217,163,0.06)' },
  templateIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(59,158,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: 14, fontWeight: '600', color: '#CCC', textAlign: 'center' },
  templateNameActive: { color: '#00D9A3' },
  templateMeta: { fontSize: 11, color: '#666', textAlign: 'center' },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(0,217,163,0.15)', marginTop: 4 },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: '#00D9A3' },
  importNewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(59,158,255,0.3)', backgroundColor: 'rgba(59,158,255,0.06)', marginBottom: 20 },
  importNewBtnText: { fontSize: 14, fontWeight: '600', color: '#3B9EFF' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 11, color: '#666', textAlign: 'center' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '47%', flexGrow: 0, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, padding: 18, alignItems: 'center', gap: 12 },
  actionIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#CCC', textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#888' },
  emptyHint: { fontSize: 14, color: '#555', textAlign: 'center' },
  importBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#00D9A3', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 },
  importBtnText: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  footer: { paddingVertical: 32, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#333' },
});

function HomeScreen() {
  return (
    <ScreenBoundary screenName="Home">
      <HomeScreenInner />
    </ScreenBoundary>
  );
}

export default HomeScreen;
