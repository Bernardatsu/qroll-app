import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "lecturer" | "teaching_assistant";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadRoles = async (uid: string | undefined) => {
      if (!uid) { setRoles([]); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (mounted) setRoles((data ?? []).map((r) => r.role as AppRole));
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      loadRoles(data.session?.user?.id).finally(() => mounted && setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      loadRoles(s?.user?.id);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const isStaff = roles.length > 0;
  return { session, user, roles, loading, hasRole, isAdmin, isStaff };
}
