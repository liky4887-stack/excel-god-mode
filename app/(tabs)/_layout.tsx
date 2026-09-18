import { Tabs } from 'expo-router';
import { Home, Zap, Search, History, Settings } from 'lucide-react-native';
import { useLanguage } from '@/hooks/useLanguage';

export default function TabLayout() {
  const { t } = useLanguage();

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#0A0A0A', borderTopColor: '#1A1A1A', borderTopWidth: 1, height: 60, paddingBottom: 8, paddingTop: 8 },
      tabBarActiveTintColor: '#00D9A3',
      tabBarInactiveTintColor: '#444',
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: t('commandCenter'), tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={2} /> }} />
      <Tabs.Screen name="form" options={{ title: t('quickEntry'), tabBarIcon: ({ color, size }) => <Zap color={color} size={size} strokeWidth={2} /> }} />
      <Tabs.Screen name="search" options={{ title: t('search'), tabBarIcon: ({ color, size }) => <Search color={color} size={size} strokeWidth={2} /> }} />
      <Tabs.Screen name="audit" options={{ title: t('auditView'), tabBarIcon: ({ color, size }) => <History color={color} size={size} strokeWidth={2} /> }} />
      <Tabs.Screen name="settings" options={{ title: t('settings'), tabBarIcon: ({ color, size }) => <Settings color={color} size={size} strokeWidth={2} /> }} />
    </Tabs>
  );
}
