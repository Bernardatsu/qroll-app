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

import { cert, getApps, initializeApp, getApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { getAuth, type Auth } from "firebase-admin/auth";
import firebaseConfigData from "../../../firebase-applet-config.json";

let adminApp: App | undefined;
let firestoreAdminInstance: Firestore | undefined;
let messagingAdminInstance: Messaging | undefined;
let authAdminInstance: Auth | undefined;

export function getAdminApp(): App {
  if (!adminApp) {
    if (getApps().length) {
      adminApp = getApp();
    } else {
      const rawServiceKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      let credentialConfig = undefined;
      if (rawServiceKey) {
        try {
          const parsed = JSON.parse(
            rawServiceKey.startsWith("{")
              ? rawServiceKey
              : Buffer.from(rawServiceKey, "base64").toString("utf-8"),
          );
          credentialConfig = cert(parsed);
        } catch (e) {
          console.warn("[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY env var:", e);
        }
      }

      adminApp = initializeApp({
        credential: credentialConfig,
        projectId: firebaseConfigData.projectId,
      });
    }
  }
  return adminApp;
}

export function getFirestoreAdmin(): Firestore {
  if (!firestoreAdminInstance) {
    const app = getAdminApp();
    const dbId =
      firebaseConfigData.firestoreDatabaseId &&
      firebaseConfigData.firestoreDatabaseId !== "(default)"
        ? firebaseConfigData.firestoreDatabaseId
        : undefined;

    firestoreAdminInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
  return firestoreAdminInstance;
}

export function getMessagingAdmin(): Messaging {
  if (!messagingAdminInstance) {
    const app = getAdminApp();
    messagingAdminInstance = getMessaging(app);
  }
  return messagingAdminInstance;
}

export function getAuthAdmin(): Auth {
  if (!authAdminInstance) {
    const app = getAdminApp();
    authAdminInstance = getAuth(app);
  }
  return authAdminInstance;
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

export const messagingAdmin = new Proxy({} as Messaging, {
  get(_target, prop) {
    const admin = getMessagingAdmin();
    const value = (admin as any)[prop];
    if (typeof value === "function") {
      return value.bind(admin);
    }
    return value;
  },
});

export const authAdmin = new Proxy({} as Auth, {
  get(_target, prop) {
    const admin = getAuthAdmin();
    const value = (admin as any)[prop];
    if (typeof value === "function") {
      return value.bind(admin);
    }
    return value;
  },
});
