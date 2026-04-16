# Firebase 好友系統（選用）

對戰大廳可顯示 **「好友（Firebase）」** 摺疊區：以 **Firebase Authentication（Email／密碼）** 登入，**Cloud Firestore** 儲存個人檔、好友代碼、邀請與好友關係。  
**養成資料仍僅存 `localStorage`**，與 Firebase 帳號無自動綁定；對戰仍走既有 **Render Socket**（`VITE_SOCKET_URL`），本功能不取代後端對戰。

## 1. Firebase 主控台設定

1. 建立專案 → 啟用 **Authentication** → 登入方式勾選 **電子郵件／密碼**。  
2. 啟用 **Cloud Firestore**（建議先以「測試模式」建立資料庫，再立刻改為正式規則）。  
3. **規則**：將本倉 `docs/firebase-friends.rules` 內容貼到 Firestore「規則」並發布。  
4. **索引**：若即時監聽或查詢報錯，主控台會提供建立連結；亦可將 `docs/firebase-friends.indexes.json` 併入專案的 `firestore.indexes.json` 後以 Firebase CLI 部署。  
5. **專案設定 → 一般 → 您的應用程式** 新增 **Web** 應用，取得設定物件中的六個欄位，對應下方 `VITE_*` 變數。

## 2. 前端建置變數（Vite）

在 **GitHub Actions** 建置時，可於 Repository secrets 另行新增 `VITE_FIREBASE_API_KEY` 等六個名稱與值（與 `SOCKET_SERVER_URL` 並列），並在 `.github/workflows/deploy-pages.yml` 的 **Build static site** 步驟 `env:` 區塊手動帶入 `${{ secrets.VITE_FIREBASE_* }}`（預設 workflow **未**寫死這些變數，避免未使用者建置失敗）。本機則用 `.env.local`（**勿**提交版控）。

| 變數 | 說明 |
|------|------|
| `VITE_FIREBASE_API_KEY` | Web API 金鑰 |
| `VITE_FIREBASE_AUTH_DOMAIN` | 例如 `your-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | 專案 ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | 例如 `your-app.appspot.com`（即使未用 Storage 也需填，與 Firebase 主控台一致） |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 寄件者 ID（數字字串） |
| `VITE_FIREBASE_APP_ID` | App ID |

**六項皆齊**時大廳才會顯示可操作的好友面板；否則僅顯示說明文字。  
`deploy.env.example` 與 `AGENTS.md` 環境變數表有摘要。

## 3. 資料模型（Firestore）

| 集合／文件 | 用途 |
|------------|------|
| `profiles/{uid}` | `displayName`、`friendCode`（8 碼大寫英數）、`updatedAt` |
| `friend_codes/{code}` | `uid`，供以代碼查使用者 |
| `friend_requests/{autoId}` | `fromUid`、`toUid`、`fromDisplayName`、`status`（僅 `pending`）、`createdAt` |
| `friends/{uidA_uidB}` | `members`（兩個 uid 排序）、`nicknames`（對照 uid→顯示名）、`since` |

接受邀請時以 **batch** 刪除邀請文件並建立 `friends` 文件；**不**使用 Cloud Functions。

## 4. 維護注意

- 修改 Firestore 結構或規則時，請同步更新本檔與 `docs/firebase-friends.rules`。  
- 玩家可讀規則摘要見 `docs/GAME_RULES.md` **2.10**。  
- 實作程式：`src/firebase/config.ts`、`src/firebase/friendsFirestore.ts`、`src/lobbyFirebaseFriends.ts`，大廳掛載於 `src/main.ts` 的 `renderLobby`。
