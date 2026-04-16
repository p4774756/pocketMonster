import { io, Socket } from "socket.io-client";
import { initDexDogCanvases, renderDogCanvas } from "./canvasDog";
import { renderPoopMonsterCanvas } from "./canvasPoop";
import {
  careIdleSpriteFile,
  carePoseFile,
  careSpriteScale,
  careUsesPoopCanvas,
  catElementKeyFromMorph,
  cleanPet,
  consumeMorphToast,
  dexCatAquaCarePoseFile,
  dexCatAquaIdleFile,
  dexCatVoltCarePoseFile,
  dexCatVoltIdleFile,
  type DogCanvasElementKey,
  dogElementKeyFromMorph,
  eggSpriteForSpecies,
  feed,
  formatVirtAgeDays,
  growthLabel,
  growthLabelForPet,
  growthSpriteScale,
  growthStage,
  idleSpriteForPet,
  idleSpriteForSpeciesStage,
  idleSpriteFromSnap,
  isLocalNightHour,
  loadPet,
  memorialLine,
  moodLine,
  morphLabelZh,
  renamePet,
  petDefaultName,
  petEmoji,
  recordPvpWin,
  resetNewPet,
  restPet,
  speciesUsesCanvasArt,
  toggleCareLights,
  trainPet,
  treatPet,
  type CarePose,
  type PetMorphKey,
  type PetSpecies,
  type PetState,
} from "./pet";
import "./fonts.css";
import "./style.css";
import { getGameRulesPlayerHtml } from "./gameRulesContent";
import { mountThemeBar } from "./theme";

type Move = "strike" | "guard" | "charge";

const ROUND_MS = 12_000;

/** 對戰快捷語 id（與 `server/index.js` `BATTLE_EMOTE_KEYS` 同步）。 */
const BATTLE_EMOTE_IDS = [
  "hi",
  "good_luck",
  "nice",
  "ouch",
  "hmm",
  "hurry",
  "gg",
  "thanks",
] as const;
type BattleEmoteId = (typeof BATTLE_EMOTE_IDS)[number];

const BATTLE_EMOTE_CLIENT_COOLDOWN_MS = 2200;

function isBattleEmoteId(raw: string): raw is BattleEmoteId {
  return (BATTLE_EMOTE_IDS as readonly string[]).includes(raw);
}

function battleEmoteButtonLabel(id: BattleEmoteId): string {
  if (id === "hi") return "\u55e8";
  if (id === "good_luck") return "\u597d\u904b";
  if (id === "nice") return "\u6f02\u4eae";
  if (id === "ouch") return "\u597d\u75db";
  if (id === "hmm") return "\u601d\u8003";
  if (id === "hurry") return "\u5feb\u51fa\u62db";
  if (id === "gg") return "GG";
  return "\u8b1d\u8b1d";
}

function battleEmoteFullLine(id: BattleEmoteId): string {
  if (id === "hi") return "\u55e8\uff01\u4e00\u8d77\u52a0\u6cb9\u5427\uff5e";
  if (id === "good_luck") return "\u795d\u4f60\u597d\u904b\uff01";
  if (id === "nice") return "\u9019\u62db\u6f02\u4eae\uff01";
  if (id === "ouch") return "\u597d\u75db\u2026";
  if (id === "hmm") return "\u8b93\u6211\u601d\u8003\u4e00\u4e0b\u2026";
  if (id === "hurry") return "\u5feb\u9ede\u51fa\u62db\u5427\uff5e";
  if (id === "gg") return "GG\uff0c\u8b9a\u8b9a\u4f60\uff01";
  return "\u8b1d\u8b1d\u6307\u6559\uff01";
}
/** 與 `server/index.js` 的 `MP_COST_CHARGE` 一致；蓄力消耗的靈力。 */
const MP_COST_CHARGE = 8;

/** 開房「隨機名稱」用；不含商業角色名，僅趣味詞組。 */
const RANDOM_ROOM_TITLES = [
  "\u661f\u5149\u5c0f\u7ad9",
  "\u9031\u4e94\u591c\u6230",
  "\u8edf\u7cd6\u5bf5\u7269\u5c40",
  "\u8349\u8393\u5fc3\u60c5",
  "\u96f7\u96f2\u8a66\u73a9\u5340",
  "\u8c6c\u6392\u6392\u7df4\u7fd2\u5ba4",
  "\u8c93\u8c93\u4f11\u606f\u5340",
  "\u96de\u86cb\u6e6f\u5713\u684c",
  "\u6c34\u679c\u6d17\u8863\u7cbe",
  "\u591c\u9593\u5faa\u74b0\u8cfd",
  "\u4e0b\u73ed\u5feb\u6a02\u6253",
  "\u5496\u5561\u62c9\u9eb5\u9928",
  "\u7a7a\u8abf\u5f37\u6b78\u968a",
  "\u8def\u908a\u5c0f\u96f7\u9053",
  "\u8d85\u8d8a\u7d19\u76d2\u6230",
  "\u8c93\u8c93\u8e22\u8e22\u7403",
  "\u5fae\u98a8\u4f11\u61a9\u7ad9",
  "\u6ce1\u6ce1\u6d17\u6fa1\u65e5",
  "\u7c73\u7c89\u5718\u5b50\u5c45",
  "\u6a58\u8272\u5c0f\u6676\u9748",
  "\u8edf\u68c9\u88ab\u5de5\u623f",
  "\u5c0f\u6b65\u8dd1\u5065\u8eab\u623f",
  "\u8ffd\u5149\u8005\u806f\u76df",
  "\u5c0f\u5c0f\u5192\u96aa\u5bb6",
];

function pickRandomRoomTitle(): string {
  return RANDOM_ROOM_TITLES[
    Math.floor(Math.random() * RANDOM_ROOM_TITLES.length)
  ]!;
}

/** 養成畫面：兩次照顧操作之間最短間隔，避免連點略過真實時間節奏。 */
/** 餵食／清潔／訓練／看醫生：最短間隔（毫秒）。 */
const CARE_GAP_QUICK_MS = 650;
/** 休息：再次休息前較長間隔，避免連點略過「需要時間」的體感。 */
const CARE_GAP_REST_MS = 2200;
let lastCareQuickAt = 0;
let lastCareRestAt = 0;

function petAssetUrl(file: string) {
  return `${import.meta.env.BASE_URL}pets/${file}`;
}

/** DOM uses numeric ids; with @types/node merged, `setTimeout` may be typed as `NodeJS.Timeout`. */
function domSetTimeout(fn: () => void, ms: number): number {
  return window.setTimeout(fn, ms) as unknown as number;
}

function domSetInterval(fn: () => void, ms: number): number {
  return window.setInterval(fn, ms) as unknown as number;
}

const el = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

function $(sel: string, root: Document | HTMLElement = document) {
  const n = root.querySelector(sel);
  if (!n) throw new Error(`Missing ${sel}`);
  return n as HTMLElement;
}

let nextCareFlash: string | null = null;
function flashCare(msg: string) {
  nextCareFlash = msg;
}
function consumeCareFlash(): string | null {
  const m = nextCareFlash;
  nextCareFlash = null;
  return m;
}

const UI = {
  tagline:
    "\u985e\u4f3c\u5be6\u9ad4\u6a5f\u63a5\u9ede\uff0c\u533f\u540d\u958b\u623f\u5c0d\u6230",
  createHost: "\u958b\u623f\uff08\u4e3b\u6a5f\uff09",
  join: "\u52a0\u5165\u6230\u5c0d",
  openRoomsTitle: "\u53ef\u52a0\u5165\u7684\u623f\u9593",
  refreshOpenRooms: "\u5237\u65b0\u6e05\u55ae",
  joinThisRoom: "\u52a0\u5165\u6b64\u623f",
  openRoomsEmpty: "\u76ee\u524d\u6c92\u6709\u53ef\u52a0\u5165\u7684\u623f\u9593",
  openRoomsLoading: "\u8b80\u53d6\u4e2d\u2026",
  openRoomsErr: "\u7121\u6cd5\u8b80\u53d6\u623f\u9593\u6e05\u55ae",
  openRoomsRateLimited: "\u8acb\u7a0d\u5f8c\u518d\u5237\u65b0\u623f\u9593\u6e05\u55ae",
  openRoomsLiveHint:
    "\u6709\u4eba\u958b\u623f\u3001\u52a0\u5165\u6216\u96e2\u7dda\u6642\uff0c\u6e05\u55ae\u6703\u81ea\u52d5\u66f4\u65b0\uff08\u4e5f\u53ef\u624b\u52d5\u5237\u65b0\uff09\u3002",
  roomTitleLabel: "\u623f\u9593\u540d\u7a31\uff08\u986f\u793a\u7528\uff0c\u9078\u586b\uff09",
  roomTitlePlaceholder: "\u4f8b\uff1a\u9031\u4e94\u5c0f\u7d44",
  roomTitleRandomAria: "\u96a8\u6a5f\u623f\u9593\u540d\u7a31",
  roomDisplayNameLabel: "\u623f\u9593\u540d\u7a31",
  roomPlaceholder: "\u623f\u9593\u78bc",
  roomCodeInvalid:
    "\u623f\u9593\u78bc\u8acb\u8f38\u5165 3 \u500b\u6578\u5b57\uff080\u301c9\uff09",
  waitConnect: "\u7b49\u5f85\u5c0d\u65b9\u63a5\u4e0a\u9023\u7dda\u2026",
  syncing: "\u9023\u7dda\u540c\u6b65\u4e2d\u2026",
  roomCodeLabel: "\u623f\u9593\u78bc",
  copyRoomCode: "\u8907\u88fd\u623f\u9593\u78bc",
  copied: "\u5df2\u8907\u88fd",
  linked: "\u9023\u7dda\u6210\u529f\uff01",
  round: (n: number) => `\u7b2c ${n} \u56de\u5408`,
  chooseMove: "\u9078\u64c7\u884c\u52d5",
  lockedYou: "\u5df2\u9396\u5b9a\uff0c\u7b49\u5f85\u5c0d\u65b9",
  strike: "\u65ac\u64ca",
  guard: "\u67b6\u76fe",
  charge: "\u84c4\u529b",
  autoPick: "\u8d85\u6642\u5df2\u81ea\u52d5\u51fa\u62db",
  win: "\u4f60\u8d0f\u4e86\uff01",
  lose: "\u4f60\u8f38\u4e86\u2026",
  draw: "\u5e73\u624b\uff01",
  again: "\u56de\u5230\u6211\u7684\u5925\u4f34",
  endModalHint:
    "\u7e7c\u7e8c\u990a\u6210\u6216\u518d\u958b\u4e00\u623f\u5c0d\u6230\u3002",
  peerLeft: "\u5c0d\u65b9\u5df2\u65b7\u7dda",
  battleEmoteTitle: "\u5feb\u6377\u8a9e\uff08\u5c0d\u6230\uff09",
  battleEmoteYouPrefix: "\u4f60\uff1a",
  battleEmoteFoePrefix: "\u5c0d\u624b\uff1a",
  battleEmoteTooFast: "\u5feb\u6377\u8a9e\u592a\u5feb\u56c9\uff0c\u7a0d\u5f8c\u518d\u8a66\u3002",
  errGeneric: "\u9023\u7dda\u5931\u6557\uff0c\u8acb\u91cd\u8a66",
  needBackend:
    "\u5c0d\u6230\u9700\u8981\u5f8c\u7aef\uff1a\u8acb\u8a2d\u5b9a VITE_SOCKET_URL \u5f8c\u91cd\u65b0\u6253\u5305\uff0c\u6216\u53c3\u8003 deploy \u8aaa\u660e\u3002",
  hubSubtitle:
    "\u533f\u540d\u958b\u623f\u3001\u8f38\u5165\u623f\u9593\u78bc\u5373\u53ef\u5c0d\u6230\uff08\u990a\u6210\u8cc7\u6599\u5728\u4e0a\u4e00\u9801\uff09",
  battleSection: "\u9023\u7dda\u5c0d\u6230",
  openBattle: "\u9023\u7dda\u5c0d\u6230",
  openSpeciesDex: "\u5925\u4f34\u5716\u9451",
  dexTitle: "\u5925\u4f34\u5716\u9451",
  dexSubtitle:
    "\u6210\u9577\u968e\u6bb5\u8207\u7167\u8b77\u52d5\u4f5c\u5c55\u793a\uff1b\u7bad\u982d\u70ba\u6642\u9593\u9032\u7a0b\u3002\u6210\u9577\u4ee5\u865b\u64ec\u65e5\u9f61\u5230\u968e\u6bb5\u70ba\u6e96\uff0c\u59ff\u52e2\u5716\u70ba\u9752\u5c11\u5e74\u671f\u9ad4\u578b\u793a\u610f\u3002",
  dexLayoutHint:
    "\u7528\u4e0a\u65b9\u5206\u9801\u5207\u63db\u7269\u7a2e\uff1b\u8c93\uff0f\u72d7\u7684\u5c6c\u6027\u9032\u5316\u5217\u9ed8\u8a8d\u6536\u5408\uff0c\u9ede\u6a19\u984c\u53ef\u5c55\u958b\u3002",
  dexTablistAria:
    "\u5716\u9451\u7269\u7a2e\u5206\u9801",
  dexEvolutionSection: "\u6210\u9577\u968e\u6bb5",
  dexPoseSection: "\u7167\u8b77\u52d5\u4f5c",
  dexPoseNote:
    "\u5c0d\u61c9\u990a\u6210\u756b\u9762\u56db\u500b\u6309\u9215\uff1a\u9935\u98df\u3001\u8a13\u7df4\u3001\u4f11\u606f\u3001\u6e05\u6f54\uff08\u4ee5\u9752\u5c11\u5e74\u671f\u9ad4\u578b\u793a\u610f\uff09\u3002",
  dexPoseEat: "\u9935\u98df",
  dexPoseTrain: "\u8a13\u7df4",
  dexPoseRest: "\u4f11\u606f",
  dexPoseClean: "\u6e05\u6f54",
  dexEgg: "\u86cb",
  dexBackMemorial: "\u56de\u5230\u7d00\u5ff5\u9801",
  dexBlurbVolt:
    "\u5f9e\u96f7\u7d0b\u86cb\u7834\u6bbc\u5f8c\u70ba\u96f7\u7cfb\u5947\u7378\u3002",
  dexBlurbCrystal:
    "\u5f9e\u6676\u77f3\u86cb\u7834\u6bbc\u5f8c\u70ba\u6c34\u6676\u7cfb\u6676\u683c\u7378\u3002",
  dexBlurbChicken:
    "\u5f9e\u6696\u967d\u86cb\u7834\u6bbc\u5f8c\u70ba\u96de\u5bf6\u9020\u578b\u3002",
  dexBlurbCat:
    "\u8a8d\u990a\u6642\u5df2\u70ba\u5c0f\u8c93\uff0c\u7121\u86cb\u968e\u6bb5\u3002",
  dexCatVoltSection:
    "\u96f7\u5c6c\u9032\u5316\uff08\u793a\u610f\uff09",
  dexCatVoltIntro:
    "\u990a\u6210\u9032\u5316\u70ba\u96f7\u5c6c\u5206\u652f\u6642\u4f7f\u7528\u5c08\u7528 PNG\uff08\u6a94\u540d\u4ee5 cat-volt-\u958b\u982d\uff09\uff0c\u8207\u4e0a\u65b9\u4e00\u822c\u8c93\u4e26\u5217\u4f9b\u53c3\u8003\u3002",
  dexCatVoltPoseSection: "\u96f7\u8c93\u7167\u8b77\u59ff\u52e2",
  dexCatVoltPoseNote:
    "\u540c\u6a23\u5c0d\u61c9\u990a\u6210\u56db\u9375\uff1b\u59ff\u52e2\u4ee5\u9752\u5c11\u5e74\u671f\u9ad4\u578b\u793a\u610f\u3002",
  dexCatAquaSection:
    "\u6c34\u5c6c\u9032\u5316\uff08\u793a\u610f\uff09",
  dexCatAquaIntro:
    "\u990a\u6210\u9032\u5316\u70ba\u6c34\u5c6c\u5206\u652f\u6642\u4f7f\u7528\u5c08\u7528 PNG\uff08\u6a94\u540d\u4ee5 cat-aqua-\u958b\u982d\uff09\u3002",
  dexCatAquaPoseSection: "\u6c34\u8c93\u7167\u8b77\u59ff\u52e2",
  dexCatAquaPoseNote:
    "\u540c\u6a23\u5c0d\u61c9\u990a\u6210\u56db\u9375\uff1b\u59ff\u52e2\u4ee5\u9752\u5c11\u5e74\u671f\u9ad4\u578b\u793a\u610f\u3002",
  dexBlurbDog:
    "\u8a8d\u990a\u6642\u5df2\u70ba\u5c0f\u72d7\uff0c\u7121\u86cb\u968e\u6bb5\uff1b\u7cbe\u9748\u70ba\u524d\u7aef Canvas \u50cf\u7d20\u7e6a\u88fd\uff08\u7121 PNG\uff09\u3002\u9032\u5316\u70ba\u96f7\uff0f\u6c34\uff0f\u706b\uff0f\u6bd2\u5c6c\u6642\u8eab\u4e0a\u6703\u591a\u4e00\u5c64\u5c6c\u6027\u5149\u9ede\u88dd\u98fe\u3002",
  dexDogVoltSection:
    "\u96f7\u5c6c\u9032\u5316\uff08\u72d7\u3001\u793a\u610f\uff09",
  dexDogVoltIntro:
    "\u9032\u5316\u70ba dog_volt \u6642\uff0cCanvas \u96f7\u7cfb\u9ec3\u8272\u5149\u9ede\u3002",
  dexDogAquaSection:
    "\u6c34\u5c6c\u9032\u5316\uff08\u72d7\u3001\u793a\u610f\uff09",
  dexDogAquaIntro:
    "\u9032\u5316\u70ba dog_aqua \u6642\uff0cCanvas \u6c34\u7cfb\u85cd\u9752\u5149\u9ede\u3002",
  dexDogPyroSection:
    "\u706b\u5c6c\u9032\u5316\uff08\u72d7\u3001\u793a\u610f\uff09",
  dexDogPyroIntro:
    "\u9032\u5316\u70ba dog_pyro \u6642\uff0cCanvas \u706b\u7cfb\u6a58\u8d64\u5149\u9ede\u3002",
  dexDogToxSection:
    "\u6bd2\u5c6c\u9032\u5316\uff08\u72d7\u3001\u793a\u610f\uff09",
  dexDogToxIntro:
    "\u9032\u5316\u70ba dog_tox \u6642\uff0cCanvas \u6bd2\u7cfb\u7d2b\uff0f\u7da0\u8272\u5149\u9ede\u3002",
  dexDogMorphPoseSection: "\u7167\u8b77\u59ff\u52e2\uff08\u8a72\u5c6c\u793a\u610f\uff09",
  dexDogMorphPoseNote:
    "\u540c\u6a23\u5c0d\u61c9\u990a\u6210\u56db\u9375\uff1b\u59ff\u52e2\u4ee5\u9752\u5c11\u5e74\u671f\u9ad4\u578b\u793a\u610f\u3002",
  backToPet: "\u56de\u5230\u6211\u7684\u5925\u4f34",
  restartAdopt: "\u91cd\u65b0\u8a8d\u990a",
  confirmRestartAdopt:
    "\u78ba\u5b9a\u8981\u91cd\u65b0\u8a8d\u990a\uff1f\u73fe\u6709\u990a\u6210\u9032\u5ea6\u6703\u5168\u90e8\u6e05\u9664\u4e14\u7121\u6cd5\u9084\u539f\u3002\u65b0\u5925\u4f34\u53ef\u80fd\u662f\u8c93\u3001\u96de\u3001\u72d7\uff0c\u6216\u5f9e\u86cb\u5b75\u5316\u7684\u5947\u7378\u3002",
  statHunger: "\u98fd\u98df",
  statHappy: "\u5fc3\u60c5",
  statClean: "\u6e05\u6f54",
  statEnergy: "\u9ad4\u529b",
  statPower: "\u8a13\u7df4",
  pvpWinsLine: (n: number) =>
    `\u9023\u7dda\u5c0d\u6230\u52dd\u5834\uff1a${n}`,
  morphLine: (label: string) => `\u9032\u5316\u5f62\u614b\uff1a${label}`,
  actionFeed: "\u9935\u98df",
  actionClean: "\u6e05\u7406",
  actionTrain: "\u8a13\u7df4",
  actionRest: "\u4f11\u606f",
  trainBlocked: "\u9ad4\u529b\u4e0d\u8db3\uff0c\u5148\u4f11\u606f\u5427",
  trainBlockedIll:
    "\u751f\u75c5\u6642\u66f4\u7d2f\uff0c\u9ad4\u529b\u8981\u66f4\u9ad8\u624d\u80fd\u8a13\u7df4",
  treat: "\u770b\u91ab\u751f\uff08\u6cbb\u7652\uff09",
  memorialTitle: "\u5925\u4f34\u96e2\u958b\u4e86",
  memorialSub: "\u8b1d\u8b1d\u4f60\u9019\u6bb5\u6642\u9593\u7684\u966a\u4f34\u3002",
  memorialDays: (n: number) =>
    `\u5171\u5ea6\u904e\u4e86\u7d04 ${n} \u500b\u865b\u64ec\u65e5\u3002`,
  newPet: "\u8fce\u63a5\u65b0\u5925\u4f34",
  deadPetBattleBlocked:
    "\u5925\u4f34\u5df2\u96e2\u958b\uff0c\u7121\u6cd5\u9023\u7dda\u5c0d\u6230\u3002\u8acb\u5148\u5728\u7d00\u5ff5\u9801\u9762\u8fce\u63a5\u65b0\u751f\u547d\u3002",
  eggBattleBlocked:
    "\u9084\u5728\u86cb\u88e1\uff0c\u7b49\u5b75\u5316\u5f8c\u518d\u9023\u7dda\u5c0d\u6230\u5427\u3002",
  eggTrainBlocked:
    "\u9084\u6c92\u5b75\u5316\uff0c\u5148\u5225\u8a13\u7df4\u56c9\u3002",
  justHatched: "\u7834\u6bbc\u4e86\uff01\u4f86\u6253\u500b\u62db\u547c\u5427\uff5e",
  careTooFast:
    "\u5148\u7a0d\u5f85\u4e00\u4e0b\u518d\u7167\u9867\u5427\uff08\u52d5\u4f5c\u592a\u5feb\u56c9\uff09\u3002",
  restTooFast:
    "\u4f11\u606f\u9593\u9694\u8f03\u9577\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002",
  restNotNeeded: "\u9ad4\u529b\u5df2\u6eff\uff0c\u4e0d\u7528\u518d\u4f11\u606f\u56c9\u3002",
  cancelWait: "\u53d6\u6d88",
  surrenderLeave: "\u6295\u964d\uff0f\u96e2\u958b",
  confirmForfeit:
    "\u78ba\u5b9a\u8981\u6295\u964d\u4e26\u7d50\u675f\u5c0d\u6230\u55ce\uff1f",
  youSurrendered: "\u4f60\u5df2\u6295\u964d",
  foeSurrenderYouWin: "\u5c0d\u65b9\u6295\u964d\uff0c\u4f60\u8d0f\u4e86\uff01",
  battleMp: "\u9748\u529b",
  chargeMpBlocked: (n: number) =>
    `\u9748\u529b\u4e0d\u8db3\uff08\u9700 ${n} \u9ede\u624d\u53ef\u84c4\u529b\uff09`,
  careLightsTurnOff: "\u95dc\u71c8",
  careLightsTurnOn: "\u958b\u71c8",
  careNightHint:
    "\u591c\u9593\uff0822:00\u301c06:59\uff09\u8eab\u9ad4\u6703\u591a\u4f11\u606f\uff1b\u95dc\u71c8\u6642\u9ad4\u529b\u56de\u5fa9\u7a0d\u5feb\u3002",
};

const socketServerUrl = (import.meta.env.VITE_SOCKET_URL || "").replace(/\/$/, "");

/** 房間碼位數（與 `server/index.js` 的 `makeRoomCode`／`join_room` 一致）。 */
const ROOM_CODE_LEN = 3;

function normalizeRoomCodeInput(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "").slice(0, ROOM_CODE_LEN);
  if (d.length === 0) return "";
  return d.padStart(ROOM_CODE_LEN, "0");
}

let socket: Socket | null = null;
let tickTimer: number | null = null;
let roomCode: string | null = null;
let role: "host" | "guest" | null = null;
/** 與目前畫面一致，供大廳即時清單等邏輯判斷。 */
let phase: "care" | "memorial" | "dex" | "lobby" | "waiting" | "battle" | "end" =
  "care";

/** 大廳 create/join 逾時解鎖（模組級，避免舊 closure 計時器誤傷新一輪操作）。 */
let lobbySocketGuardTimer: number | null = null;

/** 養成畫面夜間／心情輪詢；離開養成時務必清除。 */
let careAmbientTimer: number | null = null;

function clearCareAmbientTimer() {
  if (careAmbientTimer != null) {
    window.clearInterval(careAmbientTimer);
    careAmbientTimer = null;
  }
}

function clearLobbySocketGuardTimer() {
  if (lobbySocketGuardTimer != null) {
    window.clearTimeout(lobbySocketGuardTimer);
    lobbySocketGuardTimer = null;
  }
}

function unlockLobbyFormControlsSoft() {
  const host = document.getElementById("btn-host") as HTMLButtonElement | null;
  const join = document.getElementById("btn-join") as HTMLButtonElement | null;
  const inp = document.getElementById("room-input") as HTMLInputElement | null;
  const titleInp = document.getElementById(
    "room-title-input",
  ) as HTMLInputElement | null;
  const titleRand = document.getElementById(
    "btn-room-title-random",
  ) as HTMLButtonElement | null;
  const refreshOpen = document.getElementById(
    "btn-refresh-open-rooms",
  ) as HTMLButtonElement | null;
  if (host) host.disabled = false;
  if (join) join.disabled = false;
  if (inp) inp.disabled = false;
  if (titleInp) titleInp.disabled = false;
  if (titleRand) titleRand.disabled = false;
  if (refreshOpen) refreshOpen.disabled = false;
  document.querySelectorAll<HTMLButtonElement>(".open-room-join").forEach((b) => {
    b.disabled = false;
  });
}

/** `linked` 時由伺服器帶入，供對戰畫面顯示真實對手。 */
type BattleFoeSnap = {
  species: PetSpecies;
  nickname: string;
  virtAge: number;
  power: number;
  morphKey: PetMorphKey | null;
};
let battleFoeSnapshot: BattleFoeSnap | null = null;

function normalizeBattleFoe(raw: {
  species?: string;
  nickname?: string;
  virtAge?: number;
  power?: number;
  morphKey?: string | null;
}): BattleFoeSnap {
  const sp = raw.species;
  const species: PetSpecies =
    sp === "volt" ||
    sp === "crystal" ||
    sp === "chicken" ||
    sp === "cat" ||
    sp === "dog"
      ? sp
      : "volt";
  const nickname =
    typeof raw.nickname === "string" && raw.nickname.trim().length > 0
      ? raw.nickname.trim().slice(0, 12)
      : "\u5c0d\u624b";
  const virtAge =
    typeof raw.virtAge === "number" && !Number.isNaN(raw.virtAge)
      ? Math.min(999, Math.max(0, raw.virtAge))
      : 18;
  const pr = Number(raw.power);
  const power = Number.isFinite(pr)
    ? Math.min(100, Math.max(0, Math.floor(pr)))
    : 12;
  const mk = raw.morphKey;
  const morphKey: PetMorphKey | null =
    mk === "striker" ||
    mk === "guardian" ||
    mk === "survivor" ||
    mk === "harmony" ||
    mk === "cat_volt" ||
    mk === "cat_aqua" ||
    mk === "cat_flora" ||
    mk === "dog_volt" ||
    mk === "dog_aqua" ||
    mk === "dog_pyro" ||
    mk === "dog_tox" ||
    mk === "doodoo"
      ? mk
      : null;
  return { species, nickname, virtAge, power, morphKey };
}

function battlePetPayload(p: PetState) {
  return {
    species: p.species,
    nickname: p.nickname,
    virtAge: p.virtAge,
    power: p.power,
    ...(p.morphTier >= 1 && p.morphKey
      ? { morphKey: p.morphKey }
      : {}),
  };
}

function ensureSocket(): Socket {
  if (socket?.connected) return socket;
  const opts = {
    transports: ["websocket", "polling"] as string[],
    path: "/socket.io",
  };
  socket = io(
    socketServerUrl.length > 0 ? socketServerUrl : undefined,
    opts,
  );
  return socket;
}

/** 伺服器 `open_rooms_changed` 時自動重拉清單；離開大廳時務必 `detach`。 */
let openRoomsLiveHandler: (() => void) | null = null;

function detachOpenRoomsLiveListener(): void {
  if (socket && openRoomsLiveHandler) {
    socket.off("open_rooms_changed", openRoomsLiveHandler);
  }
  openRoomsLiveHandler = null;
}

function attachOpenRoomsLiveListener(fetchOpenRooms: () => void): void {
  detachOpenRoomsLiveListener();
  const s = ensureSocket();
  openRoomsLiveHandler = () => {
    if (phase !== "lobby") return;
    if (!document.getElementById("open-rooms-list")) return;
    const hostBtn = document.getElementById("btn-host") as HTMLButtonElement | null;
    if (hostBtn?.disabled) return;
    fetchOpenRooms();
  };
  s.on("open_rooms_changed", openRoomsLiveHandler);
}

function stopTick() {
  if (tickTimer != null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}

function cancelWaitingAndReturn(root: HTMLElement) {
  battleFoeSnapshot = null;
  detachOpenRoomsLiveListener();
  const s = socket;
  if (s) {
    s.removeAllListeners("linked");
    s.removeAllListeners("peer_left");
    s.disconnect();
  }
  socket = null;
  renderCare(root);
}

function renderMemorial(
  root: HTMLElement,
  state: PetState,
  hint: string | null = null,
) {
  clearCareAmbientTimer();
  phase = "memorial";
  const days = Math.max(0, Math.floor(state.virtAge));
  const hintBlock =
    hint && hint.length > 0
      ? `<p class="memorial-hint">${escapeHtml(hint)}</p>`
      : "";
  root.replaceChildren(
    el(`
    <div class="shell care-shell memorial-shell">
      <div class="screen-bezel memorial-bezel">
        <h2 class="memorial-title">${UI.memorialTitle}</h2>
        <p class="memorial-name">\u300c${escapeHtml(state.nickname)}\u300d</p>
        <p class="memorial-cause">${escapeHtml(memorialLine(state.deathCause))}</p>
        <p class="memorial-days">${UI.memorialDays(days)}</p>
        ${hintBlock}
        <p class="memorial-sub">${UI.memorialSub}</p>
        <div class="row memorial-actions">
          <button type="button" class="btn btn-secondary" id="btn-memorial-dex">${UI.openSpeciesDex}</button>
          <button type="button" class="btn btn-primary memorial-btn" id="btn-new-pet">${UI.newPet}</button>
        </div>
      </div>
    </div>
  `),
  );
  $("#btn-memorial-dex", root).addEventListener("click", () => {
    renderSpeciesDex(root, {
      backLabel: UI.dexBackMemorial,
      onBack: () => renderMemorial(root, state, null),
    });
  });
  $("#btn-new-pet", root).addEventListener("click", () => {
    resetNewPet();
    renderCare(root);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEX_SPECIES_ORDER: PetSpecies[] = [
  "volt",
  "crystal",
  "chicken",
  "cat",
  "dog",
];

/** 圖鑑「照護動作」列使用的成長階段（青少年期），與實際養成時依日齡變化不同。 */
const DEX_POSE_STAGE = 2 as 0 | 1 | 2 | 3 | 4;
const DEX_POSE_ORDER: CarePose[] = ["eat", "train", "rest", "clean"];

function dexPoseLabel(pose: CarePose): string {
  if (pose === "eat") return UI.dexPoseEat;
  if (pose === "train") return UI.dexPoseTrain;
  if (pose === "rest") return UI.dexPoseRest;
  return UI.dexPoseClean;
}

function speciesDexIntroLine(species: PetSpecies): string {
  switch (species) {
    case "cat":
      return UI.dexBlurbCat;
    case "chicken":
      return UI.dexBlurbChicken;
    case "crystal":
      return UI.dexBlurbCrystal;
    case "dog":
      return UI.dexBlurbDog;
    default:
      return UI.dexBlurbVolt;
  }
}

function dexJoinWithArrows(parts: string[]): string {
  return parts
    .map((block, i) =>
      i === 0
        ? block
        : `<span class="dex-arrow" aria-hidden="true">\u2192</span>${block}`,
    )
    .join("");
}

/** 貓／狗屬性分支：預設收合，減少圖鑑縱向長度。 */
function dexMorphAccordionHtml(summary: string, innerHtml: string): string {
  return `
    <details class="dex-morph-details">
      <summary class="dex-morph-summary">${summary}</summary>
      <div class="dex-morph-details-body">
        ${innerHtml}
      </div>
    </details>`;
}

function dexSpeciesTabsHtml(): string {
  const tabs = DEX_SPECIES_ORDER.map((sp) => {
    const emoji = petEmoji(sp);
    const name = petDefaultName(sp);
    const id = `dex-tab-${sp}`;
    const panelId = `dex-panel-${sp}`;
    return `
      <button type="button" class="dex-tab" role="tab" id="${id}" data-dex-tab="${sp}" aria-controls="${panelId}" aria-selected="false" tabindex="-1">
        <span class="dex-tab-emoji" aria-hidden="true">${emoji}</span>
        <span class="dex-tab-label">${escapeHtml(name)}</span>
      </button>`;
  }).join("");
  return `
    <div class="dex-species-tabs" role="tablist" aria-label="${escapeHtml(UI.dexTablistAria)}">
      ${tabs}
    </div>`;
}

function dexStageCardHtml(species: PetSpecies, stage: 0 | 1 | 2 | 3 | 4): string {
  const scale = growthSpriteScale(stage);
  const senior = stage === 4 ? " dex-stage-card--senior" : "";
  if (species === "dog") {
    return `
    <div class="dex-stage-card${senior}">
      <div class="dex-sprite-wrap">
        <canvas class="dex-sprite dex-dog-canvas" width="96" height="96" data-dex-dog="idle" data-stage="${stage}" style="transform: scale(${scale});"></canvas>
      </div>
      <span class="dex-stage-label">${growthLabel(stage)}</span>
    </div>
  `;
  }
  const file = idleSpriteForSpeciesStage(species, stage);
  const alt = species === "crystal" ? " pet-sprite--alt" : "";
  return `
    <div class="dex-stage-card${senior}">
      <div class="dex-sprite-wrap">
        <img class="dex-sprite${alt}" alt="" width="96" height="96" decoding="async" src="${petAssetUrl(file)}" style="transform: scale(${scale});" />
      </div>
      <span class="dex-stage-label">${growthLabel(stage)}</span>
    </div>
  `;
}

function dexEggCardHtml(species: PetSpecies): string {
  return `
    <div class="dex-stage-card dex-stage-card--egg">
      <div class="dex-sprite-wrap">
        <img class="dex-sprite" alt="" width="96" height="96" decoding="async" src="${petAssetUrl(eggSpriteForSpecies(species))}" />
      </div>
      <span class="dex-stage-label">${UI.dexEgg}</span>
    </div>
  `;
}

function dexCatVoltStageCardHtml(stage: 0 | 1 | 2 | 3 | 4): string {
  const scale = growthSpriteScale(stage);
  const senior = stage === 4 ? " dex-stage-card--senior" : "";
  const file = dexCatVoltIdleFile(stage);
  return `
    <div class="dex-stage-card${senior}">
      <div class="dex-sprite-wrap">
        <img class="dex-sprite" alt="" width="96" height="96" decoding="async" src="${petAssetUrl(file)}" style="transform: scale(${scale});" />
      </div>
      <span class="dex-stage-label">${growthLabel(stage)}</span>
    </div>
  `;
}

function dexCatVoltPoseCardHtml(pose: CarePose): string {
  const scale = growthSpriteScale(DEX_POSE_STAGE);
  const label = dexPoseLabel(pose);
  const file = dexCatVoltCarePoseFile(pose);
  return `
    <div class="dex-pose-card">
      <div class="dex-sprite-wrap dex-sprite-wrap--pose">
        <img class="dex-sprite" alt="" width="96" height="96" decoding="async" src="${petAssetUrl(file)}" style="transform: scale(${scale}); transform-origin: center 70%;" />
      </div>
      <span class="dex-pose-label">${label}</span>
    </div>
  `;
}

function dexCatAquaStageCardHtml(stage: 0 | 1 | 2 | 3 | 4): string {
  const scale = growthSpriteScale(stage);
  const senior = stage === 4 ? " dex-stage-card--senior" : "";
  const file = dexCatAquaIdleFile(stage);
  return `
    <div class="dex-stage-card${senior}">
      <div class="dex-sprite-wrap">
        <img class="dex-sprite" alt="" width="96" height="96" decoding="async" src="${petAssetUrl(file)}" style="transform: scale(${scale});" />
      </div>
      <span class="dex-stage-label">${growthLabel(stage)}</span>
    </div>
  `;
}

function dexCatAquaPoseCardHtml(pose: CarePose): string {
  const scale = growthSpriteScale(DEX_POSE_STAGE);
  const label = dexPoseLabel(pose);
  const file = dexCatAquaCarePoseFile(pose);
  return `
    <div class="dex-pose-card">
      <div class="dex-sprite-wrap dex-sprite-wrap--pose">
        <img class="dex-sprite" alt="" width="96" height="96" decoding="async" src="${petAssetUrl(file)}" style="transform: scale(${scale}); transform-origin: center 70%;" />
      </div>
      <span class="dex-pose-label">${label}</span>
    </div>
  `;
}

function dexDogElementStageCardHtml(
  element: DogCanvasElementKey,
  stage: 0 | 1 | 2 | 3 | 4,
): string {
  const scale = growthSpriteScale(stage);
  const senior = stage === 4 ? " dex-stage-card--senior" : "";
  return `
    <div class="dex-stage-card${senior}">
      <div class="dex-sprite-wrap">
        <canvas class="dex-sprite dex-dog-canvas" width="96" height="96" data-dex-dog="idle" data-dex-dog-element="${element}" data-stage="${stage}" style="transform: scale(${scale});"></canvas>
      </div>
      <span class="dex-stage-label">${growthLabel(stage)}</span>
    </div>
  `;
}

function dexDogElementPoseCardHtml(
  element: DogCanvasElementKey,
  pose: CarePose,
): string {
  const scale = growthSpriteScale(DEX_POSE_STAGE);
  const label = dexPoseLabel(pose);
  return `
    <div class="dex-pose-card">
      <div class="dex-sprite-wrap dex-sprite-wrap--pose">
        <canvas class="dex-sprite dex-dog-canvas" width="96" height="96" data-dex-dog="pose" data-dex-pose="${pose}" data-dex-dog-element="${element}" data-stage="${DEX_POSE_STAGE}" style="transform: scale(${scale}); transform-origin: center 70%;"></canvas>
      </div>
      <span class="dex-pose-label">${label}</span>
    </div>
  `;
}

function dexDogMorphSubdexBlockHtml(
  element: DogCanvasElementKey,
  section: string,
  intro: string,
): string {
  const inner = `
        <p class="dex-species-intro dex-morph-details-intro">${escapeHtml(intro)}</p>
        <h4 class="dex-section-heading">${UI.dexEvolutionSection}</h4>
        <div class="dex-evolution-track">
          ${dexJoinWithArrows(
            ([0, 1, 2, 3, 4] as const).map((st) =>
              dexDogElementStageCardHtml(element, st),
            ),
          )}
        </div>
        <h4 class="dex-section-heading">${UI.dexDogMorphPoseSection}</h4>
        <p class="dex-pose-note">${UI.dexDogMorphPoseNote}</p>
        <div class="dex-pose-track">
          ${dexJoinWithArrows(
            DEX_POSE_ORDER.map((pose) =>
              dexDogElementPoseCardHtml(element, pose),
            ),
          )}
        </div>`;
  return dexMorphAccordionHtml(escapeHtml(section), inner);
}

function dexPoseCardHtml(species: PetSpecies, pose: CarePose): string {
  const scale = growthSpriteScale(DEX_POSE_STAGE);
  const label = dexPoseLabel(pose);
  if (species === "dog") {
    return `
    <div class="dex-pose-card">
      <div class="dex-sprite-wrap dex-sprite-wrap--pose">
        <canvas class="dex-sprite dex-dog-canvas" width="96" height="96" data-dex-dog="pose" data-dex-pose="${pose}" data-stage="${DEX_POSE_STAGE}" style="transform: scale(${scale}); transform-origin: center 70%;"></canvas>
      </div>
      <span class="dex-pose-label">${label}</span>
    </div>
  `;
  }
  const file = carePoseFile(species, pose);
  const alt = species === "crystal" ? " pet-sprite--alt" : "";
  return `
    <div class="dex-pose-card">
      <div class="dex-sprite-wrap dex-sprite-wrap--pose">
        <img class="dex-sprite${alt}" alt="" width="96" height="96" decoding="async" src="${petAssetUrl(file)}" style="transform: scale(${scale}); transform-origin: center 70%;" />
      </div>
      <span class="dex-pose-label">${label}</span>
    </div>
  `;
}

function dexSpeciesBlockHtml(species: PetSpecies): string {
  const emoji = petEmoji(species);
  const name = petDefaultName(species);
  const intro = speciesDexIntroLine(species);
  const stages = ([0, 1, 2, 3, 4] as const).map((st) =>
    dexStageCardHtml(species, st),
  );
  const trackInner =
    species === "cat" || species === "dog"
      ? dexJoinWithArrows(stages)
      : dexJoinWithArrows([dexEggCardHtml(species), ...stages]);
  const poseParts = DEX_POSE_ORDER.map((pose) => dexPoseCardHtml(species, pose));
  const poseTrack = dexJoinWithArrows(poseParts);
  const catMorphSubdexes =
    species === "cat"
      ? `
      ${dexMorphAccordionHtml(
        escapeHtml(UI.dexCatVoltSection),
        `
        <p class="dex-species-intro dex-morph-details-intro">${escapeHtml(UI.dexCatVoltIntro)}</p>
        <h4 class="dex-section-heading">${UI.dexEvolutionSection}</h4>
        <div class="dex-evolution-track">
          ${dexJoinWithArrows(
            ([0, 1, 2, 3, 4] as const).map((st) => dexCatVoltStageCardHtml(st)),
          )}
        </div>
        <h4 class="dex-section-heading">${UI.dexCatVoltPoseSection}</h4>
        <p class="dex-pose-note">${UI.dexCatVoltPoseNote}</p>
        <div class="dex-pose-track">
          ${dexJoinWithArrows(
            DEX_POSE_ORDER.map((pose) => dexCatVoltPoseCardHtml(pose)),
          )}
        </div>`,
      )}
      ${dexMorphAccordionHtml(
        escapeHtml(UI.dexCatAquaSection),
        `
        <p class="dex-species-intro dex-morph-details-intro">${escapeHtml(UI.dexCatAquaIntro)}</p>
        <h4 class="dex-section-heading">${UI.dexEvolutionSection}</h4>
        <div class="dex-evolution-track">
          ${dexJoinWithArrows(
            ([0, 1, 2, 3, 4] as const).map((st) => dexCatAquaStageCardHtml(st)),
          )}
        </div>
        <h4 class="dex-section-heading">${UI.dexCatAquaPoseSection}</h4>
        <p class="dex-pose-note">${UI.dexCatAquaPoseNote}</p>
        <div class="dex-pose-track">
          ${dexJoinWithArrows(
            DEX_POSE_ORDER.map((pose) => dexCatAquaPoseCardHtml(pose)),
          )}
        </div>`,
      )}
    `
      : "";
  const dogMorphSubdexes =
    species === "dog"
      ? `<div class="dex-morph-accordion-stack">
      ${dexDogMorphSubdexBlockHtml("volt", UI.dexDogVoltSection, UI.dexDogVoltIntro)}
      ${dexDogMorphSubdexBlockHtml("aqua", UI.dexDogAquaSection, UI.dexDogAquaIntro)}
      ${dexDogMorphSubdexBlockHtml("pyro", UI.dexDogPyroSection, UI.dexDogPyroIntro)}
      ${dexDogMorphSubdexBlockHtml("tox", UI.dexDogToxSection, UI.dexDogToxIntro)}
    </div>`
      : "";
  return `
    <section class="dex-species-block" aria-label="${escapeHtml(name)}">
      <h3 class="dex-species-title"><span class="dex-species-emoji">${emoji}</span> ${escapeHtml(name)}</h3>
      <p class="dex-species-intro">${escapeHtml(intro)}</p>
      <h4 class="dex-section-heading">${UI.dexEvolutionSection}</h4>
      <div class="dex-evolution-track">
        ${trackInner}
      </div>
      <h4 class="dex-section-heading">${UI.dexPoseSection}</h4>
      <p class="dex-pose-note">${UI.dexPoseNote}</p>
      <div class="dex-pose-track">
        ${poseTrack}
      </div>
      ${
        catMorphSubdexes
          ? `<div class="dex-morph-accordion-stack">${catMorphSubdexes}</div>`
          : ""
      }
      ${dogMorphSubdexes}
    </section>
  `;
}

function wireDexSpeciesTabs(shell: HTMLElement): void {
  const tabs = shell.querySelectorAll<HTMLButtonElement>("[data-dex-tab]");
  const panels = shell.querySelectorAll<HTMLElement>("[data-dex-panel]");
  const show = (sp: PetSpecies) => {
    panels.forEach((panel) => {
      const on = panel.dataset.dexPanel === sp;
      panel.toggleAttribute("hidden", !on);
      panel.setAttribute("aria-hidden", on ? "false" : "true");
    });
    tabs.forEach((tab) => {
      const on = tab.dataset.dexTab === sp;
      tab.classList.toggle("dex-tab--active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
    });
    const active = shell.querySelector<HTMLElement>(`[data-dex-panel="${sp}"]`);
    if (active) initDexDogCanvases(active);
  };
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const sp = tab.dataset.dexTab as PetSpecies | undefined;
      if (sp && DEX_SPECIES_ORDER.includes(sp)) show(sp);
    });
  });
  shell.querySelectorAll("details.dex-morph-details").forEach((det) => {
    det.addEventListener("toggle", () => {
      if ((det as HTMLDetailsElement).open)
        initDexDogCanvases(det as HTMLElement);
    });
  });
  show(DEX_SPECIES_ORDER[0]);
}

function renderSpeciesDex(
  root: HTMLElement,
  opts?: { backLabel?: string; onBack?: () => void },
) {
  clearCareAmbientTimer();
  battleFoeSnapshot = null;
  detachOpenRoomsLiveListener();
  clearLobbySocketGuardTimer();
  stopTick();
  phase = "dex";
  const backLabel = opts?.backLabel ?? UI.backToPet;
  const onBack = opts?.onBack ?? (() => renderCare(root));
  const panels = DEX_SPECIES_ORDER.map((sp) => {
    const panelId = `dex-panel-${sp}`;
    const tabId = `dex-tab-${sp}`;
    return `
    <div class="dex-species-panel" id="${panelId}" role="tabpanel" aria-labelledby="${tabId}" data-dex-panel="${sp}" hidden>
      ${dexSpeciesBlockHtml(sp)}
    </div>`;
  }).join("");
  const shell = el(`
    <div class="shell shell--dex dex-shell">
      <div class="row dex-actions">
        <button type="button" class="btn btn-secondary care-back" id="btn-dex-back">${backLabel}</button>
      </div>
      <div class="screen-bezel dex-bezel">
        <h2 class="dex-heading">${UI.dexTitle}</h2>
        <p class="dex-tagline">${UI.dexSubtitle}</p>
        <p class="dex-layout-hint">${UI.dexLayoutHint}</p>
        ${dexSpeciesTabsHtml()}
        <div class="dex-species-panels">
          ${panels}
        </div>
      </div>
    </div>
  `);
  root.replaceChildren(shell);
  $("#btn-dex-back", root).addEventListener("click", onBack);
  wireDexSpeciesTabs(shell);
}

function renderCare(root: HTMLElement) {
  clearCareAmbientTimer();
  battleFoeSnapshot = null;
  detachOpenRoomsLiveListener();
  clearLobbySocketGuardTimer();
  const hint = consumeCareFlash();
  let state: PetState = loadPet();
  const morphToast = consumeMorphToast();
  if (!state.alive) {
    renderMemorial(root, state, hint);
    return;
  }

  phase = "care";
  root.replaceChildren(
    el(`
    <div class="shell care-shell shell--care">
      <div class="row care-top-actions">
        <button type="button" class="btn btn-primary" id="btn-open-battle">${UI.openBattle}</button>
        <button type="button" class="btn btn-secondary" id="btn-open-dex">${UI.openSpeciesDex}</button>
        <button type="button" class="btn btn-secondary" id="btn-restart-adopt">${UI.restartAdopt}</button>
      </div>
      <p class="care-egg-battle-hint hidden" id="care-egg-battle-hint" role="status">${UI.eggBattleBlocked}</p>
      <div class="screen-bezel care-bezel">
        <div class="pet-stage" id="pet-stage">
          <div class="pet-sprite-mount pet-sprite-mount--care" id="pet-sprite-mount">
            <img class="pet-sprite" id="pet-sprite" alt="" width="96" height="96" decoding="async" />
            <canvas class="pet-sprite pet-sprite-canvas hidden" id="pet-sprite-canvas" width="96" height="96" aria-hidden="true"></canvas>
          </div>
          <input class="pet-nick field" id="pet-nick" maxlength="12" autocomplete="off" />
        </div>
        <p class="pet-age-line" id="pet-age-line"></p>
        <p class="pet-morph-line hidden" id="pet-morph-line"></p>
        <div class="care-lights-row">
          <button type="button" class="btn btn-secondary btn--compact" id="btn-care-lights" aria-pressed="true"></button>
          <span class="care-night-hint hidden" id="care-night-hint"></span>
        </div>
        <p class="pet-pvp-meta" id="pet-pvp-meta"></p>
        <p class="pet-mood" id="pet-mood"></p>
        <div class="care-stats">
          <div class="care-stat">
            <span class="care-stat-label">${UI.statHunger}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-hunger" id="bar-hunger" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-hunger">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statHappy}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-happy" id="bar-happy" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-happy">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statClean}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-clean" id="bar-clean" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-clean">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statEnergy}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-energy" id="bar-energy" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-energy">0</span>
          </div>
          <div class="care-stat">
            <span class="care-stat-label">${UI.statPower}</span>
            <div class="hp-wrap care-bar"><div class="hp-fill care-power" id="bar-power" style="width:0%"></div></div>
            <span class="care-stat-val" id="val-power">0</span>
          </div>
        </div>
        <button type="button" class="move-btn care-treat hidden" id="btn-treat" data-care="treat">${UI.treat}</button>
        <div class="care-actions">
          <button type="button" class="move-btn" data-care="feed">${UI.actionFeed}</button>
          <button type="button" class="move-btn" data-care="clean">${UI.actionClean}</button>
          <button type="button" class="move-btn" data-care="train">${UI.actionTrain}</button>
          <button type="button" class="move-btn" data-care="rest">${UI.actionRest}</button>
        </div>
        <p class="toast care-hint hidden" id="care-toast"></p>
      </div>
    </div>
  `),
  );

  const nickEl = $("#pet-nick", root) as HTMLInputElement;
  const moodEl = $("#pet-mood", root);
  const ageLineEl = $("#pet-age-line", root);
  const morphLineEl = $("#pet-morph-line", root);
  const pvpMetaEl = $("#pet-pvp-meta", root);
  const stageEl = $("#pet-stage", root);
  const treatBtn = $("#btn-treat", root);
  const spriteEl = $("#pet-sprite", root) as HTMLImageElement;
  const spriteCv = $("#pet-sprite-canvas", root) as HTMLCanvasElement;
  const spriteMountEl = $("#pet-sprite-mount", root);
  const toastEl = $("#care-toast", root);
  const eggBattleHintEl = $("#care-egg-battle-hint", root);
  let reactionTimer: number | null = null;

  if (morphToast) {
    toastEl.textContent = morphToast;
    toastEl.classList.remove("hidden");
  } else if (hint) {
    if (hint === UI.eggBattleBlocked && !state.hatched) {
      // 與頂部 #care-egg-battle-hint 同文，不再用底部 toast 重複
    } else {
      toastEl.textContent = hint;
      toastEl.classList.remove("hidden");
    }
  }

  const btnCareLights = $("#btn-care-lights", root) as HTMLButtonElement;
  const careNightHintEl = $("#care-night-hint", root);
  const careShellEl = root.querySelector(".care-shell");

  const syncSpriteSpecies = () => {
    spriteEl.classList.toggle("pet-sprite--alt", state.species === "crystal");
  };

  const syncCatElementMount = () => {
    const ce = catElementKeyFromMorph(state.species, state.morphKey);
    if (ce) spriteMountEl.dataset.catElement = ce;
    else delete spriteMountEl.dataset.catElement;
  };

  const showCareIdleSprite = () => {
    const st = growthStage(state.virtAge);
    const sc = careSpriteScale(state);
    const poop = careUsesPoopCanvas(state);
    const dogCanvas = speciesUsesCanvasArt(state.species) && !poop;

    if (poop) {
      spriteEl.classList.add("hidden");
      spriteCv.classList.remove("hidden");
      syncCatElementMount();
      renderPoopMonsterCanvas(spriteCv, {
        cssSize: 96,
        hatched: state.hatched,
        stage: st,
        pose: null,
      });
      spriteCv.style.transform = `scale(${sc})`;
      spriteCv.style.transformOrigin = "center 70%";
      return;
    }
    if (dogCanvas) {
      spriteEl.classList.add("hidden");
      spriteCv.classList.remove("hidden");
      syncCatElementMount();
      renderDogCanvas(spriteCv, {
        cssSize: 96,
        hatched: state.hatched,
        stage: st,
        pose: null,
        elementAccent: dogElementKeyFromMorph(state.morphKey),
      });
      spriteCv.style.transform = `scale(${sc})`;
      spriteCv.style.transformOrigin = "center 70%";
      return;
    }
    spriteEl.classList.remove("hidden");
    spriteCv.classList.add("hidden");
    syncCatElementMount();
    spriteEl.src = petAssetUrl(careIdleSpriteFile(state));
    syncSpriteSpecies();
    spriteEl.style.transform = `scale(${sc})`;
  };

  const flashCareSprite = (pose: CarePose) => {
    if (!state.hatched) {
      showCareIdleSprite();
      return;
    }
    if (reactionTimer != null) {
      window.clearTimeout(reactionTimer);
      reactionTimer = null;
      spriteMountEl.classList.remove("pet-sprite-mount--paused");
    }
    spriteMountEl.classList.add("pet-sprite-mount--paused");
    const st = growthStage(state.virtAge);
    const sc = careSpriteScale(state);
    if (careUsesPoopCanvas(state)) {
      spriteEl.classList.add("hidden");
      spriteCv.classList.remove("hidden");
      syncCatElementMount();
      renderPoopMonsterCanvas(spriteCv, {
        cssSize: 96,
        hatched: true,
        stage: st,
        pose,
      });
      spriteCv.style.transform = `scale(${sc})`;
      spriteCv.style.transformOrigin = "center 70%";
      reactionTimer = domSetTimeout(() => {
        showCareIdleSprite();
        spriteMountEl.classList.remove("pet-sprite-mount--paused");
        reactionTimer = null;
      }, 1700);
      return;
    }
    if (speciesUsesCanvasArt(state.species)) {
      renderDogCanvas(spriteCv, {
        cssSize: 96,
        hatched: true,
        stage: st,
        pose,
        elementAccent: dogElementKeyFromMorph(state.morphKey),
      });
      spriteEl.classList.add("hidden");
      spriteCv.classList.remove("hidden");
      syncCatElementMount();
      spriteCv.style.transform = `scale(${sc})`;
      spriteCv.style.transformOrigin = "center 70%";
      reactionTimer = domSetTimeout(() => {
        showCareIdleSprite();
        spriteMountEl.classList.remove("pet-sprite-mount--paused");
        reactionTimer = null;
      }, 1700);
      return;
    }
    spriteEl.src = petAssetUrl(
      carePoseFile(state.species, pose, state.morphKey),
    );
    syncSpriteSpecies();
    reactionTimer = domSetTimeout(() => {
      showCareIdleSprite();
      spriteMountEl.classList.remove("pet-sprite-mount--paused");
      reactionTimer = null;
    }, 1700);
  };

  const syncLightsUi = () => {
    btnCareLights.textContent = state.lightsOn
      ? UI.careLightsTurnOff
      : UI.careLightsTurnOn;
    btnCareLights.setAttribute(
      "aria-pressed",
      state.lightsOn ? "true" : "false",
    );
    if (isLocalNightHour()) {
      careNightHintEl.textContent = UI.careNightHint;
      careNightHintEl.classList.remove("hidden");
    } else {
      careNightHintEl.textContent = "";
      careNightHintEl.classList.add("hidden");
    }
    if (careShellEl) {
      careShellEl.classList.toggle("care-shell--night", isLocalNightHour());
      careShellEl.classList.toggle("care-shell--lights-off", !state.lightsOn);
    }
  };

  const paint = () => {
    nickEl.value = state.nickname;
    moodEl.textContent = moodLine(state);
    const st = growthStage(state.virtAge);
    ageLineEl.textContent = `${formatVirtAgeDays(state.virtAge)} \u00b7 ${growthLabelForPet(state)}`;
    if (state.hatched && state.morphTier >= 1 && state.morphKey) {
      morphLineEl.textContent = UI.morphLine(morphLabelZh(state.morphKey));
      morphLineEl.classList.remove("hidden");
      stageEl.setAttribute("data-morph", state.morphKey);
    } else {
      morphLineEl.textContent = "";
      morphLineEl.classList.add("hidden");
      stageEl.removeAttribute("data-morph");
    }
    if (state.hatched) {
      pvpMetaEl.textContent = UI.pvpWinsLine(state.pvpWins);
      pvpMetaEl.classList.remove("hidden");
    } else {
      pvpMetaEl.textContent = "";
      pvpMetaEl.classList.add("hidden");
    }
    stageEl.classList.toggle("pet-stage--senior", state.hatched && st === 4);
    showCareIdleSprite();
    syncLightsUi();
    treatBtn.classList.toggle("hidden", !state.ill);
    eggBattleHintEl.classList.toggle("hidden", state.hatched);
    const battleBtn = $("#btn-open-battle", root) as HTMLButtonElement;
    if (state.hatched) battleBtn.removeAttribute("aria-describedby");
    else battleBtn.setAttribute("aria-describedby", "care-egg-battle-hint");
    const setBar = (key: keyof PetState, barId: string, valId: string) => {
      const v = Math.round(Number(state[key]) || 0);
      ($(`#${barId}`, root) as HTMLElement).style.width = `${clampPct(v)}%`;
      $(`#${valId}`, root).textContent = String(v);
    };
    setBar("hunger", "bar-hunger", "val-hunger");
    setBar("happy", "bar-happy", "val-happy");
    setBar("clean", "bar-clean", "val-clean");
    setBar("energy", "bar-energy", "val-energy");
    setBar("power", "bar-power", "val-power");
  };

  const clampPct = (n: number) => Math.min(100, Math.max(0, n));

  const onNickCommit = () => {
    state = renamePet(state, nickEl.value);
    paint();
  };
  nickEl.addEventListener("change", onNickCommit);
  nickEl.addEventListener("blur", onNickCommit);

  $("#btn-open-battle", root).addEventListener("click", () => {
    if (!state.hatched) {
      flashCare(UI.eggBattleBlocked);
      renderCare(root);
      return;
    }
    if (reactionTimer != null) {
      window.clearTimeout(reactionTimer);
      reactionTimer = null;
      spriteMountEl.classList.remove("pet-sprite-mount--paused");
    }
    renderLobby(root);
  });

  $("#btn-restart-adopt", root).addEventListener("click", () => {
    if (!window.confirm(UI.confirmRestartAdopt)) return;
    if (reactionTimer != null) {
      window.clearTimeout(reactionTimer);
      reactionTimer = null;
      spriteMountEl.classList.remove("pet-sprite-mount--paused");
    }
    resetNewPet();
    renderCare(root);
  });

  $("#btn-open-dex", root).addEventListener("click", () => {
    renderSpeciesDex(root);
  });

  root.querySelectorAll("[data-care]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = (btn as HTMLElement).dataset.care;
      const now = Date.now();
      if (act === "rest") {
        if (now - lastCareRestAt < CARE_GAP_REST_MS) {
          toastEl.textContent = UI.restTooFast;
          toastEl.classList.remove("hidden");
          return;
        }
        if (now - lastCareQuickAt < CARE_GAP_QUICK_MS) {
          toastEl.textContent = UI.careTooFast;
          toastEl.classList.remove("hidden");
          return;
        }
      } else if (now - lastCareQuickAt < CARE_GAP_QUICK_MS) {
        toastEl.textContent = UI.careTooFast;
        toastEl.classList.remove("hidden");
        return;
      }
      toastEl.classList.add("hidden");
      if (act === "feed") {
        const wasEgg = !state.hatched;
        state = feed(state);
        lastCareQuickAt = Date.now();
        paint();
        if (wasEgg && state.hatched) {
          toastEl.textContent = UI.justHatched;
          toastEl.classList.remove("hidden");
        }
        flashCareSprite("eat");
        return;
      }
      if (act === "clean") {
        const wasEgg = !state.hatched;
        state = cleanPet(state);
        lastCareQuickAt = Date.now();
        paint();
        if (wasEgg && state.hatched) {
          toastEl.textContent = UI.justHatched;
          toastEl.classList.remove("hidden");
        }
        flashCareSprite("clean");
        return;
      }
      if (act === "train") {
        if (!state.hatched) {
          toastEl.textContent = UI.eggTrainBlocked;
          toastEl.classList.remove("hidden");
          paint();
          return;
        }
        const need = state.ill ? 24 : 18;
        if (state.energy < need) {
          toastEl.textContent = state.ill ? UI.trainBlockedIll : UI.trainBlocked;
          toastEl.classList.remove("hidden");
          paint();
          return;
        }
        state = trainPet(state);
        lastCareQuickAt = Date.now();
        paint();
        flashCareSprite("train");
        return;
      }
      if (act === "treat") {
        const prev = state;
        state = treatPet(state);
        if (state !== prev) lastCareQuickAt = Date.now();
        paint();
        return;
      }
      if (act === "rest") {
        if (state.hatched && state.energy >= 100 && !state.ill) {
          toastEl.textContent = UI.restNotNeeded;
          toastEl.classList.remove("hidden");
          paint();
          return;
        }
        const before = state;
        const wasEgg = !state.hatched;
        state = restPet(state);
        if (state === before) {
          toastEl.textContent = UI.restNotNeeded;
          toastEl.classList.remove("hidden");
          paint();
          return;
        }
        lastCareQuickAt = Date.now();
        lastCareRestAt = Date.now();
        paint();
        if (wasEgg && state.hatched) {
          toastEl.textContent = UI.justHatched;
          toastEl.classList.remove("hidden");
        }
        flashCareSprite("rest");
        return;
      }
      paint();
    });
  });

  btnCareLights.addEventListener("click", () => {
    state = toggleCareLights(state);
    paint();
  });

  careAmbientTimer = domSetInterval(() => {
    if (phase !== "care") return;
    syncLightsUi();
    moodEl.textContent = moodLine(state);
  }, 45000);

  paint();
}

function renderLobby(
  root: HTMLElement,
  opts?: { lockForAutoJoin?: boolean },
) {
  clearCareAmbientTimer();
  battleFoeSnapshot = null;
  clearLobbySocketGuardTimer();
  const pet = loadPet();
  if (!pet.alive) {
    flashCare(UI.deadPetBattleBlocked);
    renderCare(root);
    return;
  }
  if (!pet.hatched) {
    flashCare(UI.eggBattleBlocked);
    renderCare(root);
    return;
  }
  phase = "lobby";
  roomCode = null;
  role = null;
  stopTick();
  root.replaceChildren(
    el(`
 <div class="shell shell--hub">
      <div class="status-pill"><span class="dot on"></span> ONLINE</div>
      <h1>${UI.battleSection}</h1>
      <p class="tagline">${UI.hubSubtitle}</p>
      <div class="row stack-gap">
        <button type="button" class="btn btn-secondary" id="btn-back-pet">${UI.backToPet}</button>
      </div>
      <p class="toast stack-gap-sm ${import.meta.env.PROD && !socketServerUrl ? "" : "hidden"}" id="backend-hint">${UI.needBackend}</p>
      <label class="room-title-label" for="room-title-input">${UI.roomTitleLabel}</label>
      <div class="row room-title-row">
        <input class="field room-title-field" id="room-title-input" maxlength="24" autocomplete="off" placeholder="${UI.roomTitlePlaceholder}" />
        <button type="button" class="btn btn-secondary btn--compact btn-room-title-random" id="btn-room-title-random" aria-label="${UI.roomTitleRandomAria}">\ud83c\udfb2</button>
      </div>
      <div class="row stack-gap-md">
        <button type="button" class="btn btn-primary" id="btn-host">${UI.createHost}</button>
      </div>
      <input class="field" id="room-input" maxlength="3" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="${UI.roomPlaceholder}" />
      <div class="row mt-gap">
        <button type="button" class="btn btn-secondary" id="btn-join">${UI.join}</button>
      </div>
      <section class="open-rooms" aria-label="${UI.openRoomsTitle}">
        <div class="open-rooms-head">
          <h2 class="open-rooms-title">${UI.openRoomsTitle}</h2>
          <button type="button" class="btn btn-secondary btn--compact" id="btn-refresh-open-rooms">${UI.refreshOpenRooms}</button>
        </div>
        <p class="open-rooms-status" id="open-rooms-status"></p>
        <p class="open-rooms-live-hint">${UI.openRoomsLiveHint}</p>
        <div class="open-rooms-list" id="open-rooms-list"></div>
        <p class="open-rooms-empty hidden" id="open-rooms-empty">${UI.openRoomsEmpty}</p>
      </section>
      <p class="toast hidden" id="lobby-toast"></p>
    </div>
  `),
  );

  $("#btn-back-pet", root).addEventListener("click", () => renderCare(root));

  const toast = $("#lobby-toast", root);
  const btnHost = $("#btn-host", root) as HTMLButtonElement;
  const btnJoin = $("#btn-join", root) as HTMLButtonElement;
  const roomInput = $("#room-input", root) as HTMLInputElement;
  const openRoomsList = $("#open-rooms-list", root);
  const openRoomsEmpty = $("#open-rooms-empty", root);
  const openRoomsStatus = $("#open-rooms-status", root);
  const btnRefreshOpenRooms = $("#btn-refresh-open-rooms", root) as HTMLButtonElement;
  const roomTitleInput = $("#room-title-input", root) as HTMLInputElement;
  const btnRoomTitleRandom = $("#btn-room-title-random", root) as HTMLButtonElement;

  type OpenRoomRow = {
    roomCode: string;
    roomTitle?: string;
    hostNickname: string;
    hostSpecies: string;
    created: number;
  };

  const setLobbyBusy = (busy: boolean) => {
    btnHost.disabled = busy;
    btnJoin.disabled = busy;
    roomInput.disabled = busy;
    roomTitleInput.disabled = busy;
    btnRoomTitleRandom.disabled = busy;
    btnRefreshOpenRooms.disabled = busy;
    openRoomsList.querySelectorAll<HTMLButtonElement>(".open-room-join").forEach((b) => {
      b.disabled = busy;
    });
    clearLobbySocketGuardTimer();
    if (busy) {
      lobbySocketGuardTimer = domSetTimeout(() => {
        lobbySocketGuardTimer = null;
        unlockLobbyFormControlsSoft();
      }, 15_000);
    }
  };

  if (opts?.lockForAutoJoin) setLobbyBusy(true);

  const attemptJoinRoom = (code: string) => {
    const c = normalizeRoomCodeInput(code.trim());
    if (c.length !== ROOM_CODE_LEN) {
      toast.textContent = UI.roomCodeInvalid;
      toast.classList.remove("hidden");
      return;
    }
    toast.classList.add("hidden");
    roomInput.value = c;
    setLobbyBusy(true);
    const s = ensureSocket();
    const pet = loadPet();
    s.emit(
      "join_room",
      { roomCode: c, pet: battlePetPayload(pet) },
      (res: { ok: boolean; error?: string }) => {
        clearLobbySocketGuardTimer();
        if (!res?.ok) {
          toast.textContent = res?.error || UI.errGeneric;
          toast.classList.remove("hidden");
          setLobbyBusy(false);
          return;
        }
        roomCode = c;
        role = "guest";
        renderWaiting(root, c, false);
      },
    );
  };

  const paintOpenRooms = (rows: OpenRoomRow[]) => {
    openRoomsList.replaceChildren();
    const joinLocked = btnHost.disabled;
    if (rows.length === 0) {
      openRoomsEmpty.classList.remove("hidden");
      return;
    }
    openRoomsEmpty.classList.add("hidden");
    for (const row of rows) {
      const wrap = document.createElement("div");
      wrap.className = "open-room-row";
      const meta = document.createElement("div");
      meta.className = "open-room-meta";
      const titleStr = (row.roomTitle || "").trim();
      if (titleStr) {
        const titleEl = document.createElement("span");
        titleEl.className = "open-room-title";
        titleEl.textContent = titleStr;
        meta.append(titleEl);
      }
      const codeEl = document.createElement("span");
      codeEl.className = "open-room-code";
      codeEl.textContent = row.roomCode;
      const nickEl = document.createElement("span");
      nickEl.className = "open-room-host";
      nickEl.textContent = row.hostNickname;
      meta.append(codeEl, nickEl);
      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "btn btn-secondary btn--compact open-room-join";
      joinBtn.textContent = UI.joinThisRoom;
      joinBtn.disabled = joinLocked;
      joinBtn.addEventListener("click", () => attemptJoinRoom(row.roomCode));
      wrap.append(meta, joinBtn);
      openRoomsList.append(wrap);
    }
  };

  const fetchOpenRooms = () => {
    openRoomsStatus.textContent = UI.openRoomsLoading;
    openRoomsEmpty.classList.add("hidden");
    const s = ensureSocket();
    s.emit(
      "list_open_rooms",
      {},
      (res: { ok?: boolean; rooms?: OpenRoomRow[]; error?: string }) => {
        if (!res?.ok || !Array.isArray(res.rooms)) {
          openRoomsStatus.textContent =
            res?.error === "too_fast"
              ? UI.openRoomsRateLimited
              : UI.openRoomsErr;
          paintOpenRooms([]);
          return;
        }
        openRoomsStatus.textContent = "";
        paintOpenRooms(res.rooms);
      },
    );
  };

  btnRefreshOpenRooms.addEventListener("click", () => {
    if (btnRefreshOpenRooms.disabled) return;
    fetchOpenRooms();
  });

  btnRoomTitleRandom.addEventListener("click", () => {
    if (btnRoomTitleRandom.disabled) return;
    roomTitleInput.value = pickRandomRoomTitle();
  });

  $("#btn-host", root).addEventListener("click", () => {
    if (btnHost.disabled || btnJoin.disabled) return;
    toast.classList.add("hidden");
    setLobbyBusy(true);
    const s = ensureSocket();
    const pet = loadPet();
    const roomTitle = roomTitleInput.value.trim();
    s.emit(
      "create_room",
      { pet: battlePetPayload(pet), roomTitle },
      (res: { ok: boolean; roomCode?: string; roomTitle?: string }) => {
        clearLobbySocketGuardTimer();
        if (!res?.ok || !res.roomCode) {
          toast.textContent = UI.errGeneric;
          toast.classList.remove("hidden");
          setLobbyBusy(false);
          return;
        }
        roomCode = res.roomCode;
        role = "host";
        renderWaiting(root, res.roomCode, true, res.roomTitle || "");
      },
    );
  });

  $("#btn-join", root).addEventListener("click", () => {
    if (btnHost.disabled || btnJoin.disabled) return;
    attemptJoinRoom(roomInput.value);
  });

  fetchOpenRooms();
  attachOpenRoomsLiveListener(fetchOpenRooms);
}

function renderWaiting(
  root: HTMLElement,
  code: string,
  isHost: boolean,
  roomTitle = "",
) {
  clearCareAmbientTimer();
  phase = "waiting";
  detachOpenRoomsLiveListener();
  root.replaceChildren(
    el(`
    <div class="shell shell--wait">
      <h1>${isHost ? UI.waitConnect : UI.syncing}</h1>
      <p class="tagline">${UI.roomCodeLabel}</p>
      <p class="room-wait-custom-title hidden" id="room-wait-custom-title"></p>
      <div class="code-display">${code}</div>
      <div class="connect-visual" aria-hidden="true">
        <span class="prong"></span><span class="connect-visual-ico">\u2694\ufe0f</span><span class="prong"></span>
      </div>
      ${
        isHost
          ? `<button type="button" class="btn btn-secondary" id="btn-copy">${UI.copyRoomCode}</button>`
          : ""
      }
      <div class="row mt-gap-lg">
        <button type="button" class="btn btn-secondary" id="btn-wait-cancel">${UI.cancelWait}</button>
      </div>
      <p class="toast hidden" id="wait-toast"></p>
    </div>
  `),
  );

  const titleLine = root.querySelector("#room-wait-custom-title");
  const tShow = roomTitle.trim();
  if (titleLine && tShow) {
    titleLine.textContent = `${UI.roomDisplayNameLabel}\uff1a ${tShow}`;
    titleLine.classList.remove("hidden");
  }

  if (isHost) {
    $("#btn-copy", root).addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        $("#btn-copy", root).textContent = UI.copied;
        window.setTimeout(() => {
          ($("#btn-copy", root) as HTMLButtonElement).textContent = UI.copyRoomCode;
        }, 2000);
      } catch {
        /* ignore */
      }
    });
  }

  const s = ensureSocket();
  s.removeAllListeners("linked");
  s.removeAllListeners("peer_left");
  const goBattle = (payload: {
    foe?: {
      species?: string;
      nickname?: string;
      virtAge?: number;
      power?: number;
      morphKey?: string | null;
    };
  }) => {
    if (payload?.foe) {
      battleFoeSnapshot = normalizeBattleFoe(payload.foe);
    }
    if (phase === "waiting") renderBattle(root);
  };
  const onPeerLeft = () => {
    const t = $("#wait-toast", root);
    t.textContent = UI.peerLeft;
    t.classList.remove("hidden");
    window.setTimeout(() => renderCare(root), 1200);
  };

  s.on("linked", goBattle);
  s.on("peer_left", onPeerLeft);

  const btnWaitCancel = $("#btn-wait-cancel", root) as HTMLButtonElement;
  let waitCancelOnce = false;
  btnWaitCancel.addEventListener("click", () => {
    if (waitCancelOnce) return;
    waitCancelOnce = true;
    btnWaitCancel.disabled = true;
    cancelWaitingAndReturn(root);
  });
}

function renderBattle(root: HTMLElement) {
  clearCareAmbientTimer();
  phase = "battle";
  detachOpenRoomsLiveListener();
  stopTick();

  const myPet = loadPet();
  if (!myPet.alive) {
    flashCare(UI.deadPetBattleBlocked);
    renderCare(root);
    return;
  }
  if (!myPet.hatched) {
    flashCare(UI.eggBattleBlocked);
    renderCare(root);
    return;
  }
  const foeSnap = battleFoeSnapshot
    ? normalizeBattleFoe(battleFoeSnapshot)
    : normalizeBattleFoe({});
  battleFoeSnapshot = null;
  const mySt = growthStage(myPet.virtAge);
  const foeSt = growthStage(foeSnap.virtAge);
  const youSprite = petAssetUrl(idleSpriteForPet(myPet));
  const foeSprite = petAssetUrl(
    idleSpriteFromSnap(
      foeSnap.species,
      foeSnap.virtAge,
      foeSnap.morphKey,
    ),
  );

  root.replaceChildren(
    el(`
    <div class="shell shell--battle">
      <div class="screen-bezel screen-bezel--battle">
        <div class="round-meta">
          <span id="round-label">${UI.round(1)}</span>
          <span class="timer" id="timer">--</span>
        </div>
        <div class="battle-arena">
          <div class="monster">
            <div class="pet-sprite-mount pet-sprite-mount--battle pet-sprite-mount--battle-you">
              <img class="pet-sprite battle-pet" id="battle-you-sprite" alt="" width="72" height="72" decoding="async" />
              <canvas class="pet-sprite battle-pet battle-pet-canvas hidden" id="battle-you-canvas" width="72" height="72" aria-hidden="true"></canvas>
            </div>
            <div class="name" id="battle-you-label"></div>
            <div class="hp-wrap"><div class="hp-fill" id="hp-you" style="width:100%"></div></div>
            <div class="mp-label">${UI.battleMp}</div>
            <div class="mp-wrap"><div class="mp-fill" id="mp-you" style="width:100%"></div></div>
          </div>
          <div class="monster">
            <div class="pet-sprite-mount pet-sprite-mount--battle pet-sprite-mount--battle-foe">
              <img class="pet-sprite battle-pet" id="battle-foe-sprite" alt="" width="72" height="72" decoding="async" />
              <canvas class="pet-sprite battle-pet battle-pet-canvas hidden" id="battle-foe-canvas" width="72" height="72" aria-hidden="true"></canvas>
            </div>
            <div class="name" id="battle-foe-label"></div>
            <div class="hp-wrap"><div class="hp-fill foe" id="hp-foe" style="width:100%"></div></div>
            <div class="mp-label">${UI.battleMp}</div>
            <div class="mp-wrap"><div class="mp-fill mp-fill--foe" id="mp-foe" style="width:100%"></div></div>
          </div>
        </div>
        <p class="battle-hint">${UI.chooseMove}</p>
        <div class="move-grid">
          <button type="button" class="move-btn" data-move="strike">${UI.strike}</button>
          <button type="button" class="move-btn" data-move="guard">${UI.guard}</button>
          <button type="button" class="move-btn" data-move="charge">${UI.charge}</button>
        </div>
        <details class="battle-emote-panel">
          <summary class="battle-emote-summary">${UI.battleEmoteTitle}</summary>
          <div class="battle-emote-buttons" role="group" aria-label="${escapeHtml(UI.battleEmoteTitle)}">
            ${BATTLE_EMOTE_IDS.map(
              (id) =>
                `<button type="button" class="btn btn-secondary btn--compact battle-emote-btn" data-battle-emote="${id}">${escapeHtml(battleEmoteButtonLabel(id))}</button>`,
            ).join("")}
          </div>
        </details>
        <div class="row battle-forfeit-row">
          <button type="button" class="btn btn-secondary" id="btn-forfeit">${UI.surrenderLeave}</button>
        </div>
        <p class="toast hidden" id="lock-hint"></p>
        <div class="log" id="battle-log"></div>
      </div>
    </div>
  `),
  );

  const youSp = $("#battle-you-sprite", root) as HTMLImageElement;
  const foeSp = $("#battle-foe-sprite", root) as HTMLImageElement;
  const youCv = $("#battle-you-canvas", root) as HTMLCanvasElement;
  const foeCv = $("#battle-foe-canvas", root) as HTMLCanvasElement;
  const youMount = root.querySelector(
    ".pet-sprite-mount--battle-you",
  ) as HTMLElement;
  const foeMount = root.querySelector(
    ".pet-sprite-mount--battle-foe",
  ) as HTMLElement;

  const foePoopSnap =
    (foeSnap.species === "cat" || foeSnap.species === "dog") &&
    foeSnap.morphKey === "doodoo";

  const syncBattleCatMount = (
    mount: HTMLElement,
    species: PetSpecies,
    morphKey: PetMorphKey | null,
    isPoop: boolean,
  ) => {
    if (isPoop) {
      delete mount.dataset.catElement;
      return;
    }
    const ce = catElementKeyFromMorph(species, morphKey);
    if (ce) mount.dataset.catElement = ce;
    else delete mount.dataset.catElement;
  };

  const youPoop = careUsesPoopCanvas(myPet);
  syncBattleCatMount(youMount, myPet.species, myPet.morphKey, youPoop);
  syncBattleCatMount(foeMount, foeSnap.species, foeSnap.morphKey, foePoopSnap);

  if (youPoop) {
    youSp.classList.add("hidden");
    youCv.classList.remove("hidden");
    renderPoopMonsterCanvas(youCv, {
      cssSize: 72,
      hatched: true,
      stage: mySt,
      pose: null,
    });
  } else if (speciesUsesCanvasArt(myPet.species)) {
    youSp.classList.add("hidden");
    youCv.classList.remove("hidden");
    renderDogCanvas(youCv, {
      cssSize: 72,
      hatched: true,
      stage: mySt,
      pose: null,
      elementAccent: dogElementKeyFromMorph(myPet.morphKey),
    });
  } else {
    youSp.classList.remove("hidden");
    youCv.classList.add("hidden");
    youSp.src = youSprite;
  }
  if (foePoopSnap) {
    foeSp.classList.add("hidden");
    foeCv.classList.remove("hidden");
    renderPoopMonsterCanvas(foeCv, {
      cssSize: 72,
      hatched: true,
      stage: foeSt,
      pose: null,
    });
  } else if (speciesUsesCanvasArt(foeSnap.species)) {
    foeSp.classList.add("hidden");
    foeCv.classList.remove("hidden");
    renderDogCanvas(foeCv, {
      cssSize: 72,
      hatched: true,
      stage: foeSt,
      pose: null,
      elementAccent: dogElementKeyFromMorph(foeSnap.morphKey),
    });
  } else {
    foeSp.classList.remove("hidden");
    foeCv.classList.add("hidden");
    foeSp.src = foeSprite;
  }
  youSp.classList.toggle("pet-sprite--alt", myPet.species === "crystal");
  foeSp.classList.toggle("pet-sprite--alt", foeSnap.species === "crystal");
  const myMorphLabel =
    myPet.morphTier >= 1 && myPet.morphKey
      ? morphLabelZh(myPet.morphKey)
      : null;
  $("#battle-you-label", root).textContent = myMorphLabel
    ? `${myPet.nickname} \u00b7 ${myMorphLabel} \u00b7 \u6211\u65b9`
    : `${myPet.nickname} \u00b7 \u6211\u65b9`;
  const foeMorph =
    foeSnap.morphKey != null ? morphLabelZh(foeSnap.morphKey) : null;
  $("#battle-foe-label", root).textContent = foeMorph
    ? `${foeSnap.nickname} \u00b7 ${foeMorph}`
    : `${foeSnap.nickname} \u00b7 \u5c0d\u624b`;

  const s = ensureSocket();
  s.removeAllListeners("battle_state");
  s.removeAllListeners("round_result");
  s.removeAllListeners("battle_end");
  s.removeAllListeners("battle_emote");
  s.removeAllListeners("linked");
  s.removeAllListeners("peer_left");
  let myLocked = false;
  /** 最近一次同步的己方靈力，供本地鎖招時仍用於按鈕狀態。 */
  let lastYourMp = 999;
  let deadlineTs = Date.now() + ROUND_MS;
  const logEl = $("#battle-log", root);
  const lockHint = $("#lock-hint", root);
  const timerEl = $("#timer", root);
  const roundLabel = $("#round-label", root);

  const appendLog = (line: string, emoteLine = false) => {
    const p = document.createElement("div");
    p.textContent = line;
    if (emoteLine) p.classList.add("log-line--emote");
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  };

  let lastBattleEmoteLocal = 0;
  const appendEmoteYou = (id: BattleEmoteId) => {
    appendLog(
      `${UI.battleEmoteYouPrefix}${battleEmoteFullLine(id)}`,
      true,
    );
  };
  const appendEmoteFoe = (id: BattleEmoteId) => {
    appendLog(
      `${UI.battleEmoteFoePrefix}${battleEmoteFullLine(id)}`,
      true,
    );
  };

  const setHp = (yourHp: number, foeHp: number) => {
    ($("#hp-you", root) as HTMLElement).style.width = `${yourHp}%`;
    ($("#hp-foe", root) as HTMLElement).style.width = `${foeHp}%`;
  };

  const setMp = (
    yourMp: number,
    yourMpMax: number,
    foeMp: number,
    foeMpMax: number,
  ) => {
    const yPct = yourMpMax > 0 ? (yourMp / yourMpMax) * 100 : 0;
    const fPct = foeMpMax > 0 ? (foeMp / foeMpMax) * 100 : 0;
    ($("#mp-you", root) as HTMLElement).style.width = `${yPct}%`;
    ($("#mp-foe", root) as HTMLElement).style.width = `${fPct}%`;
  };

  const applyMoveButtonState = (yourMp: number, allLocked: boolean) => {
    root.querySelectorAll(".move-btn").forEach((b) => {
      const btn = b as HTMLButtonElement;
      const m = btn.dataset.move as Move | undefined;
      if (allLocked) {
        btn.disabled = true;
        btn.removeAttribute("title");
        return;
      }
      if (m === "charge" && yourMp < MP_COST_CHARGE) {
        btn.disabled = true;
        btn.title = UI.chargeMpBlocked(MP_COST_CHARGE);
      } else {
        btn.disabled = false;
        btn.removeAttribute("title");
      }
    });
  };

  const updateTimer = (deadline: number) => {
    deadlineTs = deadline;
    const left = Math.max(0, deadline - Date.now());
    timerEl.textContent = `${(left / 1000).toFixed(1)}s`;
  };

  const onBattleState = (st: {
    round: number;
    yourHp: number;
    foeHp: number;
    yourMp?: number;
    yourMpMax?: number;
    foeMp?: number;
    foeMpMax?: number;
    deadline: number;
    locked?: { host: boolean; guest: boolean };
  }) => {
    roundLabel.textContent = UI.round(st.round);
    setHp(st.yourHp, st.foeHp);
    updateTimer(st.deadline);
    const iAmHost = role === "host";
    if (
      typeof st.yourMp === "number" &&
      typeof st.yourMpMax === "number" &&
      typeof st.foeMp === "number" &&
      typeof st.foeMpMax === "number"
    ) {
      lastYourMp = st.yourMp;
      setMp(st.yourMp, st.yourMpMax, st.foeMp, st.foeMpMax);
    }
    const yourMpForUi =
      typeof st.yourMp === "number" ? st.yourMp : lastYourMp;
    if (st.locked) {
      const iLocked = iAmHost ? st.locked.host : st.locked.guest;
      myLocked = iLocked;
      lockHint.classList.toggle("hidden", !iLocked);
      lockHint.textContent = UI.lockedYou;
      applyMoveButtonState(yourMpForUi, iLocked);
    } else {
      applyMoveButtonState(yourMpForUi, myLocked);
    }
  };

  const onRoundResult = (r: {
    yourLog: string;
    foeLog: string;
    hp: { host: number; guest: number };
    mp?: { host: number; guest: number };
    mpMax?: { host: number; guest: number };
    yours: Move;
    theirs: Move;
    auto: boolean;
  }) => {
    myLocked = false;
    root.querySelectorAll(".move-btn").forEach((b) => {
      (b as HTMLButtonElement).classList.remove("selected");
    });
    lockHint.classList.add("hidden");
    const yh = role === "host" ? r.hp.host : r.hp.guest;
    const fh = role === "host" ? r.hp.guest : r.hp.host;
    setHp(yh, fh);
    if (r.mp && r.mpMax) {
      const ym = role === "host" ? r.mp.host : r.mp.guest;
      const yM = role === "host" ? r.mpMax.host : r.mpMax.guest;
      const fm = role === "host" ? r.mp.guest : r.mp.host;
      const fM = role === "host" ? r.mpMax.guest : r.mpMax.host;
      lastYourMp = ym;
      setMp(ym, yM, fm, fM);
      applyMoveButtonState(ym, false);
    } else {
      applyMoveButtonState(lastYourMp, false);
    }
    appendLog(r.yourLog);
    if (r.auto) appendLog(`\u00bb ${UI.autoPick}`);
  };

  const onBattleEnd = (r: {
    winner: string;
    you: string;
    forfeitBy?: "host" | "guest" | null;
  }) => {
    stopTick();
    const fb = r.forfeitBy;
    if (fb === "host" || fb === "guest") {
      if (fb !== r.you) recordPvpWin();
      if (fb === r.you) showEndModal(root, UI.youSurrendered);
      else showEndModal(root, UI.foeSurrenderYouWin);
      return;
    }
    const iWon =
      (r.winner === "host" && r.you === "host") ||
      (r.winner === "guest" && r.you === "guest");
    if (r.winner !== "draw" && iWon) recordPvpWin();
    const title =
      r.winner === "draw" ? UI.draw : iWon ? UI.win : UI.lose;
    showEndModal(root, title);
  };

  const onPeerLeftBattle = () => {
    stopTick();
    showEndModal(root, UI.peerLeft);
  };

  const onBattleEmote = (payload: { key?: string }) => {
    const raw = typeof payload?.key === "string" ? payload.key.trim() : "";
    if (!isBattleEmoteId(raw)) return;
    appendEmoteFoe(raw);
  };

  s.off("battle_state");
  s.off("round_result");
  s.off("battle_end");
  s.off("battle_emote");
  s.off("peer_left");
  s.on("battle_state", onBattleState);
  s.on("round_result", onRoundResult);
  s.on("battle_end", onBattleEnd);
  s.on("battle_emote", onBattleEmote);
  s.on("peer_left", onPeerLeftBattle);

  root.querySelectorAll(".battle-emote-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const raw = (b as HTMLButtonElement).dataset.battleEmote;
      if (!raw || !isBattleEmoteId(raw)) return;
      const now = Date.now();
      if (now - lastBattleEmoteLocal < BATTLE_EMOTE_CLIENT_COOLDOWN_MS) {
        appendLog(UI.battleEmoteTooFast);
        return;
      }
      lastBattleEmoteLocal = now;
      appendEmoteYou(raw);
      s.emit("battle_emote", { key: raw });
    });
  });

  root.querySelectorAll(".move-btn").forEach((b) => {
    b.addEventListener("click", () => {
      if (myLocked) return;
      const btn = b as HTMLButtonElement;
      if (btn.disabled) return;
      const move = btn.dataset.move as Move;
      myLocked = true;
      applyMoveButtonState(lastYourMp, true);
      lockHint.classList.remove("hidden");
      lockHint.textContent = UI.lockedYou;
      s.emit("choose_move", { move });
      btn.classList.add("selected");
    });
  });

  const btnForfeit = $("#btn-forfeit", root) as HTMLButtonElement;
  let forfeitSent = false;
  btnForfeit.addEventListener("click", () => {
    if (forfeitSent || btnForfeit.disabled) return;
    if (!window.confirm(UI.confirmForfeit)) return;
    forfeitSent = true;
    btnForfeit.disabled = true;
    root.querySelectorAll(".move-btn").forEach((b) => {
      (b as HTMLButtonElement).disabled = true;
    });
    s.emit("forfeit");
  });

  tickTimer = domSetInterval(() => {
    const left = Math.max(0, deadlineTs - Date.now());
    timerEl.textContent = `${(left / 1000).toFixed(1)}s`;
  }, 100);
}

function showEndModal(root: HTMLElement, title: string) {
  phase = "end";
  const overlay = el(`
    <div class="modal-overlay" id="end-modal">
      <div class="modal">
        <h2>${title}</h2>
        <p>${UI.endModalHint}</p>
        <button type="button" class="btn btn-primary" id="btn-home">${UI.again}</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  $("#btn-home", overlay).addEventListener("click", () => {
    overlay.remove();
    socket?.disconnect();
    socket = null;
    renderCare(root);
  });
}

function mountGameRulesButton(): void {
  const btn = document.getElementById("btn-game-rules");
  if (!btn) return;
  btn.addEventListener("click", () => showGameRulesModal());
}

function safeHttpUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol === "https:" || u.protocol === "http:") return u.href;
  } catch {
    /* ignore */
  }
  return null;
}

function feedbackMetaBlock(): string {
  const lines = [
    `app: ${__APP_VERSION__}`,
    `url: ${location.href}`,
    `ua: ${navigator.userAgent}`,
    `time: ${new Date().toISOString()}`,
  ];
  return `${lines.join("\n")}\n\n\u8acb\u5728\u4e0b\u65b9\u5beb\u4e0b\u60a8\u7684\u610f\u898b\u6216\u554f\u984c\u2026\n`;
}

function mountFeedbackButton(): void {
  const btn = document.getElementById("btn-feedback");
  if (!btn) return;
  btn.addEventListener("click", () => showFeedbackModal());
}

function showFeedbackModal(): void {
  if (document.getElementById("feedback-modal-overlay")) return;
  const urlRaw = (import.meta.env.VITE_FEEDBACK_URL || "").trim();
  const emailRaw = (import.meta.env.VITE_FEEDBACK_EMAIL || "").trim();
  const linkHref = safeHttpUrl(urlRaw);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
  const meta = feedbackMetaBlock();
  const subject = encodeURIComponent(
    "[Pocket\u96fb\u5b50\u5bf5\u7269] \u56de\u994b",
  );
  const mailHref = emailOk
    ? `mailto:${emailRaw}?subject=${subject}&body=${encodeURIComponent(meta)}`
    : "";

  const overlay = el(`
    <div class="modal-overlay feedback-modal-overlay" id="feedback-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
      <div class="modal modal--feedback">
        <h2 id="feedback-modal-title">\u610f\u898b\u56de\u994b</h2>
        <p class="feedback-modal-intro">\u6b61\u8fce\u63d0\u4f9b\u554f\u984c\u3001\u5efa\u8b70\u6216\u9ad4\u9a57\u5206\u4eab\u3002\u82e5\u5df2\u8a2d\u5b9a\u8868\u55ae\u6216\u4fe1\u7bb1\uff0c\u53ef\u76f4\u63a5\u958b\u555f\uff1b\u5426\u5247\u8acb\u8907\u88fd\u4e0b\u65b9\u8cc7\u8a0a\u8cbc\u7d66\u958b\u767c\u8005\u3002</p>
        <div class="feedback-modal-actions" id="feedback-modal-actions"></div>
        <label class="feedback-meta-label" for="feedback-meta">\u74b0\u5883\u8cc7\u8a0a\uff08\u9078\u8cbc\uff09</label>
        <textarea class="feedback-meta" id="feedback-meta" readonly rows="6" spellcheck="false"></textarea>
        <div class="row feedback-modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-feedback-copy">\u8907\u88fd\u8cc7\u8a0a</button>
          <button type="button" class="btn btn-primary" id="btn-feedback-close">\u95dc\u9589</button>
        </div>
      </div>
    </div>
  `);
  const ta = $("#feedback-meta", overlay) as HTMLTextAreaElement;
  ta.value = meta;

  const actions = $("#feedback-modal-actions", overlay);
  if (linkHref || mailHref) actions.classList.add("row");
  if (linkHref) {
    const a = document.createElement("a");
    a.className = "btn btn-primary";
    a.href = linkHref;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "\u958b\u555f\u56de\u994b\u8868\u55ae";
    actions.append(a);
  }
  if (mailHref) {
    const a = document.createElement("a");
    a.className = "btn btn-secondary";
    a.href = mailHref;
    a.textContent = "\u7528\u96fb\u5b50\u90f5\u4ef6\u56de\u994b";
    actions.append(a);
  }
  if (!linkHref && !mailHref) {
    const hint = document.createElement("p");
    hint.className = "feedback-no-channel";
    hint.textContent =
      "\u5c1a\u672a\u8a2d\u5b9a\u56de\u994b\u9023\u7d50\uff0c\u8acb\u8907\u88fd\u4e0b\u65b9\u8cc7\u8a0a\u5f8c\u81ea\u884c\u50b3\u7d66\u5718\u968a\u3002";
    actions.append(hint);
  }

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  $("#btn-feedback-close", overlay).addEventListener("click", close);
  $("#btn-feedback-copy", overlay).addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      const b = $("#btn-feedback-copy", overlay) as HTMLButtonElement;
      const prev = b.textContent;
      b.textContent = "\u5df2\u8907\u88fd";
      domSetTimeout(() => {
        b.textContent = prev;
      }, 1600);
    } catch {
      ta.select();
      document.execCommand("copy");
    }
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
}

function showGameRulesModal(): void {
  if (document.getElementById("rules-modal-overlay")) return;
  const overlay = el(`
    <div class="modal-overlay rules-modal-overlay" id="rules-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-modal-title">
      <div class="modal modal--rules">
        <h2 id="rules-modal-title">\u904a\u6232\u8aaa\u660e</h2>
        <div class="rules-modal-scroll">
          <div class="rules-modal-body"></div>
        </div>
        <button type="button" class="btn btn-primary" id="btn-rules-close">\u95dc\u9589</button>
      </div>
    </div>
  `);
  ($(".rules-modal-body", overlay) as HTMLDivElement).innerHTML =
    getGameRulesPlayerHtml();

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  $("#btn-rules-close", overlay).addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
}

function mountAppVersionLabel(): void {
  const el = document.getElementById("app-version");
  if (el) el.textContent = `v${__APP_VERSION__}`;
}

function boot() {
  mountAppVersionLabel();
  mountThemeBar();
  mountGameRulesButton();
  mountFeedbackButton();
  const root = $("#view-root");
  const params = new URLSearchParams(location.search);
  const preJoin = normalizeRoomCodeInput(params.get("join") || "");
  if (preJoin.length === ROOM_CODE_LEN) {
    renderLobby(root, { lockForAutoJoin: true });
    window.setTimeout(() => {
      const input = document.getElementById("room-input") as HTMLInputElement | null;
      if (input) input.value = preJoin;
      const host = document.getElementById("btn-host") as HTMLButtonElement | null;
      const join = document.getElementById("btn-join") as HTMLButtonElement | null;
      const unlockUrlJoinLobby = () => {
        if (phase !== "lobby") return;
        if (host) host.disabled = false;
        if (join) join.disabled = false;
        if (input) input.disabled = false;
      };
      const s = ensureSocket();
      const pet = loadPet();
      s.emit(
        "join_room",
        { roomCode: preJoin, pet: battlePetPayload(pet) },
        (res: { ok: boolean; error?: string }) => {
          clearLobbySocketGuardTimer();
          if (!res?.ok) {
            unlockUrlJoinLobby();
            const toast = document.getElementById("lobby-toast");
            if (toast) {
              toast.textContent = res?.error || UI.errGeneric;
              toast.classList.remove("hidden");
            }
            return;
          }
          roomCode = preJoin;
          role = "guest";
          renderWaiting(root, preJoin, false);
        },
      );
    }, 200);
  } else {
    renderCare(root);
  }
}

boot();
