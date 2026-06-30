import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Trash2, Power } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/portal-links")({
  head: () => ({ meta: [{ title: "Student Portal Links — KNUST" }] }),
  component: PortalLinksPage,
});

function PortalLinksPage() {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState("");

  const { data: courses } = useQuery({
    queryKey: ["courses-active"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title").eq("archived", false).order("code")).data ?? [],
  });
  const { data: links } = useQuery({
    queryKey: ["portal-links"],
    queryFn: async () => (await supabase.from("student_portal_links").select("*, courses(code, title)").order("created_at", { ascending: false })).data ?? [],
  });

  const create = async () => {
    if (!courseId) return toast.error("Pick a course");
    const { error } = await supabase.from("student_portal_links").insert({ course_id: courseId } as any);
    if (error) return toast.error(error.message);
    toast.success("Link created");
    setCourseId("");
    qc.invalidateQueries({ queryKey: ["portal-links"] });
  };
  const toggle = async (l: any) => {
    await supabase.from("student_portal_links").update({ is_active: !l.is_active }).eq("id", l.id);
    qc.invalidateQueries({ queryKey: ["portal-links"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this link?")) return;
    await supabase.from("student_portal_links").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["portal-links"] });
  };
  const copy = (token: string) => {
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <AppShell>
      <h1 className="text-3xl font-bold mb-6">Student QR Portal Links</h1>
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Create new link</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Select course" /></SelectTrigger>
            <SelectContent>{(courses ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={create}>Generate link</Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground mb-3">Share the link with your class. Students enter their <b>index number</b> and <b>email</b> to retrieve their personal QR code and 4-digit PIN.</p>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr><th className="p-3">Course</th><th className="p-3">Link</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {(links ?? []).map((l: any) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-3 font-medium">{l.courses?.code}</td>
                    <td className="p-3 font-mono text-xs break-all">{window.location.origin}/portal/{l.token}</td>
                    <td className="p-3">{l.is_active ? <span className="text-primary">Active</span> : <span className="text-muted-foreground">Disabled</span>}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => copy(l.token)} title="Copy"><Copy className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => toggle(l)} title="Toggle"><Power className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(l.id)} title="Delete"><Trash2 className="size-4 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
                {!links?.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No links yet</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
