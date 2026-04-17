# Firebase 好友系統（選用）

從 **養成畫面**進入獨立 **「好友（Firebase）」** 頁（非連線大廳）：以 **Firebase Authentication（Email／密碼）** 登入，**Cloud Firestore** 儲存個人檔、好友代碼、邀請、好友關係與**好友一對一文字聊天**（每則最多 **500** 字；對戰仍僅快捷語，見 `docs/GAME_RULES.md` **2.9**）。  
**養成資料仍僅存 `localStorage`**，與 Firebase 帳號無自動綁定；對戰仍走既有 **Render Socket**（`VITE_SOCKET_URL`），本功能不取代後端對戰。

## 1. Firebase 主控台設定

1. 建立專案 → 啟用 **Authentication** → 登入方式勾選 **電子郵件／密碼**。  
2. 啟用 **Cloud Firestore**（建議先以「測試模式」建立資料庫，再立刻改為正式規則）。  
3. **規則**：將本倉 `docs/firebase-friends.rules` 內容貼到 Firestore「規則」並發布。  
4. **索引**：若即時監聽或查詢報錯，主控台會提供建立連結；亦可將 `docs/firebase-friends.indexes.json` 併入專案的 `firestore.indexes.json` 後以 Firebase CLI 部署。  
   **好友聊天**查詢為：`where("memberUids", "array-contains", 目前使用者)` + `orderBy("createdAt")`，須建立複合索引 **`memberUids`（陣列 Contains）+ `createdAt`（遞增）**；因訊息在 **`friends/{pairId}/messages` 子集合**，索引的 **`queryScope` 須為 `COLLECTION_GROUP`**（見本倉 `firebase-friends.indexes.json` 最後一筆）。若曾以 `COLLECTION` 部署過，請刪除錯誤索引後改以本檔重新 `firebase deploy --only firestore:indexes`。  
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

**六項皆齊**時好友頁才會顯示可操作的面板；否則僅顯示說明文字。  
`deploy.env.example` 與 `AGENTS.md` 環境變數表有摘要。

## 3. 資料模型（Firestore）

| 集合／文件 | 用途 |
|------------|------|
| `profiles/{uid}` | `displayName`、`friendCode`（新帳為 **4** 碼大寫英數；舊資料可仍為 8 碼）、`updatedAt` |
| `friend_codes/{code}` | `uid`，供以代碼查使用者 |
| `friend_requests/{autoId}` | `fromUid`、`toUid`、`fromDisplayName`、`status`（僅 `pending`）、`createdAt` |
| `friends/{uidA_uidB}` | `members`（兩個 uid 排序）、`nicknames`（對照 uid→顯示名）、`since` |
| `friends/{pairId}/messages/{autoId}` | `fromUid`、`text`（1～500 字）、`memberUids`（長度 2，與父層 `friends.members` 一致）、`createdAt`（`serverTimestamp`）；僅雙方可讀寫建立，見 `docs/firebase-friends.rules` |

接受邀請時以 **batch** 刪除邀請文件並建立 `friends` 文件；**不**使用 Cloud Functions。  
客戶端以 **`onSnapshot`** 訂閱邀請／名單；若畫面未即時更新，**展開「好友（Firebase）」摺疊區**或**切回此分頁**時會再向伺服器拉取一次（`getDocs` 備援）。

## 4. 註冊後顯示「無法寫入好友資料」或泛用失敗

- **Authentication**：主控台須啟用 **電子郵件／密碼**；未啟用時介面會提示無法使用該登入方式。  
- **Firestore**：須建立資料庫，並將 **`docs/firebase-friends.rules`** 貼到「規則」後**發布**。若 Auth 已成功建立帳號但寫入 `profiles`／`friend_codes` 被拒，介面會改顯示與 Firestore 相關的說明（開發模式下瀏覽器 **Console** 會有 `[firebase friends] profile init` 日誌）。  
- 修正規則後：若該 Email 已在 Auth 裡註冊過，請改按 **登入**（勿再註冊）；若仍無個人檔，登入後會再次執行建立個人檔與好友代碼。  
- **發送邀請**會查詢 `friend_requests` 複合條件；若主控台或瀏覽器 Console 出現需建立**索引**的提示，請依連結建立，或將 **`docs/firebase-friends.indexes.json`** 併入專案後以 Firebase CLI 部署索引。  
- 若已登入且規則已發布，仍無法發送邀請並出現 **permission-denied**：舊版 `friends` 讀取規則在**文件尚不存在**時會誤擋 `get`；請將本倉 **`docs/firebase-friends.rules`** 更新後**再次發布**（`friends` 的 `read` 須含「文件不存在則允許已登入讀取」的條件，見檔內註解）。
- **好友聊天**若**監聽**即 **permission-denied**：請確認規則已發布，且訊息文件含 **`memberUids`**（與 `friends.members` 一致）。若子集合內**混有舊版訊息**（無 `memberUids`），請升級前端後改用 **`array-contains` + `orderBy`** 的查詢（見 `subscribeFriendChatMessages`），並建立上述 **messages 複合索引**；舊訊息不會出現在該查詢結果中，可在主控台為舊文件**手動補上 `memberUids`**（同層 `friends` 文件的 `members` 陣列）或刪除舊文件。  
- 若出現 **failed-precondition**（缺索引）：依主控台連結建立索引，或部署 `docs/firebase-friends.indexes.json`。

## 5. 維護注意

- 修改 Firestore 結構或規則時，請同步更新本檔與 `docs/firebase-friends.rules`。  
- 玩家可讀規則摘要見 `docs/GAME_RULES.md` **2.10**。  
- 實作程式：`src/firebase/config.ts`、`src/firebase/friendsFirestore.ts`、`src/lobbyFirebaseFriends.ts`，掛載於 `src/main.ts` 的 `renderFriends`（`#firebase-friends-root`）。

## 6. 舊 8 碼改為 4 碼（營運／維護手動遷移）

前端自 **v0.2.29** 起僅**新註冊**會產生 **4** 碼；已存在之 `profiles`／`friend_codes` **不會自動改寫**。若希望舊使用者也改顯示 4 碼、且加友時以短碼為主，須在 Firestore **手動**調整（或自行撰寫 **Admin SDK** 批次腳本，勿把服務帳號金鑰提交版控）。

**為何不能用 App 內自己刪？** 目前 `docs/firebase-friends.rules` 規定 `friend_codes` 的 **delete** 為 `false`，一般使用者無法刪除代碼文件；遷移須透過 **Firebase 主控台**（專案擁有者操作，不受規則限制）或 **Admin SDK**。

### 6.1 單一使用者（主控台）

對 `profiles/{uid}` 內 `friendCode` 仍為 **8** 碼者，建議順序如下（避免短暫查不到人）：

1. **備份**：匯出或截圖該使用者的 `profiles` 與對應之 `friend_codes/{舊碼}`。  
2. **挑新碼**：在 **`friend_codes`** 集合搜尋，自訂一組 **4** 碼大寫英數，字元須與程式一致：`23456789ABCDEFGHJKMNPQRSTVWXYZ`（見 `src/firebase/friendsFirestore.ts` 的 `FRIEND_CODE_ALPH`），且 **`friend_codes/{新碼}` 尚不存在**。  
3. **新增**：建立文件 `friend_codes/{新碼}`，欄位僅需 `{ "uid": "<該使用者 uid>" }`（與現有格式相同）。  
4. **更新**：編輯 `profiles/{uid}`，將 `friendCode` 改為該 **新碼**，並更新 `updatedAt`（可選，建議與其他欄位一併寫入 `serverTimestamp` 等價時間）。  
5. **刪除舊索引**（選做，但建議）：刪除 `friend_codes/{舊 8 碼}`。刪除後他人**無法**再以舊 8 碼查到此使用者；若希望過渡期兩碼皆可加友，可暫留舊文件（兩份文件之 `uid` 相同即可，查詢仍依代碼文件 id）。  
6. 請使用者**重新登入**或重新整理養成頁，以看到新代碼。

### 6.2 批次注意

- 每個 **新 4 碼** 在 `friend_codes` 內必須**全域唯一**；批次前可先匯出 `friend_codes` 清單避免碰撞。  
- `friends`／`friend_requests` 內儲存的是 **uid**，**不必**因改短碼而修改（關係與邀請仍以 uid 為準）。  
- 若曾手動複製錯誤的 `friendCode` 到別處宣傳，改碼後請通知使用者更新分享字串。

### 6.3 Admin SDK（略述）

使用 **Firebase Admin** 以服務帳號讀寫 Firestore，邏輯與 **6.1** 相同：先 `create` 新 `friend_codes` 文件、再 `update` `profiles`、最後 `delete` 舊 `friend_codes`（若需）。請在隔離環境執行、先對測試專案驗證。
