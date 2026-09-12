import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./lib/query-client";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30000,
  });

  return router;
};
