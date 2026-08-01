import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Upload, QrCode, Printer, Trash2, Search, Mail, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { parseExcelFile, exportToExcel } from "@/lib/exporters";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({ meta: [{ title: "Students — KNUST" }] }),
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

  const [form, setForm] = useState({ full_name: "", index_number: "", email: "", level: "100", program: "", department_id: "" });
  const [editing, setEditing] = useState<any | null>(null);

  const { data: students } = useQuery({
    queryKey: ["students"],
    queryFn: async () => (await supabase.from("students").select("*, departments(name)").order("full_name")).data ?? [],
  });
  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });
  const { data: classLevels } = useQuery({
    queryKey: ["class-levels"],
    queryFn: async () => {
      const { data } = await supabase.from("class_levels").select("id, name").order("name");
      if (data && data.length === 0) {
        await supabase.from("class_levels").insert(DEFAULT_LEVELS.map((name) => ({ name })) as any);
        const seeded = await supabase.from("class_levels").select("id, name").order("name");
        return seeded.data ?? [];
      }
      return data ?? [];
    },
  });

  // Levels the user manages, plus any level already present in the data
  const levels = useMemo(() => {
    const set = new Set<string>((classLevels ?? []).map((l: any) => String(l.name)));
    for (const s of students ?? []) if (s.level) set.add(String(s.level));
    return Array.from(set).sort((a, b) => {
      const an = parseInt(a, 10), bn = parseInt(b, 10);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return a.localeCompare(b);
    });
  }, [students, classLevels]);

  const addLevel = async () => {
    const name = newLevel.trim();
    if (!name) return toast.error("Enter a level name");
    if (levels.includes(name)) return toast.error("That level already exists");
    const { error } = await supabase.from("class_levels").insert({ name } as any);
    if (error) return toast.error(error.message);
    setNewLevel("");
    toast.success(`Level ${name} added`);
    qc.invalidateQueries({ queryKey: ["class-levels"] });
  };

  const removeLevel = async (name: string) => {
    const count = (students ?? []).filter((s: any) => String(s.level) === name).length;
    if (count > 0) return toast.error(`Level ${name} still has ${count} student${count === 1 ? "" : "s"}. Move or delete them first.`);
    if (!confirm(`Remove level ${name}?`)) return;
    const { error } = await supabase.from("class_levels").delete().eq("name", name);
    if (error) return toast.error(error.message);
    if (tab === name) setTab("all");
    toast.success(`Level ${name} removed`);
    qc.invalidateQueries({ queryKey: ["class-levels"] });
  };


  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return (students ?? []).filter((st: any) => {
      if (tab !== "all" && String(st.level) !== tab) return false;
      if (!s) return true;
      return st.full_name.toLowerCase().includes(s) || st.index_number.toLowerCase().includes(s) || (st.email ?? "").toLowerCase().includes(s);
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
    if (!form.full_name || !form.index_number) return toast.error("Name and index required");
    const payload: any = { ...form };
    if (!payload.department_id) delete payload.department_id;
    if (!payload.email) delete payload.email;
    const { error } = await supabase.from("students").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success("Student added");
    setForm({ full_name: "", index_number: "", email: "", level: "100", program: "", department_id: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["students"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete student?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["students"] });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const payload: any = {
      full_name: editing.full_name, index_number: editing.index_number,
      email: editing.email || null, level: editing.level, program: editing.program || null,
      department_id: editing.department_id || null,
    };
    const { error } = await supabase.from("students").update(payload).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["students"] });
  };

  const ensureDept = async (name: string, cache: Map<string, string>): Promise<string | null> => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    const existing = (depts ?? []).find((d: any) => d.name.toLowerCase() === key);
    if (existing) { cache.set(key, existing.id); return existing.id; }
    const { data, error } = await supabase.from("departments").insert({ name: name.trim() } as any).select("id").single();
    if (error || !data) return null;
    cache.set(key, data.id);
    return data.id;
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const toastId = toast.loading(`Reading ${f.name}...`);
    try {
      const rawRows = await parseExcelFile(f);
      if (!rawRows.length) { toast.error("Excel file is empty", { id: toastId }); return; }
      const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, "");
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
      for (const r of rawRows) {
        const full_name = pick(r, ["fullname", "name", "studentname", "students", "student"]);
        const index_number = pick(r, ["indexnumber", "index", "indexno", "studentid", "studentnumber", "id", "matric", "matricnumber"]);
        if (!full_name || !index_number) continue;
        const lvl = pick(r, ["level", "yearofstudy", "year"]).replace(/[^0-9]/g, "") || "100";
        // Take programme name as department if no department column
        const programme = pick(r, ["program", "programme", "programmename", "programname", "course", "major"]);
        const deptName = pick(r, ["department", "dept", "departmentname"]) || programme;
        let department_id: string | null = null;
        if (deptName) department_id = await ensureDept(deptName, deptCache);
        prepared.push({
          full_name, index_number,
          email: pick(r, ["email", "emailaddress", "gmail", "mail"]) || null,
          program: programme || null,
          level: lvl || "100",
          department_id,
        });
      }
      if (!prepared.length) { toast.error("No valid rows found. Need columns: name + index number", { id: toastId }); return; }
      toast.loading(`Importing ${prepared.length} students...`, { id: toastId });
      const BATCH = 100;
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < prepared.length; i += BATCH) {
        const chunk = prepared.slice(i, i + BATCH);
        // Insert-only with duplicate index_number ignored (RLS blocks UPDATE on rows owned by others)
        const { error, data } = await supabase
          .from("students")
          .upsert(chunk as any, { onConflict: "index_number", ignoreDuplicates: true })
          .select("id");
        if (error) errors.push(error.message);
        else inserted += data?.length ?? 0;
      }
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      const dupes = prepared.length - inserted;
      if (errors.length) toast.error(errors[0], { id: toastId });
      else toast.success(`Imported ${inserted} · ${dupes} already existed`, { id: toastId });
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
      const pairs = rawRows.map((r: any) => {
        let name = "";
        let email = "";
        for (const [k, vRaw] of Object.entries(r)) {
          const v = String(vRaw ?? "").trim();
          if (!v) continue;
          const kn = k.toLowerCase();
          if (!email && emailRe.test(v)) email = v;
          else if (!email && /mail|email|gmail/.test(kn) && emailRe.test(v)) email = v;
          if (!name && /name|student/.test(kn) && !emailRe.test(v)) name = v;
        }
        // Fallback: pick longest non-email text as name
        if (!name) {
          const candidates = Object.values(r)
            .map((v) => String(v ?? "").trim())
            .filter((v) => v && !emailRe.test(v) && v.split(/\s+/).length >= 2 && /^[a-zA-Z]/.test(v));
          if (candidates.length) name = candidates.sort((a, b) => b.length - a.length)[0];
        }
        return { name, email };
      }).filter((r) => r.name && r.email);
      if (!pairs.length) { toast.error("Couldn't find name+email pairs in the file", { id: toastId }); return; }
      // Token-set key: "Firstname Lastname" == "Lastname Firstname", case/punctuation insensitive
      const nameKey = (s: string) => s.trim().toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean).sort().join(" ");
      const byName = new Map<string, any>();
      for (const s of students ?? []) byName.set(nameKey(s.full_name), s);
      let updated = 0, missing = 0, skipped = 0;
      for (const p of pairs) {
        const s = byName.get(nameKey(p.name));
        if (!s) { missing++; continue; }
        if (s.email && s.email.toLowerCase() === p.email.toLowerCase()) { skipped++; continue; }
        const { error } = await supabase.from("students").update({ email: p.email } as any).eq("id", s.id);
        if (!error) updated++;
      }
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(`Updated ${updated} emails · ${skipped} already set · ${missing} name not in system`, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed", { id: toastId });
    }
    if (emailFileRef.current) emailFileRef.current.value = "";
  };

  const deleteAll = async () => {
    const toastId = toast.loading("Deleting all students...");
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) { toast.error("Not signed in", { id: toastId }); return; }
    const { error, count } = await supabase.from("students").delete({ count: "exact" }).eq("owner_id", me.user.id);
    if (error) return toast.error(error.message, { id: toastId });
    qc.invalidateQueries({ queryKey: ["students"] });
    toast.success(`Deleted ${count ?? 0} students`, { id: toastId });
  };

  const downloadTemplate = () => {
    exportToExcel([{ full_name: "Kwame Mensah", index_number: "1234567", email: "k@knust.edu.gh", department: "Computer Science", program: "BSc Computer Science", level: "100" }], "students-template");
  };

  const runExport = () => {
    const rows = (students ?? []).filter((s: any) => exportLevel === "all" || String(s.level) === exportLevel);
    if (!rows.length) return toast.error("No students in that class");
    exportToExcel(rows.map((s: any) => ({
      full_name: s.full_name, index_number: s.index_number, email: s.email,
      department: s.departments?.name, program: s.program, level: s.level, qr_uuid: s.qr_uuid,
    })), exportLevel === "all" ? "students-all" : `students-level-${exportLevel}`);
    setExportOpen(false);
    toast.success(`Exported ${rows.length} student${rows.length === 1 ? "" : "s"}`);
  };


  const renderTable = (rows: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr><th className="p-3">Name</th><th className="p-3">Index</th><th className="p-3">Level</th><th className="p-3">Dept</th><th className="p-3">Email</th><th className="p-3 text-right">Actions</th></tr>
        </thead>
        <tbody>
          {rows.map((s: any) => (
            <tr key={s.id} className="border-t">
              <td className="p-3 font-medium">{s.full_name}</td>
              <td className="p-3 font-mono text-xs">{s.index_number}</td>
              <td className="p-3">{s.level}</td>
              <td className="p-3">{s.departments?.name ?? "—"}</td>
              <td className="p-3 text-xs">{s.email ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="p-3 text-right">
                <QrButton student={s} />
                <Button variant="ghost" size="icon" onClick={() => setEditing({ ...s, email: s.email ?? "", program: s.program ?? "", department_id: s.department_id ?? "" })} title="Edit"><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(s.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No students</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold">Students</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>Template</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onImport} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4 mr-1" />Import</Button>
          <input ref={emailFileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onImportEmails} />
          <Button variant="outline" onClick={() => emailFileRef.current?.click()}><Mail className="size-4 mr-1" />Import emails</Button>
          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogTrigger asChild><Button variant="outline">Export</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Export students</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Which class do you want to export?</Label>
                  <Select value={exportLevel} onValueChange={setExportLevel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All classes</SelectItem>
                      {levels.map((l: string) => (
                        <SelectItem key={l} value={l}>
                          Level {l} ({(students ?? []).filter((s: any) => String(s.level) === l).length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={runExport}>Export to Excel</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={levelsOpen} onOpenChange={setLevelsOpen}>
            <DialogTrigger asChild><Button variant="outline">Classes</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Manage classes (levels)</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={newLevel} onChange={(e) => setNewLevel(e.target.value)} placeholder="e.g. 500" />
                  <Button onClick={addLevel}><Plus className="size-4 mr-1" />Add</Button>
                </div>
                <div className="divide-y rounded-md border">
                  {levels.map((l: string) => {
                    const count = (students ?? []).filter((s: any) => String(s.level) === l).length;
                    return (
                      <div key={l} className="flex items-center justify-between p-2 text-sm">
                        <span>Level {l} · <span className="text-muted-foreground">{count} student{count === 1 ? "" : "s"}</span></span>
                        <Button variant="ghost" size="icon" onClick={() => removeLevel(l)} title="Remove level">
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                  {!levels.length && <div className="p-3 text-sm text-muted-foreground">No classes yet</div>}
                </div>
                <p className="text-xs text-muted-foreground">A class can only be removed when it has no students.</p>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive"><Trash2 className="size-4 mr-1" />Delete all</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-destructive" />Delete every student?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove <b>all students you own</b>, along with their QR codes, course registrations and attendance records. This action <b>cannot be undone</b>. Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteAll}>Yes, delete everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4 mr-1" />Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add student</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Index number</Label><Input value={form.index_number} onChange={(e) => setForm({ ...form, index_number: e.target.value })} /></div>
                  <div><Label>Level (class)</Label>
                    <Input list="level-suggestions" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value.trim() })} placeholder="e.g. 100, 500, 600" />
                    <datalist id="level-suggestions">
                      {levels.map((l: string) => <option key={l} value={l} />)}
                    </datalist>
                  </div>

                </div>
                <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Program</Label><Input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} /></div>
                <div><Label>Department</Label>
                  <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(depts ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={add} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base">{filtered.length} student{filtered.length === 1 ? "" : "s"}</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {levels.map((l: string) => <TabsTrigger key={l} value={l}>L{l}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, index, email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tab === "all" ? (
            <div className="divide-y">
              {levels.map((l: string) => (
                <div key={l}>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide bg-muted/30 text-muted-foreground">Level {l} · {grouped[l].length}</div>
                  {renderTable(grouped[l])}
                </div>
              ))}
            </div>
          ) : renderTable(filtered)}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit student</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Full name</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Index number</Label><Input value={editing.index_number} onChange={(e) => setEditing({ ...editing, index_number: e.target.value })} /></div>
                <div><Label>Level (class)</Label>
                  <Input list="level-suggestions-edit" value={editing.level ?? ""} onChange={(e) => setEditing({ ...editing, level: e.target.value.trim() })} />
                  <datalist id="level-suggestions-edit">
                    {levels.map((l: string) => <option key={l} value={l} />)}
                  </datalist>
                </div>

              </div>
              <div><Label>Email</Label><Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label>Program</Label><Input value={editing.program} onChange={(e) => setEditing({ ...editing, program: e.target.value })} /></div>
              <div><Label>Department</Label>
                <Select value={editing.department_id} onValueChange={(v) => setEditing({ ...editing, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{(depts ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={saveEdit} className="w-full">Save changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function QrButton({ student }: { student: any }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const show = async () => {
    setOpen(true);
    const url = await QRCode.toDataURL(student.qr_uuid, { width: 320, margin: 2, color: { dark: "#006633", light: "#ffffff" } });
    setDataUrl(url);
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${student.index_number}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>KNUST Attendance</h2><img src="${dataUrl}" /><h3>${student.full_name}</h3><p>${student.index_number} · Level ${student.level}</p></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };
  return (
    <>
      <Button variant="ghost" size="icon" onClick={show}><QrCode className="size-4" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{student.full_name}</DialogTitle></DialogHeader>
          <div className="text-center space-y-3">
            {dataUrl && <img src={dataUrl} alt="QR" className="mx-auto rounded-lg border" />}
            <div className="text-sm text-muted-foreground">{student.index_number} · Level {student.level}</div>
            <Button onClick={print} className="w-full"><Printer className="size-4 mr-1" />Print</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
