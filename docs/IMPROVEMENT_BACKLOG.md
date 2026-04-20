# 改善備忘（對話中提過、尚未實作）

以下為先前討論中**可再優化**但**尚未改程式**的項目，方便之後排程。

**版本路線與可勾選任務**見同目錄 **[`ROADMAP_TASKS.md`](./ROADMAP_TASKS.md)**（v0.3～v0.5：戰鬥紀錄、README、server 模組化等；進化 MVP 已落地見下）。

---

## 目前專案狀態（快照）

- **版號**：以根目錄 **`package.json` 的 `version`** 為準（與頂欄、`GET /version` 同源），勿在此檔另寫死數字。
- **已落地（養成／對戰）**：首次**進化分支**（`morphTier`／`morphKey`／`catChildGateDone`；**`cat_volt` 雷貓專用 `public/pets/cat-volt-*.png` 立繪**、水貓 `cat-aqua-*`；貓可於兒童期門檻後**永久無屬性**；`doodoo` 大便怪 Canvas）；`pvpWins`／`careQualityEma`／`totalIllVirtDays`、勝場結算、`create_room`／`join_room` 寵物快照可選 **`morphKey`**、對戰畫面顯示對手形態；**夜間本機時段結算**與養成畫面**開關燈**（`lightsOn`）見 **`GAME_RULES.md` 第 1.7～1.8 節**；實作見 **`src/pet.ts`**、**`src/canvasPoop.ts`**、**`src/main.ts`**、**`server/index.js`**（`parsePetSnap`）。
- **仍屬規劃／待辦**：形態專屬美術、戰鬥本場 log、`server/index.js` 模組化、大廳廣播聊天／代友照護等——見 **`ROADMAP_TASKS.md`** 未勾選項。**選用 Firebase 好友**（代碼加友、邀請、名單、**一對一文字聊天**；不含對戰 Socket、不含雲端養成）已見 **`docs/FIREBASE_FRIENDS.md`**。（根目錄 **README** 已補。）

---

## 效能與載入

- （**已實作**）寵物圖：`npm run optimize:pets` 已納入流程；`public/pets` 已縮至約 **0.6MB** 量級（仍為 PNG）。若仍嫌大可再評估 **WebP** 與 `<picture>`。
- （**已實作**）字型：移除 Google Fonts 外連；`src/fonts.css` 自託管 **DM Sans + JetBrains Mono 拉丁子集**；中文走系統字型。

---

## 部署與 CI

- **前後端同步部署**：目前 GitHub Actions 只部署 **GitHub Pages**；**Render** 另靠儲庫連動自動部署。若要「一次 push 保證兩邊版本一致」，可評估在 workflow 裡呼叫 Render Deploy Hook，或文件化必推兩邊的流程檢查清單。

---

## 連線大廳

- （無待辦；公開房清單已支援 `open_rooms_changed` 即時更新，見 `GAME_RULES` 2.1。）

---

## 對戰與養成設計（較大功能）

- （**已實作**）**物種差異**：`resolveRound` 依雙方 `species` 調整攻擊加值與受傷倍率（見 `docs/GAME_RULES.md` 第 2.6 節）。
- （**已實作**）**MP 與養成 `power` 連動**：`Battle` 含 `mp`／`mpMax`、蓄力耗魔、架盾與回合回魔；客戶端對戰條與蓄力按鈕門檻；規則見 `GAME_RULES.md` 第 2.5 節。可再擴充：第四招／物種專屬招（仍須伺服器白名單驗證）。
- （**已實作**）**首次進化（形態分支）**：本機養成判定與 UI／對戰展示；門檻與欄位見 `GAME_RULES.md` 第 1.7 節。待擴充：形態專屬 idle／姿勢圖、數值再平衡（見 `ROADMAP_TASKS.md`）。

---

## 小項／技術債（可選）

- （**已實作**）`phase` 與畫面同步、`list_open_rooms` 節流、照顧冷卻拆分（見 `GAME_RULES` 與 `AGENTS.md`）。

---

## 已完成的相關項目（對照用）

以下在後續對話中**已實作**，無需重複排：

- 大廳／對戰防連點、URL 自動加入鎖定、休息滿體不扣飽食、照顧動作節奏。
- 可加入房間清單、`list_open_rooms` 協定、**`open_rooms_changed` 即時更新**。
- 頂欄意見回饋彈窗與 `VITE_FEEDBACK_*` 選填變數。
- **首載**：寵物圖批次優化腳本、自託管字型子集（見 `GAME_RULES.md` 第三、四節）。
- **對戰 MP、物種係數**（`server/index.js`、`src/main.ts`、規則文件）。
- **進化 MVP**（`src/pet.ts`、`src/main.ts`、`server/index.js` 快照、`GAME_RULES.md` §1.7）。
