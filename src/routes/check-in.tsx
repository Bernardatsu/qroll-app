import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { firestoreDb } from "@/integrations/firebase/config";
import { collection, doc, getDoc, getDocs, query, where, addDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, GraduationCap, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";

const search = z.object({ session: z.string().optional() });

export const Route = createFileRoute("/check-in")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [{ title: "Check in — QRoll" }] }),
  component: CheckInPage,
});

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function CheckInPage() {
  const { session } = Route.useSearch();
  const [index, setIndex] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ name: string; distance: number } | null>(null);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>
              This check-in link is missing a session. Scan the QR projected by your lecturer.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getPos = () =>
    new Promise<GeolocationPosition>((res, rej) => {
      if (!navigator.geolocation) return rej(new Error("Geolocation not supported on this device"));
      navigator.geolocation.getCurrentPosition(
        res,
        (err) => {
          // If high accuracy times out (common in concrete university lecture halls), retry with standard accuracy
          if (err.code === err.TIMEOUT) {
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 15000,
            });
          } else if (err.code === err.PERMISSION_DENIED) {
            rej(
              new Error(
                "Location permission denied. Please allow location access in your browser settings to verify you are in class.",
              ),
            );
          } else {
            rej(err);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 10000,
        },
      );
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIndex = index.trim().toUpperCase();
    if (!cleanIndex) return toast.error("Enter your index number");
    setLoading(true);

    try {
      // 1. Verify session
      const sessionDocRef = doc(firestoreDb, "attendance_sessions", session);
      const sessSnap = await getDoc(sessionDocRef);
      if (!sessSnap.exists()) {
        throw new Error("Class session not found or has been removed.");
      }
      const sessData = sessSnap.data() as any;
      if (!sessData.is_active) {
        throw new Error("This attendance session has already been closed by the lecturer.");
      }

      // 2. Geolocation verification
      const pos = await getPos();
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      let distanceM = 0;

      if (typeof sessData.latitude === "number" && typeof sessData.longitude === "number") {
        distanceM = haversineDistanceMeters(
          sessData.latitude,
          sessData.longitude,
          userLat,
          userLng,
        );
        const allowedRadius = sessData.radius_m || 100;
        if (distanceM > allowedRadius) {
          throw new Error(
            `You are too far from the classroom (${Math.round(distanceM)}m away, allowed radius is ${allowedRadius}m).`,
          );
        }
      }

      // 3. Find student
      const studSnap = sessData.owner_id
        ? await getDocs(
            query(
              collection(firestoreDb, "students"),
              where("owner_id", "==", sessData.owner_id),
              where("index_number", "==", cleanIndex),
            ),
          )
        : await getDocs(
            query(collection(firestoreDb, "students"), where("index_number", "==", cleanIndex)),
          );
      if (studSnap.empty) {
        throw new Error(
          "Index number not found in student directory. Please register on the student portal first.",
        );
      }
      const studentDoc = studSnap.docs[0];
      const studentData = studentDoc.data() as any;

      // 4. Check if already checked in
      const recQuery = await getDocs(
        query(
          collection(firestoreDb, "attendance_records"),
          where("session_id", "==", session),
          where("student_id", "==", studentDoc.id),
        ),
      );

      if (!recQuery.empty) {
        setDone({ name: studentData.full_name, distance: Math.round(distanceM) });
        toast.info("You have already checked in to this session.");
        return;
      }

      // 5. Record check-in
      const now = new Date();
      await addDoc(collection(firestoreDb, "attendance_records"), {
        session_id: session,
        student_id: studentDoc.id,
        course_id: sessData.course_id || null,
        owner_id: sessData.owner_id || null,
        session_date: now.toISOString().slice(0, 10),
        check_in_at: now.toISOString(),
        status: "present",
        source: "self_geofence",
        geo_lat: userLat,
        geo_lng: userLng,
        geo_accuracy_m: pos.coords.accuracy || null,
        distance_m: Math.round(distanceM),
        created_at: now.toISOString(),
      });

      setDone({ name: studentData.full_name, distance: Math.round(distanceM) });
      toast.success("Checked in successfully!");
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

        {!done ? (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Confirm attendance</CardTitle>
              <CardDescription>
                Enter your index number. Your device GPS location will verify that you are in the
                lecture hall.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label>Index number</Label>
                  <Input
                    placeholder="e.g. 20700000"
                    value={index}
                    onChange={(e) => setIndex(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <MapPin className="size-4 mr-1.5" />
                  {loading ? "Verifying GPS & checking in..." : "Check in now"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <div className="mx-auto mb-2 size-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <CheckCircle2 className="size-6 text-emerald-600" />
              </div>
              <CardTitle>You are checked in!</CardTitle>
              <CardDescription>Recorded for {done.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Verified within ~{done.distance}m of classroom coordinates. You may close this tab.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <PublicFooter />
    </div>
  );
}
