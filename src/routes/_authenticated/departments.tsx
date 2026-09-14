import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  query,
  where,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  Building2,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({ meta: [{ title: "Departments & Academic Years — QRoll" }] }),
  component: DeptPage,
});

function DeptPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const currentUid = user?.id || firebaseAuth.currentUser?.uid;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isAddingDept, setIsAddingDept] = useState(false);

  const [yName, setYName] = useState("");
  const [isAddingYear, setIsAddingYear] = useState(false);

  const [editing, setEditing] = useState<{ id: string; name: string; code: string } | null>(null);
  const [editYear, setEditYear] = useState<{ id: string; name: string } | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<{ id: string; name: string } | null>(null);
  const [yearToDelete, setYearToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: depts, isLoading: loadingDepts } = useQuery({
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

  const { data: years, isLoading: loadingYears } = useQuery({
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

  const addDept = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName || !cleanCode) {
      toast.error("Please enter both department name and code (e.g., Computer Science, CSM)");
      return;
    }
    const uid = currentUid || firebaseAuth.currentUser?.uid;
    if (!uid) {
      toast.error("You must be logged in to add a department");
      return;
    }

    setIsAddingDept(true);
    try {
      const payload = {
        name: cleanName,
        code: cleanCode,
        owner_id: uid,
        created_at: new Date().toISOString(),
      };
      await addDoc(collection(firestoreDb, "departments"), payload);
      toast.success(`Department "${cleanName}" (${cleanCode}) added successfully!`);
      setName("");
      setCode("");
      await qc.invalidateQueries({ queryKey: ["departments"] });
    } catch (err: any) {
      console.error("Failed to add department:", err);
      toast.error(err?.message || "Failed to add department");
    } finally {
      setIsAddingDept(false);
    }
  };

  const executeDeleteDept = async () => {
    if (!deptToDelete) return;
    const { id, name: deptName } = deptToDelete;
    setDeptToDelete(null);
    try {
      await deleteDoc(doc(firestoreDb, "departments", id));
      await qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success(`Department "${deptName}" deleted`);
    } catch (err: any) {
      console.error("Failed to delete department:", err);
      toast.error(err?.message || "Failed to delete department");
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.name.trim() || !editing.code.trim()) return;
    try {
      await updateDoc(doc(firestoreDb, "departments", editing.id), {
        name: editing.name.trim(),
        code: editing.code.trim().toUpperCase(),
        updated_at: new Date().toISOString(),
      });
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update department");
    }
  };

  const addYear = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanYear = yName.trim();
    if (!cleanYear) {
      toast.error("Please enter academic year name (e.g., 2025/2026)");
      return;
    }
    const uid = currentUid || firebaseAuth.currentUser?.uid;
    if (!uid) {
      toast.error("You must be logged in to add an academic year");
      return;
    }

    setIsAddingYear(true);
    try {
      const payload = {
        name: cleanYear,
        is_current: (years?.length ?? 0) === 0,
        owner_id: uid,
        created_at: new Date().toISOString(),
      };
      await addDoc(collection(firestoreDb, "academic_years"), payload);
      toast.success(`Academic Year "${cleanYear}" added successfully!`);
      setYName("");
      await qc.invalidateQueries({ queryKey: ["years"] });
    } catch (err: any) {
      console.error("Failed to add year:", err);
      toast.error(err?.message || "Failed to add academic year");
    } finally {
      setIsAddingYear(false);
    }
  };

  const setCurrent = async (id: string) => {
    const uid = currentUid || firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDocs(
        query(collection(firestoreDb, "academic_years"), where("owner_id", "==", uid)),
      );
      const batch = writeBatch(firestoreDb);
      snap.docs.forEach((d) => {
        batch.update(d.ref, { is_current: d.id === id });
      });
      await batch.commit();
      await qc.invalidateQueries({ queryKey: ["years"] });
      toast.success("Active academic year updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to set current year");
    }
  };

  const saveYear = async () => {
    if (!editYear || !editYear.name.trim()) return;
    try {
      await updateDoc(doc(firestoreDb, "academic_years", editYear.id), {
        name: editYear.name.trim(),
        updated_at: new Date().toISOString(),
      });
      setEditYear(null);
      await qc.invalidateQueries({ queryKey: ["years"] });
      toast.success("Academic year updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update year");
    }
  };

  const executeDeleteYear = async () => {
    if (!yearToDelete) return;
    const { id, name: yearName } = yearToDelete;
    setYearToDelete(null);
    try {
      await deleteDoc(doc(firestoreDb, "academic_years", id));
      await qc.invalidateQueries({ queryKey: ["years"] });
      toast.success(`Academic year "${yearName}" deleted`);
    } catch (err: any) {
      console.error("Failed to delete academic year:", err);
      toast.error(err?.message || "Failed to delete year");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Departments & Academic Years
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your faculty departments and active academic years used for course
            organization and enrollment.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* DEPARTMENTS CARD */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                Departments
              </CardTitle>
              <CardDescription>
                Create departments for organizing your courses and student rosters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
              <form onSubmit={addDept} className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="dept-name" className="text-xs">
                      Department Name
                    </Label>
                    <Input
                      id="dept-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Petroleum Engineering"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dept-code" className="text-xs">
                      Code
                    </Label>
                    <Input
                      id="dept-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="e.g. PE"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isAddingDept} className="w-full">
                  {isAddingDept ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Adding department...
                    </>
                  ) : (
                    <>
                      <Plus className="size-4 mr-1.5" />
                      Add Department
                    </>
                  )}
                </Button>
              </form>

              <div className="divide-y rounded-md border flex-1">
                {loadingDepts ? (
                  <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Loading departments...
                  </div>
                ) : (depts ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No departments added yet. Use the form above to add your first department.
                  </div>
                ) : (
                  (depts ?? []).map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 p-3">
                      {editing?.id === d.id ? (
                        <>
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <Input
                              className="col-span-2 h-8 text-sm"
                              value={editing.name}
                              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            />
                            <Input
                              className="h-8 text-sm"
                              value={editing.code}
                              onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-emerald-600 hover:text-emerald-700"
                            onClick={saveEdit}
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEditing(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div>
                            <div className="font-medium text-sm text-foreground">{d.name}</div>
                            <div className="text-xs font-mono text-muted-foreground">{d.code}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setEditing({ id: d.id, name: d.name, code: d.code ?? "" })
                              }
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeptToDelete({ id: d.id, name: d.name })}
                              title={`Delete ${d.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* ACADEMIC YEARS CARD */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="size-5 text-primary" />
                Academic Years
              </CardTitle>
              <CardDescription>
                Manage academic session calendars and toggle the active school year.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
              <form onSubmit={addYear} className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <Label htmlFor="year-name" className="text-xs">
                    Academic Year Name
                  </Label>
                  <Input
                    id="year-name"
                    value={yName}
                    onChange={(e) => setYName(e.target.value)}
                    placeholder="e.g. 2025/2026"
                    required
                  />
                </div>
                <Button type="submit" disabled={isAddingYear} className="w-full">
                  {isAddingYear ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Adding academic year...
                    </>
                  ) : (
                    <>
                      <Plus className="size-4 mr-1.5" />
                      Add Academic Year
                    </>
                  )}
                </Button>
              </form>

              <div className="divide-y rounded-md border flex-1">
                {loadingYears ? (
                  <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Loading academic years...
                  </div>
                ) : (years ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No academic years added yet. Use the form above to add your first academic year.
                  </div>
                ) : (
                  (years ?? []).map((y) => (
                    <div key={y.id} className="flex items-center justify-between gap-2 p-3">
                      {editYear?.id === y.id ? (
                        <>
                          <Input
                            className="flex-1 h-8 text-sm"
                            value={editYear.name}
                            onChange={(e) => setEditYear({ ...editYear, name: e.target.value })}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-emerald-600 hover:text-emerald-700"
                            onClick={saveYear}
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEditYear(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">{y.name}</span>
                            {y.is_current && (
                              <span className="text-[10px] uppercase tracking-wider font-semibold bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {!y.is_current && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setCurrent(y.id)}
                              >
                                Set active
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              onClick={() => setEditYear({ id: y.id, name: y.name })}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setYearToDelete({ id: y.id, name: y.name })}
                              title={`Delete ${y.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delete Department Confirmation Dialog */}
        <AlertDialog open={!!deptToDelete} onOpenChange={(o) => !o && setDeptToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                Delete Department?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete <b>{deptToDelete?.name}</b>?
                <br />
                <br />
                Courses and students linked to this department will lose their department tag. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={executeDeleteDept}
              >
                Yes, delete department
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Academic Year Confirmation Dialog */}
        <AlertDialog open={!!yearToDelete} onOpenChange={(o) => !o && setYearToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                Delete Academic Year?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete academic year{" "}
                <b>{yearToDelete?.name}</b>?
                <br />
                <br />
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={executeDeleteYear}
              >
                Yes, delete academic year
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
