interface ViteTypeOptions {
  // Makes a typo in an import.meta.env key a type error instead of `any`.
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  /** Base URL of the API as seen by the browser. Defaults to the same-origin `/api` proxy. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
