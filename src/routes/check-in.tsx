import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { firestoreDb } from "@/integrations/firebase/config";
import { collection, doc, getDoc, getDocs, query, where, addDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MapPin, ShieldCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { PublicFooter } from "@/components/PublicFooter";
import qrollLogo from "@/assets/qroll-logo.png";

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
  const [done, setDone] = useState<{ name: string; index: string; distance: number } | null>(null);

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <img src={qrollLogo} alt="QRoll" className="h-10 w-auto mb-6" />
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid Check-in Link</CardTitle>
            <CardDescription>
              This check-in link is missing a class session. Please scan the QR code projected on
              the classroom screen.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getPos = () =>
    new Promise<GeolocationPosition>((res, rej) => {
      if (!navigator.geolocation)
        return rej(new Error("Geolocation is not supported on this device."));
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
                "Location access was denied. Please allow location permissions in your mobile browser to verify you are in class.",
              ),
            );
          } else {
            rej(err);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000,
        },
      );
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIndex = index.trim().toUpperCase();
    if (!cleanIndex) return toast.error("Please enter your student index number");
    setLoading(true);

    try {
      // 1. Verify session
      const sessionDocRef = doc(firestoreDb, "attendance_sessions", session);
      const sessSnap = await getDoc(sessionDocRef);
      if (!sessSnap.exists()) {
        throw new Error("Class attendance session was not found or has expired.");
      }
      const sessData = sessSnap.data() as any;
      if (!sessData.is_active) {
        throw new Error("This attendance session has already been closed by your lecturer.");
      }

      // 2. Geolocation verification against lecturer's configured radius
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
        const allowedRadius = sessData.radius_m || 80;
        if (distanceM > allowedRadius) {
          throw new Error(
            `You are too far from the classroom (${Math.round(distanceM)}m away). You must be within ${allowedRadius}m of the lecture hall coordinates.`,
          );
        }
      }

      // 3. Resolve student record
      let studentId = "";
      let studentName = `Student ${cleanIndex}`;

      // First look up student under lecturer's roster
      let studSnap = sessData.owner_id
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

      // Fallback: look up in general students directory if not found under owner
      if (studSnap.empty) {
        studSnap = await getDocs(
          query(collection(firestoreDb, "students"), where("index_number", "==", cleanIndex)),
        );
      }

      if (!studSnap.empty) {
        const docSnap = studSnap.docs[0];
        studentId = docSnap.id;
        const sdata = docSnap.data();
        studentName = sdata.full_name || studentName;
      } else {
        // Auto-register student so their presence is accurately preserved with their index number
        const newStudRef = await addDoc(collection(firestoreDb, "students"), {
          full_name: `Student (${cleanIndex})`,
          index_number: cleanIndex,
          owner_id: sessData.owner_id || null,
          level: "100",
          created_at: new Date().toISOString(),
        });
        studentId = newStudRef.id;
        studentName = `Student (${cleanIndex})`;
      }

      // 4. Check if already recorded as present in this session
      const recQuery = await getDocs(
        query(
          collection(firestoreDb, "attendance_records"),
          where("session_id", "==", session),
          where("student_id", "==", studentId),
        ),
      );

      if (!recQuery.empty) {
        setDone({ name: studentName, index: cleanIndex, distance: Math.round(distanceM) });
        toast.info("You are already recorded as present for this session.");
        return;
      }

      // 5. Record student as PRESENT with verified index number
      const now = new Date();
      await addDoc(collection(firestoreDb, "attendance_records"), {
        session_id: session,
        student_id: studentId,
        student_index: cleanIndex,
        student_name: studentName,
        course_id: sessData.course_id || null,
        owner_id: sessData.owner_id || null,
        session_date: now.toISOString().slice(0, 10),
        check_in_at: now.toISOString(),
        status: "present",
        source: "projected_qr",
        geo_lat: userLat,
        geo_lng: userLng,
        geo_accuracy_m: pos.coords.accuracy || null,
        distance_m: Math.round(distanceM),
        created_at: now.toISOString(),
      });

      setDone({ name: studentName, index: cleanIndex, distance: Math.round(distanceM) });
      toast.success(`Checked in successfully! Marked present: ${cleanIndex}`);
    } catch (err: any) {
      toast.error(err.message ?? "Check-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-md mx-auto">
        <div className="flex flex-col items-center gap-2 mb-6 text-center">
          <img
            src={qrollLogo}
            alt="QRoll Logo"
            className="h-10 sm:h-12 w-auto object-contain mb-1"
          />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Class Attendance Check-in
          </h1>
          <p className="text-xs text-muted-foreground">Scanned from projected classroom screen</p>
        </div>

        {!done ? (
          <Card className="w-full shadow-md border-border">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg font-semibold">Verify & Record Attendance</CardTitle>
              <CardDescription className="text-xs">
                Enter your student index number. Your device GPS location will verify that you are
                inside the classroom radius.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="index-input" className="text-xs font-semibold">
                    Student Index Number
                  </Label>
                  <Input
                    id="index-input"
                    placeholder="e.g. 20700000"
                    value={index}
                    onChange={(e) => setIndex(e.target.value)}
                    required
                    autoFocus
                    className="font-mono text-base uppercase tracking-wider text-center h-11"
                  />
                </div>

                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1 border">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
                    GPS Geofence Verification
                  </div>
                  <p>
                    When you tap check in, your device coordinates will be checked against the
                    lecture hall boundary set by your lecturer.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-semibold"
                  disabled={loading}
                >
                  <MapPin className="size-4 mr-2" />
                  {loading ? "Verifying GPS radius & recording..." : "Verify Location & Check In"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full text-center shadow-md border-border">
            <CardHeader className="pb-3">
              <div className="mx-auto mb-2 size-14 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
                <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                You Are Marked Present!
              </CardTitle>
              <CardDescription className="text-xs">
                Attendance successfully recorded in the lecturer's register.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <div className="rounded-xl border bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b text-xs sm:text-sm">
                  <span className="text-muted-foreground">Student Name:</span>
                  <span className="font-semibold text-foreground">{done.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b text-xs sm:text-sm">
                  <span className="text-muted-foreground">Index Number:</span>
                  <span className="font-mono font-bold text-primary">{done.index}</span>
                </div>
                <div className="flex justify-between py-1 text-xs sm:text-sm">
                  <span className="text-muted-foreground">GPS Proximity:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Verified (~{done.distance}m from classroom)
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Your check-in is saved. You can safely close this browser window.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <PublicFooter />
    </div>
  );
}
