import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { subscriptionService } from "@/services/subscriptionService";
import { Skeleton } from "@/components/ui/skeleton";
import { Check } from "lucide-react";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Planos — JM BeautyFlow" },
      { name: "description", content: "Escolha o plano ideal para o seu studio de beleza." },
    ],
  }),
  component: PublicPlansPage,
});

type PublicPlan = {
  id: string;
  name: string;
  price?: number | null;
  features?: string[] | null;
};

function formatBrl(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function PublicPlansPage() {
  const plansQuery = useQuery({
    queryKey: ["public", "plans", "page"],
    queryFn: async () => {
      const res = await subscriptionService.listPlans();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const plans = (plansQuery.data ?? []) as PublicPlan[];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container-page py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl tracking-tight">Planos</h1>
          <p className="mt-3 text-muted-foreground">
            Comece com 7 dias de teste grátis ou assine agora. Você pode mudar de plano a qualquer momento.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {plansQuery.isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-3xl border border-border p-8">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="mt-6 h-10 w-24" />
                <Skeleton className="mt-6 h-32 w-full" />
              </div>
            ))}
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="flex flex-col rounded-3xl border border-border bg-card p-8 shadow-soft"
            >
              <h2 className="font-display text-xl">{plan.name}</h2>
              <p className="mt-4 text-3xl font-semibold">
                R$ {formatBrl(Number(plan.price ?? 0))}
                <span className="text-sm font-normal text-muted-foreground">/mês</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-muted-foreground">
                {(plan.features ?? []).slice(0, 6).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-gold" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-2">
                <Link
                  to="/cadastro"
                  search={{ planId: plan.id }}
                  className="rounded-full bg-foreground py-3 text-center text-sm font-medium text-background"
                >
                  Começar teste grátis
                </Link>
                <Link
                  to="/cadastro"
                  search={{ planId: plan.id }}
                  className="rounded-full border border-border py-3 text-center text-sm font-medium"
                >
                  Assinar agora
                </Link>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
