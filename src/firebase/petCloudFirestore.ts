import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

/** 與 `docs/firebase-friends.rules` 內 `cloud_pet_saves` 一致。 */
export const CLOUD_PET_SAVES = "cloud_pet_saves";

function readUpdatedAtFromDoc(data: Record<string, unknown>): Date | null {
  const rawTs = data.updatedAt;
  if (
    rawTs &&
    typeof rawTs === "object" &&
    "toDate" in rawTs &&
    typeof (rawTs as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (rawTs as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

/** 僅讀取備份時間（不載入 payload），供確認視窗顯示。文件不存在則 `null`。 */
export async function fetchCloudPetSaveMeta(
  db: Firestore,
  uid: string,
): Promise<{ updatedAt: Date | null } | null> {
  const snap = await getDoc(doc(db, CLOUD_PET_SAVES, uid));
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  return { updatedAt: readUpdatedAtFromDoc(d) };
}

export async function uploadCloudPetSave(
  db: Firestore,
  uid: string,
  jsonPayload: string,
): Promise<void> {
  await setDoc(
    doc(db, CLOUD_PET_SAVES, uid),
    { v: 1, payload: jsonPayload, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export type CloudPetSaveMeta = {
  payload: string;
  updatedAt: Date | null;
};

export async function downloadCloudPetSave(
  db: Firestore,
  uid: string,
): Promise<CloudPetSaveMeta | null> {
  const snap = await getDoc(doc(db, CLOUD_PET_SAVES, uid));
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  const payload = typeof d.payload === "string" ? d.payload : "";
  if (!payload.trim()) return null;
  return { payload, updatedAt: readUpdatedAtFromDoc(d) };
}
