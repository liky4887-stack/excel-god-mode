import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Globe, Shield, Info } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';

export default function SettingsScreen() {
  const { t, language, setLanguage } = useLanguage();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{t('settings')}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('language')}</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Globe size={20} color="#3B9EFF" strokeWidth={2} />
            <Text style={styles.cardTitle}>{t('language')}</Text>
          </View>
          <View style={styles.langOptions}>
            <TouchableOpacity style={[styles.langBtn, language === 'ar' && styles.langBtnActive]} onPress={() => setLanguage('ar')}>
              <Text style={[styles.langBtnText, language === 'ar' && styles.langBtnTextActive]}>{t('arabic')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.langBtn, language === 'en' && styles.langBtnActive]} onPress={() => setLanguage('en')}>
              <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>{t('english')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('offlineMode')}</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Shield size={20} color="#00D9A3" strokeWidth={2} />
            <Text style={styles.cardTitle}>{t('offlineMode')}</Text>
          </View>
          <Text style={styles.cardBody}>{t('noNetwork')}</Text>
          <Text style={styles.cardBody}>{t('yourData')}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('appName')}</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Info size={20} color="#FFB444" strokeWidth={2} />
            <Text style={styles.cardTitle}>{t('appName')}</Text>
          </View>
          <Text style={styles.cardBody}>{t('tagline')}</Text>
          <Text style={styles.versionText}>v1.0.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 28 },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#E8E8E8' },
  cardBody: { fontSize: 14, color: '#666', marginBottom: 4 },
  langOptions: { flexDirection: 'row', gap: 10 },
  langBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#333', backgroundColor: '#1A1A1A' },
  langBtnActive: { borderColor: '#00D9A3', backgroundColor: 'rgba(0,217,163,0.12)' },
  langBtnText: { fontSize: 15, color: '#666' },
  langBtnTextActive: { color: '#00D9A3', fontWeight: '700' },
  versionText: { fontSize: 13, color: '#444', marginTop: 8 },
});
