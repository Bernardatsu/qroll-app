import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import { useAuth } from "@/lib/auth";
import { collection, getDocs, addDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Megaphone,
  Trash2,
  Loader2,
  ClipboardList,
  Calendar,
  ExternalLink,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  Link as LinkIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/announcements")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || "all",
  }),
  head: () => ({
    meta: [
      { title: "Announcements & Assignments — QRoll" },
      {
        name: "description",
        content:
          "Manage class announcements, deadlines, homework assignments and submission links in one unified portal.",
      },
      { property: "og:title", content: "Announcements & Assignments — QRoll" },
      {
        property: "og:description",
        content:
          "Manage class announcements, deadlines, homework assignments and submission links in one unified portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnnouncementsAndAssignmentsPage,
});

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  levels: string[];
  course_id: string | null;
  starts_on: string;
  expires_on: string | null;
  created_at?: string;
  type: "announcement";
};

type AssignmentRow = {
  id: string;
  title: string;
  details: string;
  submission_url: string | null;
  levels: string[];
  course_id: string | null;
  due_at: string | null;
  created_at?: string;
  type: "assignment";
};

type CourseRow = { id: string; code: string; title: string };

const LEVELS = ["100", "200", "300", "400"];

export function AnnouncementsAndAssignmentsPage() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUid = user?.id || firebaseAuth.currentUser?.uid;

  const [activeTab, setActiveTab] = useState<string>(searchParams.tab || "all");
  const [courseFilter, setCourseFilter] = useState<string>("all");

  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Announcement Form State
  const [announceBusy, setAnnounceBusy] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceLevels, setAnnounceLevels] = useState<string[]>([]);
  const [announceCourseId, setAnnounceCourseId] = useState<string>("all");
  const [announceExpiresOn, setAnnounceExpiresOn] = useState("");

  // Assignment Form State
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDetails, setAssignDetails] = useState("");
  const [assignUrl, setAssignUrl] = useState("");
  const [assignLevels, setAssignLevels] = useState<string[]>([]);
  const [assignCourseId, setAssignCourseId] = useState<string>("all");
  const [assignDueAt, setAssignDueAt] = useState("");

  const loadAll = async () => {
    const uid = currentUid || firebaseAuth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [aSnap, assignSnap, cSnap] = await Promise.all([
        getDocs(query(collection(firestoreDb, "announcements"), where("owner_id", "==", uid))),
        getDocs(query(collection(firestoreDb, "assignments"), where("owner_id", "==", uid))),
        getDocs(query(collection(firestoreDb, "courses"), where("owner_id", "==", uid))),
      ]);

      const aList = aSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        type: "announcement" as const,
      })) as AnnouncementRow[];
      aList.sort((x, y) =>
        (y.starts_on || y.created_at || "").localeCompare(x.starts_on || x.created_at || ""),
      );

      const assignList = assignSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        type: "assignment" as const,
      })) as AssignmentRow[];
      assignList.sort((x, y) => {
        if (!x.due_at) return 1;
        if (!y.due_at) return -1;
        return x.due_at.localeCompare(y.due_at);
      });

      const cList = cSnap.docs.map((d) => ({
        id: d.id,
        code: (d.data() as any).code,
        title: (d.data() as any).title,
      })) as CourseRow[];
      cList.sort((x, y) => (x.code || "").localeCompare(y.code || ""));

      setAnnouncements(aList);
      setAssignments(assignList);
      setCourses(cList);
    } catch (err: any) {
      console.error("Failed to load announcements & assignments:", err);
      toast.error(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [currentUid]);

  const toggleAnnounceLevel = (l: string) =>
    setAnnounceLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const toggleAssignLevel = (l: string) =>
    setAssignLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  // Post Announcement Handler
  const postAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceBody.trim()) {
      return toast.error("Please add both a title and a message");
    }
    const uid = currentUid || firebaseAuth.currentUser?.uid;
    if (!uid) return toast.error("You must be signed in");

    setAnnounceBusy(true);
    try {
      await addDoc(collection(firestoreDb, "announcements"), {
        title: announceTitle.trim(),
        body: announceBody.trim(),
        levels: announceLevels,
        course_id: announceCourseId === "all" ? null : announceCourseId,
        expires_on: announceExpiresOn || null,
        starts_on: new Date().toISOString(),
        created_at: new Date().toISOString(),
        owner_id: uid,
      });
      toast.success("Announcement published to student portal");
      setAnnounceTitle("");
      setAnnounceBody("");
      setAnnounceLevels([]);
      setAnnounceCourseId("all");
      setAnnounceExpiresOn("");
      void loadAll();
    } catch (err: any) {
      toast.error(err?.message || "Failed to post announcement");
    } finally {
      setAnnounceBusy(false);
    }
  };

  // Post Assignment Handler
  const postAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTitle.trim() || !assignDetails.trim()) {
      return toast.error("Please add both a title and instructions/details");
    }
    const uid = currentUid || firebaseAuth.currentUser?.uid;
    if (!uid) return toast.error("You must be signed in");

    setAssignBusy(true);
    try {
      await addDoc(collection(firestoreDb, "assignments"), {
        title: assignTitle.trim(),
        details: assignDetails.trim(),
        submission_url: assignUrl.trim() || null,
        levels: assignLevels,
        course_id: assignCourseId === "all" ? null : assignCourseId,
        due_at: assignDueAt || null,
        created_at: new Date().toISOString(),
        owner_id: uid,
      });
      toast.success("Assignment published to student portal");
      setAssignTitle("");
      setAssignDetails("");
      setAssignUrl("");
      setAssignLevels([]);
      setAssignCourseId("all");
      setAssignDueAt("");
      void loadAll();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create assignment");
    } finally {
      setAssignBusy(false);
    }
  };

  const removeAnnouncement = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this announcement? It will be removed from student portals immediately.",
      )
    )
      return;
    try {
      await deleteDoc(doc(firestoreDb, "announcements", id));
      setAnnouncements((prev) => prev.filter((x) => x.id !== id));
      toast.success("Announcement removed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const removeAssignment = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this assignment? It will be removed from student portals immediately.",
      )
    )
      return;
    try {
      await deleteDoc(doc(firestoreDb, "assignments", id));
      setAssignments((prev) => prev.filter((x) => x.id !== id));
      toast.success("Assignment removed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete");
    }
  };

  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.id, `${c.code} — ${c.title}`));
    return map;
  }, [courses]);

  const getCourseDisplay = (courseId: string | null) => {
    if (!courseId) return "All Courses (Broadcast)";
    return courseMap.get(courseId) || "Course";
  };

  // Filtered lists based on course selection
  const filteredAnnouncements = useMemo(() => {
    if (courseFilter === "all") return announcements;
    return announcements.filter((a) => !a.course_id || a.course_id === courseFilter);
  }, [announcements, courseFilter]);

  const filteredAssignments = useMemo(() => {
    if (courseFilter === "all") return assignments;
    return assignments.filter((a) => !a.course_id || a.course_id === courseFilter);
  }, [assignments, courseFilter]);

  // Combined timeline for "All" tab
  const combinedTimeline = useMemo(() => {
    const items: Array<(AnnouncementRow | AssignmentRow) & { sortDate: string }> = [
      ...filteredAnnouncements.map((a) => ({
        ...a,
        sortDate: a.starts_on || a.created_at || "",
      })),
      ...filteredAssignments.map((a) => ({
        ...a,
        sortDate: a.due_at || a.created_at || "",
      })),
    ];
    return items.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  }, [filteredAnnouncements, filteredAssignments]);

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Megaphone className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Announcements & Assignments
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Keep your students informed with broadcasts, urgent notices, homework tasks, and
                deadlines.
              </p>
            </div>
          </div>

          {/* Quick Course Filter */}
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground shrink-0" />
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-[180px] sm:w-[220px] text-xs h-9">
                <SelectValue placeholder="Filter by course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses ({courses.length})</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs System */}
        <Tabs
          value={activeTab}
          onValueChange={(tab) => {
            setActiveTab(tab);
            void navigate({ to: "/announcements", search: { tab } });
          }}
          className="space-y-6"
        >
          <div className="border-b pb-2">
            <TabsList className="grid grid-cols-3 max-w-md">
              <TabsTrigger value="all" className="text-xs sm:text-sm">
                All Updates ({combinedTimeline.length})
              </TabsTrigger>
              <TabsTrigger
                value="announcements"
                className="text-xs sm:text-sm flex items-center gap-1.5"
              >
                <Megaphone className="size-3.5" />
                Notices ({filteredAnnouncements.length})
              </TabsTrigger>
              <TabsTrigger
                value="assignments"
                className="text-xs sm:text-sm flex items-center gap-1.5"
              >
                <ClipboardList className="size-3.5" />
                Tasks ({filteredAssignments.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: ALL UPDATES (Streamlined Combined Timeline) */}
          <TabsContent value="all" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Timeline feed */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">Class Activity Feed</h3>
                  <span className="text-xs text-muted-foreground">Chronological order</span>
                </div>

                {loading && (
                  <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Loading updates...
                  </div>
                )}

                {!loading && combinedTimeline.length === 0 && (
                  <Card className="p-8 text-center text-muted-foreground">
                    <Megaphone className="size-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium text-sm">
                      No announcements or assignments posted yet.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use the quick forms on the right to post your first notice or assignment.
                    </p>
                  </Card>
                )}

                {combinedTimeline.map((item) => (
                  <Card
                    key={`${item.type}-${item.id}`}
                    className="overflow-hidden border-border hover:shadow-sm transition-shadow"
                  >
                    <CardHeader className="pb-3 bg-muted/20 flex flex-row items-start justify-between space-y-0">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.type === "announcement" ? (
                            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] gap-1">
                              <Megaphone className="size-3" /> Announcement
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] gap-1">
                              <ClipboardList className="size-3" /> Assignment
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {getCourseDisplay(item.course_id)}
                          </Badge>
                          {item.levels && item.levels.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {item.levels.map((l) => `L${l}`).join(", ")}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base font-semibold pt-1">{item.title}</CardTitle>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          item.type === "announcement"
                            ? removeAnnouncement(item.id)
                            : removeAssignment(item.id)
                        }
                        className="text-muted-foreground hover:text-destructive shrink-0 size-8"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-3 space-y-3">
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        {item.type === "announcement" ? item.body : item.details}
                      </p>

                      {item.type === "assignment" && (
                        <div className="flex flex-wrap items-center gap-4 pt-2 border-t text-xs">
                          {item.due_at && (
                            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                              <Clock className="size-3.5" />
                              Due: {new Date(item.due_at).toLocaleDateString()} at{" "}
                              {new Date(item.due_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                          {item.submission_url && (
                            <a
                              href={
                                item.submission_url.startsWith("http")
                                  ? item.submission_url
                                  : `https://${item.submission_url}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-1 font-medium ml-auto"
                            >
                              <ExternalLink className="size-3.5" /> Submission Portal
                            </a>
                          )}
                        </div>
                      )}

                      {item.type === "announcement" && item.expires_on && (
                        <div className="text-xs text-muted-foreground pt-1">
                          Visible until: {item.expires_on}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Quick Actions / Shortcuts Panel */}
              <div className="space-y-4">
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-base">Quick Actions</CardTitle>
                    <CardDescription className="text-xs">
                      Post updates directly to your enrolled students' personal portals.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      className="w-full justify-start text-xs h-10"
                      onClick={() => setActiveTab("announcements")}
                    >
                      <Megaphone className="size-4 mr-2 text-blue-300" />
                      Post New Announcement
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-xs h-10"
                      onClick={() => setActiveTab("assignments")}
                    >
                      <ClipboardList className="size-4 mr-2 text-amber-500" />
                      Create New Assignment
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border bg-muted/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">
                      Student Visibility Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-2 leading-relaxed">
                    <p>
                      • <b>Enrolled Courses:</b> Announcements or assignments bound to a course
                      appear exclusively for students enrolled in that course.
                    </p>
                    <p>
                      • <b>Multi-Lecturer Support:</b> Students taking courses from multiple tutors
                      see assignments and announcements grouped cleanly under each course.
                    </p>
                    <p>
                      • <b>Central Student Portal:</b> Students can view their tasks at{" "}
                      <code className="font-mono bg-muted px-1 py-0.5 rounded">/student</code>.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: ANNOUNCEMENTS ONLY */}
          <TabsContent value="announcements" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Form */}
              <Card className="lg:col-span-1 border-border h-fit">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="size-4 text-primary" /> New Announcement
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Broadcast urgent updates, cancellations, or reminders.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={postAnnouncement} className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold">Title</Label>
                      <div className="flex flex-wrap gap-1 my-1.5">
                        {["Room Change", "Class Cancelled", "Quiz Alert", "Urgent Notice"].map(
                          (tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setAnnounceTitle(`${tag}: `)}
                              className="text-[11px] px-2 py-0.5 rounded-full border bg-muted/50 hover:bg-muted text-foreground transition-colors"
                            >
                              + {tag}
                            </button>
                          ),
                        )}
                      </div>
                      <Input
                        value={announceTitle}
                        onChange={(e) => setAnnounceTitle(e.target.value)}
                        placeholder="e.g. Room Change: PB 200 today"
                        className="text-xs h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Message</Label>
                      <Textarea
                        value={announceBody}
                        onChange={(e) => setAnnounceBody(e.target.value)}
                        rows={4}
                        placeholder="Provide details and instructions for students..."
                        className="text-xs mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Target Course</Label>
                      <Select value={announceCourseId} onValueChange={setAnnounceCourseId}>
                        <SelectTrigger className="text-xs mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All My Courses (Broadcast)</SelectItem>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.code} — {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Target Levels</Label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={announceLevels.length === 0 ? "default" : "outline"}
                          onClick={() => setAnnounceLevels([])}
                          className="h-7 text-xs px-2.5"
                        >
                          All Levels
                        </Button>
                        {LEVELS.map((l) => (
                          <Button
                            key={l}
                            type="button"
                            size="sm"
                            variant={announceLevels.includes(l) ? "default" : "outline"}
                            onClick={() => toggleAnnounceLevel(l)}
                            className="h-7 text-xs px-2.5"
                          >
                            Level {l}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Hide After (Optional)</Label>
                      <Input
                        type="date"
                        value={announceExpiresOn}
                        onChange={(e) => setAnnounceExpiresOn(e.target.value)}
                        className="text-xs mt-1 h-9"
                      />
                    </div>

                    <Button type="submit" disabled={announceBusy} className="w-full text-xs h-9">
                      {announceBusy ? (
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5 mr-1.5" />
                      )}
                      Publish Announcement
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Announcements List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">Published Announcements</h3>
                  <span className="text-xs text-muted-foreground">
                    {filteredAnnouncements.length} item
                    {filteredAnnouncements.length === 1 ? "" : "s"}
                  </span>
                </div>

                {filteredAnnouncements.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">
                    <p className="text-sm">No announcements posted for this selection.</p>
                  </Card>
                ) : (
                  filteredAnnouncements.map((a) => (
                    <Card key={a.id} className="border-border">
                      <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {getCourseDisplay(a.course_id)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {a.levels.length === 0
                                ? "All Levels"
                                : a.levels.map((l) => `L${l}`).join(", ")}
                            </Badge>
                          </div>
                          <CardTitle className="text-base font-semibold">{a.title}</CardTitle>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAnnouncement(a.id)}
                          className="text-muted-foreground hover:text-destructive size-8"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {a.body}
                        </p>
                        {a.expires_on && (
                          <div className="text-xs text-muted-foreground mt-3 pt-2 border-t">
                            Active until: {a.expires_on}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: ASSIGNMENTS ONLY */}
          <TabsContent value="assignments" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Assignment Form */}
              <Card className="lg:col-span-1 border-border h-fit">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="size-4 text-primary" /> New Assignment
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Set tasks, deadlines, and submission dropboxes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={postAssignment} className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold">Title</Label>
                      <Input
                        value={assignTitle}
                        onChange={(e) => setAssignTitle(e.target.value)}
                        placeholder="e.g. Lab 4: Binary Trees Implementation"
                        className="text-xs mt-1 h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Instructions & Details</Label>
                      <Textarea
                        value={assignDetails}
                        onChange={(e) => setAssignDetails(e.target.value)}
                        rows={4}
                        placeholder="Describe the requirements, grading rubric, format..."
                        className="text-xs mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Target Course</Label>
                      <Select value={assignCourseId} onValueChange={setAssignCourseId}>
                        <SelectTrigger className="text-xs mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All My Courses</SelectItem>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.code} — {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Due Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={assignDueAt}
                        onChange={(e) => setAssignDueAt(e.target.value)}
                        className="text-xs mt-1 h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Submission Link (Optional)</Label>
                      <div className="relative mt-1">
                        <LinkIcon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={assignUrl}
                          onChange={(e) => setAssignUrl(e.target.value)}
                          placeholder="https://forms.gle/... or Google Drive URL"
                          className="text-xs pl-9 h-9"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Target Levels</Label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={assignLevels.length === 0 ? "default" : "outline"}
                          onClick={() => setAssignLevels([])}
                          className="h-7 text-xs px-2.5"
                        >
                          All Levels
                        </Button>
                        {LEVELS.map((l) => (
                          <Button
                            key={l}
                            type="button"
                            size="sm"
                            variant={assignLevels.includes(l) ? "default" : "outline"}
                            onClick={() => toggleAssignLevel(l)}
                            className="h-7 text-xs px-2.5"
                          >
                            Level {l}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Button type="submit" disabled={assignBusy} className="w-full text-xs h-9">
                      {assignBusy ? (
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Plus className="size-3.5 mr-1.5" />
                      )}
                      Create Assignment
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Assignment List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">Course Assignments</h3>
                  <span className="text-xs text-muted-foreground">
                    {filteredAssignments.length} item{filteredAssignments.length === 1 ? "" : "s"}
                  </span>
                </div>

                {filteredAssignments.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">
                    <p className="text-sm">No assignments posted for this selection.</p>
                  </Card>
                ) : (
                  filteredAssignments.map((a) => (
                    <Card key={a.id} className="border-border">
                      <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {getCourseDisplay(a.course_id)}
                            </Badge>
                            {a.due_at && (
                              <Badge
                                variant="outline"
                                className="text-xs text-amber-600 dark:text-amber-400 gap-1"
                              >
                                <Clock className="size-3" />
                                Due: {new Date(a.due_at).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-base font-semibold">{a.title}</CardTitle>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAssignment(a.id)}
                          className="text-muted-foreground hover:text-destructive size-8"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {a.details}
                        </p>
                        {a.submission_url && (
                          <div className="pt-2 border-t">
                            <a
                              href={
                                a.submission_url.startsWith("http")
                                  ? a.submission_url
                                  : `https://${a.submission_url}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary font-medium hover:underline flex items-center gap-1.5"
                            >
                              <ExternalLink className="size-3.5" /> Submit via: {a.submission_url}
                            </a>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
