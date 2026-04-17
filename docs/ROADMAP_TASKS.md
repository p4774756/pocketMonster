# 產品路線任務清單（v0.3 起）

與對話結論對齊：**不急著重寫**，優先補「養成動機、可維護後端、對外說清楚」。  
狀態欄：`[ ]` 待辦、`[~]` 進行中、`[x]` 已完成（請在合併／上線後手動勾選）。

**與倉庫同步**：實作進度以程式為準；**版號**見根目錄 `package.json`（頂欄與後端 `/version` 同源）。本檔勾選由維護者在里程碑完成時更新。

**進度摘要（請隨版本更新此段）**：**v0.3 進化核心**已擴充：貓／狗屬性鍵、`cat_volt`／`cat_aqua` 專用 PNG、圖鑑改版、`doodoo` 大便怪 Canvas、狗 Canvas 四屬、`lightsOn` 與夜間結算（`GAME_RULES.md` §1.7～1.8）；**根目錄 README**（技術棧、啟動、部署、圖片示意）已補；**選用 Firebase 好友 MVP**（養成主畫面、Firestore、見 `docs/FIREBASE_FRIENDS.md`）已落地；**架構圖**見 `docs/ARCHITECTURE.md`；**v0.3 其餘**（戰鬥 log、server 模組化、草貓專屬圖等）仍為待辦。

---

## v0.3 — 進化動機、對戰紀錄、README

### 進化系統（養成）

- [x] **資料模型**：`PetState` 增加進化與統計欄位（例：`morphTier`／`morphKey`、`pvpWins`、`careQualityEma`、`totalIllVirtDays`）；`mergeDefaults`／新認養／存檔相容。
- [x] **判定邏輯**：依虛擬日齡、照護 EMA、訓練值、勝場、累積生病虛擬日等分支為可解釋的形態（首版可僅 UI／數值標記，物種分支圖待擴充）。
- [x] **觸發時機**：生命週期結算（`applyLifecycleAndDecay`）與照護／對戰結算後呼叫 `tryEvolve`；勝場僅在合理勝利結局遞增（排除自投降、平手）。
- [x] **玩家回饋**：養成畫面顯示形態名稱、首次進化 toast；可選 `data-morph` 樣式區分。
- [x] **對戰展示**：對手快照帶可選 `morphKey`，對戰頭像旁顯示形態（`server/index.js` `parsePetSnap`、客戶端 `battlePetPayload`）。
- [~] **分支美術**：`cat_volt` 已專用 `cat-volt-*.png`；其餘分支仍 hue／疊加或待替換圖；換圖後跑 `npm run optimize:pets`。
- [x] **規則敘述**：進化門檻與欄位已寫入 `docs/GAME_RULES.md` 第 1.7 節（與 `src/pet.ts` 常數／`pickMorphKey` 對齊）。
- [ ] **數值平衡**：依試玩回饋調整 `EVOLVE_MIN_VIRT_AGE`、`pickMorphKey` 閾值等（改動時須同步 `GAME_RULES.md` §1.7）。

### 戰鬥紀錄／可讀性（輕量版）

- [ ] **本場 log UI**：對戰畫面可捲動文字時間軸（沿用／擴充 `round_result` 敘述即可，不必新 Socket）。
- [ ] **跨場摘要**（選做）：`localStorage` 存最近 N 場勝負、時間、房間碼摘要。
- [ ] **回放**（可延後）：回合序列 JSON + 本地重播元件。

### README／作品集

- [x] **根目錄 README**：遊戲一句話、技術棧、核心功能、本機啟動、部署提示、圖片（`docs/readme/banner.svg` + `public/pets` 示意，可替換為 UI 截圖見 `docs/readme/IMAGES.md`）、連結 `GAME_RULES.md`／`AGENTS.md`／路線檔。
- [x] **架構圖**：`docs/ARCHITECTURE.md`（Mermaid）。

### 後端模組化（可與 v0.3 並行或緊接）

- [ ] 自 `server/index.js` 拆出：`constants.js`、`petSnapshot.js`、`battleEngine.js`、`roomService.js`、`socketHandlers.js`（或同等邊界）；入口僅組裝。
- [ ] 拆離後跑一輪手動對戰 smoke（開房、加入、出招、投降、斷線）。

---

## v0.4 — 單機與黏著

- [x] **Firebase 好友 MVP（選用）**：養成主畫面 Email 註冊／登入、好友代碼、邀請／接受／拒絕、好友名單（Firestore）；不含站內聊天、不含雲端養成；見 `docs/FIREBASE_FRIENDS.md`。
- [ ] **帳號制社交（其餘大工程）**：站內聊天、代友照護、寵物雲端同步等（須另行設計訊息／授權與後端策略）；與現行「匿名房間碼＋本機養成」架構分線規劃。
- [ ] **AI 對手**：本地或 Socket 單人房；簡單 heuristics（MP 門檻、隨機打破純 Nash）。
- [ ] **單機模式**：無後端時降級說明 + 僅養成或僅本地戰（需產品決策）。
- [ ] **排名或勝場記錄**：本機排行榜或僅累計統計（無帳號前不上雲）。

---

## v0.5 — 深度與帳號

- [ ] **物種專屬招／被動**：伺服器白名單驗證、與 `power`／MP 連動。
- [ ] **圖鑑擴充**：形態、技能、取得條件。
- [ ] **雲端存檔／帳號**：OAuth 或 email magic link（牽涉隱私與維運，放最後）。

---

## 參考

- 玩家規則：`docs/GAME_RULES.md`
- Agent 索引與 Socket：`AGENTS.md`
- 雜項待辦：`docs/IMPROVEMENT_BACKLOG.md`
