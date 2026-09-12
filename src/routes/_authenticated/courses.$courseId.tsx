import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firestoreDb } from "@/integrations/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  deleteDoc,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/courses/$courseId")({
  component: CourseDetail,
});

function CourseDetail() {
  const { courseId } = Route.useParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const snap = await getDoc(doc(firestoreDb, "courses", courseId));
      if (!snap.exists()) return null;
      const cData = { id: snap.id, ...(snap.data() as any) };
      if (cData.department_id) {
        try {
          const deptSnap = await getDoc(doc(firestoreDb, "departments", cData.department_id));
          if (deptSnap.exists()) {
            cData.departments = { name: (deptSnap.data() as any).name };
          }
        } catch {
          // ignore
        }
      }
      return cData;
    },
  });

  const currentUid = firebaseAuth.currentUser?.uid;

  const { data: roster } = useQuery({
    queryKey: ["roster", courseId, currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const regSnap = await getDocs(
        query(collection(firestoreDb, "course_registrations"), where("course_id", "==", courseId)),
      );
      const studentIds = regSnap.docs.map((d) => (d.data() as any).student_id).filter(Boolean);
      const studentMap = new Map<string, any>();
      if (studentIds.length > 0) {
        const studSnap = await getDocs(
          query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
        );
        studSnap.docs.forEach((d) => {
          if (studentIds.includes(d.id)) {
            studentMap.set(d.id, { id: d.id, ...(d.data() as any) });
          }
        });
      }
      return regSnap.docs.map((d) => {
        const rData = d.data() as any;
        return {
          id: d.id,
          ...rData,
          students: studentMap.get(rData.student_id) || null,
        };
      });
    },
    enabled: !!currentUid,
  });

  const { data: students } = useQuery({
    queryKey: ["students-pick", currentUid, search],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const s = search.trim().toLowerCase();
      const filtered = s
        ? list.filter(
            (st) =>
              (st.full_name || "").toLowerCase().includes(s) ||
              (st.index_number || "").toLowerCase().includes(s),
          )
        : list;
      return filtered.slice(0, 20);
    },
    enabled: !!currentUid,
  });

  const register = async (student_id: string) => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return toast.error("You must be signed in");
    try {
      await addDoc(collection(firestoreDb, "course_registrations"), {
        course_id: courseId,
        student_id,
        owner_id: uid,
        registered_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["roster", courseId] });
      toast.success("Student added to course");
    } catch (err: any) {
      toast.error(err?.message || "Failed to register student");
    }
  };

  const unregister = async (id: string) => {
    if (
      !confirm(
        "⚠️ WARNING: Are you sure you want to remove this student from the course roster?\n\nThis will remove them from future attendance tracking for this course.",
      )
    )
      return;
    try {
      await deleteDoc(doc(firestoreDb, "course_registrations", id));
      qc.invalidateQueries({ queryKey: ["roster", courseId] });
      toast.success("Student removed from course");
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove student");
    }
  };

  const registeredIds = new Set((roster ?? []).map((r: any) => r.students?.id));

  return (
    <AppShell>
      <Link
        to={"/courses" as string}
        className="text-sm text-muted-foreground inline-flex items-center mb-4"
      >
        <ArrowLeft className="size-4 mr-1" />
        All courses
      </Link>
      <h1 className="text-3xl font-bold">
        {course?.code} — {course?.title}
      </h1>
      <p className="text-muted-foreground mb-6">
        Level {course?.level} · {course?.semester} Semester
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Registered ({roster?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(roster ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{r.students?.full_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.students?.index_number}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => unregister(r.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {!roster?.length && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No students registered
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add students</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search by name or index"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="divide-y border rounded max-h-96 overflow-y-auto">
              {(students ?? []).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{s.full_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {s.index_number} · L{s.level}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={registeredIds.has(s.id)}
                    onClick={() => register(s.id)}
                  >
                    <Plus className="size-4 mr-1" />
                    {registeredIds.has(s.id) ? "Added" : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
