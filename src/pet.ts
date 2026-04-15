export type PetSpecies = "volt" | "crystal" | "chicken" | "cat" | "dog";

export type DeathCause = "old" | "neglect" | "illness";

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
  starveHours: 0,
  alive: true,
};

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

export function carePoseFile(species: PetSpecies, pose: CarePose): string {
  const suf =
    pose === "eat"
      ? "eat"
      : pose === "train"
        ? "train"
        : pose === "rest"
          ? "rest"
          : "clean";
  if (species === "cat") return `cat-${suf}.png`;
  if (species === "chicken") return `chicken-${suf}.png`;
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
  return {
    species: parseSpecies(raw.species),
    nickname:
      typeof raw.nickname === "string" && raw.nickname.trim().length > 0
        ? raw.nickname.trim().slice(0, 12)
        : DEFAULT.nickname,
    hunger: clamp(Number(raw.hunger) || DEFAULT.hunger, 0, 100),
    happy: clamp(Number(raw.happy) || DEFAULT.happy, 0, 100),
    clean: clamp(Number(raw.clean) || DEFAULT.clean, 0, 100),
    energy: clamp(Number(raw.energy) || DEFAULT.energy, 0, 100),
    power: clamp(Number(raw.power) || DEFAULT.power, 0, 100),
    lastTs: Number(raw.lastTs) || Date.now(),
    hatched,
    virtAge,
    ill: alive && Boolean(raw.ill),
    illDays: alive ? clamp(Number(raw.illDays) || 0, 0, 999) : 0,
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
  return idleSpriteForSpeciesStage(p.species, growthStage(p.virtAge));
}

export function growthLabelForPet(p: PetState): string {
  if (p.alive && !p.hatched) return "\u536f\u5316\u4e2d";
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

  const illMul = ill ? 1.38 : 1;
  const eggDecay = egg ? 0.42 : 1;
  const decay = illMul * eggDecay;
  hunger = clamp(hunger - hours * 7 * decay, 0, 100);
  clean = clamp(clean - hours * 4 * decay, 0, 100);
  const hungryPenalty = hunger < 38 ? hours * 6 * decay : hours * 2.5 * decay;
  happy = clamp(happy - hungryPenalty, 0, 100);
  energy = clamp(energy - hours * 1.85 * decay, 0, 100);

  if (!ill && !egg && hunger < 34 && clean < 38 && happy < 48) {
    const stress = Math.min(1, hours / 8);
    if (Math.random() < stress * 0.22) {
      ill = true;
    }
  }

  if (egg) {
    ill = false;
    illDays = 0;
    starveHours = 0;
  } else if (ill) {
    illDays += dAge;
  } else {
    illDays = 0;
  }

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
    starveHours,
    hunger,
    happy,
    clean,
    energy,
    lastTs: now,
  };
  live = tryHatchEgg(live);
  if (!live.hatched) {
    return savePet(live);
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

  return savePet(live);
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
  return {
    species,
    nickname: petDefaultName(species),
    hunger: 88,
    happy: 82,
    clean: 90,
    energy: 92,
    power: hatched ? 5 : 4,
    lastTs: Date.now(),
    hatched,
    virtAge: 0,
    ill: false,
    illDays: 0,
    starveHours: 0,
    alive: true,
  };
}

export function moodLine(p: PetState): string {
  if (!p.alive) return "";
  if (!p.hatched)
    return "\u8f15\u8f15\u52d5\u4e86\u4e00\u4e0b\u2026\u9084\u5728\u86cb\u88e1\uff0c\u591a\u966a\u6211\u3001\u9935\u9ede\u6eab\u6696\u5427\u3002";
  if (p.ill) return "\u597d\u4e0d\u8212\u670d\u2026\u5e36\u6211\u770b\u91ab\u751f\u597d\u55ce\uff1f";
  const avg = (p.hunger + p.happy + p.clean + p.energy) / 4;
  const stage = growthStage(p.virtAge);
  if (stage === 0 && p.hunger < 40)
    return "\u9084\u597d\u5c0f\uff0c\u8981\u591a\u9935\u4e00\u9ede\u9ede\uff5e";
  if (stage >= 4 && avg >= 55)
    return "\u966a\u4f60\u9019\u9ebd\u4e45\u4e86\uff0c\u6bcf\u5929\u90fd\u5f88\u73cd\u8cb4\u3002";
  if (p.hunger < 25)
    return "\u597d\u9913\u2026\u5feb\u9935\u6211\u5403\u7684\uff01";
  if (p.clean < 25) return "\u8eab\u4e0a\u597d\u9ad2\uff0c\u60f3\u6d17\u6d17\u2026";
  if (p.energy < 22) return "\u7d2f\u4e86\uff0c\u60f3\u4f11\u606f\u2026";
  if (avg >= 72) return "\u5fc3\u60c5\u8d85\u597d\uff01\u4e00\u8d77\u73a9\u5427\uff01";
  if (avg >= 48) return "\u9084\u4e0d\u932f\uff0c\u966a\u6211\u7df4\u7df4\u5427\u3002";
  return "\u6709\u9ede\u6c92\u52c1\u2026\u966a\u6211\u4e00\u4e0b\u597d\u55ce\uff1f";
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
  return savePet({
    ...p,
    ill: false,
    illDays: 0,
    happy: clamp(p.happy + 22, 0, 100),
    energy: clamp(p.energy + 8, 0, 100),
  });
}

/** 重新認養：隨機物種（貓直接入欄，其餘從蛋開始）。 */
export function resetNewPet(): PetState {
  return savePet(newAdoptionPetState());
}

function saveAndReturn(p: PetState): PetState {
  return savePet(p);
}

export function renamePet(p: PetState, nickname: string): PetState {
  if (!p.alive) return p;
  const n = nickname.trim().slice(0, 12);
  if (!n) return { ...p };
  return savePet({ ...p, nickname: n });
}

export function memorialLine(cause: DeathCause | undefined): string {
  if (cause === "neglect")
    return "\u9577\u6642\u9593\u7f3a\u4e4f\u7167\u9867\uff0c\u8eab\u9ad4\u7121\u6cd5\u627f\u53d7\u2026";
  if (cause === "illness")
    return "\u75c5\u60c5\u52a0\u5287\uff0c\u5df2\u7d93\u5230\u4e86\u8eab\u908a\u6975\u9650\u3002";
  return "\u5e74\u9f61\u5230\u4e86\uff0c\u5728\u5be2\u975c\u4e2d\u5b89\u7965\u5730\u96e2\u958b\u4e86\u3002";
}
