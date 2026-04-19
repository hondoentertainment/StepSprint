import "@testing-library/jest-dom/vitest";
// Ensure i18next is initialized before any test renders components that use
// useTranslation(). main.tsx does this for the real app; tests need their own
// bootstrap since they mount subtrees directly.
import "../i18n";
