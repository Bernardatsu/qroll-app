import { useEffect, useState } from "react";
import { firebaseAuth, onAuthStateChanged, firestoreDb } from "@/integrations/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { clearUserAppCache } from "./query-client";

export type AppRole = "super_admin" | "admin" | "lecturer" | "teaching_assistant";

export const DEMO_LECTURER_EMAIL = "lecturer@qroll.edu";
export const DEMO_LECTURER_PASS = "QrollTutorPass2026!#";

export interface AppUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  provider?: "google" | "password";
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(() => {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) return null;
    const providerId =
      fbUser.providerData?.[0]?.providerId === "google.com" ? "google" : "password";
    return {
      id: fbUser.uid,
      email: fbUser.email ?? undefined,
      user_metadata: {
        full_name: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User",
        avatar_url: fbUser.photoURL ?? undefined,
      },
      provider: providerId,
    };
  });
  const [roles, setRoles] = useState<AppRole[]>(["super_admin"]);
  const [loading, setLoading] = useState(!firebaseAuth.currentUser);

  useEffect(() => {
    let mounted = true;

    const unsubFirebase = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (!mounted) return;
      if (fbUser) {
        const providerId =
          fbUser.providerData?.[0]?.providerId === "google.com" ? "google" : "password";
        setUser({
          id: fbUser.uid,
          email: fbUser.email ?? undefined,
          user_metadata: {
            full_name: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User",
            avatar_url: fbUser.photoURL ?? undefined,
          },
          provider: providerId,
        });

        // Load roles from Firestore if present
        try {
          const userDoc = await getDoc(doc(firestoreDb, "users", fbUser.uid));
          if (mounted && userDoc.exists()) {
            const data = userDoc.data();
            if (data?.role) {
              setRoles([data.role as AppRole]);
            } else {
              setRoles(["super_admin"]);
            }
          } else if (mounted) {
            setRoles(["super_admin"]);
          }
        } catch {
          if (mounted) setRoles(["super_admin"]);
        }
        if (mounted) setLoading(false);
      } else {
        if (mounted) {
          clearUserAppCache();
          setUser(null);
          setRoles([]);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      unsubFirebase();
    };
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const isAdmin =
    roles.includes("super_admin") || roles.includes("admin") || user?.provider === "google";
  const isStaff = roles.length > 0 || user?.provider === "google";

  return { session: user ? { user } : null, user, roles, loading, hasRole, isAdmin, isStaff };
}
