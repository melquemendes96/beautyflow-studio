import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Logo } from "@/components/brand/Logo";
import { subscriptionService } from "@/services/subscriptionService";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, Calendar, Smartphone, Heart, Star, Check,
  Palette, MessageCircle, BarChart3, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JM BeautyFlow — Agenda inteligente para negócios de beleza" },
      { name: "description", content: "Transforme a forma como suas clientes agendam horários. Agenda online elegante, simples e personalizada." },
    ],
  }),
  component: Landing,
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

function LandingPlanCardSkeleton() {
  return (
    <div className="rounded-3xl border border-border bg-card p-8 shadow-soft">
      <Skeleton className="h-8 w-36" />
      <div className="mt-6 flex items-baseline gap-2">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-4 w-12" />
      </div>
      <ul className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex gap-2">
            <Skeleton className="mt-0.5 size-4 shrink-0 rounded" />
            <Skeleton className="h-4 flex-1" />
          </li>
        ))}
      </ul>
      <Skeleton className="mt-7 h-11 w-full rounded-full" />
    </div>
  );
}

function Landing() {
  const plansQuery = useQuery({
    queryKey: ["public", "plans"],
    queryFn: async () => {
      const res = await subscriptionService.listPlans();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const plans = (plansQuery.data ?? []) as PublicPlan[];
  const highlightIndex =
    plans.length > 1 ? Math.min(plans.length - 1, Math.floor(plans.length / 2)) : -1;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* HERO */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="container-page grid gap-12 py-16 md:grid-cols-2 md:py-28">
          <div className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-gold/30 bg-background/60 px-4 py-1.5 text-xs uppercase tracking-widest text-gold backdrop-blur">
              <Sparkles className="size-3.5" /> SaaS Premium para Beleza
            </span>
            <h1 className="mt-5 text-4xl leading-tight md:text-6xl">
              Agenda inteligente para <em className="not-italic text-gold">negócios de beleza</em>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              Transforme a forma como suas clientes agendam horários. Uma agenda online elegante, simples e personalizada com a identidade da sua marca.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#planos"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-medium text-background shadow-elegant hover:opacity-90 transition"
              >
                Começar agora <ArrowRight className="size-4" />
              </a>
              <Link
                to="/agendar/$slug"
                params={{ slug: "joyce-mendes" }}
                className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background/60 px-7 py-3.5 text-sm font-medium hover:bg-background transition"
              >
                Ver demonstração
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="size-8 rounded-full border-2 border-background bg-gradient-to-br from-gold to-rose" />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1 text-gold">
                  {[...Array(5)].map((_, i) => <Star key={i} className="size-3.5 fill-current" />)}
                </div>
                <span className="text-xs">+1.200 profissionais já amam</span>
              </div>
            </div>
          </div>

          {/* Mock device preview */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-gold/40 to-rose/30 blur-2xl" />
            <div className="relative rounded-[2.5rem] border border-border bg-card p-3 shadow-elegant">
              <div className="rounded-[2rem] bg-secondary/40 p-5">
                <div className="flex items-center justify-between">
                  <Logo onLight className="h-12 max-w-[220px]" />
                  <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] text-success">Aberto</span>
                </div>
                <div className="mt-5 text-sm text-muted-foreground">Próximo horário</div>
                <div className="mt-1 font-display text-2xl">Sábado, 14:00</div>
                <div className="text-sm text-muted-foreground">Lash Volume Brasileiro</div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {["09:00", "10:30", "11:00", "14:00", "15:30", "17:00"].map((h, i) => (
                    <div
                      key={h}
                      className={`rounded-xl border px-2 py-3 text-center text-xs ${
                        i === 3
                          ? "border-foreground bg-foreground text-background"
                          : i === 1
                          ? "border-destructive/20 bg-destructive/5 text-muted-foreground line-through"
                          : "border-border bg-background"
                      }`}
                    >
                      {h}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-5 w-full rounded-full bg-foreground py-3 text-sm text-background"
                >
                  Confirmar agendamento
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section id="beneficios" className="container-page py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs uppercase tracking-widest text-gold">Benefícios</span>
          <h2 className="mt-2 text-3xl md:text-4xl">Tudo que você precisa em um só lugar</h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            { icon: Calendar, t: "Agenda online 24h", d: "Suas clientes agendam quando quiserem, sem precisar te chamar." },
            { icon: Palette, t: "Sua marca, sua página", d: "Personalize cores, logo e textos. Tenha um link exclusivo." },
            { icon: Smartphone, t: "Mobile-first de verdade", d: "Experiência impecável em qualquer celular ou tablet." },
            { icon: MessageCircle, t: "Lembretes e confirmações", d: "Reduza faltas com avisos por e-mail e SMS; integração WhatsApp em evolução." },
            { icon: BarChart3, t: "Relatórios elegantes", d: "Veja faturamento, clientes recorrentes e mais." },
            { icon: Heart, t: "Área da cliente", d: "Histórico, avaliações e reagendamento em segundos." },
          ].map((b) => (
            <div key={b.t} className="rounded-3xl border border-border bg-card p-7 shadow-soft transition hover:shadow-elegant">
              <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-gold-soft text-foreground">
                <b.icon className="size-5" />
              </div>
              <h3 className="text-lg">{b.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="bg-secondary/40 py-24">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs uppercase tracking-widest text-gold">Como funciona</span>
            <h2 className="mt-2 text-3xl md:text-4xl">3 passos para começar</h2>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              ["01", "Crie sua conta", "Escolha um plano e configure sua marca em minutos."],
              ["02", "Cadastre serviços", "Defina preços, durações e horários de atendimento."],
              ["03", "Compartilhe seu link", "Suas clientes começam a agendar imediatamente."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-3xl bg-card p-7 shadow-soft">
                <div className="font-display text-5xl text-gold">{n}</div>
                <h3 className="mt-4 text-lg">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARA QUEM */}
      <section className="container-page py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs uppercase tracking-widest text-gold">Para quem é</span>
          <h2 className="mt-2 text-3xl md:text-4xl">Feito para profissionais de beleza</h2>
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {["Salões", "Studios de Beleza", "Clínicas Estéticas", "Designers de Sobrancelha", "Lash Designers", "Manicures", "Cabeleireiras", "Profissionais Autônomas"].map((p) => (
            <span key={p} className="rounded-full border border-border bg-card px-5 py-2.5 text-sm shadow-soft">{p}</span>
          ))}
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="bg-secondary/40 py-24">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs uppercase tracking-widest text-gold">Planos</span>
            <h2 className="mt-2 text-3xl md:text-4xl">Escolha o ideal para seu negócio</h2>
            <p className="mt-3 text-muted-foreground">Sem fidelidade. Cancele quando quiser.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {plansQuery.isError && (
              <div
                role="alert"
                className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive md:col-span-3"
              >
                Não foi possível carregar os planos agora. Atualize a página ou tente de novo em instantes.
              </div>
            )}
            {plansQuery.isLoading &&
              Array.from({ length: 3 }).map((_, i) => <LandingPlanCardSkeleton key={i} />)}
            {!plansQuery.isLoading &&
              !plansQuery.isError &&
              plans.map((p, i) => {
                const isHighlight = i === highlightIndex;
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-3xl p-8 shadow-soft transition hover:shadow-elegant ${
                      isHighlight ? "z-[1] scale-[1.02] bg-card ring-2 ring-gold/60" : "bg-card"
                    }`}
                  >
                    {isHighlight && (
                      <span className="absolute right-4 top-4 rounded-full bg-gold/20 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gold">
                        Popular
                      </span>
                    )}
                    <h3 className="font-display text-2xl">{p.name}</h3>
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-display">
                        R$ {formatBrl(Number(p.price ?? 0))}
                      </span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    <ul className="mt-6 space-y-3 text-sm">
                      {(Array.isArray(p.features) ? p.features : []).map((f: string) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-success" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/cadastro"
                      search={{ planId: String(p.id) }}
                      className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-foreground py-3 text-sm font-medium text-background transition hover:opacity-90"
                    >
                      Começar com {p.name}
                    </Link>
                    <Link
                      to="/login"
                      search={{ planId: String(p.id) }}
                      className="mt-3 block text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Já tenho conta
                    </Link>
                  </div>
                );
              })}
            {!plansQuery.isLoading && !plansQuery.isError && plans.length === 0 && (
              <div className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground md:col-span-3">
                Nenhum plano ativo encontrado no Supabase. Crie os planos no painel Master.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section id="depoimentos" className="container-page py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs uppercase tracking-widest text-gold">Depoimentos</span>
          <h2 className="mt-2 text-3xl md:text-4xl">Profissionais que confiam</h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            { n: "Joyce Mendes", c: "Lash Designer · SP", t: "Minha agenda triplicou. As clientes adoram a praticidade e o visual elegante da página." },
            { n: "Carla Ribeiro", c: "Studio Bella · RJ", t: "Reduzi faltas em 60% só com os lembretes. O painel é lindo e fácil de usar." },
            { n: "Patrícia Lima", c: "Salão Petalla · BH", t: "A personalização da marca faz toda diferença. Parece que foi feito sob medida pra mim." },
          ].map((d) => (
            <div key={d.n} className="rounded-3xl border border-border bg-card p-7 shadow-soft">
              <div className="flex gap-1 text-gold">
                {[...Array(5)].map((_, i) => <Star key={i} className="size-4 fill-current" />)}
              </div>
              <p className="mt-4 text-sm leading-relaxed">"{d.t}"</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="size-10 rounded-full bg-gradient-to-br from-gold to-rose" />
                <div>
                  <div className="text-sm font-medium">{d.n}</div>
                  <div className="text-xs text-muted-foreground">{d.c}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="container-page pb-24">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-foreground p-10 text-background md:p-16">
          <div className="absolute -right-20 -top-20 size-80 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl text-background md:text-5xl">Pronta para transformar sua agenda?</h2>
            <p className="mt-4 text-background/70">
              Teste grátis de 7 dias no plano escolhido. Cancele quando quiser.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#planos" className="inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 text-sm font-medium text-foreground hover:opacity-90 transition">
                Começar agora <ArrowRight className="size-4" />
              </a>
              <Link
                to="/agendar/$slug"
                params={{ slug: "joyce-mendes" }}
                className="inline-flex items-center gap-2 rounded-full border border-background/20 px-7 py-3.5 text-sm font-medium hover:bg-background/10 transition"
              >
                Ver demonstração
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
