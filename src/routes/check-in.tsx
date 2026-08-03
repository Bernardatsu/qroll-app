import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, GraduationCap, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";

const search = z.object({ session: z.string().uuid().optional() });

export const Route = createFileRoute("/check-in")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [{ title: "Check in — QRoll" }] }),
  component: CheckInPage,
});

function CheckInPage() {
  const { session } = Route.useSearch();
  const [index, setIndex] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ name: string; distance: number } | null>(null);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full"><CardHeader><CardTitle>Invalid link</CardTitle><CardDescription>This check-in link is missing a session. Scan the QR projected by your lecturer.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  const getPos = () => new Promise<GeolocationPosition>((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Geolocation not supported on this device"));
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 });
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!index.trim()) return toast.error("Enter your index number");
    setLoading(true);
    try {
      const pos = await getPos();
      const { data, error } = await supabase.rpc("self_checkin_geo", {
        _session_id: session, _index: index.trim(),
        _lat: pos.coords.latitude, _lng: pos.coords.longitude,
      });
      if (error) throw error;
      const row = (data as any[])?.[0];
      if (!row?.ok) throw new Error(row?.message ?? "Failed");
      setDone({ name: row.student_name, distance: row.distance_m });
    } catch (err: any) {
      toast.error(err.message ?? "Check-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <div className="flex-1 flex flex-col items-center p-6">
      <div className="flex items-center gap-2 mb-6 mt-4">
        <GraduationCap className="size-7 text-primary" />
        <h1 className="text-2xl font-bold">QRoll Self Check-in</h1>
      </div>

      {done ? (
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6 space-y-3">
            <CheckCircle2 className="size-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold">You're marked present</h2>
            <p className="text-muted-foreground">{done.name}</p>
            <p className="text-xs text-muted-foreground">Verified {done.distance} m from the classroom</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Mark yourself present</CardTitle>
            <CardDescription className="flex items-center gap-1"><MapPin className="size-3.5" />Location must be on. You have to be physically in class.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Index number</Label><Input value={index} onChange={(e) => setIndex(e.target.value)} required autoFocus /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Verifying location..." : "Check in"}</Button>
            </form>
          </CardContent>
        </Card>
      )}
      </div>
      <PublicFooter />
    </div>
  );
}
