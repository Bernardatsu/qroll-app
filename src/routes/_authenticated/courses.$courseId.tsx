import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { isStudentInCourse } from "@/lib/class-matching";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Users, UserCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/courses/$courseId")({
  component: CourseDetail,
});

function CourseDetail() {
  const { courseId } = Route.useParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const currentUid = firebaseAuth.currentUser?.uid;

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["course", courseId, currentUid],
    queryFn: async () => {
      const snap = await getDoc(doc(firestoreDb, "courses", courseId));
      if (!snap.exists()) return null;
      const cData = { id: snap.id, ...(snap.data() as any) };
      // Restrict access: course belongs only to its owner
      if (cData.owner_id && currentUid && cData.owner_id !== currentUid) {
        return null;
      }
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
    enabled: !!currentUid,
  });

  const { data: deptMap } = useQuery({
    queryKey: ["depts-map", currentUid],
    queryFn: async () => {
      if (!currentUid) return new Map<string, string>();
      const snap = await getDocs(
        query(collection(firestoreDb, "departments"), where("owner_id", "==", currentUid)),
      );
      const map = new Map<string, string>();
      snap.docs.forEach((d) => map.set(d.id, (d.data() as any).name || ""));
      return map;
    },
    enabled: !!currentUid,
  });

  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ["roster", courseId, currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const regSnap = await getDocs(
        query(
          collection(firestoreDb, "course_registrations"),
          where("owner_id", "==", currentUid),
          where("course_id", "==", courseId),
        ),
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

  const { data: allStudents } = useQuery({
    queryKey: ["all-students-course", currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
      );
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    },
    enabled: !!currentUid,
  });

  const registeredIds = new Set((roster ?? []).map((r: any) => r.students?.id).filter(Boolean));

  // Students belonging to this course's level & department
  const classPopulation = (allStudents ?? []).filter((s: any) =>
    isStudentInCourse(s, course as any, registeredIds, deptMap),
  );

  const unenrolledCount = classPopulation.filter((s) => !registeredIds.has(s.id)).length;

  const [enrollingAll, setEnrollingAll] = useState(false);

  const enrollAllClassStudents = async () => {
    if (!currentUid || !course) return;
    const toEnroll = classPopulation.filter((s) => !registeredIds.has(s.id));
    if (toEnroll.length === 0) {
      toast.info("All students in this class level are already registered!");
      return;
    }
    setEnrollingAll(true);
    const toastId = toast.loading(`Enrolling ${toEnroll.length} students into ${course.code}...`);
    try {
      const BATCH = 250;
      for (let i = 0; i < toEnroll.length; i += BATCH) {
        const chunk = toEnroll.slice(i, i + BATCH);
        const batch = writeBatch(firestoreDb);
        chunk.forEach((st) => {
          const ref = doc(collection(firestoreDb, "course_registrations"));
          batch.set(ref, {
            course_id: courseId,
            student_id: st.id,
            owner_id: currentUid,
            registered_at: new Date().toISOString(),
          });
        });
        await batch.commit();
      }
      qc.invalidateQueries({ queryKey: ["roster", courseId] });
      qc.invalidateQueries({ queryKey: ["history-data"] });
      qc.invalidateQueries({ queryKey: ["report-data"] });
      toast.success(`Enrolled all ${toEnroll.length} students into ${course.code}!`, {
        id: toastId,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to bulk enroll students", { id: toastId });
    } finally {
      setEnrollingAll(false);
    }
  };

  const { data: students } = useQuery({
    queryKey: ["students-pick", currentUid, search],
    queryFn: async () => {
      if (!currentUid) return [];
      const list = allStudents || [];
      const s = search.trim().toLowerCase();
      const filtered = s
        ? list.filter(
            (st) =>
              (st.full_name || "").toLowerCase().includes(s) ||
              (st.index_number || "").toLowerCase().includes(s),
          )
        : list;
      return filtered.slice(0, 30);
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
      qc.invalidateQueries({ queryKey: ["history-data"] });
      qc.invalidateQueries({ queryKey: ["report-data"] });
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
      qc.invalidateQueries({ queryKey: ["history-data"] });
      qc.invalidateQueries({ queryKey: ["report-data"] });
      toast.success("Student removed from course");
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove student");
    }
  };

  if (!courseLoading && !course) {
    return (
      <AppShell>
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold">Course Not Found</h2>
          <p className="text-muted-foreground mt-2">
            This course does not exist or belongs to another lecturer account.
          </p>
          <Link to="/courses" className="mt-4 inline-block">
            <Button variant="outline">
              <ArrowLeft className="size-4 mr-1" /> Return to Courses
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to={"/courses" as string}
        className="text-sm text-muted-foreground inline-flex items-center mb-4"
      >
        <ArrowLeft className="size-4 mr-1" />
        All courses
      </Link>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            {course?.code} — {course?.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            Level {course?.level ?? "—"} · {course?.departments?.name || "All Departments"} ·{" "}
            {course?.semester ? `${course.semester} Semester` : "Active"}
          </p>
        </div>

        {unenrolledCount > 0 && (
          <Button onClick={enrollAllClassStudents} disabled={enrollingAll} className="shrink-0">
            <UserCheck className="size-4 mr-2" />
            {enrollingAll
              ? "Enrolling..."
              : `Enroll All Level ${course?.level} Students (${unenrolledCount})`}
          </Button>
        )}
      </div>

      {/* Class Level Population Overview Banner */}
      <Card className="mb-6 bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <div className="font-semibold text-sm">
                Class Level Population: {classPopulation.length} Students
              </div>
              <div className="text-xs text-muted-foreground">
                All Level {course?.level} students{" "}
                {course?.departments?.name ? `in ${course.departments.name}` : ""} are automatically
                recognized for this course across academic history, scan check-ins, and reports.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{roster?.length ?? 0} Explicitly Enrolled</Badge>
            <Badge variant="secondary">{classPopulation.length} Class Population</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Registered Roster ({roster?.length ?? 0})</CardTitle>
            <CardDescription>Students with explicit registration in this course</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {(roster ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{r.students?.full_name || "Unknown Student"}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.students?.index_number} · Level {r.students?.level}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => unregister(r.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {!roster?.length && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No students explicitly registered yet.
                  {classPopulation.length > 0 && (
                    <div className="mt-2">
                      <Button size="sm" variant="outline" onClick={enrollAllClassStudents}>
                        Enroll {classPopulation.length} Class Members Now
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search & Add Students</CardTitle>
            <CardDescription>Add students from your student directory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search by name or index number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="divide-y border rounded max-h-[440px] overflow-y-auto">
              {(students ?? []).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{s.full_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {s.index_number} · L{s.level} {s.program ? `· ${s.program}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={registeredIds.has(s.id)}
                    onClick={() => register(s.id)}
                  >
                    <Plus className="size-4 mr-1" />
                    {registeredIds.has(s.id) ? "Enrolled" : "Add"}
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
