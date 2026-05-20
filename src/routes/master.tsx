import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MasterRoute } from "@/lib/route-guards";
import { Loader2 } from "lucide-react";

const MasterShell = lazy(() =>
  import("@/components/master/MasterShell").then((m) => ({ default: m.MasterShell })),
);

function MasterRoutePending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30">
      <Loader2 className="size-8 animate-spin text-gold" aria-hidden />
    </div>
  );
}

export const Route = createFileRoute("/master")({
  beforeLoad: MasterRoute,
  component: MasterRouteComponent,
});

function MasterRouteComponent() {
  return (
    <Suspense fallback={<MasterRoutePending />}>
      <MasterShell />
    </Suspense>
  );
}
