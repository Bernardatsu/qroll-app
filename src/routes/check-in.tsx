import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, GraduationCap } from "lucide-react";
import { toast } from "sonner";

const search = z.object({ session: z.string().uuid().optional() });

export const Route = createFileRoute("/check-in")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [{ title: "Check in — KNUST" }] }),
  component: CheckInPage,
});

function CheckInPage() {
  const { session } = Route.useSearch();
  const [index, setIndex] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ name: string } | null>(null);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full"><CardHeader><CardTitle>Invalid link</CardTitle><CardDescription>This check-in link is missing a session. Scan the QR projected by your lecturer.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return toast.error("PIN must be 4 digits");
    setLoading(true);
    const { data, error } = await supabase.rpc("self_checkin", { _session_id: session, _index: index.trim(), _pin: pin.trim() });
    setLoading(false);
    if (error) return toast.error(error.message);
    const row = (data as any[])?.[0];
    if (!row?.ok) return toast.error(row?.message ?? "Failed");
    setDone({ name: row.student_name });
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center p-6">
      <div className="flex items-center gap-2 mb-6 mt-4">
        <GraduationCap className="size-7 text-primary" />
        <h1 className="text-2xl font-bold">KNUST Self Check-in</h1>
      </div>

      {done ? (
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6 space-y-3">
            <CheckCircle2 className="size-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">You're marked present</h2>
            <p className="text-muted-foreground">{done.name}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Mark yourself present</CardTitle>
            <CardDescription>Enter your index number and 4-digit PIN. The PIN is private — never share it.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Index number</Label><Input value={index} onChange={(e) => setIndex(e.target.value)} required autoFocus /></div>
              <div><Label>PIN</Label><Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} required className="text-2xl font-mono tracking-widest text-center" /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Checking..." : "Check in"}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
