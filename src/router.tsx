import { createRouter } from "@tanstack/react-router";
import { createAppQueryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 60_000,
    defaultPendingMs: 300,
  });

  return router;
};
