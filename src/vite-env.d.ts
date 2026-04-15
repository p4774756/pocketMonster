/// <reference types="vite/client" />

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SOCKET_URL: string | undefined;
  /** 選填：Google 表單、GitHub Issues 等 HTTPS 連結，會在新分頁開啟。 */
  readonly VITE_FEEDBACK_URL: string | undefined;
  /** 選填：回饋用信箱（純位址，如 feedback@example.com），會開啟已帶主旨與環境資訊的 mailto。 */
  readonly VITE_FEEDBACK_EMAIL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
