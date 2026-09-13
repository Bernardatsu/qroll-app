import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
  query,
  where,
} from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Archive, CalendarRange, Lock, Plus, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/semesters")({
  head: () => ({
    meta: [
      { title: "Semesters & Archive — QRoll" },
      {
        name: "description",
        content:
          "Organise courses by academic year and semester, mark the current semester, and archive completed semesters so their records are preserved permanently.",
      },
      { property: "og:title", content: "Semesters & Archive — QRoll" },
      {
        property: "og:description",
        content: "Academic year and semester management with permanent archiving.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SemestersPage,
});

type Term = {
  id: string;
  year_name: string;
  semester: "First" | "Second";
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
  archived_at: string | null;
};

function defaultYear() {
  const y = new Date().getFullYear();
  return `${y}/${y + 1}`;
}

function SemestersPage() {
  const qc = useQueryClient();
  const [yearName, setYearName] = useState(defaultYear());
  const [semester, setSemester] = useState<"First" | "Second">("First");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Term | null>(null);

  const { user } = useAuth();
  const currentUid = user?.id || firebaseAuth.currentUser?.uid;

  const { data: terms, isLoading: termsLoading } = useQuery({
    queryKey: ["academic-terms", currentUid],
    queryFn: async () => {
      const uid = currentUid || firebaseAuth.currentUser?.uid;
      if (!uid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "academic_terms"), where("owner_id", "==", uid)),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Term[];
      return list.sort((a, b) => {
        const yearCmp = (b.year_name || "").localeCompare(a.year_name || "");
        if (yearCmp !== 0) return yearCmp;
        return (a.semester || "").localeCompare(b.semester || "");
      });
    },
    enabled: !!(currentUid || firebaseAuth.currentUser?.uid),
  });

  const { data: courseCounts } = useQuery({
    queryKey: ["term-course-counts", currentUid],
    queryFn: async () => {
      const uid = currentUid || firebaseAuth.currentUser?.uid;
      if (!uid) return {};
      const snap = await getDocs(
        query(collection(firestoreDb, "courses"), where("owner_id", "==", uid)),
      );
      const map: Record<string, number> = {};
      for (const d of snap.docs) {
        const c = d.data() as any;
        if (c.term_id) map[c.term_id] = (map[c.term_id] ?? 0) + 1;
      }
      return map;
    },
    enabled: !!(currentUid || firebaseAuth.currentUser?.uid),
  });

  const current = useMemo(() => terms?.find((t) => t.is_current) ?? null, [terms]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["academic-terms"] });
    void qc.invalidateQueries({ queryKey: ["term-course-counts"] });
  };

  const createTerm = useMutation({
    mutationFn: async () => {
      const uid = user?.id || firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error("Authentication required. Please sign in.");
      if (!yearName.trim()) throw new Error("Academic year name is required (e.g. 2025/2026)");
      const payload: any = {
        year_name: yearName.trim(),
        semester,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        is_current: !terms?.length,
        owner_id: uid,
        created_at: new Date().toISOString(),
      };
      await addDoc(collection(firestoreDb, "academic_terms"), payload);
    },
    onSuccess: () => {
      toast.success("Semester added");
      setStartsOn("");
      setEndsOn("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const makeCurrent = useMutation({
    mutationFn: async (id: string) => {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDocs(
        query(collection(firestoreDb, "academic_terms"), where("owner_id", "==", uid)),
      );
      const batch = writeBatch(firestoreDb);
      snap.docs.forEach((d) => {
        batch.update(d.ref, { is_current: d.id === id });
      });
      await batch.commit();
    },
    onSuccess: () => {
      toast.success("Current semester updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      await updateDoc(doc(firestoreDb, "academic_terms", id), {
        archived_at: new Date().toISOString(),
        is_current: false,
      });
    },
    onSuccess: () => {
      toast.success("Semester archived — its records are now locked and preserved");
      setArchiveTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopen = useMutation({
    mutationFn: async (id: string) => {
      await updateDoc(doc(firestoreDb, "academic_terms", id), { archived_at: null });
    },
    onSuccess: () => {
      toast.success("Semester reopened");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const endedNotArchived = (terms ?? []).filter(
    (t) => !t.archived_at && t.ends_on && new Date(t.ends_on) < new Date(),
  );

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">Semesters & archive</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Group your courses by academic year and semester. Archiving keeps every record permanently
        and locks the semester from further edits.
      </p>

      {endedNotArchived.map((t) => (
        <div
          key={t.id}
          className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="text-sm">
            <b>
              {t.year_name} · Semester {t.semester === "First" ? "1" : "2"}
            </b>{" "}
            has ended. Would you like to archive it?
          </div>
          <Button size="sm" onClick={() => setArchiveTarget(t)}>
            <Archive className="size-4 mr-1" />
            Archive semester
          </Button>
        </div>
      ))}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="size-4" />
            Add a semester
          </CardTitle>
          <CardDescription>
            {current ? (
              <>
                Current:{" "}
                <b>
                  {current.year_name} · Semester {current.semester === "First" ? "1" : "2"}
                </b>
              </>
            ) : (
              "No current semester set yet."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              createTerm.mutate();
            }}
          >
            <div>
              <Label className="text-xs text-muted-foreground">Academic year</Label>
              <Input
                value={yearName}
                onChange={(e) => setYearName(e.target.value)}
                placeholder="2026/2027"
                required
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Semester</Label>
              <Select value={semester} onValueChange={(v) => setSemester(v as "First" | "Second")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="First">Semester 1</SelectItem>
                  <SelectItem value="Second">Semester 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Starts</Label>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Ends</Label>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
            <Button type="submit" disabled={createTerm.isPending}>
              {createTerm.isPending ? "Adding..." : "Add semester"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(terms ?? []).map((t) => (
          <Card key={t.id} className={t.archived_at ? "opacity-90" : ""}>
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CalendarRange className="size-4 text-primary" />
                  <span className="font-semibold">
                    {t.year_name} · Semester {t.semester === "First" ? "1" : "2"}
                  </span>
                  {t.is_current && <Badge>Current</Badge>}
                  {t.archived_at && (
                    <Badge variant="secondary">
                      <Lock className="size-3 mr-1" />
                      Archived
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {courseCounts?.[t.id] ?? 0} course{(courseCounts?.[t.id] ?? 0) === 1 ? "" : "s"}
                  {t.starts_on ? ` · ${new Date(t.starts_on).toLocaleDateString()}` : ""}
                  {t.ends_on ? ` – ${new Date(t.ends_on).toLocaleDateString()}` : ""}
                  {t.archived_at
                    ? ` · archived ${new Date(t.archived_at).toLocaleDateString()}`
                    : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!t.archived_at && !t.is_current && (
                  <Button variant="outline" size="sm" onClick={() => makeCurrent.mutate(t.id)}>
                    <Star className="size-4 mr-1" />
                    Make current
                  </Button>
                )}
                {!t.archived_at ? (
                  <Button variant="outline" size="sm" onClick={() => setArchiveTarget(t)}>
                    <Archive className="size-4 mr-1" />
                    Archive
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => reopen.mutate(t.id)}>
                    Reopen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {terms && !terms.length && (
          <p className="text-sm text-muted-foreground">
            No semesters yet — add your first one above.
          </p>
        )}
      </div>

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this semester?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget && (
                <>
                  {archiveTarget.year_name} · Semester{" "}
                  {archiveTarget.semester === "First" ? "1" : "2"} will be locked.{" "}
                </>
              )}
              Nothing is deleted — students, attendance, and reports stay available for viewing
              forever. You can reopen it later if you need to make a correction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveTarget && archive.mutate(archiveTarget.id)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
