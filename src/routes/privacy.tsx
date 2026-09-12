import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — QRoll" },
      { name: "description", content: "Privacy policy for the QRoll QR system." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to={"/" as string} className="font-bold text-primary">
            QRoll
          </Link>
          <div className="flex gap-4 text-sm">
            <Link to={"/terms" as string} className="hover:text-primary">
              Terms
            </Link>
            <Link to={"/manual" as string} className="hover:text-primary">
              Manual
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10 prose prose-sm md:prose-base">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm">Last updated: 4 July 2026</p>

        <h2 className="text-xl font-semibold mt-8">1. Who we are</h2>
        <p>
          QRoll is a QR-based attendance-tracking Service operated by QRoll for the Kwame Nkrumah
          University of Science and Technology community.
        </p>

        <h2 className="text-xl font-semibold mt-8">2. What we collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <b>Lecturer accounts:</b> full name and email address (from Google Sign-In or
            email/password registration).
          </li>
          <li>
            <b>Student records (uploaded by the lecturer):</b> full name, index number, level,
            department/programme, email address, and a randomly generated QR UUID.
          </li>
          <li>
            <b>Attendance events:</b> session ID, student ID, timestamp, source (manual scan or self
            check-in) and coarse GPS coordinates at the moment of check-in.
          </li>
          <li>
            <b>Technical logs:</b> minimal server logs used for security and debugging.
          </li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">3. How we use data</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Authenticate lecturers and generate personal QR codes for their students.</li>
          <li>Verify a student's physical presence in the classroom (geofence check).</li>
          <li>Produce daily and semester attendance reports for the owning lecturer.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8">4. Legal basis</h2>
        <p>
          Processing is carried out under the legitimate interest of the university in maintaining
          accurate attendance records, and — for the storage of GPS coordinates — under the explicit
          consent of the student who chooses to use the self check-in feature.
        </p>

        <h2 className="text-xl font-semibold mt-8">5. Data isolation</h2>
        <p>
          Every record you create is tagged with your <b>owner_id</b>. Row-Level Security policies
          in the database prevent any lecturer from viewing another lecturer's students, sessions or
          attendance records.
        </p>

        <h2 className="text-xl font-semibold mt-8">6. Storage & retention</h2>
        <p>
          Data is hosted on Google Cloud / Firebase Firestore infrastructure (TLS in transit,
          AES-256 at rest). Records are retained until the owning lecturer deletes them. Deleting a
          course, session or student cascades to the associated attendance records.
        </p>

        <h2 className="text-xl font-semibold mt-8">7. Sharing</h2>
        <p>
          We do not sell personal data. Data is shared only with the infrastructure provider hosting
          the Service (Google Cloud / Firebase / Cloudflare) strictly to operate the Service.
        </p>

        <h2 className="text-xl font-semibold mt-8">8. Your rights</h2>
        <p>
          Students may contact the lecturer who uploaded their record to request access, correction
          or deletion. Lecturers may delete any record they own directly from the app.
        </p>

        <h2 className="text-xl font-semibold mt-8">9. Cookies</h2>
        <p>
          The Service stores an authentication token in your browser's local storage so you stay
          signed in. No advertising or tracking cookies are used.
        </p>

        <h2 className="text-xl font-semibold mt-8">10. Contact</h2>
        <p>Direct any privacy request to your Master Admin lecturer or to the QRoll executive.</p>

        <p className="mt-10 text-sm">
          <Link to={"/" as string} className="text-primary hover:underline">
            ← Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
