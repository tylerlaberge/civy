/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Base URL of the Civy API. See .env.example. */
  readonly PUBLIC_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
