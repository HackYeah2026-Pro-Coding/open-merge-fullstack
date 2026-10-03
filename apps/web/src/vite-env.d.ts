/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: string;
  readonly VITE_GITHUB_REPO?: string;
  readonly VITE_SOLANA_CLUSTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
