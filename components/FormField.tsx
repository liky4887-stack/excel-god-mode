import { memo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useCallback } from 'react';
import { FieldMapping } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';

interface Props {
  mapping: FieldMapping;
  value: string | number;
  onChangeText: (text: string) => void;
}

function FormField({ mapping, value, onChangeText }: Props) {
  const { t, language } = useLanguage();
  const label = language === 'ar' ? mapping.labelAr : mapping.labelEn;

  const handleOptionPress = useCallback((opt: string) => {
    onChangeText(opt);
  }, [onChangeText]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {mapping.fieldType === 'select' && mapping.options && mapping.options.length > 0 ? (
        <View style={styles.options}>
          {mapping.options.map((opt) => (
            <Text
              key={opt}
              style={[styles.option, String(value) === opt && styles.optionActive]}
              onPress={() => handleOptionPress(opt)}
            >
              {opt}
            </Text>
          ))}
        </View>
      ) : (
        <TextInput
          style={styles.input}
          value={String(value ?? '')}
          onChangeText={onChangeText}
          keyboardType={mapping.fieldType === 'number' ? 'numeric' : 'default'}
          placeholder={label}
          placeholderTextColor="#555"
        />
      )}
      <Text style={styles.hint}>
        {mapping.sheetName} · {mapping.column}
        {mapping.isFormula ? ` · ${t('formula')}` : ''}
      </Text>
    </View>
  );
}

export default memo(FormField);

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#E8E8E8', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#FFF',
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A',
    fontSize: 14, color: '#999', overflow: 'hidden',
  },
  optionActive: {
    borderColor: '#00D9A3', backgroundColor: 'rgba(0,217,163,0.15)',
    color: '#00D9A3', fontWeight: '600',
  },
  hint: { fontSize: 11, color: '#555', marginTop: 4 },
});
