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
import { Plus, Upload, QrCode, Printer, Trash2, Search, Mail, AlertTriangle } from "lucide-react";
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

const LEVELS = ["100", "200", "300", "400"] as const;

function StudentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "100" | "200" | "300" | "400">("all");
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const emailFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ full_name: "", index_number: "", email: "", level: "100", program: "", department_id: "" });

  const { data: students } = useQuery({
    queryKey: ["students"],
    queryFn: async () => (await supabase.from("students").select("*, departments(name)").order("full_name")).data ?? [],
  });
  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return (students ?? []).filter((st: any) => {
      if (tab !== "all" && String(st.level) !== tab) return false;
      if (!s) return true;
      return st.full_name.toLowerCase().includes(s) || st.index_number.toLowerCase().includes(s) || (st.email ?? "").toLowerCase().includes(s);
    });
  }, [students, q, tab]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { "100": [], "200": [], "300": [], "400": [] };
    for (const s of filtered) if (g[String(s.level)]) g[String(s.level)].push(s);
    return g;
  }, [filtered]);

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
      const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");
      const pick = (row: any, keys: string[]) => {
        const map: Record<string, any> = {};
        for (const k of Object.keys(row)) map[norm(k)] = row[k];
        for (const k of keys) {
          const v = map[norm(k)];
          if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
        }
        return "";
      };
      const validLevels = new Set(["100", "200", "300", "400"]);
      const deptCache = new Map<string, string>();
      const prepared: any[] = [];
      for (const r of rawRows) {
        const full_name = pick(r, ["fullname", "name", "studentname"]);
        const index_number = pick(r, ["indexnumber", "index", "indexno", "studentid", "id"]);
        if (!full_name || !index_number) continue;
        const lvl = pick(r, ["level", "yearofstudy", "year"]).replace(/[^0-9]/g, "") || "100";
        const deptName = pick(r, ["department", "dept"]);
        let department_id: string | null = null;
        if (deptName) department_id = await ensureDept(deptName, deptCache);
        prepared.push({
          full_name, index_number,
          email: pick(r, ["email", "emailaddress", "gmail", "mail"]) || null,
          program: pick(r, ["program", "programme", "course", "major"]) || null,
          level: (validLevels.has(lvl) ? lvl : "100") as "100" | "200" | "300" | "400",
          department_id,
        });
      }
      if (!prepared.length) { toast.error("No valid rows. Need full_name + index_number", { id: toastId }); return; }
      toast.loading(`Importing ${prepared.length} students...`, { id: toastId });
      const BATCH = 200;
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < prepared.length; i += BATCH) {
        const chunk = prepared.slice(i, i + BATCH);
        const { error, count } = await supabase.from("students").upsert(chunk as any, { onConflict: "index_number", ignoreDuplicates: false, count: "exact" });
        if (error) errors.push(error.message);
        else inserted += count ?? chunk.length;
      }
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      if (errors.length) toast.error(`Imported ${inserted}/${prepared.length}. ${errors[0]}`, { id: toastId });
      else toast.success(`Imported ${inserted} students`, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed", { id: toastId });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  // Import file with just names + emails — matches existing students by name and fills in missing emails
  const onImportEmails = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const toastId = toast.loading(`Reading ${f.name}...`);
    try {
      const rawRows = await parseExcelFile(f);
      const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");
      const pick = (row: any, keys: string[]) => {
        const map: Record<string, any> = {};
        for (const k of Object.keys(row)) map[norm(k)] = row[k];
        for (const k of keys) {
          const v = map[norm(k)];
          if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
        }
        return "";
      };
      const pairs = rawRows
        .map((r: any) => ({
          name: pick(r, ["fullname", "name", "studentname"]),
          email: pick(r, ["email", "emailaddress", "gmail", "mail"]),
        }))
        .filter((r) => r.name && r.email);
      if (!pairs.length) { toast.error("Need columns: name + email", { id: toastId }); return; }
      const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
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
      toast.success(`Updated ${updated} emails · ${skipped} already set · ${missing} name not found`, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed", { id: toastId });
    }
    if (emailFileRef.current) emailFileRef.current.value = "";
  };

  const downloadTemplate = () => {
    exportToExcel([{ full_name: "Kwame Mensah", index_number: "1234567", email: "k@knust.edu.gh", department: "Computer Science", program: "BSc Computer Science", level: "100" }], "students-template");
  };

  const exportAll = () => {
    exportToExcel((students ?? []).map((s: any) => ({
      full_name: s.full_name, index_number: s.index_number, email: s.email,
      department: s.departments?.name, program: s.program, level: s.level, qr_uuid: s.qr_uuid,
    })), "students");
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
          <Button variant="outline" onClick={exportAll}>Export</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4 mr-1" />Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add student</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Index number</Label><Input value={form.index_number} onChange={(e) => setForm({ ...form, index_number: e.target.value })} /></div>
                  <div><Label>Level</Label>
                    <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>Level {l}</SelectItem>)}</SelectContent>
                    </Select>
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
                {LEVELS.map((l) => <TabsTrigger key={l} value={l}>L{l}</TabsTrigger>)}
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
              {LEVELS.map((l) => (
                <div key={l}>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide bg-muted/30 text-muted-foreground">Level {l} · {grouped[l].length}</div>
                  {renderTable(grouped[l])}
                </div>
              ))}
            </div>
          ) : renderTable(filtered)}
        </CardContent>
      </Card>
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
