/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: string;
  readonly VITE_GITHUB_ORG?: string;
  readonly VITE_SOLANA_CLUSTER?: string;
  readonly VITE_SOLANA_RPC_URL?: string;
  readonly VITE_TOKEN_MINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
