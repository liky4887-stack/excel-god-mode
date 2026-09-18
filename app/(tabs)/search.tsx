import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useState, useMemo } from 'react';
import { Search as SearchIcon } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import { SearchBar } from '@/components/SearchBar';
import { searchInWorkbook } from '@/src/excelBridge';

export default function SearchScreen() {
  const { t } = useLanguage();
  const { workbook } = useExcel();
  const [query, setQuery] = useState('');

  const results = useMemo(() => workbook ? searchInWorkbook(workbook, query) : [], [workbook, query]);

  if (!workbook || workbook.sheets.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('search')}</Text>
        <View style={styles.empty}><Text style={styles.emptyText}>{t('noWorkbook')}</Text></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('search')}</Text>
      <View style={styles.searchWrap}><SearchBar value={query} onChangeText={setQuery} /></View>
      <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
        {query && results.length === 0 && (
          <View style={styles.noResultsContainer}>
            <SearchIcon size={32} color="#333" strokeWidth={1.5} />
            <Text style={styles.noResultsText}>{t('noResults')}</Text>
          </View>
        )}
        {results.map((r, idx) => (
          <View key={idx} style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={styles.sheetBadge}><Text style={styles.sheetBadgeText}>{r.sheet}</Text></View>
              <Text style={styles.resultLocation}>{t('row')} {r.row} · {t('column')} {r.column}</Text>
            </View>
            <Text style={styles.resultHeader2}>{r.header}</Text>
            <Text style={styles.resultValue}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 20 },
  searchWrap: { marginBottom: 20 },
  results: { flex: 1 },
  noResultsContainer: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  noResultsText: { fontSize: 16, color: '#555' },
  resultCard: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 14, marginBottom: 10 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(59,158,255,0.15)', borderWidth: 1, borderColor: 'rgba(59,158,255,0.3)' },
  sheetBadgeText: { fontSize: 12, fontWeight: '600', color: '#3B9EFF' },
  resultLocation: { fontSize: 12, color: '#555' },
  resultHeader2: { fontSize: 13, color: '#666', marginBottom: 4 },
  resultValue: { fontSize: 16, fontWeight: '600', color: '#E8E8E8' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, color: '#666' },
});
