import { createContext, useContext, useState, ReactNode } from 'react';
import { I18nManager } from 'react-native';
import { Language } from '@/types';
import { t, TKey } from '@/src/i18n';

interface LanguageContextValue {
  language: Language;
  isRTL: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<Language>('ar');

  const setLanguage = (lang: Language) => {
    setLang(lang);
    I18nManager.forceRTL(lang === 'ar');
  };

  const toggleLanguage = () => setLanguage(language === 'ar' ? 'en' : 'ar');

  return (
    <LanguageContext.Provider value={{ language, isRTL: language === 'ar', setLanguage, toggleLanguage, t: (k: TKey) => t(k, language) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
