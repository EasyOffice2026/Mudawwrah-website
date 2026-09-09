import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar.json';
import en from './en.json';

const stored = localStorage.getItem('mdawra_lang') || 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: stored,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export const applyDirection = (lang) => {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
};

applyDirection(stored);

i18n.on('languageChanged', (lang) => {
  localStorage.setItem('mdawra_lang', lang);
  applyDirection(lang);
});

export default i18n;
