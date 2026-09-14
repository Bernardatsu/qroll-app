import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
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
  writeBatch,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Upload,
  QrCode,
  Printer,
  Download,
  Trash2,
  Search,
  Mail,
  AlertTriangle,
  Pencil,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { parseExcelFile, exportToExcel } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({ meta: [{ title: "Students — QRoll" }] }),
  component: StudentsPage,
});

const DEFAULT_LEVELS = ["100", "200", "300", "400"] as const;

function StudentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [newLevel, setNewLevel] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLevel, setExportLevel] = useState<string>("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const emailFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    full_name: "",
    index_number: "",
    email: "",
    level: "100",
    program: "",
    department_id: "",
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

  const { data: students } = useQuery({
    queryKey: ["students", currentUid, depts],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
      );
      const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
      const list = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          departments:
            data.department_id && deptMap.has(data.department_id)
              ? { name: deptMap.get(data.department_id) }
              : null,
        };
      });
      return list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    },
    enabled: !!currentUid,
  });

  const { data: classLevels } = useQuery({
    queryKey: ["class-levels", currentUid],
    queryFn: async () => {
      if (!currentUid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, "class_levels"), where("owner_id", "==", currentUid)),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      if (list.length === 0) {
        const seeded: any[] = [];
        for (const name of DEFAULT_LEVELS) {
          const docRef = await addDoc(collection(firestoreDb, "class_levels"), {
            name,
            owner_id: currentUid,
          });
          seeded.push({ id: docRef.id, name });
        }
        return seeded.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      }
      return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },
    enabled: !!currentUid,
  });

  // Levels the user manages, plus any level already present in the data
  const levels = useMemo(() => {
    const set = new Set<string>((classLevels ?? []).map((l: any) => String(l.name)));
    for (const s of students ?? []) if (s.level) set.add(String(s.level));
    return Array.from(set).sort((a, b) => {
      const an = parseInt(a, 10),
        bn = parseInt(b, 10);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return a.localeCompare(b);
    });
  }, [students, classLevels]);

  const addLevel = async () => {
    const name = newLevel.trim();
    if (!name) return toast.error("Enter a level name");
    if (levels.includes(name)) return toast.error("That level already exists");
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return toast.error("Authentication required");
    const payload: any = { name, owner_id: uid };
    try {
      await addDoc(collection(firestoreDb, "class_levels"), payload);
      setNewLevel("");
      toast.success(`Level ${name} added`);
      qc.invalidateQueries({ queryKey: ["class-levels"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add level");
    }
  };

  const [levelToDelete, setLevelToDelete] = useState<string | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<{ id: string; name: string } | null>(null);

  const requestRemoveLevel = (name: string) => {
    const count = (students ?? []).filter((s: any) => String(s.level) === name).length;
    if (count > 0)
      return toast.error(
        `Level ${name} still has ${count} student${count === 1 ? "" : "s"}. Move or delete them first.`,
      );
    setLevelToDelete(name);
  };

  const removeLevel = async (name: string) => {
    setLevelToDelete(null);
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDocs(
        query(
          collection(firestoreDb, "class_levels"),
          where("owner_id", "==", uid),
          where("name", "==", name),
        ),
      );
      for (const d of snap.docs) {
        await deleteDoc(doc(firestoreDb, "class_levels", d.id));
      }
      if (tab === name) setTab("all");
      toast.success(`Level ${name} removed`);
      qc.invalidateQueries({ queryKey: ["class-levels"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove level");
    }
  };

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return (students ?? []).filter((st: any) => {
      if (tab !== "all" && String(st.level) !== tab) return false;
      if (!s) return true;
      return (
        st.full_name.toLowerCase().includes(s) ||
        st.index_number.toLowerCase().includes(s) ||
        (st.email ?? "").toLowerCase().includes(s)
      );
    });
  }, [students, q, tab]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const l of levels) g[l] = [];
    for (const s of filtered) {
      const l = String(s.level);
      if (!g[l]) g[l] = [];
      g[l].push(s);
    }
    return g;
  }, [filtered, levels]);

  const add = async () => {
    if (!form.full_name.trim() || !form.index_number.trim())
      return toast.error("Name and index required");
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return toast.error("You must be signed in");
    const targetLevel = String(form.level || "100");
    const countInLevel = (students ?? []).filter(
      (s: any) => String(s.level) === targetLevel,
    ).length;
    if (countInLevel >= 400) {
      return toast.error(
        `Limit reached: Maximum 400 students allowed per class/level. Level ${targetLevel} currently has ${countInLevel} students.`,
      );
    }
    // Ensure each student has ONE unique QR code for all courses and lecturers
    let existingQrUuid = "";
    const cleanIndex = form.index_number.trim();
    try {
      const existingSnap = await getDocs(
        query(collection(firestoreDb, "students"), where("index_number", "==", cleanIndex)),
      );
      if (!existingSnap.empty) {
        existingQrUuid = (existingSnap.docs[0].data() as any)?.qr_uuid || "";
      }
    } catch (err) {
      console.warn("Could not check existing student qr_uuid:", err);
    }

    const payload: any = {
      ...form,
      full_name: form.full_name.trim(),
      index_number: cleanIndex,
      qr_uuid: existingQrUuid || crypto.randomUUID(),
      owner_id: uid,
    };
    if (!payload.department_id) delete payload.department_id;
    if (!payload.email) delete payload.email;
    try {
      await addDoc(collection(firestoreDb, "students"), payload);
      toast.success("Student added");
      setForm({
        full_name: "",
        index_number: "",
        email: "",
        level: "100",
        program: "",
        department_id: "",
      });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["students"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add student");
    }
  };

  const executeDeleteStudent = async () => {
    if (!studentToDelete) return;
    const { id, name } = studentToDelete;
    setStudentToDelete(null);
    try {
      await deleteDoc(doc(firestoreDb, "students", id));
      await qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(`Student "${name}" deleted`);
    } catch (err: any) {
      console.error("Failed to delete student:", err);
      toast.error(err?.message || "Failed to delete student");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const targetLevel = String(editing.level || "100");
    const origStudent = (students ?? []).find((s: any) => s.id === editing.id);
    if (origStudent && String(origStudent.level) !== targetLevel) {
      const countInLevel = (students ?? []).filter(
        (s: any) => String(s.level) === targetLevel,
      ).length;
      if (countInLevel >= 400) {
        return toast.error(
          `Limit reached: Cannot change to Level ${targetLevel} because it has already reached the maximum 400 students.`,
        );
      }
    }
    const payload: any = {
      full_name: editing.full_name,
      index_number: editing.index_number,
      email: editing.email || null,
      level: editing.level,
      program: editing.program || null,
      department_id: editing.department_id || null,
    };
    try {
      await updateDoc(doc(firestoreDb, "students", editing.id), payload);
      toast.success("Updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["students"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update student");
    }
  };

  const ensureDept = async (name: string, cache: Map<string, string>): Promise<string | null> => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    const existing = (depts ?? []).find((d: any) => d.name.toLowerCase() === key);
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }
    const currentUid = firebaseAuth.currentUser?.uid;
    const insertPayload: any = { name: name.trim() };
    if (currentUid) insertPayload.owner_id = currentUid;
    try {
      const docRef = await addDoc(collection(firestoreDb, "departments"), insertPayload);
      cache.set(key, docRef.id);
      return docRef.id;
    } catch (err) {
      console.error("[departments.insert error]", err);
      return null;
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const toastId = toast.loading(`Reading ${f.name}...`);
    try {
      const rawRows = await parseExcelFile(f);
      if (!rawRows.length) {
        toast.error("Excel file is empty", { id: toastId });
        return;
      }
      const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.]/g, "");
      const pick = (row: any, keys: string[]) => {
        const map: Record<string, any> = {};
        for (const k of Object.keys(row)) map[norm(k)] = row[k];
        for (const k of keys) {
          const v = map[norm(k)];
          if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
        }
        return "";
      };
      // Level is free-form text now; any digits (or the raw value) accepted
      const deptCache = new Map<string, string>();
      const prepared: any[] = [];
      const currentUserId = firebaseAuth.currentUser?.uid;

      for (const r of rawRows) {
        const full_name = pick(r, ["fullname", "name", "studentname", "students", "student"]);
        const index_number = pick(r, [
          "indexnumber",
          "index",
          "indexno",
          "studentid",
          "studentnumber",
          "id",
          "matric",
          "matricnumber",
        ]);
        if (!full_name || !index_number) continue;
        const lvl = pick(r, ["level", "yearofstudy", "year"]).replace(/[^0-9]/g, "") || "100";
        // Take programme name as department if no department column
        const programme = pick(r, [
          "program",
          "programme",
          "programmename",
          "programname",
          "course",
          "major",
        ]);
        const deptName = pick(r, ["department", "dept", "departmentname"]) || programme;
        let department_id: string | null = null;
        if (deptName) department_id = await ensureDept(deptName, deptCache);
        prepared.push({
          full_name,
          index_number,
          email: pick(r, ["email", "emailaddress", "gmail", "mail"]) || null,
          program: programme || null,
          level: lvl || "100",
          department_id,
          qr_uuid: crypto.randomUUID(),
          ...(currentUserId ? { owner_id: currentUserId } : {}),
        });
      }
      if (!prepared.length) {
        toast.error("No valid rows found. Need columns: name + index number", { id: toastId });
        return;
      }
      toast.loading(`Importing ${prepared.length} students...`, { id: toastId });
      const existingIndexes = new Set(
        (students ?? []).map((s: any) => String(s.index_number).trim().toLowerCase()),
      );
      const levelCounts: Record<string, number> = {};
      for (const s of students ?? []) {
        const l = String(s.level || "100");
        levelCounts[l] = (levelCounts[l] || 0) + 1;
      }

      const BATCH = 250;
      let inserted = 0;
      let dupes = 0;
      let skippedLimit = 0;

      for (let i = 0; i < prepared.length; i += BATCH) {
        const chunk = prepared.slice(i, i + BATCH);
        const batch = writeBatch(firestoreDb);
        let batchCount = 0;

        for (const item of chunk) {
          const idxKey = String(item.index_number).trim().toLowerCase();
          if (existingIndexes.has(idxKey)) {
            dupes++;
            continue;
          }
          const itemLvl = String(item.level || "100");
          if ((levelCounts[itemLvl] || 0) >= 400) {
            skippedLimit++;
            continue;
          }

          existingIndexes.add(idxKey);
          levelCounts[itemLvl] = (levelCounts[itemLvl] || 0) + 1;
          const newDocRef = doc(collection(firestoreDb, "students"));
          batch.set(newDocRef, item);
          batchCount++;
          inserted++;
        }

        if (batchCount > 0) {
          await batch.commit();
        }
      }
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      let msg = `Imported ${inserted} · ${dupes} already existed`;
      if (skippedLimit > 0) {
        msg += ` · ${skippedLimit} skipped (exceeded 400 students/level)`;
      }
      toast.success(msg, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed", { id: toastId });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  // Import file with just names + emails — matches existing students by name (order-insensitive) and fills in missing emails
  const onImportEmails = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const toastId = toast.loading(`Reading ${f.name}...`);
    try {
      const rawRows = await parseExcelFile(f);
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      // Extract name+email from each row by scanning all cells (handles unordered/messy files)
      const pairs = rawRows
        .map((r: any) => {
          let name = "";
          let email = "";
          for (const [k, vRaw] of Object.entries(r)) {
            const v = String(vRaw ?? "").trim();
            if (!v) continue;
            const kn = k.toLowerCase();
            if (!email && /mail|email|gmail/.test(kn) && emailRe.test(v)) email = v;
            else if (!email && emailRe.test(v)) email = v;
            if (!name && /name|student/.test(kn) && !emailRe.test(v)) name = v;
          }
          // Fallback: pick longest non-email text as name
          if (!name) {
            const candidates = Object.values(r)
              .map((v) => String(v ?? "").trim())
              .filter(
                (v) => v && !emailRe.test(v) && v.split(/\s+/).length >= 2 && /^[a-zA-Z]/.test(v),
              );
            if (candidates.length) name = candidates.sort((a, b) => b.length - a.length)[0];
          }
          return { name, email };
        })
        .filter((r) => r.name && r.email);
      if (!pairs.length) {
        toast.error("Couldn't find name+email pairs in the file", { id: toastId });
        return;
      }
      // Token-set key: "Firstname Lastname" == "Lastname Firstname", case/punctuation insensitive
      const nameKey = (s: string) =>
        s
          .trim()
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter(Boolean)
          .sort()
          .join(" ");
      const byName = new Map<string, any>();
      for (const s of students ?? []) byName.set(nameKey(s.full_name), s);
      let updated = 0,
        missing = 0,
        skipped = 0;
      for (const p of pairs) {
        const s = byName.get(nameKey(p.name));
        if (!s) {
          missing++;
          continue;
        }
        if (s.email && s.email.toLowerCase() === p.email.toLowerCase()) {
          skipped++;
          continue;
        }
        try {
          await updateDoc(doc(firestoreDb, "students", s.id), { email: p.email });
          updated++;
        } catch {
          // ignore error
        }
      }
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(
        `Updated ${updated} emails · ${skipped} already set · ${missing} name not in system`,
        { id: toastId },
      );
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed", { id: toastId });
    }
    if (emailFileRef.current) emailFileRef.current.value = "";
  };

  const deleteAll = async () => {
    const toastId = toast.loading("Deleting all students...");
    const currentUid = firebaseAuth.currentUser?.uid;
    try {
      const idSet = new Set<string>();
      if (currentUid) {
        try {
          const snap = await getDocs(
            query(collection(firestoreDb, "students"), where("owner_id", "==", currentUid)),
          );
          snap.docs.forEach((d) => idSet.add(d.id));
        } catch (err) {
          console.warn("Could not query students by owner_id for deleteAll:", err);
        }
      }

      // Also include any currently visible students
      (students ?? []).forEach((s: any) => {
        if (s.id) idSet.add(s.id);
      });

      const allIds = Array.from(idSet);
      if (allIds.length === 0) {
        toast.info("No students found to delete", { id: toastId });
        return;
      }

      // Delete in batches of 200 to safely stay under Firestore's 500-op limit
      for (let i = 0; i < allIds.length; i += 200) {
        const chunk = allIds.slice(i, i + 200);
        const batch = writeBatch(firestoreDb);
        chunk.forEach((id) => batch.delete(doc(firestoreDb, "students", id)));
        await batch.commit();
      }

      await qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(`Successfully deleted all ${allIds.length} students`, { id: toastId });
    } catch (err: any) {
      console.error("Batch delete failed, attempting individual fallback deletes:", err);
      try {
        const fallbackIds = (students ?? []).map((s: any) => s.id).filter(Boolean);
        await Promise.allSettled(
          fallbackIds.map((id: string) => deleteDoc(doc(firestoreDb, "students", id))),
        );
        await qc.invalidateQueries({ queryKey: ["students"] });
        toast.success("Students deleted", { id: toastId });
      } catch (fallbackErr: any) {
        toast.error(err?.message || "Failed to delete students", { id: toastId });
      }
    }
  };

  const downloadTemplate = () => {
    exportToExcel(
      [
        {
          full_name: "Kwame Mensah",
          index_number: "1234567",
          email: "k@knust.edu.gh",
          department: "Computer Science",
          program: "BSc Computer Science",
          level: "100",
        },
      ],
      "students-template",
    );
  };

  const runExport = () => {
    const rows = (students ?? []).filter(
      (s: any) => exportLevel === "all" || String(s.level) === exportLevel,
    );
    if (!rows.length) return toast.error("No students in that class");
    exportToExcel(
      rows.map((s: any) => ({
        full_name: s.full_name,
        index_number: s.index_number,
        email: s.email,
        department: s.departments?.name,
        program: s.program,
        level: s.level,
        qr_uuid: s.qr_uuid,
      })),
      exportLevel === "all" ? "students-all" : `students-level-${exportLevel}`,
    );
    setExportOpen(false);
    toast.success(`Exported ${rows.length} student${rows.length === 1 ? "" : "s"}`);
  };

  const renderTable = (rows: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-3">Name</th>
            <th className="p-3">Index</th>
            <th className="p-3">Level</th>
            <th className="p-3">Dept</th>
            <th className="p-3">Email</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s: any) => (
            <tr key={s.id} className="border-t">
              <td className="p-3 font-medium">{s.full_name}</td>
              <td className="p-3 font-mono text-xs">{s.index_number}</td>
              <td className="p-3">{s.level}</td>
              <td className="p-3">{s.departments?.name ?? "—"}</td>
              <td className="p-3 text-xs">
                {s.email ?? <span className="text-muted-foreground">—</span>}
              </td>
              <td className="p-3 text-right">
                <QrButton student={s} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setEditing({
                      ...s,
                      email: s.email ?? "",
                      program: s.program ?? "",
                      department_id: s.department_id ?? "",
                    })
                  }
                  title="Edit"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStudentToDelete({ id: s.id, name: s.full_name })}
                  title={`Delete ${s.full_name}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                No students
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold">Students</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            Template
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onImport} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4 mr-1" />
            Import
          </Button>
          <input
            ref={emailFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={onImportEmails}
          />
          <Button variant="outline" onClick={() => emailFileRef.current?.click()}>
            <Mail className="size-4 mr-1" />
            Import emails
          </Button>
          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Export</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export students</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Which class do you want to export?</Label>
                  <Select value={exportLevel} onValueChange={setExportLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {levels.map((l: string) => (
                        <SelectItem key={l} value={l}>
                          Level {l} (
                          {(students ?? []).filter((s: any) => String(s.level) === l).length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={runExport}>
                  Export to Excel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={levelsOpen} onOpenChange={setLevelsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Classes</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Manage classes (levels)</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value)}
                    placeholder="e.g. 500"
                  />
                  <Button onClick={addLevel}>
                    <Plus className="size-4 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="divide-y rounded-md border">
                  {levels.map((l: string) => {
                    const count = (students ?? []).filter((s: any) => String(s.level) === l).length;
                    return (
                      <div key={l} className="flex items-center justify-between p-2 text-sm">
                        <span>
                          Level {l} ·{" "}
                          <span className="text-muted-foreground">
                            {count} student{count === 1 ? "" : "s"}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => requestRemoveLevel(l)}
                          title="Remove level"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                  {!levels.length && (
                    <div className="p-3 text-sm text-muted-foreground">No classes yet</div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  A class can only be removed when it has no students.
                </p>
                <AlertDialog
                  open={!!levelToDelete}
                  onOpenChange={(o) => !o && setLevelToDelete(null)}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="size-5 text-destructive" />
                        Delete class (level {levelToDelete})?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the class <b>Level {levelToDelete}</b> from your
                        account. It will disappear from the class tabs, the add/edit student
                        pickers, and the export chooser. Any past attendance already recorded stays
                        untouched, but you will have to re-create the class if you need it again.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => levelToDelete && removeLevel(levelToDelete)}
                      >
                        Yes, delete this class
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="size-4 mr-1" />
                Delete all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" />
                  Delete every student?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove <b>all students you own</b>, along with their QR
                  codes, course registrations and attendance records. This action{" "}
                  <b>cannot be undone</b>. Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={deleteAll}
                >
                  Yes, delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add student</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Full name</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Index number</Label>
                    <Input
                      value={form.index_number}
                      onChange={(e) => setForm({ ...form, index_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Level (class)</Label>
                    <Input
                      list="level-suggestions"
                      value={form.level}
                      onChange={(e) => setForm({ ...form, level: e.target.value.trim() })}
                      placeholder="e.g. 100, 500, 600"
                    />
                    <datalist id="level-suggestions">
                      {levels.map((l: string) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Program</Label>
                  <Input
                    value={form.program}
                    onChange={(e) => setForm({ ...form, program: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Department</Label>
                  <Select
                    value={form.department_id}
                    onValueChange={(v) => setForm({ ...form, department_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
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
                <Button onClick={add} className="w-full">
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base">
              {filtered.length} student{filtered.length === 1 ? "" : "s"}
            </CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {levels.map((l: string) => (
                  <TabsTrigger key={l} value={l}>
                    L{l}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, index, email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tab === "all" ? (
            <div className="divide-y">
              {levels.map((l: string) => (
                <div key={l}>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide bg-muted/30 text-muted-foreground">
                    Level {l} · {grouped[l].length}
                  </div>
                  {renderTable(grouped[l])}
                </div>
              ))}
            </div>
          ) : (
            renderTable(filtered)
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input
                  value={editing.full_name}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Index number</Label>
                  <Input
                    value={editing.index_number}
                    onChange={(e) => setEditing({ ...editing, index_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Level (class)</Label>
                  <Input
                    list="level-suggestions-edit"
                    value={editing.level ?? ""}
                    onChange={(e) => setEditing({ ...editing, level: e.target.value.trim() })}
                  />
                  <datalist id="level-suggestions-edit">
                    {levels.map((l: string) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Program</Label>
                <Input
                  value={editing.program}
                  onChange={(e) => setEditing({ ...editing, program: e.target.value })}
                />
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

      {/* Delete Student Confirmation Dialog */}
      <AlertDialog open={!!studentToDelete} onOpenChange={(o) => !o && setStudentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Delete Student?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <b>{studentToDelete?.name}</b>?
              <br />
              <br />
              This will remove the student profile, portal link, and historical attendance data for
              this student. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={executeDeleteStudent}
            >
              Yes, delete student
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function QrButton({ student }: { student: any }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const show = async () => {
    setOpen(true);
    let qrValue = student.qr_uuid;
    if (!qrValue || typeof qrValue !== "string" || !qrValue.trim()) {
      qrValue = student.index_number || student.id || crypto.randomUUID();
      if (student.id) {
        updateDoc(doc(firestoreDb, "students", student.id), { qr_uuid: qrValue }).catch((e) =>
          console.error("Could not persist student qr_uuid", e),
        );
      }
    }
    try {
      const url = await QRCode.toDataURL(qrValue, {
        width: 320,
        margin: 2,
        color: { dark: "#1e3a8a", light: "#ffffff" },
      });
      setDataUrl(url);
    } catch (err) {
      console.error("Error creating student QR code", err);
      toast.error("Could not render QR code");
    }
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${student.index_number} - QR Code</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;padding:40px;color:#0f172a}.badge{display:inline-block;border:2px solid #0f172a;border-radius:12px;padding:24px 32px;max-width:320px}img{width:220px;height:220px}h2{margin:0 0 10px}h3{margin:12px 0 4px;font-size:20px}p{margin:4px 0;color:#475569;font-size:14px}</style></head><body><div class="badge"><h2>QRoll Student Pass</h2><img src="${dataUrl}" /><h3>${student.full_name}</h3><p><strong>${student.index_number}</strong> · Level ${student.level}</p></div></body></html>`,
    );
    w.document.close();
    setTimeout(() => w.print(), 400);
  };
  return (
    <>
      <Button variant="ghost" size="icon" onClick={show} title="View & Print QR Code">
        <QrCode className="size-4 text-primary" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg pr-6 break-words">
              {student.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4">
            {dataUrl ? (
              <div className="p-3 bg-white rounded-xl shadow-sm border inline-block mx-auto">
                <img
                  src={dataUrl}
                  alt={`QR code for ${student.full_name}`}
                  className="mx-auto size-52 object-contain"
                />
              </div>
            ) : (
              <div className="size-52 bg-muted animate-pulse rounded-xl mx-auto" />
            )}
            <div className="space-y-1">
              <div className="font-mono text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded inline-block">
                {student.index_number}
              </div>
              <div className="text-xs text-muted-foreground">
                Level {student.level}{" "}
                {student.departments?.name ? `· ${student.departments.name}` : ""}
              </div>
              <div className="pt-1">
                <span className="inline-block text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md py-0.5 px-2">
                  Universal Pass · Valid across all courses & lecturers
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {dataUrl && (
                <a
                  href={dataUrl}
                  download={`QRoll-${student.index_number || "student"}.png`}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground py-2 px-3 rounded-lg border transition"
                >
                  <Download className="size-3.5" />
                  Save PNG
                </a>
              )}
              <Button onClick={print} className="w-full text-xs">
                <Printer className="size-3.5 mr-1" />
                Print Pass
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
