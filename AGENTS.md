# Pocket Monster（pocket-pet-battle）— Agent 專案導覽

本文件給之後的 coding agent 用：說明架構、如何跑起來、哪裡改什麼、部署與資產規範。

**遊戲規則（養成 + 對戰）** 的完整說明寫在 **`docs/GAME_RULES.md`**；遊戲內「遊戲說明」彈窗由 `src/gameRulesContent.ts` 的 **`getGameRulesPlayerHtml()`**（`marked`）自同檔節錄第一、二節並排版，非原始 Markdown。改平衡或寫給玩家說明時請以該檔與程式為準。**改 `GAME_RULES.md` 或規則相關程式時**，請依該檔 **§五** 同步更新 Socket 協定／`deploy.env.example`／`IMPROVEMENT_BACKLOG.md` 等（見 `.cursor/rules/pocket-pet-game-rules-sync.mdc`）。

## 專案是什麼

- **電子寵物養成**：狀態存在瀏覽器 `localStorage`（鍵名等見 `src/pet.ts`），含飢餓、心情、清潔、體力、訓練、虛擬日齡、生病與死亡等邏輯；並含**首次進化形態**（`morphTier`／`morphKey`）、勝場與照護／生病累積統計（見 `docs/GAME_RULES.md` 第 1.7 節）。
- **匿名連線對戰**：兩人透過 **房間碼** 配對，**Socket.IO** 同步回合制戰鬥（出招、超時自動出招、投降、斷線處理）。

前端為 **Vite + TypeScript** 單頁應用；後端為 **Node（ESM）+ Express + socket.io** 的單檔伺服器。

### 目前專案狀態（維護者快照）

- **版號**：一律以 **`package.json` 的 `version`** 為單一來源（前端頂欄、`GET /version`）。
- **已納入主線**：養成進化 MVP（`tryEvolve`、`recordPvpWin`）、對戰寵物快照可選 `morphKey`、`linked` 對手資料可含形態；細節見 **`docs/GAME_RULES.md`** 與 **`docs/ROADMAP_TASKS.md`**（路線勾選與待辦）。
- **進行中／下一批**：戰鬥本場 log、`server/index.js` 模組化、形態專屬美術等——以 **`docs/ROADMAP_TASKS.md`** 未勾選項為準。（**`README.md`** 已補：啟動、部署、圖片示意。）

**版本號**：以根目錄 **`package.json` 的 `version`** 為單一來源；前端建置時由 Vite 注入 `__APP_VERSION__`（頂欄顯示），後端啟動日誌與 **`GET /version`** 亦讀取同檔。實質更新 **`GAME_RULES.md`**、**`AGENTS.md`** 或 **`.cursor/rules/*.mdc`** 時，須在同一批變更內遞增該欄位（預設 patch +1）；遞增後應以**中文 commit 訊息**完成 `git commit` 並 **`git push`**（見 **`.cursor/rules/pocket-pet-game-rules-sync.mdc`** 末段）。

## 目錄結構（精簡）

| 路徑 | 用途 |
|------|------|
| `README.md` | 對外說明：專案簡介、技術棧、本機／部署、`docs/readme/` 圖片與 `public/pets` 示意。 |
| `src/main.ts` | 幾乎全部 UI：養成畫面、紀念頁、對戰大廳與戰鬥 UI；Socket 客戶端事件綁定。 |
| `src/pet.ts` | 寵物狀態型別、`loadPet`/`save`、成長階段、照護 action、死亡條件、**進化**（`tryEvolve`、`morphKey` 等）。 |
| `docs/ROADMAP_TASKS.md` | 產品路線與任務勾選（v0.3～v0.5）；與 `docs/IMPROVEMENT_BACKLOG.md` 互補。 |
| `src/canvasDog.ts` | **狗**物種：Canvas 像素格繪製（無 PNG），供養成／對戰／圖鑑。 |
| `src/style.css` | 全域樣式。 |
| `src/fonts.css` | 自託管字型（`@fontsource` 拉丁子集）；由 `main.ts` 早於 `style.css` 匯入。 |
| `scripts/optimize-pet-pngs.mjs` | 縮小 `public/pets/*.png`：`npm run optimize:pets`（換圖後應重跑）。 |
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
# 若更換 public/pets 內 PNG，建議提交前執行：
# npm run optimize:pets
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

- `create_room({ pet: { species, nickname, virtAge, power, morphKey?, playerTag? }, roomTitle? }, ack)` — `ack({ ok, roomCode, roomTitle })`；`roomTitle` 為伺服器裁切後的展示名（最多 24 字，可空字串）。舊版只傳 `ack` 仍相容。`pet` 供對手顯示與**對戰 MP 上限**（`power` 0～100，缺省伺服器以 12 計）。`morphKey` 選填：`striker`／`guardian`／`survivor`／`harmony`／`cat_volt`／`cat_aqua`／`cat_flora`／`dog_volt`／`dog_aqua`／`dog_pyro`／`dog_tox`／`doodoo`，供對戰頭像旁形態字樣（舊版 `dog_flora` 伺服器會視為 `dog_pyro`）。`playerTag` 選填：伺服器僅接受 **恰好四位數字**（0～9）才會保存並轉發，否則視同未提供（匿名辨識用，非帳號）。
- `join_room({ roomCode, pet: { species, nickname, virtAge, power, morphKey?, playerTag? } }, ack)` — `ack({ ok, error? })`；建議一律帶 `pet`。
- `list_open_rooms({}, ack)` — 成功：`ack({ ok: true, rooms })`；`rooms` 為最多 40 筆 `{ roomCode, roomTitle, hostNickname, hostSpecies, created, hostPlayerTag? }`（僅「房主已連線、尚無訪客」且排除呼叫端自己開的房）。`hostPlayerTag` 為房主 `pet.playerTag`（若有且通過伺服器驗證）。**節流**：同一連線 **1 秒內超過 10 次** 回 `ack({ ok: false, error: "too_fast" })`。
- `choose_move({ move })` — `move`: `"strike" | "guard" | "charge"`
- `battle_emote({ key })` — 對戰中預設快捷語；`key` 須為伺服器白名單（與 `src/main.ts` 的 `BATTLE_EMOTE_IDS` 一致，見 `docs/GAME_RULES.md` **§2.9**）。僅在房間已進入戰鬥且雙方在場時有效；約 **2.2 秒** 節流。
- `forfeit` — 投降並結束對戰

**Server → Client**

- `linked` — 配對成功；payload 含 `role`、`roomCode`、**`foe`**（對手 `{ species, nickname, virtAge, power, morphKey?, playerTag? }`，供對戰畫面；`morphKey`／`playerTag` 選填，見 `create_room`／`join_room` 的 `pet`）。
- `open_rooms_changed` — 無 payload；**可加入的公開房清單**有變（開房、有人加入、房關閉、訪客斷線回到等待等）時廣播；大廳可據此再呼叫 `list_open_rooms`（實作含約 200ms 防抖合併）。
- `peer_joined` / `peer_left` — 對端狀態
- `battle_state` — 回合、HP、**MP**（`mp` / `mpMax` 主客欄位、以及 **`yourMp` / `yourMpMax` / `foeMp` / `foeMpMax`** 視角欄位）、deadline、phase、鎖定狀態等
- `round_result` — 雙方出招與敘述、HP、結算後的 **`mp` / `mpMax`**
- `battle_emote` — 對手送出的快捷語；payload `{ key }`（同白名單鍵），由客戶端對照為中文句子寫入戰報
- `battle_end` — 勝負或平手、可含 `forfeitBy`

戰鬥規則常數（回合長度、最大回合、起始 HP 等）在 **`server/index.js` 頂部**；前端 UI 字串與部分倒數與 **`ROUND_MS`** 在 `src/main.ts`。**改程式常數或行為**時請與 **`docs/GAME_RULES.md`** 對齊；**改 `GAME_RULES.md` 且涉及 Socket／流程**時請同步本節 **Socket 協定** 與 **`GAME_RULES.md` §五** 所列檔案。

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

- **養成數值／壽命／儲存格式／進化**：`src/pet.ts`（含 `STORAGE_KEY`、`idleSpriteForStage`、成長階段閾值、`tryEvolve`／`morphKey`／`lightsOn`、夜間結算）。**狗**外觀見 `src/canvasDog.ts`（`speciesUsesCanvasArt`）；**貓／狗大便怪**見 `src/canvasPoop.ts`（`careUsesPoopCanvas` 時取代 PNG／狗 Canvas）。
- **畫面與對戰流程**：`src/main.ts`（體積大，可用搜尋 `renderCare`、`renderBattle`、`ensureSocket`）。
- **對戰平衡與房間生命週期**：`server/index.js`。
- **樣式**：`src/style.css`。
- **新精靈／圖示**：遵守 `.cursor/rules/pocket-pet-assets.mdc`；idle 見 **`idleSpriteForSpeciesStage`**／**`idleSpriteFromSnap`**／**`idleSpriteForPet`**（`src/pet.ts`）；照護姿勢見 **`carePoseFile`**（第三參數可帶 `morphKey`，雷貓 **`cat-volt-*.png`**、水貓 **`cat-aqua-*.png`**）。雷系訓練 **`pet-train-volt.png`**、水晶系 **`pet-train-crystal.png`**（其餘 `pet-*.png`／貓雞各檔）。**圖鑑**（`renderSpeciesDex`）：**物種分頁**（`data-dex-tab`／`data-dex-panel`）；貓／狗屬性變體為 **`<details class="dex-morph-details">`** 預設收合；成長／照護軌可橫向捲動（`src/style.css`）。`DEX_POSE_STAGE`、`initDexDogCanvases`（`data-dex-dog`、`data-dex-pose`、`data-dex-dog-element`）。

## 慣例與注意

- UI 文案多為 **繁體中文**，部分在原始碼中以 Unicode 轉義字元儲存（與 `server/index.js` 內 log 字串類似）。
- 後端為 **JSDoc 型別** 的 `.js`，前端為 **TS**；不要假設伺服器有獨立 `tsconfig` 編譯步驟。
- `package.json` 的 `"type": "module"`：後端與工具鏈皆 ESM。

若你發現本文件與程式不一致，**以程式與 `package.json` 為準**，並請順手更新本文件。
