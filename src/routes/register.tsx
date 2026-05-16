import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /register → /cadastro */
export const Route = createFileRoute("/register")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/cadastro", search, replace: true });
  },
  component: () => null,
});
