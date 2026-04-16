export type PetSpecies = "volt" | "crystal" | "chicken" | "cat" | "dog";

export type DeathCause = "old" | "neglect" | "illness";

/**
 * 首次進化分支（僅本機養成；不影響物種）。
 * 貓／狗：`cat_*`／`dog_*` 為屬性分支，`doodoo` 為照護過差的大便怪；其餘物種仍為四種作戰風格鍵。
 */
export type PetMorphKey =
  | "striker"
  | "guardian"
  | "survivor"
  | "harmony"
  | "cat_volt"
  | "cat_aqua"
  | "cat_flora"
  | "dog_volt"
  | "dog_aqua"
  | "dog_flora"
  | "doodoo";

export interface PetState {
  species: PetSpecies;
  nickname: string;
  hunger: number;
  happy: number;
  clean: number;
  energy: number;
  power: number;
  lastTs: number;
  /** Until true, the pet is an egg (sprite + softer decay, no battle). */
  hatched: boolean;
  /** Virtual days lived (float); advances with real time. */
  virtAge: number;
  ill: boolean;
  /** Virtual days spent ill (resets when healthy). */
  illDays: number;
  /** Lifetime virtual days spent ill (for evolution / 「常生病」). */
  totalIllVirtDays: number;
  /** Exponential moving average of (hunger+happy+clean+energy)/4 while alive. */
  careQualityEma: number;
  /** PvP wins (HP 勝負或對方投降)，自投降／平手不計。 */
  pvpWins: number;
  /** 0 = 未進化；1 = 已選定分支（`morphKey`）。 */
  morphTier: 0 | 1;
  morphKey: PetMorphKey | null;
  /** 養成畫面房間燈（關燈時夜間回體力略強）。 */
  lightsOn: boolean;
  /** Accumulated real hours while critically hungry. */
  starveHours: number;
  alive: boolean;
  deathCause?: DeathCause;
}

const STORAGE_KEY = "pocketPet_pet_v2";
const LEGACY_KEY = "pocketPet_pet_v1";

/** Real hours per one virtual day (tune pace of life). */
const HOURS_PER_VIRT_DAY = 12;
/** Natural lifespan in virtual days. */
const OLD_AGE_DEATH = 90;
/** Critical hunger: accumulate starveHours toward neglect death. */
const STARVE_HUNGER = 12;
/** Real hours of starvation exposure before death. */
const STARVE_DEATH_HOURS = 44;
/** Virtual age beyond which extra illness-death checks apply. */
const FRAIL_AGE = 52;

/** Virtual days of warmth / time before the sprite leaves the egg. */
export const EGG_HATCH_VIRT = 0.32;

const DEFAULT: PetState = {
  species: "volt",
  nickname: "\u96f7\u866b\u7378",
  hunger: 82,
  happy: 78,
  clean: 80,
  energy: 88,
  power: 12,
  lastTs: Date.now(),
  hatched: true,
  virtAge: 22,
  ill: false,
  illDays: 0,
  totalIllVirtDays: 0,
  careQualityEma: 82,
  pvpWins: 0,
  morphTier: 0,
  morphKey: null,
  lightsOn: true,
  starveHours: 0,
  alive: true,
};

/** 首次進化最低虛擬日齡（仍須滿足某一分支條件）。 */
const EVOLVE_MIN_VIRT_AGE = 12;

let pendingMorphToast: string | null = null;

/** 養成畫面首次進化提示（若有則消費為單次字串）。 */
export function consumeMorphToast(): string | null {
  const t = pendingMorphToast;
  pendingMorphToast = null;
  return t;
}

function parseMorphKey(raw: unknown): PetMorphKey | null {
  if (
    raw === "striker" ||
    raw === "guardian" ||
    raw === "survivor" ||
    raw === "harmony" ||
    raw === "cat_volt" ||
    raw === "cat_aqua" ||
    raw === "cat_flora" ||
    raw === "dog_volt" ||
    raw === "dog_aqua" ||
    raw === "dog_flora" ||
    raw === "doodoo"
  ) {
    return raw;
  }
  return null;
}

/** 本機時鐘：夜間（自動睡眠結算用）。22:00～06:59。 */
export function isLocalNightHour(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 22 || h < 7;
}

/** 貓／狗且已進化為大便怪時，養成／對戰改用 Canvas 大便怪。 */
export function careUsesPoopCanvas(p: PetState): boolean {
  return (
    p.alive &&
    p.hatched &&
    p.morphTier >= 1 &&
    p.morphKey === "doodoo" &&
    (p.species === "cat" || p.species === "dog")
  );
}

/**
 * 對戰／養成：貓水／草屬給 DOM `data-cat-element` 做色光。
 * `cat_volt` 使用專用 `cat-volt-*.png` 立繪，不疊濾鏡。
 */
export function catElementKeyFromMorph(
  species: PetSpecies,
  k: PetMorphKey | null,
): "volt" | "aqua" | "flora" | null {
  if (species !== "cat") return null;
  if (k === "cat_volt") return null;
  if (k === "cat_aqua") return "aqua";
  if (k === "cat_flora") return "flora";
  return null;
}

/** 狗 Canvas 屬性裝飾鍵。 */
export function dogElementKeyFromMorph(
  k: PetMorphKey | null,
): "volt" | "aqua" | "flora" | null {
  if (k === "dog_volt") return "volt";
  if (k === "dog_aqua") return "aqua";
  if (k === "dog_flora") return "flora";
  return null;
}

/** 形態中文名（UI／對戰標籤）。 */
export function morphLabelZh(key: PetMorphKey): string {
  if (key === "striker") return "\u9b25\u9b42\u5f62\u614b";
  if (key === "guardian") return "\u5b88\u8b77\u5f62\u614b";
  if (key === "survivor") return "\u97cc\u6027\u5f62\u614b";
  if (key === "harmony") return "\u5747\u8861\u5f62\u614b";
  if (key === "cat_volt" || key === "dog_volt")
    return "\u96f7\u5c6c\u9032\u5316";
  if (key === "cat_aqua" || key === "dog_aqua")
    return "\u6c34\u5c6c\u9032\u5316";
  if (key === "cat_flora" || key === "dog_flora")
    return "\u8349\u5c6c\u9032\u5316";
  return "\u5927\u4fbf\u602a";
}

function isDoodooMorphCandidate(p: PetState): boolean {
  const ema = p.careQualityEma;
  const illLife = p.totalIllVirtDays;
  return (
    ema <= 29 &&
    illLife >= 4 &&
    p.clean < 36 &&
    p.hunger < 42 &&
    (p.happy < 40 || p.clean < 30)
  );
}

function pickCatDogElementMorph(p: PetState): PetMorphKey {
  const pref = p.species === "cat" ? "cat_" : "dog_";
  const ema = p.careQualityEma;
  const illLife = p.totalIllVirtDays;
  if (p.power >= 21 && ema >= 34) return `${pref}volt` as PetMorphKey;
  if (p.clean >= 58 && illLife <= 4.5 && ema >= 35)
    return `${pref}aqua` as PetMorphKey;
  if (p.happy >= 60 && p.hunger >= 46 && ema >= 36)
    return `${pref}flora` as PetMorphKey;
  const v = p.power * 1.15 + p.pvpWins * 2.8;
  const a = p.clean * 1.08 + (100 - illLife) * 0.12;
  const f = p.happy * 1.05 + p.hunger * 0.22;
  if (v >= a && v >= f) return `${pref}volt` as PetMorphKey;
  if (a >= f) return `${pref}aqua` as PetMorphKey;
  return `${pref}flora` as PetMorphKey;
}

/**
 * 貓／狗：12 虛擬日起可變大便怪；滿 13 虛擬日且非大便怪則屬性進化。
 * 其他物種：鬥魂 → 守護 → 韌性 → 均衡（舊版）。
 */
function pickMorphKey(p: PetState): PetMorphKey | null {
  if (p.morphTier >= 1 || !p.alive || !p.hatched) return null;
  if (p.virtAge < EVOLVE_MIN_VIRT_AGE) return null;

  if (p.species === "cat" || p.species === "dog") {
    if (isDoodooMorphCandidate(p)) return "doodoo";
    if (p.virtAge < 13) return null;
    return pickCatDogElementMorph(p);
  }

  const ema = p.careQualityEma;
  const illLife = p.totalIllVirtDays;
  const wins = p.pvpWins;
  const pw = p.power;
  const age = p.virtAge;
  if (wins >= 2 && pw >= 18 && ema >= 38) return "striker";
  if (ema >= 62 && illLife <= 3.5 && age >= 12) return "guardian";
  if (illLife >= 5 && ema >= 32) return "survivor";
  if (age >= 13 && ema >= 44) return "harmony";
  return null;
}

export function tryEvolve(p: PetState): PetState {
  if (p.morphTier >= 1 || !p.alive || !p.hatched) return p;
  const key = pickMorphKey(p);
  if (!key) return p;
  if (key === "doodoo") {
    pendingMorphToast =
      "\u9032\u5316\uff01\u2026\u597d\u50cf\u8b8a\u6210\u5927\u4fbf\u602a\u4e86\uff08\u7167\u9867\u8981\u7528\u5fc3\u9ede\uff09";
  } else {
    pendingMorphToast = `\u9032\u5316\uff01${morphLabelZh(key)}`;
  }
  return { ...p, morphTier: 1, morphKey: key };
}

/** 養成畫面切換房間燈。 */
export function toggleCareLights(p: PetState): PetState {
  if (!p.alive) return p;
  return savePet({ ...p, lightsOn: !p.lightsOn });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function parseSpecies(raw: unknown): PetSpecies {
  if (
    raw === "volt" ||
    raw === "crystal" ||
    raw === "chicken" ||
    raw === "cat" ||
    raw === "dog"
  ) {
    return raw;
  }
  return "volt";
}

/** 狗物種以 Canvas 繪製，不使用 `public/pets` PNG。 */
export function speciesUsesCanvasArt(species: PetSpecies): boolean {
  return species === "dog";
}

export type CarePose = "eat" | "train" | "rest" | "clean";

export function carePoseFile(
  species: PetSpecies,
  pose: CarePose,
  morphKey: PetMorphKey | null = null,
): string {
  const suf =
    pose === "eat"
      ? "eat"
      : pose === "train"
        ? "train"
        : pose === "rest"
          ? "rest"
          : "clean";
  if (species === "cat" && morphKey === "cat_volt")
    return `cat-volt-${suf}.png`;
  if (species === "cat") return `cat-${suf}.png`;
  if (species === "chicken") return `chicken-${suf}.png`;
  if (species === "volt" && pose === "train") return "pet-train-volt.png";
  if (species === "crystal" && pose === "train") return "pet-train-crystal.png";
  return `pet-${suf}.png`;
}

function mergeDefaults(raw: Partial<PetState>): PetState {
  const legacy =
    raw.virtAge === undefined &&
    typeof raw.hunger === "number" &&
    raw.alive !== false;
  const virtAge =
    typeof raw.virtAge === "number" && !Number.isNaN(raw.virtAge)
      ? clamp(raw.virtAge, 0, 999)
      : legacy
        ? 22
        : DEFAULT.virtAge;
  const alive = raw.alive === false ? false : true;
  /** Legacy saves omit `hatched`; treat as already born. */
  const hatched = raw.hatched === false ? false : true;
  const hunger = clamp(Number(raw.hunger) || DEFAULT.hunger, 0, 100);
  const happy = clamp(Number(raw.happy) || DEFAULT.happy, 0, 100);
  const clean = clamp(Number(raw.clean) || DEFAULT.clean, 0, 100);
  const energy = clamp(Number(raw.energy) || DEFAULT.energy, 0, 100);
  const power = clamp(Number(raw.power) || DEFAULT.power, 0, 100);
  const careAvgLegacy = (hunger + happy + clean + energy) / 4;
  const careQualityEma =
    typeof raw.careQualityEma === "number" && !Number.isNaN(raw.careQualityEma)
      ? clamp(raw.careQualityEma, 0, 100)
      : careAvgLegacy;
  const totalIllVirtDays = clamp(
    Number(raw.totalIllVirtDays) || 0,
    0,
    9999,
  );
  const pvpWins = clamp(Number(raw.pvpWins) || 0, 0, 9999);
  const morphTier = raw.morphTier === 1 ? 1 : 0;
  const species = parseSpecies(raw.species);
  let morphKey: PetMorphKey | null =
    morphTier === 1 ? parseMorphKey(raw.morphKey) : null;
  if (morphTier === 1 && !morphKey) {
    morphKey =
      species === "cat"
        ? "cat_flora"
        : species === "dog"
          ? "dog_flora"
          : "harmony";
  }
  const lightsOn = raw.lightsOn === false ? false : true;
  return {
    species,
    nickname:
      typeof raw.nickname === "string" && raw.nickname.trim().length > 0
        ? raw.nickname.trim().slice(0, 12)
        : DEFAULT.nickname,
    hunger,
    happy,
    clean,
    energy,
    power,
    lastTs: Number(raw.lastTs) || Date.now(),
    hatched,
    virtAge,
    ill: alive && Boolean(raw.ill),
    illDays: alive ? clamp(Number(raw.illDays) || 0, 0, 999) : 0,
    totalIllVirtDays,
    careQualityEma,
    pvpWins,
    morphTier,
    morphKey,
    lightsOn,
    starveHours: Math.max(0, Number(raw.starveHours) || 0),
    alive,
    deathCause:
      raw.deathCause === "old" ||
      raw.deathCause === "neglect" ||
      raw.deathCause === "illness"
        ? raw.deathCause
        : undefined,
  };
}

function finalizeDeath(
  base: PetState,
  cause: DeathCause,
  now: number,
  virtAge: number,
): PetState {
  return {
    ...base,
    alive: false,
    deathCause: cause,
    virtAge,
    ill: false,
    illDays: 0,
    lastTs: now,
  };
}

/** 0=baby … 4=senior (by virtual days). */
export function growthStage(virtAge: number): 0 | 1 | 2 | 3 | 4 {
  if (virtAge < 5) return 0;
  if (virtAge < 13) return 1;
  if (virtAge < 27) return 2;
  if (virtAge < 61) return 3;
  return 4;
}

/** CSS scale for idle sprite in care screen. */
export function growthSpriteScale(stage: 0 | 1 | 2 | 3 | 4): number {
  const t = [0.58, 0.72, 0.86, 1, 1][stage];
  return t;
}

/** 養成畫面精靈縮放（含蛋期略小）。 */
export function careSpriteScale(p: PetState): number {
  const st = growthStage(p.virtAge);
  return p.hatched ? growthSpriteScale(st) : growthSpriteScale(0) * 0.9;
}

/**
 * Idle art per stage (`public/pets/pet-idle-s0.png` … `s4`).
 * Replace files with your own pixel art; placeholders ship as copies of the base idle.
 */
export function idleSpriteForSpeciesStage(
  species: PetSpecies,
  stage: 0 | 1 | 2 | 3 | 4,
): string {
  if (species === "cat") return `cat-idle-s${stage}.png`;
  if (species === "chicken") return `chicken-idle-s${stage}.png`;
  return `pet-idle-s${stage}.png`;
}

/**
 * 養成／對戰頭像：已進化雷貓用 `cat-volt-idle-s*.png`，其餘同 `idleSpriteForSpeciesStage`。
 * `morphKey` 傳 `null` 表示未進化或無此分支。
 */
export function idleSpriteFromSnap(
  species: PetSpecies,
  virtAge: number,
  morphKey: PetMorphKey | null,
): string {
  const st = growthStage(virtAge);
  if (species === "cat" && morphKey === "cat_volt")
    return `cat-volt-idle-s${st}.png`;
  return idleSpriteForSpeciesStage(species, st);
}

/** 目前寵物 idle 檔名（不含蛋）。 */
export function idleSpriteForPet(p: PetState): string {
  const mk = p.morphTier >= 1 ? p.morphKey : null;
  return idleSpriteFromSnap(p.species, p.virtAge, mk);
}

/** 舊版怪獸 idle（僅 volt 檔名）；請優先使用 `idleSpriteForSpeciesStage`。 */
export function idleSpriteForStage(stage: 0 | 1 | 2 | 3 | 4): string {
  return idleSpriteForSpeciesStage("volt", stage);
}

export function eggSpriteForSpecies(species: PetSpecies): string {
  if (species === "crystal") return "pet-egg-crystal.png";
  if (species === "chicken") return "pet-egg-chicken.png";
  return "pet-egg-volt.png";
}

/** Idle image on the care screen (egg until hatched). */
export function careIdleSpriteFile(p: PetState): string {
  if (p.alive && !p.hatched) return eggSpriteForSpecies(p.species);
  return idleSpriteForPet(p);
}

export function growthLabelForPet(p: PetState): string {
  if (p.alive && !p.hatched) return "\u5b75\u5316\u4e2d";
  return growthLabel(growthStage(p.virtAge));
}

export function growthLabel(stage: 0 | 1 | 2 | 3 | 4): string {
  const labels = [
    "\u5bf6\u5bf6\u671f",
    "\u5152\u7ae5\u671f",
    "\u9752\u5c11\u5e74",
    "\u6210\u5e74\u671f",
    "\u9ec3\u660f\u671f",
  ];
  return labels[stage];
}

export function formatVirtAgeDays(virtAge: number): string {
  const d = Math.floor(virtAge);
  return `\u7b2c ${d} \u865b\u64ec\u65e5`;
}

function tryHatchEgg(p: PetState): PetState {
  if (p.hatched || !p.alive) return p;
  if (p.virtAge >= EGG_HATCH_VIRT) return { ...p, hatched: true, ill: false, illDays: 0 };
  return p;
}

function applyLifecycleAndDecay(p: PetState): PetState {
  const now = Date.now();
  const hours = Math.max(0, (now - p.lastTs) / 3_600_000);
  if (hours < 1 / 60) {
    return { ...p, lastTs: now };
  }

  let {
    virtAge,
    ill,
    illDays,
    starveHours,
    hunger,
    happy,
    clean,
    energy,
  } = p;
  const egg = p.alive && !p.hatched;
  const dAge = hours / HOURS_PER_VIRT_DAY;
  virtAge += dAge;

  const night = !egg && p.hatched && isLocalNightHour(new Date(now));
  const deepSleep = night && !p.lightsOn;
  const nightHungerMul = night ? (deepSleep ? 0.58 : 0.74) : 1;
  const nightCleanMul = night ? (deepSleep ? 0.72 : 0.85) : 1;
  const nightHappyMul = night ? (deepSleep ? 0.78 : 0.88) : 1;
  const nightEnergyDrainMul = night ? (deepSleep ? 0.42 : 0.55) : 1;

  const illMul = ill ? 1.38 : 1;
  const eggDecay = egg ? 0.42 : 1;
  const decay = illMul * eggDecay;
  hunger = clamp(hunger - hours * 7 * decay * nightHungerMul, 0, 100);
  clean = clamp(clean - hours * 4 * decay * nightCleanMul, 0, 100);
  const hungryPenalty =
    hunger < 38
      ? hours * 6 * decay * nightHappyMul
      : hours * 2.5 * decay * nightHappyMul;
  happy = clamp(happy - hungryPenalty, 0, 100);
  energy = clamp(
    energy - hours * 1.85 * decay * nightEnergyDrainMul,
    0,
    100,
  );
  if (night) {
    const bonus = hours * (deepSleep ? 1.42 : 0.92) * (ill ? 0.5 : 1);
    energy = clamp(energy + bonus, 0, 100);
  }

  if (!ill && !egg && hunger < 34 && clean < 38 && happy < 48) {
    const stress = Math.min(1, hours / 8);
    if (Math.random() < stress * 0.22) {
      ill = true;
    }
  }

  let totalIllVirtDays = p.totalIllVirtDays;
  if (egg) {
    ill = false;
    illDays = 0;
    starveHours = 0;
  } else if (ill) {
    illDays += dAge;
    totalIllVirtDays = clamp(totalIllVirtDays + dAge, 0, 9999);
  } else {
    illDays = 0;
  }

  const careAvg = (hunger + happy + clean + energy) / 4;
  const emaAlpha = Math.min(1, hours * 0.25);
  const careQualityEma = clamp(
    p.careQualityEma * (1 - emaAlpha) + careAvg * emaAlpha,
    0,
    100,
  );

  if (!egg && hunger < STARVE_HUNGER) {
    starveHours += hours;
  } else if (!egg) {
    starveHours = Math.max(0, starveHours - hours * 0.35);
  }

  let live: PetState = {
    ...p,
    virtAge,
    ill,
    illDays,
    totalIllVirtDays,
    careQualityEma,
    starveHours,
    hunger,
    happy,
    clean,
    energy,
    lastTs: now,
  };
  live = tryHatchEgg(live);
  if (!live.hatched) {
    return savePet(tryEvolve(live));
  }

  if (live.virtAge >= OLD_AGE_DEATH) {
    return savePet(finalizeDeath(live, "old", now, live.virtAge));
  }
  if (live.starveHours >= STARVE_DEATH_HOURS) {
    return savePet(finalizeDeath(live, "neglect", now, live.virtAge));
  }
  if (
    live.ill &&
    live.virtAge >= FRAIL_AGE &&
    live.illDays > 9 &&
    live.hunger < 24 &&
    Math.random() < dAge * 0.12
  ) {
    return savePet(finalizeDeath(live, "illness", now, live.virtAge));
  }

  return savePet(tryEvolve(live));
}

export function applyOfflineDecay(p: PetState): PetState {
  if (!p.alive) return p;
  return applyLifecycleAndDecay(p);
}

export function loadPet(): PetState {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY);
      if (raw) {
        try {
          localStorage.removeItem(LEGACY_KEY);
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) {
      return savePet(newAdoptionPetState());
    }
    const parsed = JSON.parse(raw) as Partial<PetState>;
    let p = mergeDefaults(parsed);
    if (!p.alive) return p;
    p = applyOfflineDecay(p);
    return p;
  } catch {
    return savePet(newAdoptionPetState());
  }
}

export function savePet(p: PetState): PetState {
  const next = p.alive ? { ...p, lastTs: Date.now() } : { ...p };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** 對戰勝利後呼叫（已排除自投降）；內部會 `loadPet` 並存檔。 */
export function recordPvpWin(): PetState {
  const p = loadPet();
  if (!p.alive) return p;
  const bumped = { ...p, pvpWins: p.pvpWins + 1 };
  return savePet(tryEvolve(bumped));
}

export function petEmoji(species: PetSpecies): string {
  if (species === "crystal") return "\ud83d\udc8e";
  if (species === "chicken") return "\ud83d\udc24";
  if (species === "cat") return "\ud83d\udc31";
  if (species === "dog") return "\ud83d\udc15";
  return "\u26a1";
}

export function petDefaultName(species: PetSpecies): string {
  if (species === "crystal") return "\u6676\u683c\u7378";
  if (species === "chicken") return "\u5c0f\u96de";
  if (species === "cat") return "\u5c0f\u8c93";
  if (species === "dog") return "\u5c0f\u72d7";
  return "\u96f7\u866b\u7378";
}

/** 新認養抽選：貓、狗＝已孵化；其餘先孵蛋，破殼後為該物種。 */
export function rollAdoptionProfile(): { species: PetSpecies; hatched: boolean } {
  const u = Math.random();
  if (u < 0.2) return { species: "cat", hatched: true };
  if (u < 0.4) return { species: "chicken", hatched: false };
  if (u < 0.58) return { species: "dog", hatched: true };
  if (u < 0.78) return { species: "volt", hatched: false };
  return { species: "crystal", hatched: false };
}

export function newAdoptionPetState(): PetState {
  const { species, hatched } = rollAdoptionProfile();
  const hunger = 88;
  const happy = 82;
  const clean = 90;
  const energy = 92;
  const careQualityEma = (hunger + happy + clean + energy) / 4;
  return {
    species,
    nickname: petDefaultName(species),
    hunger,
    happy,
    clean,
    energy,
    power: hatched ? 5 : 4,
    lastTs: Date.now(),
    hatched,
    virtAge: 0,
    ill: false,
    illDays: 0,
    totalIllVirtDays: 0,
    careQualityEma,
    pvpWins: 0,
    morphTier: 0,
    morphKey: null,
    lightsOn: true,
    starveHours: 0,
    alive: true,
  };
}

function pickMoodLine(seed: number, lines: readonly string[]): string {
  if (lines.length === 0) return "";
  const u = ((seed % 9973) + 9973) % 9973;
  return lines[u % lines.length]!;
}

export function moodLine(p: PetState): string {
  if (!p.alive) return "";
  if (!p.hatched) {
    const eggLines = [
      "\u8f15\u8f15\u52d5\u4e86\u4e00\u4e0b\u2026\u9084\u5728\u86cb\u88e1\uff0c\u591a\u966a\u6211\u3001\u9935\u9ede\u6eab\u6696\u5427\u3002",
      "\u86cb\u6bbc\u88e1\u807d\u5f97\u5230\u4f60\u7684\u8072\u97f3\uff0c\u597d\u5b89\u5fc3\u3002",
      "\u518d\u7b49\u4e00\u4e0b\u4e0b\u2026\u5feb\u8981\u8ddf\u4f60\u6253\u62db\u547c\u56c9\u3002",
    ];
    return pickMoodLine(
      Math.floor(p.virtAge * 31) + p.nickname.charCodeAt(0),
      eggLines,
    );
  }
  if (p.ill) {
    const illLines = [
      "\u597d\u4e0d\u8212\u670d\u2026\u5e36\u6211\u770b\u91ab\u751f\u597d\u55ce\uff1f",
      "\u54b3\u54b3\u2026\u4eca\u5929\u53ef\u4ee5\u5148\u6062\u606f\u55ce\uff1f",
      "\u8eab\u9ad4\u597d\u91cd\u2026\u8cbc\u8cbc\u6211\u4e00\u4e0b\u597d\u55ce\u3002",
    ];
    return pickMoodLine(
      p.nickname.charCodeAt(0) + Math.floor(p.illDays * 17),
      illLines,
    );
  }
  const avg = (p.hunger + p.happy + p.clean + p.energy) / 4;
  const stage = growthStage(p.virtAge);
  const seedBase =
    Math.floor(p.virtAge * 13) +
    p.nickname.charCodeAt(0) * 5 +
    Math.floor(avg * 7);

  if (p.morphTier >= 1 && p.morphKey === "doodoo") {
    const dLines = [
      "\u2026\u2026\u5473\u9053\u597d\u516b\u3002\u4f46\u6211\u9084\u662f\u60f3\u966a\u4f60\u3002",
      "\u9019\u6a23\u4e5f\u80fd\u5e6b\u6211\u5237\u5237\u7259\u55ce\uff1f",
      "\u6211\u8b8a\u6210\u9019\u6a23\u4e86\u2026\u4f60\u9084\u6703\u6478\u6478\u6211\u55ce\uff1f",
    ];
    return pickMoodLine(seedBase + 101, dLines);
  }

  if (p.hunger < 25) {
    const h = [
      "\u597d\u9913\u2026\u5feb\u9935\u6211\u5403\u7684\uff01",
      "\u98fd\u98df\u5ea6\u5feb\u898b\u5e95\u4e86\uff0c\u6551\u547d\u554a\u3002",
    ];
    return pickMoodLine(seedBase + 3, h);
  }
  if (p.clean < 25) {
    const c = [
      "\u8eab\u4e0a\u597d\u9ad2\uff0c\u60f3\u6d17\u6d17\u2026",
      "\u6709\u9ede\u81ed\u81ed\u7684\u2026\u6e05\u6f54\u4e00\u4e0b\u55ce\u3002",
    ];
    return pickMoodLine(seedBase + 4, c);
  }
  if (p.energy < 22) {
    const e = [
      "\u7d2f\u4e86\uff0c\u60f3\u4f11\u606f\u2026",
      "\u773c\u76ae\u597d\u91cd\u2026\u8eba\u4e00\u4e0b\u5c31\u597d\u3002",
    ];
    return pickMoodLine(seedBase + 5, e);
  }

  if (isLocalNightHour()) {
    const nightOn = [
      "\u665a\u4e0a\u5230\u4e86\uff0c\u8eab\u9ad4\u8a18\u61b6\u6703\u81ea\u52d5\u60f3\u7761\u4e00\u9ede\u2026",
      "\u5916\u9762\u597d\u5b89\u975c\uff0c\u661f\u661f\u5728\u770b\u6211\u5011\u55ce\uff1f",
      "\u591c\u8c93\u5b50\u6a21\u5f0f\uff1f\u9084\u662f\u4f60\u4e5f\u7761\u4e0d\u8457\uff1f",
    ];
    const nightOff = [
      "\u95dc\u71c8\u5f8c\u5fc3\u88e1\u597d\u5b89\u5b9a\uff0c\u8b93\u6211\u7761\u5427\u3002",
      "ZZZ\u2026\u8b8a\u6210\u591c\u884c\u6027\u683c\u4e86\u3002",
      "\u9ed1\u6697\u88e1\u6211\u6700\u653e\u9b06\u4e86\u3002",
    ];
    return pickMoodLine(
      seedBase + (p.lightsOn ? 0 : 404),
      p.lightsOn ? nightOn : nightOff,
    );
  }

  if (p.morphTier >= 1 && p.morphKey && p.morphKey !== "doodoo") {
    const mk = p.morphKey;
    if (
      mk === "cat_volt" ||
      mk === "dog_volt" ||
      mk === "cat_aqua" ||
      mk === "dog_aqua" ||
      mk === "cat_flora" ||
      mk === "dog_flora"
    ) {
      const eLines =
        mk.endsWith("volt") || mk === "striker"
          ? [
              "\u8eab\u9ad4\u88e1\u6709\u5c0f\u5c0f\u96fb\u6d41\u5728\u8dd1\uff01",
              "\u96f7\u96f2\u5473\u7684\u4e00\u5929\u958b\u59cb\u56c9\u3002",
            ]
          : mk.endsWith("aqua") || mk === "guardian"
            ? [
                "\u6e05\u723d\u7684\u611f\u89ba\uff0c\u60f3\u53bb\u73a9\u6c34\u3002",
                "\u6ce1\u6ce1\u5fc3\u60c5\uff0c\u6d17\u500b\u6fa1\u66f4\u8212\u670d\u3002",
              ]
            : mk.endsWith("flora") || mk === "harmony"
              ? [
                  "\u8349\u539f\u7684\u98a8\u5439\u904e\u8033\u908a\u3002",
                  "\u5fc3\u60c5\u8edf\u8edf\u7684\uff0c\u60f3\u66ec\u66ec\u592a\u967d\u3002",
                ]
              : [];
      if (eLines.length)
        return pickMoodLine(seedBase + mk.charCodeAt(2), eLines);
    }
  }

  if (stage === 0 && p.hunger < 40) {
    const b = [
      "\u9084\u597d\u5c0f\uff0c\u8981\u591a\u9935\u4e00\u9ede\u9ede\uff5e",
      "\u809a\u5b50\u5495\u5695\u53eb\uff0c\u6211\u9084\u5728\u9577\u5927\u5462\u3002",
    ];
    return pickMoodLine(seedBase, b);
  }
  if (stage >= 4 && avg >= 55) {
    const s = [
      "\u966a\u4f60\u9019\u9ebd\u4e45\u4e86\uff0c\u6bcf\u5929\u90fd\u5f88\u73cd\u8cb4\u3002",
      "\u8001\u670b\u53cb\u4e86\uff0c\u8b1d\u8b1d\u4f60\u4e00\u8def\u7167\u9867\u6211\u3002",
    ];
    return pickMoodLine(seedBase + 2, s);
  }
  if (avg >= 72) {
    const hi = [
      "\u5fc3\u60c5\u8d85\u597d\uff01\u4e00\u8d77\u73a9\u5427\uff01",
      "\u4eca\u5929\u4e5f\u662f\u5143\u6c23\u6eff\u6eff\u7684\u4e00\u5929\uff01",
      "\u559c\u6b61\u559c\u6b61\u559c\u6b61\u4f60\uff01",
    ];
    return pickMoodLine(seedBase + 6, hi);
  }
  if (avg >= 48) {
    const mid = [
      "\u9084\u4e0d\u932f\uff0c\u966a\u6211\u7df4\u7df4\u5427\u3002",
      "\u5e73\u5e73\u9806\u9806\u7684\uff0c\u9019\u6a23\u633a\u597d\u3002",
      "\u6709\u4f60\u5728\u5c31\u5b89\u5fc3\u591a\u4e86\u3002",
    ];
    return pickMoodLine(seedBase + 7, mid);
  }
  const low = [
    "\u6709\u9ede\u6c92\u52c1\u2026\u966a\u6211\u4e00\u4e0b\u597d\u55ce\uff1f",
    "\u4eca\u5929\u60f3\u8981\u591a\u4e00\u9ede\u9ede\u95dc\u6ce8\u3002",
    "\u6478\u6478\u6211\u7684\u982d\u597d\u55ce\uff1f",
  ];
  return pickMoodLine(seedBase + 8, low);
}

export function feed(p: PetState): PetState {
  if (!p.alive) return p;
  const bonus = p.ill ? 4 : 6;
  let next: PetState = {
    ...p,
    hunger: clamp(p.hunger + 28, 0, 100),
    happy: clamp(p.happy + bonus, 0, 100),
    clean: clamp(p.clean - 4, 0, 100),
  };
  if (!next.hatched) {
    next = { ...next, virtAge: clamp(next.virtAge + 0.11, 0, 999) };
  }
  return saveAndReturn(tryHatchEgg(next));
}

export function cleanPet(p: PetState): PetState {
  if (!p.alive) return p;
  let next: PetState = {
    ...p,
    clean: clamp(p.clean + 35, 0, 100),
    happy: clamp(p.happy + 8, 0, 100),
  };
  if (!next.hatched) {
    next = { ...next, virtAge: clamp(next.virtAge + 0.045, 0, 999) };
  }
  return saveAndReturn(tryHatchEgg(next));
}

export function trainPet(p: PetState): PetState {
  if (!p.alive) return p;
  if (!p.hatched) return { ...p };
  const need = p.ill ? 24 : 18;
  if (p.energy < need) return { ...p };
  return saveAndReturn({
    ...p,
    energy: clamp(p.energy - 18, 0, 100),
    power: clamp(p.power + 4, 0, 100),
    happy: clamp(p.happy + 5, 0, 100),
    hunger: clamp(p.hunger - 6, 0, 100),
    clean: clamp(p.clean - 5, 0, 100),
  });
}

export function restPet(p: PetState): PetState {
  if (!p.alive) return p;
  /** 已破殼且體力已滿時不必再休息，避免狂點反而一直扣飽食度。 */
  if (p.hatched && p.energy >= 100) return p;
  const gain = p.ill ? 22 : 32;
  let next: PetState = {
    ...p,
    energy: clamp(p.energy + gain, 0, 100),
    happy: clamp(p.happy + 4, 0, 100),
    hunger: clamp(p.hunger - 8, 0, 100),
  };
  if (!next.hatched) {
    next = { ...next, virtAge: clamp(next.virtAge + 0.04, 0, 999) };
  }
  return saveAndReturn(tryHatchEgg(next));
}

/** Vet visit: clears illness and lifts mood. */
export function treatPet(p: PetState): PetState {
  if (!p.alive) return p;
  if (!p.ill) return p;
  return savePet(
    tryEvolve({
      ...p,
      ill: false,
      illDays: 0,
      happy: clamp(p.happy + 22, 0, 100),
      energy: clamp(p.energy + 8, 0, 100),
    }),
  );
}

/** 重新認養：隨機物種（貓直接入欄，其餘從蛋開始）。 */
export function resetNewPet(): PetState {
  return savePet(newAdoptionPetState());
}

function saveAndReturn(p: PetState): PetState {
  return savePet(tryEvolve(p));
}

export function renamePet(p: PetState, nickname: string): PetState {
  if (!p.alive) return p;
  const n = nickname.trim().slice(0, 12);
  if (!n) return { ...p };
  return savePet(tryEvolve({ ...p, nickname: n }));
}

export function memorialLine(cause: DeathCause | undefined): string {
  if (cause === "neglect")
    return "\u9577\u6642\u9593\u7f3a\u4e4f\u7167\u9867\uff0c\u8eab\u9ad4\u7121\u6cd5\u627f\u53d7\u2026";
  if (cause === "illness")
    return "\u75c5\u60c5\u52a0\u5287\uff0c\u5df2\u7d93\u5230\u4e86\u8eab\u908a\u6975\u9650\u3002";
  return "\u5e74\u9f61\u5230\u4e86\uff0c\u5728\u5be2\u975c\u4e2d\u5b89\u7965\u5730\u96e2\u958b\u4e86\u3002";
}
