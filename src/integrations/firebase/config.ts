import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  doc,
  setDoc,
  getDoc,
  type Firestore,
} from "firebase/firestore";
import firebaseConfigData from "../../../firebase-applet-config.json";

const firebaseConfig = {
  apiKey:
    (typeof process !== "undefined" && process.env?.VITE_FIREBASE_API_KEY) ||
    firebaseConfigData.apiKey,
  authDomain:
    (typeof process !== "undefined" && process.env?.VITE_FIREBASE_AUTH_DOMAIN) ||
    firebaseConfigData.authDomain,
  projectId:
    (typeof process !== "undefined" && process.env?.VITE_FIREBASE_PROJECT_ID) ||
    firebaseConfigData.projectId,
  storageBucket:
    (typeof process !== "undefined" && process.env?.VITE_FIREBASE_STORAGE_BUCKET) ||
    firebaseConfigData.storageBucket,
  messagingSenderId:
    (typeof process !== "undefined" && process.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    firebaseConfigData.messagingSenderId,
  appId:
    (typeof process !== "undefined" && process.env?.VITE_FIREBASE_APP_ID) ||
    firebaseConfigData.appId,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const firebaseAuth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

const databaseId =
  firebaseConfigData.firestoreDatabaseId && firebaseConfigData.firestoreDatabaseId !== "(default)"
    ? firebaseConfigData.firestoreDatabaseId
    : undefined;

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    },
    databaseId,
  );
} catch {
  firestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export const firestoreDb: Firestore = firestoreInstance;

export interface AppUserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: "super_admin" | "admin" | "lecturer" | "teaching_assistant";
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Syncs the authenticated Firebase user profile into Firestore.
 */
export async function syncUserToFirestore(user: FirebaseUser): Promise<AppUserProfile> {
  const userRef = doc(firestoreDb, "users", user.uid);
  const now = new Date().toISOString();

  let existingProfile: AppUserProfile | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existingProfile = snap.data() as AppUserProfile;
    }
  } catch (err) {
    console.warn("Could not read existing user doc from Firestore:", err);
  }

  const profile: AppUserProfile = {
    id: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "User",
    photoURL: user.photoURL || undefined,
    role: existingProfile?.role || "super_admin",
    createdAt: existingProfile?.createdAt || now,
    updatedAt: now,
  };

  try {
    await setDoc(userRef, profile, { merge: true });
  } catch (err) {
    console.warn("Could not write user doc to Firestore:", err);
  }

  return profile;
}

export { fbSignOut, onAuthStateChanged };
