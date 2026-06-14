import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import es from "./es.json";

export const LOCALE_STORAGE_KEY = "stepsprint-locale";

function readStoredLocale(): "en" | "es" | undefined {
  try {
    const v = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (v === "en" || v === "es") return v;
  } catch {
    /* private mode or no storage */
  }
  return undefined;
}

const storedLocale = readStoredLocale();
const browserLocaleHint =
  storedLocale === undefined && typeof navigator !== "undefined"
    ? navigator.language.toLowerCase().startsWith("es")
      ? "es"
      : "en"
    : undefined;

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: storedLocale ?? browserLocaleHint ?? "en",
  fallbackLng: "en",
  supportedLngs: ["en", "es"],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
