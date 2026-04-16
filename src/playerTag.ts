/**
 * 匿名連線用的「對戰代號」與本機「好友備忘」（localStorage）。
 * 非帳號系統：無法保證代號全域唯一，僅供約戰辨識與備忘。
 */

/** v2：四位數字代號（與舊版英數代號分開儲存，避免格式混用）。 */
const TAG_STORAGE = "pocketPet_playerTag_v2";
const FRIENDS_STORAGE = "pocketPet_friends_v1";

export type FriendBookmark = {
  /** 對方的對戰代號（四位數字） */
  tag: string;
  /** 你為對方取的顯示名 */
  label: string;
};

/** 只保留數字，最多四位（供輸入正規化）。 */
export function normalizePlayerTag(raw: string): string {
  return String(raw || "")
    .replace(/\D/g, "")
    .slice(0, 4);
}

export function isValidPlayerTag(tag: string): boolean {
  return /^\d{4}$/.test(normalizePlayerTag(tag));
}

function randomTag4Digits(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

/** 讀取或建立本機對戰代號（四位數字，0000～9999）。 */
export function getOrCreatePlayerTag(): string {
  try {
    const prev = localStorage.getItem(TAG_STORAGE);
    if (prev && isValidPlayerTag(prev)) return normalizePlayerTag(prev);
  } catch {
    /* ignore */
  }
  const tag = randomTag4Digits();
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
      const tag = normalizePlayerTag(String((row as FriendBookmark).tag || ""));
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
