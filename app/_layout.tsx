import { useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { LanguageProvider } from '@/hooks/useLanguage';
import { ExcelProvider } from '@/hooks/ExcelProvider';
import ErrorBoundary from '@/components/ErrorBoundary';
import SplashScreen from '@/components/SplashScreen';
import { installCrashGuard } from '@/lib/crashGuard';

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    try {
      installCrashGuard();
    } catch (e) {
      if (__DEV__) console.warn('[crashGuard] install failed:', e);
    }
  }, []);
  const [splashDone, setSplashDone] = useState(false);

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ExcelProvider>
          {!splashDone ? (
            <>
              <SplashScreen onFinish={() => setSplashDone(true)} />
              <StatusBar style="light" />
            </>
          ) : (
            <>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="import" options={{ presentation: 'modal' }} />
                <Stack.Screen name="export" options={{ presentation: 'modal' }} />
            <Stack.Screen name="create-template" options={{ presentation: 'modal' }} />
                <Stack.Screen name="+not-found" />
              </Stack>
              <StatusBar style="light" />
            </>
          )}
        </ExcelProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
