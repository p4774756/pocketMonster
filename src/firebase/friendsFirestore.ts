import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";

/** \u8207\u597d\u53cb\u804a\u5929\u55ae\u5247\u5b57\u6578\u4e0a\u9650\uff08\u8207\u898f\u5247\u4e00\u81f4\uff09\u3002 */
export const FRIEND_CHAT_MAX_LEN = 500;

export type IncomingRequestRow = {
  id: string;
  fromUid: string;
  fromDisplayName: string;
};

export type OutgoingRequestRow = { id: string; toUid: string };

export type FriendListRow = {
  pairId: string;
  otherUid: string;
  label: string;
};

function mapIncomingSnap(
  snap: QuerySnapshot,
): IncomingRequestRow[] {
  const rows: IncomingRequestRow[] = [];
  snap.forEach((d) => {
    const x = d.data();
    rows.push({
      id: d.id,
      fromUid: String(x.fromUid),
      fromDisplayName: String(x.fromDisplayName || ""),
    });
  });
  return rows;
}

function mapOutgoingSnap(snap: QuerySnapshot): OutgoingRequestRow[] {
  const rows: OutgoingRequestRow[] = [];
  snap.forEach((d) => {
    const x = d.data();
    rows.push({ id: d.id, toUid: String(x.toUid) });
  });
  return rows;
}

function mapFriendsSnap(snap: QuerySnapshot, uid: string): FriendListRow[] {
  const rows: FriendListRow[] = [];
  snap.forEach((d) => {
    const m = d.data().members as string[] | undefined;
    const nick = d.data().nicknames as Record<string, string> | undefined;
    if (!Array.isArray(m)) return;
    const other = m.find((x) => x !== uid) || "";
    const label =
      (other && nick?.[other]) || other.slice(0, 8) || "\u53cb\u4eba";
    rows.push({ pairId: d.id, otherUid: other, label });
  });
  return rows;
}

/** 好友代碼字元集（大寫英數，略過易混淆的 0/O/1/I）。 */
const FRIEND_CODE_ALPH =
  "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 新產生的好友代碼長度（既有 8 碼仍可由 `resolveUidFromFriendCode` 查詢）。 */
const FRIEND_CODE_LEN = 4;

export type UserProfileDoc = {
  displayName: string;
  friendCode: string;
};

export function pairFriendDocId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

export async function ensureUserProfile(
  db: Firestore,
  uid: string,
  displayName: string,
): Promise<UserProfileDoc> {
  const pref = doc(db, "profiles", uid);
  const snap = await getDoc(pref);
  if (snap.exists()) {
    const d = snap.data();
    return {
      displayName: String(d.displayName || displayName).slice(0, 32),
      friendCode: String(d.friendCode || ""),
    };
  }
  const safeName = displayName.trim().slice(0, 32) || "\u73a9\u5bb6";
  for (let attempt = 0; attempt < 48; attempt++) {
    let code = "";
    for (let i = 0; i < FRIEND_CODE_LEN; i++) {
      code += FRIEND_CODE_ALPH[
        Math.floor(Math.random() * FRIEND_CODE_ALPH.length)
      ]!;
    }
    try {
      await runTransaction(db, async (transaction) => {
        const cref = doc(db, "friend_codes", code);
        const cSnap = await transaction.get(cref);
        if (cSnap.exists()) throw new Error("collision");
        transaction.set(cref, { uid });
        transaction.set(pref, {
          displayName: safeName,
          friendCode: code,
          updatedAt: serverTimestamp(),
        });
      });
      return { displayName: safeName, friendCode: code };
    } catch {
      /* retry new code */
    }
  }
  throw new Error("friend_code_exhausted");
}

export async function updateProfileDisplayName(
  db: Firestore,
  uid: string,
  name: string,
): Promise<void> {
  const pref = doc(db, "profiles", uid);
  await updateDoc(pref, {
    displayName: name.trim().slice(0, 32),
    updatedAt: serverTimestamp(),
  });
}

export async function resolveUidFromFriendCode(
  db: Firestore,
  rawCode: string,
): Promise<string> {
  const code = rawCode.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (code.length < FRIEND_CODE_LEN) throw new Error("code_short");
  const cref = doc(db, "friend_codes", code);
  const snap = await getDoc(cref);
  if (!snap.exists()) throw new Error("code_unknown");
  const uid = String(snap.data()?.uid || "");
  if (!uid) throw new Error("code_unknown");
  return uid;
}

export async function sendFriendRequest(
  db: Firestore,
  fromUid: string,
  toUid: string,
  fromDisplayName: string,
): Promise<void> {
  if (fromUid === toUid) throw new Error("self");
  const pair = pairFriendDocId(fromUid, toUid);
  const fSnap = await getDoc(doc(db, "friends", pair));
  if (fSnap.exists()) throw new Error("already_friends");
  const dupA = query(
    collection(db, "friend_requests"),
    where("fromUid", "==", fromUid),
    where("toUid", "==", toUid),
    where("status", "==", "pending"),
  );
  if (!(await getDocs(dupA)).empty) throw new Error("dup_pending");
  const dupB = query(
    collection(db, "friend_requests"),
    where("fromUid", "==", toUid),
    where("toUid", "==", fromUid),
    where("status", "==", "pending"),
  );
  if (!(await getDocs(dupB)).empty) throw new Error("reverse_pending");
  await addDoc(collection(db, "friend_requests"), {
    fromUid,
    toUid,
    fromDisplayName: fromDisplayName.trim().slice(0, 32),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function acceptFriendRequest(
  db: Firestore,
  requestId: string,
  toUid: string,
  toDisplayName: string,
): Promise<void> {
  const reqRef = doc(db, "friend_requests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error("missing");
  const d = reqSnap.data();
  if (d.toUid !== toUid) throw new Error("forbidden");
  if (d.status !== "pending") throw new Error("not_pending");
  const fromUid = String(d.fromUid);
  const pair = pairFriendDocId(fromUid, toUid);
  const fromName = String(d.fromDisplayName || "");
  const batch = writeBatch(db);
  batch.delete(reqRef);
  const sorted = [fromUid, toUid].sort();
  batch.set(doc(db, "friends", pair), {
    members: sorted,
    nicknames: {
      [fromUid]: fromName,
      [toUid]: toDisplayName.trim().slice(0, 32),
    },
    since: serverTimestamp(),
  });
  await batch.commit();
}

export async function rejectFriendRequest(
  db: Firestore,
  requestId: string,
  uid: string,
): Promise<void> {
  const reqRef = doc(db, "friend_requests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;
  const d = reqSnap.data();
  if (d.toUid !== uid) throw new Error("forbidden");
  await deleteDoc(reqRef);
}

export async function cancelOutgoingRequest(
  db: Firestore,
  requestId: string,
  fromUid: string,
): Promise<void> {
  const reqRef = doc(db, "friend_requests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;
  const d = reqSnap.data();
  if (d.fromUid !== fromUid) throw new Error("forbidden");
  await deleteDoc(reqRef);
}

export async function removeFriendship(
  db: Firestore,
  pairId: string,
  myUid: string,
): Promise<void> {
  const fref = doc(db, "friends", pairId);
  const snap = await getDoc(fref);
  if (!snap.exists()) return;
  const members = snap.data().members as string[] | undefined;
  if (!Array.isArray(members) || !members.includes(myUid)) {
    throw new Error("forbidden");
  }
  await deleteDoc(fref);
}

export async function fetchIncomingRequestRows(
  db: Firestore,
  toUid: string,
): Promise<IncomingRequestRow[]> {
  const q = query(
    collection(db, "friend_requests"),
    where("toUid", "==", toUid),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  return mapIncomingSnap(snap);
}

export async function fetchOutgoingRequestRows(
  db: Firestore,
  fromUid: string,
): Promise<OutgoingRequestRow[]> {
  const q = query(
    collection(db, "friend_requests"),
    where("fromUid", "==", fromUid),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  return mapOutgoingSnap(snap);
}

export async function fetchFriendListRows(
  db: Firestore,
  uid: string,
): Promise<FriendListRow[]> {
  const q = query(
    collection(db, "friends"),
    where("members", "array-contains", uid),
  );
  const snap = await getDocs(q);
  return mapFriendsSnap(snap, uid);
}

export function subscribeIncomingRequests(
  db: Firestore,
  toUid: string,
  onRows: (rows: IncomingRequestRow[]) => void,
  onListenError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "friend_requests"),
    where("toUid", "==", toUid),
    where("status", "==", "pending"),
  );
  return onSnapshot(
    q,
    (snap) => onRows(mapIncomingSnap(snap)),
    (e) => {
      if (import.meta.env.DEV) console.error("[friend_requests incoming listen]", e);
      onListenError?.(e);
      onRows([]);
    },
  );
}

export function subscribeOutgoingRequests(
  db: Firestore,
  fromUid: string,
  onRows: (rows: OutgoingRequestRow[]) => void,
  onListenError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "friend_requests"),
    where("fromUid", "==", fromUid),
    where("status", "==", "pending"),
  );
  return onSnapshot(
    q,
    (snap) => onRows(mapOutgoingSnap(snap)),
    (e) => {
      if (import.meta.env.DEV) console.error("[friend_requests outgoing listen]", e);
      onListenError?.(e);
      onRows([]);
    },
  );
}

export function subscribeFriends(
  db: Firestore,
  uid: string,
  onRows: (rows: FriendListRow[]) => void,
  onListenError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "friends"),
    where("members", "array-contains", uid),
  );
  return onSnapshot(
    q,
    (snap) => onRows(mapFriendsSnap(snap, uid)),
    (e) => {
      if (import.meta.env.DEV) console.error("[friends listen]", e);
      onListenError?.(e);
      onRows([]);
    },
  );
}

export type FriendChatMessageRow = {
  id: string;
  fromUid: string;
  text: string;
  createdAtMs: number;
};

export async function sendFriendChatMessage(
  db: Firestore,
  pairId: string,
  fromUid: string,
  text: string,
): Promise<void> {
  const t = text.trim().slice(0, FRIEND_CHAT_MAX_LEN);
  if (!t) throw new Error("empty");
  const pairRef = doc(db, "friends", pairId);
  const pairSnap = await getDoc(pairRef);
  if (!pairSnap.exists()) throw new Error("pair_missing");
  const rawMembers = pairSnap.data()?.members;
  if (!Array.isArray(rawMembers) || rawMembers.length !== 2)
    throw new Error("pair_invalid");
  const memberUids = [String(rawMembers[0]), String(rawMembers[1])];
  if (!memberUids.includes(fromUid)) throw new Error("not_member");
  await addDoc(collection(db, "friends", pairId, "messages"), {
    fromUid,
    text: t,
    memberUids,
    createdAt: serverTimestamp(),
  });
}

/**
 * 以 `memberUids array-contains` 過濾，避免子集合內混有舊版（無 memberUids）訊息時，
 * 整段 `orderBy(createdAt)` 查詢因規則無法通過而 permission-denied。
 * 需複合索引：memberUids (Contains) + createdAt —— 見 `docs/firebase-friends.indexes.json`。
 */
export function subscribeFriendChatMessages(
  db: Firestore,
  pairId: string,
  viewerUid: string,
  onRows: (rows: FriendChatMessageRow[]) => void,
  onListenError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "friends", pairId, "messages"),
    where("memberUids", "array-contains", viewerUid),
    orderBy("createdAt", "asc"),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows: FriendChatMessageRow[] = [];
      snap.forEach((d) => {
        const x = d.data();
        const ts = x.createdAt as { toMillis?: () => number } | undefined;
        const ms =
          ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
        rows.push({
          id: d.id,
          fromUid: String(x.fromUid || ""),
          text: String(x.text || ""),
          createdAtMs: ms,
        });
      });
      onRows(rows);
    },
    (e) => {
      if (import.meta.env.DEV) console.error("[friend chat listen]", e);
      onListenError?.(e);
      onRows([]);
    },
  );
}
