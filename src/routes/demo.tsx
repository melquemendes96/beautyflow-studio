import { Outlet, createFileRoute } from "@tanstack/react-router";

/** Layout pai — filhos: /demo (salão) e /demo/barbearia. */
export const Route = createFileRoute("/demo")({
  component: () => <Outlet />,
});
