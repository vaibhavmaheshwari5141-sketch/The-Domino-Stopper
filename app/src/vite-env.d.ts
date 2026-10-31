/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API, for example https://api.example.com. Empty means same origin (/api). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
