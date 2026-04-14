/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCKET_URL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
