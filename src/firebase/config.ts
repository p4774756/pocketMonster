import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function readEnv(key: keyof ImportMetaEnv): string {
  const v = import.meta.env[key];
  return typeof v === "string" ? v.trim() : "";
}

/** 建置時若六項皆已設定，大廳可啟用 Firebase 好友面板。 */
export function isFirebaseFriendsConfigured(): boolean {
  return (
    !!readEnv("VITE_FIREBASE_API_KEY") &&
    !!readEnv("VITE_FIREBASE_AUTH_DOMAIN") &&
    !!readEnv("VITE_FIREBASE_PROJECT_ID") &&
    !!readEnv("VITE_FIREBASE_STORAGE_BUCKET") &&
    !!readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID") &&
    !!readEnv("VITE_FIREBASE_APP_ID")
  );
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function getFirebaseFriendsApp(): FirebaseApp {
  if (!isFirebaseFriendsConfigured()) {
    throw new Error("Firebase friends env not configured");
  }
  if (!app) {
    app = initializeApp({
      apiKey: readEnv("VITE_FIREBASE_API_KEY"),
      authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
      projectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
      storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
      messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
      appId: readEnv("VITE_FIREBASE_APP_ID"),
    });
  }
  return app;
}

export function getFirebaseFriendsDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseFriendsApp());
  }
  return db;
}

export function getFirebaseFriendsAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseFriendsApp());
  }
  return auth;
}
