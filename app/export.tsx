import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal } from 'react-native';
import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ArrowLeft, Download, FileText, FileSpreadsheet, CheckCircle2 } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useExcel } from '@/hooks/ExcelProvider';
import { writeWorkbook, base64ToBuffer, bufferToBase64 } from '@/src/excelBridge';

type ExportFormat = 'xlsx' | 'pdf' | 'both';

export default function ExportScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { activeTemplate, activeTemplateId } = useExcel();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  const workbook = activeTemplate?.workbook;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const toggleTemplateSelection = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(activeTemplateId ? [activeTemplateId] : []);
  }, [activeTemplateId]);

  const handleClear = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleExportXlsx = useCallback(async () => {
    if (!workbook || !activeTemplateId) return;
    setExporting('xlsx');
    setProgress(`Exporting ${workbook.fileName}...`);
    try {
      if (!workbook.originalBase64) throw new Error('No original buffer');
      const outBuffer = writeWorkbook(workbook, workbook.originalBase64);
      const b64 = bufferToBase64(outBuffer);
      const fileName = workbook.fileName.replace(/\.(xlsx|xls)$/, '') + '_export.xlsx';
      const filePath = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(filePath, b64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: t('exportXlsx'),
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
      Alert.alert(t('fileExported'), '');
    } catch (e) {
      Alert.alert(t('exportError'), String(e));
    } finally {
      setExporting(null);
      setProgress(null);
    }
  }, [workbook, activeTemplateId, t]);

  const handleExportPdf = useCallback(async () => {
    setExporting('pdf');
    setProgress('Generating PDF summary...');
    try {
      const { expoPrint } = await import('@/src/pdfExport');
      const html = expoPrint(workbook!, t);
      const fileName = workbook!.fileName.replace(/\.(xlsx|xls)$/, '') + '_summary.pdf';
      const filePath = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(filePath, html, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/pdf',
        dialogTitle: t('exportPdf'),
        UTI: 'com.adobe.pdf',
      });
      Alert.alert(t('pdfGenerated'), '');
    } catch (e) {
      Alert.alert(t('exportError'), String(e));
    } finally {
      setExporting(null);
      setProgress(null);
    }
  }, [workbook, t]);

  const handleExportBoth = useCallback(async () => {
    await handleExportXlsx();
    if (!exporting) {
      await handleExportPdf();
    }
  }, [handleExportXlsx, handleExportPdf, exporting]);

  const handleExport = useCallback(() => {
    if (exporting === 'xlsx') handleExportXlsx();
    else if (exporting === 'pdf') handleExportPdf();
    else handleExportBoth();
  }, [exporting, handleExportXlsx, handleExportPdf, handleExportBoth]);

  if (!workbook || workbook.sheets.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <ArrowLeft size={22} color="#FFF" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('exportFile')}</Text>
        </View>
        <View style={styles.empty}><Text style={styles.emptyText}>{t('noWorkbook')}</Text></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <ArrowLeft size={22} color="#FFF" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('exportFile')}</Text>
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.fileInfoCard}>
          <FileSpreadsheet size={32} color="#00D9A3" strokeWidth={2} />
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>{workbook.fileName}</Text>
            <Text style={styles.fileMeta}>{workbook.sheets.length} {t('sheets')} · {workbook.records.length} {t('records')}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.exportCard} activeOpacity={0.7} onPress={handleExport} disabled={exporting !== null}>
          <View style={[styles.exportIcon, { backgroundColor: 'rgba(0,217,163,0.12)' }]}>
            {exporting === 'xlsx' ? <ActivityIndicator size="small" color="#00D9A3" /> : <FileSpreadsheet size={24} color="#00D9A3" strokeWidth={2} />}
          </View>
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Export XLSX</Text>
            <Text style={styles.exportHint}>.xlsx · {t('exportFile')}</Text>
          </View>
          <Download size={20} color="#444" strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.exportCard} activeOpacity={0.7} onPress={handleExport} disabled={exporting !== null}>
          <View style={[styles.exportIcon, { backgroundColor: 'rgba(255,180,68,0.12)' }]}>
            {exporting === 'pdf' ? <ActivityIndicator size="small" color="#FFB444" /> : <FileText size={24} color="#FFB444" strokeWidth={2} />}
          </View>
          <View style={styles.exportInfo}>
            <Text style={styles.exportTitle}>Export PDF Summary</Text>
            <Text style={styles.exportHint}>.pdf · {t('summary')}</Text>
          </View>
          <Download size={20} color="#444" strokeWidth={2} />
        </TouchableOpacity>

        {progress && (
          <View style={styles.progressBox}>
            <ActivityIndicator size="small" color="#00D9A3" />
            <Text style={styles.progressText}>{progress}</Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{t('yourData')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', paddingTop: 60, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#222', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  content: { flex: 1 },
  fileInfoCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, padding: 16, marginBottom: 20 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 16, fontWeight: '600', color: '#E8E8E8', marginBottom: 2 },
  fileMeta: { fontSize: 13, color: '#666' },
  exportCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, padding: 16, marginBottom: 12 },
  exportIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  exportInfo: { flex: 1 },
  exportTitle: { fontSize: 16, fontWeight: '600', color: '#E8E8E8', marginBottom: 2 },
  exportHint: { fontSize: 13, color: '#555' },
  progressBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: 'rgba(0,217,163,0.06)', borderRadius: 10, marginBottom: 12 },
  progressText: { fontSize: 14, color: '#00D9A3' },
  infoBox: { backgroundColor: 'rgba(0,217,163,0.06)', borderWidth: 1, borderColor: 'rgba(0,217,163,0.15)', borderRadius: 12, padding: 14, marginTop: 8, alignItems: 'center' },
  infoText: { fontSize: 13, color: '#00D9A3' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, color: '#666' },
});
