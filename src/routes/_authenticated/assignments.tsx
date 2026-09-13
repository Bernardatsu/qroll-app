import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AnnouncementsAndAssignmentsPage } from "./announcements";

export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({
    meta: [
      { title: "Assignments & Announcements — QRoll" },
      {
        name: "description",
        content:
          "Assignments have been unified with Announcements into the class tasks and updates portal.",
      },
    ],
  }),
  component: AssignmentsRedirectWrapper,
});

function AssignmentsRedirectWrapper() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/announcements",
      search: { tab: "assignments" },
      replace: true,
    });
  }, [navigate]);

  return <AnnouncementsAndAssignmentsPage />;
}
