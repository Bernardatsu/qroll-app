import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({ meta: [{ title: "Departments — KNUST" }] }),
  component: DeptPage,
});

function DeptPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [yName, setYName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; code: string } | null>(null);

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });
  const { data: years } = useQuery({
    queryKey: ["years"],
    queryFn: async () => (await supabase.from("academic_years").select("*").order("name", { ascending: false })).data ?? [],
  });

  const addDept = async () => {
    if (!name || !code) return;
    const { error } = await supabase.from("departments").insert({ name, code } as any);
    if (error) toast.error(error.message);
    else { toast.success("Department added"); setName(""); setCode(""); qc.invalidateQueries({ queryKey: ["departments"] }); }
  };
  const delDept = async (id: string) => {
    if (!confirm("Delete department?")) return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["departments"] });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("departments").update({ name: editing.name, code: editing.code }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["departments"] });
    toast.success("Updated");
  };
  const addYear = async () => {
    if (!yName) return;
    const { error } = await supabase.from("academic_years").insert({ name: yName } as any);
    if (error) toast.error(error.message);
    else { toast.success("Year added"); setYName(""); qc.invalidateQueries({ queryKey: ["years"] }); }
  };
  const setCurrent = async (id: string) => {
    await supabase.from("academic_years").update({ is_current: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("academic_years").update({ is_current: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["years"] });
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-6">Departments & Academic Years</h1>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Departments</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Computer Science" /></div>
              <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CSM" /></div>
            </div>
            <Button onClick={addDept} className="w-full"><Plus className="size-4 mr-1" />Add department</Button>
            <div className="divide-y rounded-md border">
              {(depts ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 p-3">
                  {editing?.id === d.id ? (
                    <>
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <Input className="col-span-2" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                        <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                      </div>
                      <Button variant="ghost" size="icon" onClick={saveEdit}><Check className="size-4 text-success" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(null)}><X className="size-4" /></Button>
                    </>
                  ) : (
                    <>
                      <div><div className="font-medium">{d.name}</div><div className="text-xs text-muted-foreground">{d.code}</div></div>
                      <div className="flex">
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ id: d.id, name: d.name, code: d.code ?? "" })}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => delDept(d.id)}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!depts?.length && <div className="p-4 text-sm text-muted-foreground">No departments yet.</div>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Academic Years</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1"><Label>Year name</Label><Input value={yName} onChange={(e) => setYName(e.target.value)} placeholder="2025/2026" /></div>
              <Button onClick={addYear}><Plus className="size-4 mr-1" />Add</Button>
            </div>
            <div className="divide-y rounded-md border">
              {(years ?? []).map((y) => (
                <div key={y.id} className="flex items-center justify-between p-3">
                  <div className="font-medium">{y.name} {y.is_current && <span className="ml-2 text-xs bg-gold text-gold-foreground px-2 py-0.5 rounded">current</span>}</div>
                  {!y.is_current && <Button variant="outline" size="sm" onClick={() => setCurrent(y.id)}>Set current</Button>}
                </div>
              ))}
              {!years?.length && <div className="p-4 text-sm text-muted-foreground">No academic years yet.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
