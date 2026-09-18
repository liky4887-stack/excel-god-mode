import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Upload, FileSpreadsheet, CheckCircle2, ArrowLeft } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import { readWorkbook, bufferToBase64 } from '@/src/excelBridge';

export default function ImportScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { setWorkbookData } = useExcel();
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handlePick = useCallback(async () => {
    setImporting(true); setError(null); setSuccess(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) { setImporting(false); return; }

      const file = result.assets[0];
      const fileContent = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const binary = atob(fileContent);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const arrayBuffer = bytes.buffer as ArrayBuffer;

      const wb = readWorkbook(arrayBuffer, file.name);
      const base64 = bufferToBase64(arrayBuffer);
      await setWorkbookData(wb, base64);

      setSuccess(true);
      setTimeout(() => router.replace('/(tabs)'), 1500);
    } catch (e) {
      setError(t('importError'));
    } finally {
      setImporting(false);
    }
  }, [setWorkbookData, t, router]);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <ArrowLeft size={22} color="#FFF" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('importTemplate')}</Text>
      </View>
      <View style={styles.content}>
        {importing ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#00D9A3" />
            <Text style={styles.loadingText}>{t('importing')}</Text>
          </View>
        ) : success ? (
          <View style={styles.centerContent}>
            <View style={styles.successIcon}><CheckCircle2 size={48} color="#00D9A3" strokeWidth={2} /></View>
            <Text style={styles.successText}>{t('fileImported')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.dropZone}>
              <View style={styles.dropIcon}><Upload size={40} color="#00D9A3" strokeWidth={1.5} /></View>
              <Text style={styles.dropTitle}>{t('pickFile')}</Text>
              <Text style={styles.dropHint}>{t('pickFileHint')}</Text>
              <Text style={styles.formats}>.xlsx · .xls</Text>
            </View>
            {error && (
              <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
            )}
            <TouchableOpacity style={styles.pickBtn} activeOpacity={0.7} onPress={handlePick}>
              <FileSpreadsheet size={22} color="#0A0A0A" strokeWidth={2.5} />
              <Text style={styles.pickBtnText}>{t('pickFile')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 32 },
  backBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#222', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  content: { flex: 1 },
  centerContent: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  loadingText: { fontSize: 16, color: '#666' },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,217,163,0.15)', alignItems: 'center', justifyContent: 'center' },
  successText: { fontSize: 18, fontWeight: '600', color: '#00D9A3' },
  dropZone: { alignItems: 'center', borderWidth: 2, borderColor: '#222', borderStyle: 'dashed', borderRadius: 20, paddingVertical: 48, paddingHorizontal: 24, gap: 12, marginBottom: 24 },
  dropIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,217,163,0.1)', alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontSize: 18, fontWeight: '700', color: '#E8E8E8' },
  dropHint: { fontSize: 14, color: '#555', textAlign: 'center' },
  formats: { fontSize: 13, fontWeight: '600', color: '#00D9A3' },
  errorBox: { backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: 10, padding: 14, marginBottom: 16 },
  errorText: { fontSize: 14, color: '#FF4444' },
  pickBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#00D9A3', borderRadius: 14, paddingVertical: 18 },
  pickBtnText: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
});
