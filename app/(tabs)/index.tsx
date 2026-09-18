import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { FileSpreadsheet, Zap, History, Download, Upload, Search, Database, Shield, TrendingUp } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';

export default function HomeScreen() {
  const { t } = useLanguage();
  const { workbook, isLoading } = useExcel();
  const router = useRouter();
  const hasWb = workbook && workbook.sheets.length > 0;

  const stats = hasWb ? [
    { label: t('totalRecords'), value: workbook.records.length, icon: Database, color: '#00D9A3' },
    { label: t('totalSheets'), value: workbook.sheets.length, icon: FileSpreadsheet, color: '#3B9EFF' },
    { label: t('totalFields'), value: workbook.mappings.length, icon: TrendingUp, color: '#FFB444' },
  ] : [];

  const actions = [
    { icon: Upload, label: t('importTemplate'), color: '#3B9EFF', route: '/import' },
    { icon: Zap, label: t('quickEntry'), color: '#00D9A3', route: '/(tabs)/form' },
    { icon: Search, label: t('search'), color: '#FFB444', route: '/(tabs)/search' },
    { icon: History, label: t('auditView'), color: '#FF6B6B', route: '/(tabs)/audit' },
    { icon: Download, label: t('exportFile'), color: '#9B59FF', route: '/export' },
  ];

  const handleActionPress = useCallback((route: string) => {
    router.push(route as any);
  }, [router]);

  const handleImport = useCallback(() => {
    router.push('/import');
  }, [router]);

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

      {hasWb && (
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

      <Text style={styles.sectionTitle}>{t('quickActions')}</Text>
      <View style={styles.actionsGrid}>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <TouchableOpacity key={a.label} style={styles.actionCard} activeOpacity={0.7} onPress={() => handleActionPress(a.route)}>
              <View style={[styles.actionIcon, { backgroundColor: `${a.color}15` }]}>
                <Icon size={24} color={a.color} strokeWidth={2} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!hasWb && (
        <View style={styles.emptyState}>
          <FileSpreadsheet size={48} color="#333" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>{t('noWorkbook')}</Text>
          <Text style={styles.emptyHint}>{t('importFirst')}</Text>
          <TouchableOpacity style={styles.importBtn} activeOpacity={0.7} onPress={handleImport}>
            <Upload size={20} color="#0A0A0A" strokeWidth={2.5} />
            <Text style={styles.importBtnText}>{t('importTemplate')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}><Text style={styles.footerText}>{t('yourData')}</Text></View>
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
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 11, color: '#666', textAlign: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#E8E8E8', marginBottom: 14 },
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
