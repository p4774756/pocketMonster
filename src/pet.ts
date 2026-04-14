export type PetSpecies = "volt" | "crystal";

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

const DEFAULT: PetState = {
  species: "volt",
  nickname: "\u96f7\u866b\u7378",
  hunger: 82,
  happy: 78,
  clean: 80,
  energy: 88,
  power: 12,
  lastTs: Date.now(),
  virtAge: 22,
  ill: false,
  illDays: 0,
  starveHours: 0,
  alive: true,
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
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
  return {
    species: raw.species === "crystal" ? "crystal" : "volt",
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

/**
 * Idle art per stage (`public/pets/pet-idle-s0.png` … `s4`).
 * Replace files with your own pixel art; placeholders ship as copies of the base idle.
 */
export function idleSpriteForStage(stage: 0 | 1 | 2 | 3 | 4): string {
  return `pet-idle-s${stage}.png`;
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
  const dAge = hours / HOURS_PER_VIRT_DAY;
  virtAge += dAge;

  const illMul = ill ? 1.38 : 1;
  hunger = clamp(hunger - hours * 7 * illMul, 0, 100);
  clean = clamp(clean - hours * 4 * illMul, 0, 100);
  const hungryPenalty = hunger < 38 ? hours * 6 * illMul : hours * 2.5 * illMul;
  happy = clamp(happy - hungryPenalty, 0, 100);
  energy = clamp(energy - hours * 1.85 * illMul, 0, 100);

  if (!ill && hunger < 34 && clean < 38 && happy < 48) {
    const stress = Math.min(1, hours / 8);
    if (Math.random() < stress * 0.22) {
      ill = true;
    }
  }

  if (ill) {
    illDays += dAge;
  } else {
    illDays = 0;
  }

  if (hunger < STARVE_HUNGER) {
    starveHours += hours;
  } else {
    starveHours = Math.max(0, starveHours - hours * 0.35);
  }

  const live: PetState = {
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

  if (virtAge >= OLD_AGE_DEATH) {
    return savePet(finalizeDeath(live, "old", now, virtAge));
  }
  if (starveHours >= STARVE_DEATH_HOURS) {
    return savePet(finalizeDeath(live, "neglect", now, virtAge));
  }
  if (
    ill &&
    virtAge >= FRAIL_AGE &&
    illDays > 9 &&
    hunger < 24 &&
    Math.random() < dAge * 0.12
  ) {
    return savePet(finalizeDeath(live, "illness", now, virtAge));
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
      const p = { ...DEFAULT, virtAge: 0, lastTs: Date.now() };
      return savePet(p);
    }
    const parsed = JSON.parse(raw) as Partial<PetState>;
    let p = mergeDefaults(parsed);
    if (!p.alive) return p;
    p = applyOfflineDecay(p);
    return p;
  } catch {
    const p = { ...DEFAULT, virtAge: 0, lastTs: Date.now() };
    return savePet(p);
  }
}

export function savePet(p: PetState): PetState {
  const next = p.alive ? { ...p, lastTs: Date.now() } : { ...p };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function petEmoji(species: PetSpecies): string {
  return species === "crystal" ? "\ud83d\udc8e" : "\u26a1";
}

export function petDefaultName(species: PetSpecies): string {
  return species === "crystal" ? "\u6676\u683c\u7378" : "\u96f7\u866b\u7378";
}

export function moodLine(p: PetState): string {
  if (!p.alive) return "";
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
  return saveAndReturn({
    ...p,
    hunger: clamp(p.hunger + 28, 0, 100),
    happy: clamp(p.happy + bonus, 0, 100),
    clean: clamp(p.clean - 4, 0, 100),
  });
}

export function cleanPet(p: PetState): PetState {
  if (!p.alive) return p;
  return saveAndReturn({
    ...p,
    clean: clamp(p.clean + 35, 0, 100),
    happy: clamp(p.happy + 8, 0, 100),
  });
}

export function trainPet(p: PetState): PetState {
  if (!p.alive) return p;
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
  const gain = p.ill ? 22 : 32;
  return saveAndReturn({
    ...p,
    energy: clamp(p.energy + gain, 0, 100),
    happy: clamp(p.happy + 4, 0, 100),
    hunger: clamp(p.hunger - 8, 0, 100),
  });
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

/** New egg after memorial (species kept for continuity). */
export function resetNewPet(species: PetSpecies): PetState {
  const p: PetState = {
    species,
    nickname: petDefaultName(species),
    hunger: 76,
    happy: 80,
    clean: 82,
    energy: 88,
    power: 6,
    lastTs: Date.now(),
    virtAge: 0,
    ill: false,
    illDays: 0,
    starveHours: 0,
    alive: true,
  };
  return savePet(p);
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
