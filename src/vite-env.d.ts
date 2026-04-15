/// <reference types="vite/client" />

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SOCKET_URL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
