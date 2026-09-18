import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Calculator, CheckCircle2, XCircle } from 'lucide-react-native';
import { CalculationResult } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';

interface Props {
  results: CalculationResult[];
}

export function CalculationPreview({ results }: Props) {
  const { t } = useLanguage();

  if (results.length === 0) {
    return (
      <View style={styles.empty}>
        <Calculator size={32} color="#444" strokeWidth={1.5} />
        <Text style={styles.emptyText}>{t('noFormulas')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {results.map((r) => (
        <View key={r.fieldId} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.label} numberOfLines={1}>{r.label}</Text>
            {r.isValid ? <CheckCircle2 size={16} color="#00D9A3" strokeWidth={2} /> : <XCircle size={16} color="#FF4444" strokeWidth={2} />}
          </View>
          <Text style={styles.formula} numberOfLines={2}>{r.formula}</Text>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>{t('result')}: </Text>
            <Text style={[styles.resultValue, !r.isValid && styles.resultError]}>{String(r.result)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { maxHeight: 300 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 14, color: '#555' },
  card: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#222', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#CCC', flex: 1, marginRight: 8 },
  formula: { fontSize: 12, color: '#666', marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center' },
  resultLabel: { fontSize: 14, color: '#888' },
  resultValue: { fontSize: 16, fontWeight: '700', color: '#00D9A3' },
  resultError: { color: '#FF4444' },
});
