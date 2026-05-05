/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When `"true"`, hides the draft legal banner on Privacy and Terms (after counsel-approved copy is in place). */
  readonly VITE_LEGAL_CONTENT_REVIEWED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
