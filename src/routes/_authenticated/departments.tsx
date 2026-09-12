import { createFileRoute } from "@tanstack/react-router";
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
  writeBatch,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({ meta: [{ title: "Departments — QRoll" }] }),
  component: DeptPage,
});

function DeptPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [yName, setYName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; code: string } | null>(null);
  const [editYear, setEditYear] = useState<{ id: string; name: string } | null>(null);

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

  const addDept = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Please enter both department name and code");
      return;
    }
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      toast.error("You must be logged in to add a department");
      return;
    }
    const payload: any = { name: name.trim(), code: code.trim().toUpperCase(), owner_id: uid };
    try {
      await addDoc(collection(firestoreDb, "departments"), payload);
      toast.success("Department added");
      setName("");
      setCode("");
      qc.invalidateQueries({ queryKey: ["departments"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add department");
    }
  };

  const delDept = async (id: string) => {
    if (
      !confirm(
        "⚠️ WARNING: Are you sure you want to permanently delete this department?\n\nAny courses or students linked to this department will lose their department association. This action cannot be undone!",
      )
    )
      return;
    try {
      await deleteDoc(doc(firestoreDb, "departments", id));
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete department");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateDoc(doc(firestoreDb, "departments", editing.id), {
        name: editing.name,
        code: editing.code,
      });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update department");
    }
  };

  const addYear = async () => {
    if (!yName.trim()) {
      toast.error("Please enter academic year name (e.g., 2026/2027)");
      return;
    }
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      toast.error("You must be logged in to add an academic year");
      return;
    }
    const payload: any = { name: yName.trim(), is_current: false, owner_id: uid };
    try {
      await addDoc(collection(firestoreDb, "academic_years"), payload);
      toast.success("Year added");
      setYName("");
      qc.invalidateQueries({ queryKey: ["years"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add year");
    }
  };

  const setCurrent = async (id: string) => {
    const uid = firebaseAuth.currentUser?.uid;
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
      qc.invalidateQueries({ queryKey: ["years"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to set current year");
    }
  };

  const saveYear = async () => {
    if (!editYear || !editYear.name.trim()) return;
    try {
      await updateDoc(doc(firestoreDb, "academic_years", editYear.id), {
        name: editYear.name.trim(),
      });
      setEditYear(null);
      qc.invalidateQueries({ queryKey: ["years"] });
      toast.success("Year updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update year");
    }
  };

  const delYear = async (id: string) => {
    if (
      !confirm(
        "⚠️ WARNING: Are you sure you want to permanently delete this academic year?\n\nCourses linked to this year will lose their year label. This action cannot be undone!",
      )
    )
      return;
    try {
      await deleteDoc(doc(firestoreDb, "academic_years", id));
      qc.invalidateQueries({ queryKey: ["years"] });
      toast.success("Academic year deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete year");
    }
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-6">Departments & Academic Years</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Computer Science"
                />
              </div>
              <div>
                <Label>Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CSM" />
              </div>
            </div>
            <Button onClick={addDept} className="w-full">
              <Plus className="size-4 mr-1" />
              Add department
            </Button>
            <div className="divide-y rounded-md border">
              {(depts ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 p-3">
                  {editing?.id === d.id ? (
                    <>
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <Input
                          className="col-span-2"
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        />
                        <Input
                          value={editing.code}
                          onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={saveEdit}>
                        <Check className="size-4 text-success" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-muted-foreground">{d.code}</div>
                      </div>
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing({ id: d.id, name: d.name, code: d.code ?? "" })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => delDept(d.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!depts?.length && (
                <div className="p-4 text-sm text-muted-foreground">No departments yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Academic Years</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Year name</Label>
                <Input
                  value={yName}
                  onChange={(e) => setYName(e.target.value)}
                  placeholder="2025/2026"
                />
              </div>
              <Button onClick={addYear}>
                <Plus className="size-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="divide-y rounded-md border">
              {(years ?? []).map((y) => (
                <div key={y.id} className="flex items-center justify-between gap-2 p-3">
                  {editYear?.id === y.id ? (
                    <>
                      <Input
                        className="flex-1"
                        value={editYear.name}
                        onChange={(e) => setEditYear({ ...editYear, name: e.target.value })}
                      />
                      <Button variant="ghost" size="icon" onClick={saveYear}>
                        <Check className="size-4 text-success" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditYear(null)}>
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="font-medium">
                        {y.name}{" "}
                        {y.is_current && (
                          <span className="ml-2 text-xs bg-gold text-gold-foreground px-2 py-0.5 rounded">
                            current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!y.is_current && (
                          <Button variant="outline" size="sm" onClick={() => setCurrent(y.id)}>
                            Set current
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditYear({ id: y.id, name: y.name })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => delYear(y.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!years?.length && (
                <div className="p-4 text-sm text-muted-foreground">No academic years yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
