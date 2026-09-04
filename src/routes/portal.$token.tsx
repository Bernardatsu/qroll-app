import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/$token")({
  ssr: false,
  component: () => <Outlet />,
});
