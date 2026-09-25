/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Entry URL for Avaria. Absolute http(s) URL or same-origin path. */
  readonly VITE_AVARIA_URL?: string
  /** Entry URL for המחלבה. Absolute http(s) URL or same-origin path. */
  readonly VITE_MACHLAVA_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
