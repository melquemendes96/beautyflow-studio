import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { Lock, Mail } from "lucide-react";

export const Route = createFileRoute("/entrar")({
  component: Entrar,
});

function Entrar() {
  const navigate = useNavigate();
  return (
    <div
      className="grid min-h-screen lg:grid-cols-2"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="hidden flex-col justify-between p-12 text-background lg:flex" style={{ background: "var(--charcoal)" }}>
        <Logo className="h-10 brightness-0 invert" />
        <div>
          <div className="font-display text-4xl leading-tight">Sua agenda, sua marca, suas regras.</div>
          <p className="mt-3 max-w-md text-background/70">
            Acesse o painel BeautyFlow e veja em tempo real tudo o que acontece no seu studio.
          </p>
        </div>
        <div className="text-xs text-background/40">© 2026 JM BeautyFlow</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form
          onSubmit={(e) => { e.preventDefault(); navigate({ to: "/admin" }); }}
          className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-elegant"
        >
          <div className="lg:hidden mb-6"><Logo className="h-10" /></div>
          <h1 className="font-display text-2xl">Entrar no painel</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bem-vinda de volta. Acesse seu studio.</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">E-mail</span>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input type="email" defaultValue="joyce@beautyflow.com" className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-gold/30" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Senha</span>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input type="password" defaultValue="••••••••" className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-gold/30" />
              </div>
            </label>
          </div>

          <button className="mt-6 w-full rounded-full bg-foreground py-3.5 text-sm font-medium text-background shadow-soft hover:opacity-90 transition">
            Entrar no painel
          </button>

          <div className="mt-4 flex items-center justify-between text-xs">
            <Link to="/" className="text-muted-foreground hover:text-foreground">← Voltar</Link>
            <a className="text-muted-foreground hover:text-foreground" href="#">Esqueci minha senha</a>
          </div>
        </form>
      </div>
    </div>
  );
}
