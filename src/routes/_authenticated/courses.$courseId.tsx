import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
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
    queryFn: async () => (await supabase.from("courses").select("*, departments(name)").eq("id", courseId).maybeSingle()).data,
  });
  const { data: roster } = useQuery({
    queryKey: ["roster", courseId],
    queryFn: async () => (await supabase.from("course_registrations").select("id, students(*)").eq("course_id", courseId)).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-pick", search],
    queryFn: async () => {
      let q = supabase.from("students").select("*").limit(20);
      if (search) q = q.or(`full_name.ilike.%${search}%,index_number.ilike.%${search}%`);
      return (await q).data ?? [];
    },
  });

  const register = async (student_id: string) => {
    const { error } = await supabase.from("course_registrations").insert({ course_id: courseId, student_id });
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["roster", courseId] });
  };
  const unregister = async (id: string) => {
    const { error } = await supabase.from("course_registrations").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["roster", courseId] });
  };

  const registeredIds = new Set((roster ?? []).map((r: any) => r.students?.id));

  return (
    <AppShell>
      <Link to={"/courses" as string} className="text-sm text-muted-foreground inline-flex items-center mb-4"><ArrowLeft className="size-4 mr-1" />All courses</Link>
      <h1 className="text-3xl font-bold">{course?.code} — {course?.title}</h1>
      <p className="text-muted-foreground mb-6">Level {course?.level} · {course?.semester} Semester</p>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Registered ({roster?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(roster ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3">
                  <div><div className="font-medium">{r.students?.full_name}</div><div className="text-xs text-muted-foreground font-mono">{r.students?.index_number}</div></div>
                  <Button variant="ghost" size="icon" onClick={() => unregister(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              ))}
              {!roster?.length && <div className="p-6 text-sm text-muted-foreground text-center">No students registered</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Add students</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Search by name or index" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="divide-y border rounded max-h-96 overflow-y-auto">
              {(students ?? []).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3">
                  <div><div className="font-medium">{s.full_name}</div><div className="text-xs text-muted-foreground font-mono">{s.index_number} · L{s.level}</div></div>
                  <Button size="sm" variant="outline" disabled={registeredIds.has(s.id)} onClick={() => register(s.id)}>
                    <Plus className="size-4 mr-1" />{registeredIds.has(s.id) ? "Added" : "Add"}
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
