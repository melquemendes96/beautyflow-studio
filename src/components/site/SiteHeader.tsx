import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Logo onLight className="h-11 max-w-[220px]" />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#beneficios" className="hover:text-foreground transition-colors">Benefícios</a>
          <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
          <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
          <a href="#depoimentos" className="hover:text-foreground transition-colors">Depoimentos</a>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            to="/login"
            className="inline-flex px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-0 sm:py-0 sm:text-sm"
          >
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex rounded-full border border-foreground/15 bg-background/60 px-3 py-2 text-xs font-medium hover:bg-background sm:px-5 sm:py-2.5 sm:text-sm"
          >
            Criar conta
          </Link>
          <Link
            to="/agendar/$slug"
            params={{ slug: "joyce-mendes" }}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-soft hover:opacity-90 transition"
          >
            Ver demonstração
          </Link>
        </div>
      </div>
    </header>
  );
}
