if (typeof globalThis !== "undefined") {
  if (typeof (globalThis as any).__dirname === "undefined") {
    (globalThis as any).__dirname =
      typeof process !== "undefined" && process.cwd ? process.cwd() : "/";
  }
  if (typeof (globalThis as any).__filename === "undefined") {
    (globalThis as any).__filename =
      typeof process !== "undefined" && process.cwd ? process.cwd() + "/index.js" : "/index.js";
  }
}

import { getApps, initializeApp, getApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import firebaseConfigData from "../../../firebase-applet-config.json";

let adminApp: App | undefined;
let firestoreAdminInstance: Firestore | undefined;

export function getFirestoreAdmin(): Firestore {
  if (!firestoreAdminInstance) {
    adminApp = getApps().length
      ? getApp()
      : initializeApp({
          projectId: firebaseConfigData.projectId,
        });

    const dbId =
      firebaseConfigData.firestoreDatabaseId &&
      firebaseConfigData.firestoreDatabaseId !== "(default)"
        ? firebaseConfigData.firestoreDatabaseId
        : undefined;

    firestoreAdminInstance = dbId ? getFirestore(adminApp, dbId) : getFirestore(adminApp);
  }
  return firestoreAdminInstance;
}

export const firestoreAdmin = new Proxy({} as Firestore, {
  get(_target, prop) {
    const admin = getFirestoreAdmin();
    const value = (admin as any)[prop];
    if (typeof value === "function") {
      return value.bind(admin);
    }
    return value;
  },
});
