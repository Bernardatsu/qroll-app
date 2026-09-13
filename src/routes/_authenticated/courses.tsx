import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Users, Trash2, Pencil, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { isStudentInCourse } from "@/lib/class-matching";

export const Route = createFileRoute("/_authenticated/courses")({
  head: () => ({ meta: [{ title: "Courses — QRoll" }] }),
  component: CoursesPage,
});

const LEVELS = ["100", "200", "300", "400"] as const;

function CoursesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    title: "",
    level: "100",
    semester: "First",
    credit_hours: 3,
    department_id: "",
    academic_year_id: "",
  });
  const [editing, setEditing] = useState<any | null>(null);

  const currentUid = firebaseAuth.currentUser?.uid;

  const { data: depts } = useQuery({
    queryKey: ["departments", currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "departments"), where("owner_id", "==", currentUid)),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },
    enabled: !!currentUid,
  });

  const { data: years } = useQuery({
    queryKey: ["years", currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "academic_years"), where("owner_id", "==", currentUid)),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      return list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    },
    enabled: !!currentUid,
  });

  const { data: currentTerm } = useQuery({
    queryKey: ["current-term", currentUid],
    queryFn: async () => {
      if (!currentUid) return null;
      const snap = await getDocs(
        query(
          collection(firestoreDb, "academic_terms"),
          where("owner_id", "==", currentUid),
          where("is_current", "==", true),
        ),
      );
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...(snap.docs[0].data() as any) };
      }
      return null;
    },
    enabled: !!currentUid,
  });

  const { data: courses } = useQuery({
    queryKey: ["courses", currentUid, depts, years],
    queryFn: async () => {
      if (!currentUid) return [];
      const [coursesSnap, studSnap, regsSnap] = await Promise.all([
        getDocs(query(collection(firestoreDb, "courses"), where("owner_id", "==", currentUid))),
        getDocs(query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid))),
        getDocs(
          query(
            collection(firestoreDb, "course_registrations"),
            where("owner_id", "==", currentUid),
          ),
        ),
      ]);

      const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
      const yearMap = new Map((years ?? []).map((y: any) => [y.id, y.name]));

      const students = studSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      const regsByCourse = new Map<string, Set<string>>();
      regsSnap.docs.forEach((d) => {
        const r = d.data() as any;
        if (r.course_id && r.student_id) {
          const set = regsByCourse.get(r.course_id) ?? new Set<string>();
          set.add(r.student_id);
          regsByCourse.set(r.course_id, set);
        }
      });

      const list = coursesSnap.docs.map((d) => {
        const data = d.data() as any;
        const regSet = regsByCourse.get(d.id) ?? new Set<string>();
        const courseObj = {
          id: d.id,
          ...data,
          department_name: data.department_id ? deptMap.get(data.department_id) : null,
        };
        const matchingStudents = students.filter((s) =>
          isStudentInCourse(s, courseObj, regSet, deptMap),
        );

        return {
          id: d.id,
          ...data,
          departments:
            data.department_id && deptMap.has(data.department_id)
              ? { name: deptMap.get(data.department_id) }
              : null,
          academic_years:
            data.academic_year_id && yearMap.has(data.academic_year_id)
              ? { name: yearMap.get(data.academic_year_id) }
              : null,
          populationCount: matchingStudents.length,
          registeredCount: regSet.size,
        };
      });
      return list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    },
    enabled: !!currentUid,
  });

  const add = async () => {
    if (!form.code.trim() || !form.title.trim()) return toast.error("Code and title required");
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return toast.error("You must be signed in");
    if (courses && courses.length >= 10) {
      return toast.error("Limit reached: You can create a maximum of 10 courses per account.");
    }
    const payload: any = {
      ...form,
      code: form.code.trim().toUpperCase(),
      title: form.title.trim(),
      credit_hours: Number(form.credit_hours),
      created_at: new Date().toISOString(),
      lecturer_id: uid,
      owner_id: uid,
    };
    if (!payload.department_id) delete payload.department_id;
    if (!payload.academic_year_id) delete payload.academic_year_id;
    if (currentTerm?.id) payload.term_id = currentTerm.id;
    try {
      await addDoc(collection(firestoreDb, "courses"), payload);
      toast.success("Course added");
      setForm({
        code: "",
        title: "",
        credit_hours: 3,
        level: "100",
        semester: "First",
        department_id: "",
        academic_year_id: "",
      });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["courses"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add course");
    }
  };

  const remove = async (id: string) => {
    if (
      !confirm(
        "⚠️ WARNING: Are you sure you want to permanently delete this course?\n\nDeleting this course will remove all associated registrations, attendance records, and sessions. This data cannot be recovered!",
      )
    )
      return;
    try {
      await deleteDoc(doc(firestoreDb, "courses", id));
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Course deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete course");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const payload: any = {
      code: editing.code,
      title: editing.title,
      level: editing.level,
      semester: editing.semester,
      credit_hours: Number(editing.credit_hours),
      department_id: editing.department_id || null,
      academic_year_id: editing.academic_year_id || null,
      updated_at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(firestoreDb, "courses", editing.id), payload);
      toast.success("Updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["courses"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update course");
    }
  };

  return (
    <AppShell>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Courses</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Capacity: <span className="font-semibold text-foreground">{courses?.length ?? 0}</span>{" "}
            / 10 courses max
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (next && (courses?.length ?? 0) >= 10) {
              toast.error("Maximum 10 courses per account reached.");
              return;
            }
            setOpen(next);
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={(courses?.length ?? 0) >= 10}>
              <Plus className="size-4 mr-1" />
              Add course
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New course</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Code</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="CSM 151"
                  />
                </div>
                <div>
                  <Label>Credit hours</Label>
                  <Input
                    type="number"
                    value={form.credit_hours}
                    onChange={(e) => setForm({ ...form, credit_hours: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Level (class)</Label>
                  <Input
                    list="course-level-suggestions"
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: e.target.value.trim() })}
                    placeholder="e.g. 100, 500"
                  />
                  <datalist id="course-level-suggestions">
                    {LEVELS.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <Label>Semester</Label>
                  <Select
                    value={form.semester}
                    onValueChange={(v) => setForm({ ...form, semester: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="First">First</SelectItem>
                      <SelectItem value="Second">Second</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Department</Label>
                <Select
                  value={form.department_id}
                  onValueChange={(v) => setForm({ ...form, department_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {(depts ?? []).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Academic year</Label>
                <Select
                  value={form.academic_year_id}
                  onValueChange={(v) => setForm({ ...form, academic_year_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {(years ?? []).map((y: any) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={add} className="w-full">
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(courses ?? []).map((c: any) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-muted-foreground">{c.code}</div>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </div>
                <span className="text-xs bg-gold text-gold-foreground px-2 py-0.5 rounded">
                  L{c.level}
                </span>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>
                {c.departments?.name ?? "No department"} · {c.semester} Sem
              </div>
              <div>
                {c.academic_years?.name ?? "—"} · {c.credit_hours} credits
              </div>
              <div className="text-xs text-foreground font-medium flex items-center gap-1.5 pt-1">
                <Users className="size-3.5 text-primary" />
                <span>
                  {c.populationCount ?? 0} {(c.populationCount ?? 0) === 1 ? "student" : "students"}{" "}
                  in class
                </span>
                {c.registeredCount > 0 && c.registeredCount !== c.populationCount && (
                  <span className="text-muted-foreground font-normal">
                    ({c.registeredCount} enrolled)
                  </span>
                )}
              </div>
              <div className="flex gap-2 pt-3">
                <Link
                  to={"/courses/$courseId" as string}
                  params={{ courseId: c.id } as any}
                  className="flex-1"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    title="Manage students enrolled in this course"
                  >
                    <Users className="size-3 mr-1" />
                    Roster ({c.populationCount ?? 0})
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setEditing({
                      ...c,
                      department_id: c.department_id ?? "",
                      academic_year_id: c.academic_year_id ?? "",
                    })
                  }
                  title="Edit course"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(c.id)}
                  title="Delete course"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!courses?.length && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No courses yet
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit course</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Code</Label>
                  <Input
                    value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Credit hours</Label>
                  <Input
                    type="number"
                    value={editing.credit_hours}
                    onChange={(e) =>
                      setEditing({ ...editing, credit_hours: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Level (class)</Label>
                  <Input
                    list="course-level-suggestions-edit"
                    value={editing.level ?? ""}
                    onChange={(e) => setEditing({ ...editing, level: e.target.value.trim() })}
                  />
                  <datalist id="course-level-suggestions-edit">
                    {LEVELS.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <Label>Semester</Label>
                  <Select
                    value={editing.semester}
                    onValueChange={(v) => setEditing({ ...editing, semester: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="First">First</SelectItem>
                      <SelectItem value="Second">Second</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Department</Label>
                <Select
                  value={editing.department_id}
                  onValueChange={(v) => setEditing({ ...editing, department_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {(depts ?? []).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={saveEdit} className="w-full">
                Save changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
