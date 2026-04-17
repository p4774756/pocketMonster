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
  /** 選用：Firebase Web 設定（六項皆齊才在養成主畫面啟用好友面板）。見 `docs/FIREBASE_FRIENDS.md`。 */
  readonly VITE_FIREBASE_API_KEY: string | undefined;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string | undefined;
  readonly VITE_FIREBASE_PROJECT_ID: string | undefined;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string | undefined;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string | undefined;
  readonly VITE_FIREBASE_APP_ID: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
