# 遊戲規則說明

給玩家與維護者：養成與連線對戰的規則摘要。**實作以程式為準**；常數定義在 `src/pet.ts`、`src/main.ts`、`server/index.js`。

**維護注意**：本檔由 `src/gameRulesContent.ts` 以 `?raw` 匯入；遊戲內「遊戲說明」彈窗由 **`getGameRulesPlayerHtml()`**（同檔）以 **`marked`** 轉成易讀版面，**僅節錄「一、養成」與「二、對戰」**（不含第三節以後的維護者內容）。**凡修改本檔或與規則相關的程式行為**，請一併檢查並更新下方「改規則時要同步的文件」一節所列項目（避免文件與實作脫節）。

---

## 一、電子寵物（養成）

### 1.1 資料儲存

- 狀態存在瀏覽器 **`localStorage`**，鍵名見 `src/pet.ts` 的 `STORAGE_KEY`。
- 僅本機儲存，換裝置或清除網站資料後不會保留。

### 1.2 認養與物種

- **重新認養**時會隨機決定物種與是否從蛋開始（邏輯在 `rollAdoptionProfile` / `newAdoptionPetState`）。
- **貓、狗**：一開始就是已孵化（`hatched: true`），可直接照護與對戰。（**狗**的精靈圖由前端 **Canvas 像素繪製**，不使用 `public/pets` 的 PNG。）
- **雷系／水晶系／雞**：先為**蛋**（`hatched: false`），需孵化後才會顯示對應精靈；**未孵化前無法連線對戰**、也無法訓練。
- 孵化條件：虛擬日齡達 **`EGG_HATCH_VIRT`（0.32 虛擬日）** 會自動破殼；餵食／清潔／休息會額外累積孵化進度（見 `feed` / `cleanPet` / `restPet`）。

### 1.3 時間與虛擬日齡

- **1 虛擬日** ≈ **12 小時真實時間**（`HOURS_PER_VIRT_DAY`）。
- 離線再開啟時會依流逝時間結算衰減與年齡（`applyOfflineDecay`）。

### 1.4 狀態欄位（0～100）

- **飽食、心情、清潔、體力、訓練（power）**：照護行為會改變數值；隨時間會自然下降（蛋期衰減較慢，且不會在蛋裡生病／累積餓死時數）。
- **房間燈**（`lightsOn`，布林）：預設開燈；影響夜間結算係數（見第 1.8 節）。
- **生病**：非蛋期、在飢餓／清潔／心情偏低時有機率觸發；可看醫生（`treatPet`）治癒。

### 1.5 死亡條件（僅孵化後完整適用）

| 原因 | 條件概要（細節見 `pet.ts`） |
|------|-----------------------------|
| 老死 | 虛擬日齡 ≥ **90** |
| 疏忽 | 長時間處於極低飽食，累積 **`starveHours`** ≥ **44** 小時（門檻與 `STARVE_HUNGER` 等有關） |
| 病逝 | 已生病、高齡與虛弱等條件下機率觸發 |

死亡後進入紀念畫面，可迎新夥伴（等同重新認養抽選）。

### 1.6 照護行為（摘要）

- **餵食／清潔／訓練／休息**：影響數值不同；訓練需足夠體力（生病時門檻更高）。
- **看醫生**：僅在生病時有效。
- **按鈕節奏（前端）**：餵食、清潔、訓練、看醫生兩次之間約 **0.65 秒**內會提示稍候；**休息**與其他照護亦受此短間隔約束，且**連續休息**之間約 **2.2 秒**（避免連點略過休息感）。

### 1.7 進化形態（首次分支）

- **僅本機**：形態存在 `localStorage` 的寵物狀態中，**不**改變物種；連線對戰時可選上傳 `morphKey` 供對手頭像旁顯示。
- **僅一次**：`morphTier` 由 0 升為 1 後不會再改分支。
- **統計欄位**：`pvpWins`（勝場，平手與**自己投降**不計；對方投降或一般勝利 +1）、`totalIllVirtDays`（累積處於生病狀態的虛擬日）、`careQualityEma`（四維狀態均值的指數移動平均，照護品質指標）。
- **貓、狗**（`pickMorphKey`／`pickCatDogElementMorph`／`isDoodooMorphCandidate`，實作見 `src/pet.ts`）：
  - 虛擬日齡達 **12** 起，若長期照護過差（低 `careQualityEma`、高累積生病虛擬日、清潔／飽食／心情偏低等），可進化為 **大便怪**（`morphKey` = `doodoo`）；外觀以 **Canvas** 繪製（非 PNG）。
  - 虛擬日齡滿 **13** 且未成為大便怪時，依訓練、清潔、心情、體力與整體照護決定屬性分支：**貓**為 **雷**（`cat_volt`）、**水**（`cat_aqua`）、**草**（`cat_flora`）；**狗**為 **雷**（`dog_volt`）、**水**（`dog_aqua`）、**火**（`dog_pyro`）、**毒**（`dog_tox`）。**雷貓**／**水貓**使用專用立繪 **`cat-volt-*`／`cat-aqua-*`**（見 `idleSpriteFromSnap`／`carePoseFile`）；**草貓**仍用一般 `cat-*.png` 並以畫面色光區分。**狗**全程 **Canvas** 繪製，四屬以 **`canvasDog`** 小色點／光點裝飾（`dogElementKeyFromMorph`）。
- **雷系／水晶系／雞**（非貓狗）：維持下列分支優先序（未達門檻則不進化）：
  1. **鬥魂（striker）**：勝場 ≥ **2**、訓練 `power` ≥ **18**、且 `careQualityEma` ≥ **38**。
  2. **守護（guardian）**：`careQualityEma` ≥ **62**、累積生病虛擬日 ≤ **3.5**、虛擬日齡 ≥ **12**。
  3. **韌性（survivor）**：累積生病虛擬日 ≥ **5**、且 `careQualityEma` ≥ **32**。
  4. **均衡（harmony）**：虛擬日齡 ≥ **13**、且 `careQualityEma` ≥ **44**。
- **最低虛擬日齡**：貓／狗大便怪路線自 **12** 虛擬日起判斷；貓／狗屬性路線自 **13** 虛擬日起；其他物種仍須達 **12** 虛擬日才可能觸發非均衡分支（均衡仍須 **13** 日）。
- **美術**：雷系／水晶系**訓練**姿勢分別使用 `public/pets/pet-train-volt.png`、`pet-train-crystal.png`（與各自 idle 外觀一致）；其餘照護檔名見 `carePoseFile`（`src/pet.ts`）。

### 1.8 夜間作息與房間燈光

- **夜間**：依玩家裝置**本機時鐘** **22:00～06:59**（`isLocalNightHour`，`src/pet.ts`）。此時段內離線結算會**減緩**部分數值自然下滑，並依停留時間給予**小幅體力回復**（仍受生病等狀態影響），模擬寵物自動多睡一點。
- **房間燈**（`lightsOn`）：養成畫面可切換「開燈／關燈」。**關燈且為夜間**時，體力回復與減緩下滑的係數較**開燈**更優（仍非無敵，極端疏忽仍會惡化）。

---

## 二、連線對戰（Socket）

### 2.1 流程

1. **房主**建立房間取得 **三位數字房間碼**（000～999，系統隨機，用於加入）；可選填 **房間名稱**（僅展示，最多 24 字），大廳公開清單與等待畫面會顯示；亦可用 **骰子** 隨機填入趣味名稱。**訪客**仍須以 **房間碼** 加入（名稱不能代替房碼）。
2. **可加入房間清單**：大廳會向伺服器拉取 `list_open_rooms`；當有人**開房**、**加入**（房間從等待變對戰）、**房關閉**或**訪客斷線**（房主回到可加入狀態）時，伺服器會廣播 **`open_rooms_changed`**（短防抖合併），客戶端自動再拉清單；仍可手動「刷新清單」。**節流**：同一 Socket **1 秒內超過 10 次** `list_open_rooms` 會失敗（防刷），介面會提示稍後再試。
3. 雙方連上後開始對戰；斷線、投降、結算規則由伺服器處理（見 `server/index.js`）。
4. **對戰外觀與結算用快照**：開房與加入時，客戶端會上傳目前寵物的 **`species` / `nickname` / `virtAge` / `power`（訓練值，0～100）**；若已進化可選送 **`morphKey`**（`striker`／`guardian`／`survivor`／`harmony`／`cat_volt`／`cat_aqua`／`cat_flora`／`dog_volt`／`dog_aqua`／`dog_pyro`／`dog_tox`／`doodoo`）。伺服器在 **`linked`** 事件裡把對手的這組資料給另一方，對戰畫面用來顯示**正確精靈**、**對方暱稱**與形態字樣。`power` 會換算戰鬥 **MP 上限**（見第 2.5 節）；舊版客戶端未送 `power` 時伺服器以 **12** 視同；未送 `morphKey` 則視為無形態標記。

### 2.2 參戰條件

- 寵物需 **存活**且 **已孵化**（蛋期無法進入對戰）。

### 2.3 回合與時間

| 項目 | 數值 | 程式位置 |
|------|------|------------|
| 每回合決策時間 | **12 秒** | `ROUND_MS`：`server/index.js` 與 `src/main.ts` 應一致 |
| 起始 HP | **100** | `START_HP` |
| 最大回合數 | **12** | `MAX_ROUNDS`；若未分勝負則依 HP 判斷勝負或平手 |
| 房間閒置清理 | **30 分鐘** | `ROOM_TTL_MS` |

- 若倒數結束仍未出招，伺服器會為缺招的一方（或雙方）**隨機**在斬擊／架盾中擇一；僅當該方 **MP ≥ 蓄力消耗**（見第 2.5 節）時，隨機池才會包含蓄力。

### 2.4 三種出招

| 招式 | 說明 |
|------|------|
| **斬擊（strike）** | 一般攻擊，基礎傷害見下節。 |
| **架盾（guard）** | 不主動攻擊；若對方本回合為攻擊型招式，**大幅降低**所受到的傷害（仍至少 **2** 點）。 |
| **蓄力（charge）** | 本回合視為攻擊；若擊中，傷害為基礎值的 **×1.35**（四捨五入）。蓄力成功後，**下一回合**自己的斬擊／蓄力可額外 **+10** 基礎傷害（`chargeBonus`）。本回合結算前會先扣除 **靈力 MP**（見第 2.5 節）；若 MP 不足，伺服器會將蓄力**降級為斬擊**（含超時隨機選招）。 |

「攻擊型」在程式裡包含 **斬擊** 與 **蓄力**（兩者都會造成對方架盾時的減傷判斷）。

### 2.5 靈力（MP）與養成訓練值（`power`）

常數在 **`server/index.js`**（`MP_COST_CHARGE`、`MP_GUARD_RECOVER`、`MP_REGEN_PER_ROUND`）；前端按鈕門檻 **`MP_COST_CHARGE`** 須與後端一致（`src/main.ts`）。

- **開戰時**：雙方 MP **填滿**至各自上限。
- **MP 上限**：`min(44, 26 + min(18, floor(power / 4)))`（約 **26～44**；`power` 來自參戰快照）。
- **蓄力**：結算該回合傷害前，若本回合實際出招為蓄力，先扣除 **`MP_COST_CHARGE`（8）** 點 MP。
- **架盾**：回合結算後，若該方本回合為架盾，額外回復 **`MP_GUARD_RECOVER`（6）**（不超過上限）。
- **每回合結束**：雙方各回復 **`MP_REGEN_PER_ROUND`（5）**（不超過上限）。

### 2.6 物種差異（伺服器 `resolveRound`）

在共通基礎上小幅調整（仍先套用架盾 **×0.25** 再套用下列倍率；傷害仍**至少 2**）：

- **攻擊方物種**（加在「14 + chargeBonus」這段基礎上，蓄力的 **×1.35** 仍作用在加總後）：**volt +2**、**chicken / cat / dog +1**、**crystal +0**。
- **受傷方物種**（乘在「已含架盾係數後」的傷害上）：**crystal ×0.92**、**cat ×0.96**、**dog ×0.97**、**chicken ×0.98**、**volt ×1**。

### 2.7 單回合傷害計算（伺服器 `resolveRound`）

對每位玩家：

- **基礎攻擊力** = **14 + 當回合的蓄力加值（chargeBonus，成功蓄力後為 10，否則 0）+ 攻擊方物種加值（第 2.6 節）**。
- 若該玩家本回合出 **蓄力** 且該次攻擊成立，則把上述基礎先 **×1.35** 再四捨五入，作為「原始傷害」。
- 若對方本回合為 **架盾**：原始傷害改為 **×0.25** 後四捨五入，且**至少 2**。
- 再乘以**受傷方物種防禦係數**（第 2.6 節），四捨五入，且**至少 2**，為最終扣血。
- 雙方同時結算：可能雙方本回合都受傷（例如雙雙攻擊且都未架盾）。

### 2.8 勝負與結束

- 一方 **HP ≤ 0** 則落敗（雙方同時 ≤0 為平手相關邏輯，見伺服器）。
- 達 **最大回合** 仍雙方存活：比較 HP；相同則平手。
- **投降**：立即判對方獲勝。
- **斷線**：房主斷線會解散房間；訪客斷線房主可留在等待或依事件回到養成（見伺服器 `disconnect`）。

### 2.9 對戰快捷語（非自由聊天）

- 對戰中可送 **預設句子**（伺服器白名單 `key`），以 **`battle_emote`** 送達對方，對方收到 **`battle_emote`** 顯示在戰報區；**不支援自訂長文**，以免濫用與審核成本。
- **節流**：同一連線約 **2.2 秒** 內最多送一次（伺服器與客戶端皆有限制）。

### 2.10 好友（Firebase，選用）

- **僅在**建置時已設定 **`VITE_FIREBASE_*`** 六個變數時，**養成主畫面**會顯示「好友（Firebase）」摺疊區；否則僅簡短說明，不影響匿名房間碼對戰。
- 使用 **Firebase Authentication（Email／密碼）** 註冊／登入；每位使用者會取得一組 **好友代碼**（**4** 碼英文與數字、大寫），可把代碼給對方，對方輸入後送出 **好友邀請**；對方在養成主畫面的好友區 **接受** 或 **拒絕**。雙方成為好友後可於該區檢視名單或 **移除** 關係。（舊版曾發過 **8** 碼者仍可輸入原碼加入。）
- 好友與邀請資料存在 **Cloud Firestore**（規則與索引見倉庫 `docs/firebase-friends.rules`、`docs/firebase-friends.indexes.json` 與 **`docs/FIREBASE_FRIENDS.md`**）。**養成進度仍只存本機 `localStorage`**，與 Firebase 帳號無自動同步。
- **對戰配對**仍依本檔第 2.1 節：Socket 房間碼與 Render（或同源）後端；Firebase **不**負責對戰連線。

---

## 三、想改平衡時

- **對戰數值與回合長度**：改 `server/index.js` 頂部常數，並確認 **`src/main.ts` 的 `ROUND_MS`** 與之一致；**MP 蓄力消耗**須與 **`MP_COST_CHARGE`**（前端）一致。
- **養成節奏、孵化、死亡**：改 `src/pet.ts` 對應常數與函式。
- **首載／寵物圖體積**：更換或新增 `public/pets/*.png` 後，請執行 **`npm run optimize:pets`**（`scripts/optimize-pet-pngs.mjs`：最長邊上限 256、`nearest` 縮放 + PNG 壓縮），再提交縮過的檔案。
- **字型**：介面不再外連 Google Fonts；**DM Sans**／**JetBrains Mono** 的 **拉丁子集** 由 `src/fonts.css`（`@fontsource/*`）經 Vite 打包；**中文**使用系統字型（如 PingFang TC、Microsoft JhengHei）。若需全站自託管中文 webfont，須另加子集與授權檢查。

---

## 四、相關檔案索引

| 主題 | 檔案 |
|------|------|
| 養成狀態機、孵化、照護 | `src/pet.ts` |
| 畫面與 Socket 客戶端（含大廳房名、骰子、公開清單列） | `src/main.ts` |
| 自託管字型子集 | `src/fonts.css`（`@fontsource/dm-sans`、`@fontsource/jetbrains-mono`） |
| 寵物 PNG 批次壓縮 | `scripts/optimize-pet-pngs.mjs`（`npm run optimize:pets`） |
| 圖鑑介面 | `src/main.ts` `renderSpeciesDex`：物種**分頁**切換；貓／狗屬性變體為**摺疊** `<details>`；成長／姿勢列可**橫向捲動**（`src/style.css`）。雷／水貓示意檔見 `dexCatVolt*`／`dexCatAqua*`（`src/pet.ts`）；狗四屬 Canvas 見 `data-dex-dog-element`（`src/canvasDog.ts`） |
| 對戰結算、房間、計時 | `server/index.js` |
| Firebase 好友（選用 Auth + Firestore） | `src/firebase/`、`src/lobbyFirebaseFriends.ts`、`docs/FIREBASE_FRIENDS.md`、`docs/firebase-friends.rules` |
| 專案架構給 agent | `AGENTS.md` |
| 對外說明（GitHub 首頁） | 根目錄 `README.md`；可替換截圖見 `docs/readme/IMAGES.md` |
| 產品路線與任務勾選 | `docs/ROADMAP_TASKS.md`（與 `docs/IMPROVEMENT_BACKLOG.md` 互補） |
| 遊戲內規則彈窗內容 | `src/gameRulesContent.ts`（`?raw` 本檔 + `getGameRulesPlayerHtml` 節錄並轉 HTML；**改規則請編輯本 MD**） |

---

## 五、改規則時要同步的文件

變更 **本檔 `GAME_RULES.md`** 或 **會影響玩家認知的程式**（對戰常數、Socket 事件、大廳流程、養成門檻等）時，請依影響範圍更新：

| 變更類型 | 請同步檢查／更新 |
|----------|------------------|
| **Socket 事件名、payload、流程**（例：`linked`、`battle_emote`、`list_open_rooms`、`open_rooms_changed`、`create_room` 的 `roomTitle`） | `AGENTS.md` 的 **Socket 協定**（Client → Server / Server → Client） |
| **建置／環境變數** 影響對戰或回饋 | `AGENTS.md` 環境變數表、`deploy.env.example` |
| **Firebase 好友**（`VITE_FIREBASE_*`、規則或資料模型） | `docs/FIREBASE_FRIENDS.md`、`docs/firebase-friends.rules`（及索引 JSON）、`AGENTS.md` 環境變數表、`deploy.env.example` |
| **關閉或落實** `docs/IMPROVEMENT_BACKLOG.md` 裡某條待辦 | 該 backlog 檔案（對照區與待辦區）；若屬版本里程碑亦請更新 **`docs/ROADMAP_TASKS.md`** 勾選 |
| **僅改數值或敘述**、協定不變 | 僅需本檔與程式一致；`AGENTS.md` 若無協定描述可不改 |
| **`phase` 或照顧冷卻常數**（`src/main.ts`） | 本檔 **§1.6** 若影響玩家體感須同步一句 |
| **對戰 MP、物種係數、`battle_state` / `round_result`、快捷語** | 本檔 **第 2.5～2.7、2.9 節**、`AGENTS.md` Socket 協定 |
| **發布版本號**（頂欄、`GET /version`） | 根目錄 **`package.json` 的 `version`**（與本檔或 `AGENTS.md`、`.cursor/rules` 實質同批更新時預設 **patch +1**）；遞增後以**中文**撰寫 `git commit` 並 `git push`（見 `AGENTS.md` 與 `.cursor/rules/pocket-pet-game-rules-sync.mdc`） |

**單一來源**：玩家可讀的長篇規則以 **本檔** 為主；`AGENTS.md` 保持精簡索引與**協定／路徑**，避免在兩處複製大段重複規則文字。
