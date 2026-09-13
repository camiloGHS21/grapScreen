import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import esTranslations from './locales/es.json';
import enTranslations from './locales/en.json';

// Retrieve the saved language from localStorage, default to 'es'
const savedLanguage = localStorage.getItem('grap_lang') || 'es';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: esTranslations },
      en: { translation: enTranslations }
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;
