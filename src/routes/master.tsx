import { createFileRoute } from "@tanstack/react-router";
import { MasterShell } from "@/components/master/MasterShell";
import { MasterRoute } from "@/lib/route-guards";

export const Route = createFileRoute("/master")({
  beforeLoad: MasterRoute,
  component: MasterShell,
});
