/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Inyectado en build (git local o COMMIT_REF / etc. en CI). */
  readonly VITE_APP_COMMIT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
