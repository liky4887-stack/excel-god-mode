import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { History, RotateCcw, Trash2 } from 'lucide-react-native';
import { SaveVersion } from '@/types';
import { useLanguage } from '@/hooks/useLanguage';

interface Props {
  version: SaveVersion;
  onRollback: () => void;
  onDelete: () => void;
}

function VersionCard({ version, onRollback, onDelete }: Props) {
  const { t } = useLanguage();
  const d = new Date(version.createdAt);
  const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.iconWrap}><History size={20} color="#00D9A3" strokeWidth={2} /></View>
        <View style={styles.info}>
          <Text style={styles.versionLabel}>{version.label}</Text>
          <Text style={styles.versionMeta}>{t('versions')} #{version.versionNumber} · {dateStr}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.rollbackBtn} onPress={onRollback}>
          <RotateCcw size={16} color="#00D9A3" strokeWidth={2} />
          <Text style={styles.rollbackText}>{t('rollback')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Trash2 size={16} color="#FF4444" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default memo(VersionCard);

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 14, marginBottom: 10 },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,217,163,0.12)', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  versionLabel: { fontSize: 15, fontWeight: '600', color: '#E8E8E8', marginBottom: 2 },
  versionMeta: { fontSize: 12, color: '#666' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rollbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,217,163,0.3)', backgroundColor: 'rgba(0,217,163,0.08)' },
  rollbackText: { fontSize: 12, fontWeight: '600', color: '#00D9A3' },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', backgroundColor: 'rgba(255,68,68,0.08)' },
});
