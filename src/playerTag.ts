/**
 * 匿名連線用的「對戰代號」與本機「好友備忘」（localStorage）。
 * 非帳號系統：無法保證代號全域唯一，僅供約戰辨識與備忘。
 */

const TAG_STORAGE = "pocketPet_playerTag_v1";
const FRIENDS_STORAGE = "pocketPet_friends_v1";

const TAG_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type FriendBookmark = {
  /** 對方的對戰代號（大寫英數） */
  tag: string;
  /** 你為對方取的顯示名 */
  label: string;
};

function randomTag8(): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += TAG_CHARS[Math.floor(Math.random() * TAG_CHARS.length)];
  }
  return s;
}

/** 正規化並檢查是否為允許字元（不含易混淆 I、O、0、1、L）。 */
export function normalizePlayerTag(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "");
}

export function isValidPlayerTag(tag: string): boolean {
  const t = normalizePlayerTag(tag);
  return t.length >= 4 && t.length <= 10;
}

/** 讀取或建立本機對戰代號（8 字）。 */
export function getOrCreatePlayerTag(): string {
  try {
    const prev = localStorage.getItem(TAG_STORAGE);
    if (prev && isValidPlayerTag(prev) && normalizePlayerTag(prev).length === 8) {
      return normalizePlayerTag(prev);
    }
  } catch {
    /* ignore */
  }
  const tag = randomTag8();
  try {
    localStorage.setItem(TAG_STORAGE, tag);
  } catch {
    /* ignore */
  }
  return tag;
}

export function loadFriendBookmarks(): FriendBookmark[] {
  try {
    const raw = localStorage.getItem(FRIENDS_STORAGE);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: FriendBookmark[] = [];
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const tag = normalizePlayerTag(
        String((row as FriendBookmark).tag || ""),
      );
      const label = String((row as FriendBookmark).label || "")
        .trim()
        .slice(0, 12);
      if (!isValidPlayerTag(tag) || !label) continue;
      out.push({ tag, label });
    }
    return dedupeFriends(out);
  } catch {
    return [];
  }
}

function dedupeFriends(list: FriendBookmark[]): FriendBookmark[] {
  const seen = new Set<string>();
  const out: FriendBookmark[] = [];
  for (const f of list) {
    if (seen.has(f.tag)) continue;
    seen.add(f.tag);
    out.push(f);
  }
  return out;
}

function saveFriendBookmarks(list: FriendBookmark[]): void {
  try {
    localStorage.setItem(FRIENDS_STORAGE, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function friendTagSet(): Set<string> {
  return new Set(loadFriendBookmarks().map((f) => f.tag));
}

export function isFriendTag(tag: string): boolean {
  const t = normalizePlayerTag(tag);
  return friendTagSet().has(t);
}

export function addFriendBookmark(tag: string, label: string): string | null {
  const t = normalizePlayerTag(tag);
  if (!isValidPlayerTag(t)) return "invalid";
  const lab = label.trim().slice(0, 12);
  if (!lab) return "empty";
  const list = loadFriendBookmarks();
  if (list.some((f) => f.tag === t)) return "dup";
  list.push({ tag: t, label: lab });
  saveFriendBookmarks(list);
  return null;
}

export function removeFriendBookmark(tag: string): void {
  const t = normalizePlayerTag(tag);
  saveFriendBookmarks(loadFriendBookmarks().filter((f) => f.tag !== t));
}
