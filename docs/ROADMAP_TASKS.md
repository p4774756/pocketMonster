# 產品路線任務清單（v0.3 起）

與對話結論對齊：**不急著重寫**，優先補「養成動機、可維護後端、對外說清楚」。  
狀態欄：`[ ]` 待辦、`[~]` 進行中、`[x]` 已完成（請在合併／上線後手動勾選）。

---

## v0.3 — 進化動機、對戰紀錄、README

### 進化系統（養成）

- [x] **資料模型**：`PetState` 增加進化與統計欄位（例：`morphTier`／`morphKey`、`pvpWins`、`careQualityEma`、`totalIllVirtDays`）；`mergeDefaults`／新認養／存檔相容。
- [x] **判定邏輯**：依虛擬日齡、照護 EMA、訓練值、勝場、累積生病虛擬日等分支為可解釋的形態（首版可僅 UI／數值標記，物種分支圖待擴充）。
- [x] **觸發時機**：生命週期結算（`applyLifecycleAndDecay`）與照護／對戰結算後呼叫 `tryEvolve`；勝場僅在合理勝利結局遞增（排除自投降、平手）。
- [x] **玩家回饋**：養成畫面顯示形態名稱、首次進化 toast；可選 `data-morph` 樣式區分。
- [x] **對戰展示**：對手快照帶可選 `morphKey`，對戰頭像旁顯示形態（`server/index.js` `parsePetSnap`、客戶端 `battlePetPayload`）。
- [ ] **分支美術**：依形態替換或疊加 idle／姿勢圖（`public/pets/`、`idleSpriteForSpeciesStage` 擴充或 hue）；換圖後跑 `npm run optimize:pets`。
- [ ] **規則與平衡**：與 `docs/GAME_RULES.md` 同步門檻敘述；依試玩調整常數。

### 戰鬥紀錄／可讀性（輕量版）

- [ ] **本場 log UI**：對戰畫面可捲動文字時間軸（沿用／擴充 `round_result` 敘述即可，不必新 Socket）。
- [ ] **跨場摘要**（選做）：`localStorage` 存最近 N 場勝負、時間、房間碼摘要。
- [ ] **回放**（可延後）：回合序列 JSON + 本地重播元件。

### README／作品集

- [ ] **根目錄 README**：遊戲一句話、技術棧、核心功能、本機啟動、部署提示、2～4 張截圖、未來規劃（連結本檔與 `GAME_RULES.md`）。
- [ ] **架構圖**（選做）：前端／Socket／Node 一張圖（Mermaid 或 PNG）。

### 後端模組化（可與 v0.3 並行或緊接）

- [ ] 自 `server/index.js` 拆出：`constants.js`、`petSnapshot.js`、`battleEngine.js`、`roomService.js`、`socketHandlers.js`（或同等邊界）；入口僅組裝。
- [ ] 拆離後跑一輪手動對戰 smoke（開房、加入、出招、投降、斷線）。

---

## v0.4 — 單機與黏著

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
