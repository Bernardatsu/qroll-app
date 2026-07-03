import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/courses")({
  head: () => ({ meta: [{ title: "Courses — KNUST" }] }),
  component: CoursesPage,
});

const LEVELS = ["100", "200", "300", "400"] as const;

function CoursesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", title: "", level: "100", semester: "First", credit_hours: 3, department_id: "", academic_year_id: "" });
  const [editing, setEditing] = useState<any | null>(null);

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => (await supabase.from("courses").select("*, departments(name), academic_years(name)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: depts } = useQuery({ queryKey: ["departments"], queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [] });
  const { data: years } = useQuery({ queryKey: ["years"], queryFn: async () => (await supabase.from("academic_years").select("*").order("name", { ascending: false })).data ?? [] });

  const add = async () => {
    if (!form.code || !form.title) return toast.error("Code and title required");
    const payload: any = { ...form, credit_hours: Number(form.credit_hours) };
    if (!payload.department_id) delete payload.department_id;
    if (!payload.academic_year_id) delete payload.academic_year_id;
    const { error } = await supabase.from("courses").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Course added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["courses"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete course? Registrations and sessions will also be deleted.")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["courses"] });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const payload: any = {
      code: editing.code, title: editing.title, level: editing.level,
      semester: editing.semester, credit_hours: Number(editing.credit_hours),
      department_id: editing.department_id || null,
      academic_year_id: editing.academic_year_id || null,
    };
    const { error } = await supabase.from("courses").update(payload).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["courses"] });
  };

  return (
    <AppShell>
      <div className="flex flex-wrap justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold">Courses</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 mr-1" />Add course</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New course</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CSM 151" /></div>
                <div><Label>Credit hours</Label><Input type="number" value={form.credit_hours} onChange={(e) => setForm({ ...form, credit_hours: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Level</Label>
                  <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>Level {l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Semester</Label>
                  <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="First">First</SelectItem><SelectItem value="Second">Second</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Department</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{(depts ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Academic year</Label>
                <Select value={form.academic_year_id} onValueChange={(v) => setForm({ ...form, academic_year_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{(years ?? []).map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={add} className="w-full">Save</Button>
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
                <span className="text-xs bg-gold text-gold-foreground px-2 py-0.5 rounded">L{c.level}</span>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>{c.departments?.name ?? "No department"} · {c.semester} Sem</div>
              <div>{c.academic_years?.name ?? "—"} · {c.credit_hours} credits</div>
              <div className="flex gap-2 pt-3">
                <Link to={"/courses/$courseId" as string} params={{ courseId: c.id } as any} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full"><Users className="size-3 mr-1" />Roster</Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!courses?.length && <Card><CardContent className="p-8 text-center text-muted-foreground">No courses yet</CardContent></Card>}
      </div>
    </AppShell>
  );
}
