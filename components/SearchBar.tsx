import { memo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useCallback, useState } from 'react';
import { Search } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
}

function SearchBar({ value, onChangeText }: Props) {
  const { t } = useLanguage();

  const handleClear = useCallback(() => {
    onChangeText('');
  }, [onChangeText]);

  return (
    <View style={styles.container}>
      <Search size={20} color="#666" strokeWidth={2} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('searchPlaceholder')}
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={handleClear}>
          <Text style={styles.clear}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default memo(SearchBar);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A',
    borderWidth: 1, borderColor: '#333', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  input: { flex: 1, fontSize: 16, color: '#FFF', paddingVertical: 0 },
  clear: { color: '#666', fontSize: 16, fontWeight: '600' },
});
