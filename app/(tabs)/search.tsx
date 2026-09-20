import { ScreenBoundary } from '@/components/ScreenBoundary';
import { memo, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Search as SearchIcon } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import SearchBar from '@/components/SearchBar';
import { searchInWorkbook } from '@/src/excelBridge';

function colLetterToIndex(letters: string): number {
  let n = 0;
  const s = letters.toUpperCase().replace(/\$/g, '');
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 65 || code > 90) continue;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

function SearchScreen() {
  const { t } = useLanguage();
  const { activeTemplate, setNavigationTarget } = useExcel();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const workbook = activeTemplate?.workbook;

  const results = useMemo(
    () => (workbook ? searchInWorkbook(workbook, query) : []),
    [workbook, query],
  );

  const handleClearQuery = useCallback(() => {
    setQuery('');
  }, []);

  const handleResultTap = useCallback(
    (sheet: string, row: number, column: string) => {
      const col = colLetterToIndex(column);
      setNavigationTarget({
        sheet,
        row,
        col,
        nonce: Date.now(),
      });
      router.push('/(tabs)/form');
    },
    [router, setNavigationTarget],
  );

  if (!workbook || workbook.sheets.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('search')}</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('noWorkbook')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('search')}</Text>
      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} />
      </View>
      <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
        {query && results.length === 0 && (
          <View style={styles.noResultsContainer}>
            <SearchIcon size={32} color="#333" strokeWidth={1.5} />
            <Text style={styles.noResultsText}>{t('noResults')}</Text>
          </View>
        )}
        {results.map((r, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.resultCard}
            activeOpacity={0.7}
            onPress={() => handleResultTap(r.sheet, r.row, r.column)}
          >
            <View style={styles.resultHeader}>
              <View style={styles.sheetBadge}>
                <Text style={styles.sheetBadgeText}>{r.sheet}</Text>
              </View>
              <Text style={styles.resultLocation}>
                {t('row')} {r.row} · {t('column')} {r.column}
              </Text>
            </View>
            <Text style={styles.resultHeader2}>{r.header}</Text>
            <Text style={styles.resultValue}>{r.value}</Text>
            <Text style={styles.tapHint}>↗ {t('gridView')}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function SearchScreenWrapped() {
  return (
    <ScreenBoundary screenName="Search">
      <SearchScreen />
    </ScreenBoundary>
  );
}

export default memo(SearchScreenWrapped);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 20 },
  searchWrap: { marginBottom: 20 },
  results: { flex: 1 },
  resultCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetBadge: {
    backgroundColor: 'rgba(14,165,233,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sheetBadgeText: { color: '#0EA5E9', fontSize: 12, fontWeight: '700' },
  resultLocation: { color: '#64748B', fontSize: 11 },
  resultHeader2: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
  resultValue: { color: '#E8E8E8', fontSize: 14, lineHeight: 20 },
  tapHint: { color: '#0EA5E9', fontSize: 11, marginTop: 10, textAlign: 'right', fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#666', fontSize: 16 },
  noResultsContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  noResultsText: { color: '#555', fontSize: 14 },
});
