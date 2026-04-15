# Pocket Monster（pocket-pet-battle）— Agent 專案導覽

本文件給之後的 coding agent 用：說明架構、如何跑起來、哪裡改什麼、部署與資產規範。

**遊戲規則（養成 + 對戰）** 的完整說明寫在 **`docs/GAME_RULES.md`**，改平衡或寫給玩家說明時請以該檔與程式為準。

## 專案是什麼

- **電子寵物養成**：狀態存在瀏覽器 `localStorage`（鍵名等見 `src/pet.ts`），含飢餓、心情、清潔、體力、訓練、虛擬日齡、生病與死亡等邏輯。
- **匿名連線對戰**：兩人透過 **房間碼** 配對，**Socket.IO** 同步回合制戰鬥（出招、超時自動出招、投降、斷線處理）。

前端為 **Vite + TypeScript** 單頁應用；後端為 **Node（ESM）+ Express + socket.io** 的單檔伺服器。

**版本號**：以根目錄 **`package.json` 的 `version`** 為單一來源；前端建置時由 Vite 注入 `__APP_VERSION__`（頂欄顯示），後端啟動日誌與 **`GET /version`** 亦讀取同檔。

## 目錄結構（精簡）

| 路徑 | 用途 |
|------|------|
| `src/main.ts` | 幾乎全部 UI：養成畫面、紀念頁、對戰大廳與戰鬥 UI；Socket 客戶端事件綁定。 |
| `src/pet.ts` | 寵物狀態型別、`loadPet`/`save`、成長階段、各種照護 action、死亡條件。 |
| `src/style.css` | 全域樣式。 |
| `server/index.js` | HTTP + WebSocket：房間、戰鬥狀態機、傷害結算、TTL 清理。 |
| `public/pets/` | 精靈圖等靜態資源（idle 依成長階段命名）。 |
| `docs/GAME_RULES.md` | **遊戲規則**：養成、孵化、對戰出招與傷害、勝負條件（給玩家／維護者）。 |
| `vite.config.ts` | 開發時把 `/socket.io` **proxy** 到 `localhost:3000`。 |
| `render.yaml` | Render.com Web Service 範例（僅 API、不掛靜態）。 |
| `.github/workflows/deploy-pages.yml` | GitHub Pages 靜態部署；建置需 `SOCKET_SERVER_URL` secret。 |
| `.cursor/rules/pocket-pet-assets.mdc` | **永遠套用**：美術資產流程（原創、PNG、idle 命名等）。 |

## 本機開發

```bash
npm install
npm run dev
```

- 會同時跑 **`dev:server`**（預設 port **3000**）與 **`dev:client`**（Vite **5173**）。
- 瀏覽器連 5173 即可；Socket 經 Vite proxy 連到本機 3000，**不必**設 `VITE_SOCKET_URL`。

單獨跑：

- 僅前端：`npm run dev:client`（若沒有後端，對戰功能不可用）。
- 僅後端：`npm run dev:server`。

## 環境變數

| 變數 | 誰用 | 說明 |
|------|------|------|
| `VITE_SOCKET_URL` | 前端建置／執行 | **生產或分離部署時必填**（完整 origin，無尾隨 `/`）。見 `deploy.env.example`。開發留空則連同源並走 proxy。 |
| `VITE_FEEDBACK_URL` | 前端建置 | 選填。意見回饋彈窗的「開啟回饋表單」連結（建議 `https:`）。 |
| `VITE_FEEDBACK_EMAIL` | 前端建置 | 選填。`mailto` 收件信箱。 |
| `PORT` | `server/index.js` | HTTP 埠，預設 `3000`。 |
| `NODE_ENV=production` | 伺服器 | 生產模式。 |
| `SERVE_STATIC=0` | 伺服器 | 僅 API：不從 `dist` 提供靜態（Render 上的 API 服務用）。 |

型別：`src/vite-env.d.ts` 宣告了 `VITE_SOCKET_URL` 與選填的 `VITE_FEEDBACK_*`。

## Socket 協定（客戶端 ↔ `server/index.js`）

客戶端 path 固定為 `/socket.io`（見 `src/main.ts` 與 `vite.config.ts`）。

**Client → Server**

- `create_room({ pet: { species, nickname, virtAge } }, ack)` — `ack({ ok, roomCode })`；舊版只傳 `ack` 仍相容（伺服器用預設外觀）。`pet` 供對手顯示精靈與暱稱。
- `join_room({ roomCode, pet: { species, nickname, virtAge } }, ack)` — `ack({ ok, error? })`；建議一律帶 `pet`。
- `list_open_rooms({}, ack)` — `ack({ ok, rooms })`；`rooms` 為最多 40 筆 `{ roomCode, hostNickname, hostSpecies, created }`（僅「房主已連線、尚無訪客」且排除呼叫端自己開的房）。
- `choose_move({ move })` — `move`: `"strike" | "guard" | "charge"`
- `forfeit` — 投降並結束對戰

**Server → Client**

- `linked` — 配對成功；payload 含 `role`、`roomCode`、**`foe`**（對手 `{ species, nickname, virtAge }`，供對戰畫面）。
- `open_rooms_changed` — 無 payload；**可加入的公開房清單**有變（開房、有人加入、房關閉、訪客斷線回到等待等）時廣播；大廳可據此再呼叫 `list_open_rooms`（實作含約 200ms 防抖合併）。
- `peer_joined` / `peer_left` — 對端狀態
- `battle_state` — 回合、HP、deadline、phase、鎖定狀態等
- `round_result` — 雙方出招與敘述、HP
- `battle_end` — 勝負或平手、可含 `forfeitBy`

戰鬥規則常數（回合長度、最大回合、起始 HP 等）在 **`server/index.js` 頂部**；前端 UI 字串與部分倒數與 **`ROUND_MS`** 在 `src/main.ts` — 若改規則請兩邊對齊，並更新 **`docs/GAME_RULES.md`**。

## 建置與生產跑法

```bash
npm run build   # 輸出 dist/
npm run start   # NODE_ENV=production：若有 dist 則一併提供靜態 + Socket
npm run start:api   # SERVE_STATIC=0：只跑 API（給 Pages + 分離後端）
```

## 部署形態（摘要）

1. **GitHub Pages（靜態）**：workflow 建置時注入 `secrets.SOCKET_SERVER_URL` → `VITE_SOCKET_URL`。未設 secret 建置會失敗。
2. **Render（API）**：`render.yaml` 使用 `start:api`；部署後把該服務的 HTTPS URL 設進 GitHub secret。

## 改功能時該看哪

- **養成數值／壽命／儲存格式**：`src/pet.ts`（含 `STORAGE_KEY`、`idleSpriteForStage`、成長階段閾值）。
- **畫面與對戰流程**：`src/main.ts`（體積大，可用搜尋 `renderCare`、`renderBattle`、`ensureSocket`）。
- **對戰平衡與房間生命週期**：`server/index.js`。
- **樣式**：`src/style.css`。
- **新精靈／圖示**：遵守 `.cursor/rules/pocket-pet-assets.mdc`；idle 見 `idleSpriteForSpeciesStage`（`src/pet.ts`）；照護姿勢檔名見 **`carePoseFile`**（`src/pet.ts`），由 `src/main.ts` 呼叫。

## 慣例與注意

- UI 文案多為 **繁體中文**，部分在原始碼中以 Unicode 轉義字元儲存（與 `server/index.js` 內 log 字串類似）。
- 後端為 **JSDoc 型別** 的 `.js`，前端為 **TS**；不要假設伺服器有獨立 `tsconfig` 編譯步驟。
- `package.json` 的 `"type": "module"`：後端與工具鏈皆 ESM。

若你發現本文件與程式不一致，**以程式與 `package.json` 為準**，並請順手更新本文件。
