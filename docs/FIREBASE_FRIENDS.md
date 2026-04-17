# Firebase 好友系統（選用）

**養成主畫面**（非連線大廳）可顯示 **「好友（Firebase）」** 摺疊區：以 **Firebase Authentication（Email／密碼）** 登入，**Cloud Firestore** 儲存個人檔、好友代碼、邀請與好友關係。  
**養成資料仍僅存 `localStorage`**，與 Firebase 帳號無自動綁定；對戰仍走既有 **Render Socket**（`VITE_SOCKET_URL`），本功能不取代後端對戰。

## 1. Firebase 主控台設定

1. 建立專案 → 啟用 **Authentication** → 登入方式勾選 **電子郵件／密碼**。  
2. 啟用 **Cloud Firestore**（建議先以「測試模式」建立資料庫，再立刻改為正式規則）。  
3. **規則**：將本倉 `docs/firebase-friends.rules` 內容貼到 Firestore「規則」並發布。  
4. **索引**：若即時監聽或查詢報錯，主控台會提供建立連結；亦可將 `docs/firebase-friends.indexes.json` 併入專案的 `firestore.indexes.json` 後以 Firebase CLI 部署。  
5. **專案設定 → 一般 → 您的應用程式** 新增 **Web** 應用，取得設定物件中的六個欄位，對應下方 `VITE_*` 變數。

## 2. 前端建置變數（Vite）

在 **GitHub** → **Settings → Secrets and variables → Actions** 建立 Repository secrets：`SOCKET_SERVER_URL`（必填）以及六個 `VITE_FIREBASE_*`（選填；皆設定後 Pages 建置才會內嵌養成畫面好友功能）。本倉 `.github/workflows/deploy-pages.yml` 的 **Build static site** 已將上述 secrets 對應到 `env`，**無需**再改 workflow。本機則用專案根目錄 `.env.local`（**勿**提交版控）。

| 變數 | 說明 |
|------|------|
| `VITE_FIREBASE_API_KEY` | Web API 金鑰 |
| `VITE_FIREBASE_AUTH_DOMAIN` | 例如 `your-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | 專案 ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | 例如 `your-app.appspot.com`（即使未用 Storage 也需填，與 Firebase 主控台一致） |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 寄件者 ID（數字字串） |
| `VITE_FIREBASE_APP_ID` | App ID |

**六項皆齊**時養成主畫面才會顯示可操作的好友面板；否則僅顯示說明文字。  
`deploy.env.example` 與 `AGENTS.md` 環境變數表有摘要。

## 3. 資料模型（Firestore）

| 集合／文件 | 用途 |
|------------|------|
| `profiles/{uid}` | `displayName`、`friendCode`（新帳為 **4** 碼大寫英數；舊資料可仍為 8 碼）、`updatedAt` |
| `friend_codes/{code}` | `uid`，供以代碼查使用者 |
| `friend_requests/{autoId}` | `fromUid`、`toUid`、`fromDisplayName`、`status`（僅 `pending`）、`createdAt` |
| `friends/{uidA_uidB}` | `members`（兩個 uid 排序）、`nicknames`（對照 uid→顯示名）、`since` |

接受邀請時以 **batch** 刪除邀請文件並建立 `friends` 文件；**不**使用 Cloud Functions。

## 4. 註冊後顯示「無法寫入好友資料」或泛用失敗

- **Authentication**：主控台須啟用 **電子郵件／密碼**；未啟用時介面會提示無法使用該登入方式。  
- **Firestore**：須建立資料庫，並將 **`docs/firebase-friends.rules`** 貼到「規則」後**發布**。若 Auth 已成功建立帳號但寫入 `profiles`／`friend_codes` 被拒，介面會改顯示與 Firestore 相關的說明（開發模式下瀏覽器 **Console** 會有 `[firebase friends] profile init` 日誌）。  
- 修正規則後：若該 Email 已在 Auth 裡註冊過，請改按 **登入**（勿再註冊）；若仍無個人檔，登入後會再次執行建立個人檔與好友代碼。

## 5. 維護注意

- 修改 Firestore 結構或規則時，請同步更新本檔與 `docs/firebase-friends.rules`。  
- 玩家可讀規則摘要見 `docs/GAME_RULES.md` **2.10**。  
- 實作程式：`src/firebase/config.ts`、`src/firebase/friendsFirestore.ts`、`src/lobbyFirebaseFriends.ts`，掛載於 `src/main.ts` 的 `renderCare`。
