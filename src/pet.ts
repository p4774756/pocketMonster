export type PetSpecies = "volt" | "crystal";

export interface PetState {
  species: PetSpecies;
  nickname: string;
  hunger: number;
  happy: number;
  clean: number;
  energy: number;
  power: number;
  lastTs: number;
}

const STORAGE_KEY = "pocketPet_pet_v1";

const DEFAULT: PetState = {
  species: "volt",
  nickname: "\u96f7\u866b\u7378",
  hunger: 82,
  happy: 78,
  clean: 80,
  energy: 88,
  power: 12,
  lastTs: Date.now(),
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function mergeDefaults(raw: Partial<PetState>): PetState {
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
  };
}

/** Idle decay from lastTs; lastTs updated to now in result. */
export function applyOfflineDecay(p: PetState): PetState {
  const now = Date.now();
  const hours = Math.max(0, (now - p.lastTs) / 3_600_000);
  if (hours < 1 / 60) {
    return { ...p, lastTs: now };
  }
  let { hunger, happy, clean, energy } = p;
  hunger = clamp(hunger - hours * 7, 0, 100);
  clean = clamp(clean - hours * 4, 0, 100);
  const hungryPenalty = hunger < 38 ? hours * 6 : hours * 2.5;
  happy = clamp(happy - hungryPenalty, 0, 100);
  energy = clamp(energy - hours * 1.8, 0, 100);
  return { ...p, hunger, happy, clean, energy, lastTs: now };
}

export function loadPet(): PetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const p = { ...DEFAULT, lastTs: Date.now() };
      return savePet(p);
    }
    const parsed = JSON.parse(raw) as Partial<PetState>;
    let p = mergeDefaults(parsed);
    p = applyOfflineDecay(p);
    return savePet(p);
  } catch {
    const p = { ...DEFAULT, lastTs: Date.now() };
    return savePet(p);
  }
}

export function savePet(p: PetState): PetState {
  const next = { ...p, lastTs: Date.now() };
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
  const avg = (p.hunger + p.happy + p.clean + p.energy) / 4;
  if (p.hunger < 25)
    return "\u597d\u9913\u2026\u5feb\u9935\u6211\u5403\u7684\uff01";
  if (p.clean < 25) return "\u8eab\u4e0a\u597d\u9ad2\uff0c\u60f3\u6d17\u6d17\u2026";
  if (p.energy < 22) return "\u7d2f\u4e86\uff0c\u60f3\u4f11\u606f\u2026";
  if (avg >= 72) return "\u5fc3\u60c5\u8d85\u597d\uff01\u4e00\u8d77\u73a9\u5427\uff01";
  if (avg >= 48) return "\u9084\u4e0d\u932f\uff0c\u966a\u6211\u7df4\u7df4\u5427\u3002";
  return "\u6709\u9ede\u6c92\u52c1\u2026\u966a\u6211\u4e00\u4e0b\u597d\u55ce\uff1f";
}

export function feed(p: PetState): PetState {
  return saveAndReturn({
    ...p,
    hunger: clamp(p.hunger + 28, 0, 100),
    happy: clamp(p.happy + 6, 0, 100),
    clean: clamp(p.clean - 4, 0, 100),
  });
}

export function cleanPet(p: PetState): PetState {
  return saveAndReturn({
    ...p,
    clean: clamp(p.clean + 35, 0, 100),
    happy: clamp(p.happy + 8, 0, 100),
  });
}

export function trainPet(p: PetState): PetState {
  if (p.energy < 18) return { ...p };
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
  return saveAndReturn({
    ...p,
    energy: clamp(p.energy + 32, 0, 100),
    happy: clamp(p.happy + 4, 0, 100),
    hunger: clamp(p.hunger - 8, 0, 100),
  });
}

function saveAndReturn(p: PetState): PetState {
  return savePet(p);
}

export function renamePet(p: PetState, nickname: string): PetState {
  const n = nickname.trim().slice(0, 12);
  if (!n) return { ...p };
  return savePet({ ...p, nickname: n });
}
