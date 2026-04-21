import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

/** 與 `docs/firebase-friends.rules` 內 `cloud_pet_saves` 一致。 */
export const CLOUD_PET_SAVES = "cloud_pet_saves";

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
  const d = snap.data();
  const payload = typeof d.payload === "string" ? d.payload : "";
  if (!payload.trim()) return null;
  const rawTs = d.updatedAt;
  let updatedAt: Date | null = null;
  if (
    rawTs &&
    typeof rawTs === "object" &&
    "toDate" in rawTs &&
    typeof (rawTs as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      updatedAt = (rawTs as { toDate: () => Date }).toDate();
    } catch {
      updatedAt = null;
    }
  }
  return { payload, updatedAt };
}
