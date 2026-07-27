import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, MessageCircle, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { DEMO_BOOKING_PATH, DEMO_BARBER_PATH, corporateWhatsAppHref } from "@/lib/app-constants";
import { trackMarketingEvent } from "@/lib/marketing-analytics";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const onWhatsApp = () => trackMarketingEvent("whatsapp_click", { placement: "header" });

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container-page flex min-h-14 items-center justify-between gap-2 py-2 sm:min-h-16 sm:gap-3">
        <Link to="/" className="min-w-0 shrink">
          <Logo onLight className="h-9 max-w-[140px] sm:h-11 sm:max-w-[200px]" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#beneficios" className="transition-colors hover:text-foreground">
            Benefícios
          </a>
          <a href="#como-funciona" className="transition-colors hover:text-foreground">
            Como funciona
          </a>
          <a href="#planos" className="transition-colors hover:text-foreground">
            Planos
          </a>
          <a href="#depoimentos" className="transition-colors hover:text-foreground">
            Depoimentos
          </a>
          <a
            href={corporateWhatsAppHref()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWhatsApp}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <MessageCircle className="size-3.5" aria-hidden />
            Fale conosco
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            to="/login"
            className="hidden px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:inline sm:text-sm"
          >
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="hidden rounded-full border border-foreground/15 bg-background/60 px-3 py-2 text-xs font-medium hover:bg-background sm:inline-flex sm:px-4 sm:text-sm"
          >
            Criar conta
          </Link>
          <Link
            to={DEMO_BOOKING_PATH}
            className="hidden rounded-full border border-foreground/15 bg-background/60 px-3 py-2 text-xs font-medium hover:bg-background lg:inline-flex lg:px-4 lg:text-sm"
          >
            Studio feminino
          </Link>
          <Link
            to={DEMO_BARBER_PATH}
            className="hidden rounded-full bg-foreground px-3 py-2 text-xs font-medium text-background shadow-soft transition hover:opacity-90 sm:inline-flex sm:px-4 sm:text-sm"
          >
            Barbearias
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-background md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-border/60 bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm">
            <a href="#beneficios" onClick={() => setMenuOpen(false)} className="text-muted-foreground">
              Benefícios
            </a>
            <a href="#como-funciona" onClick={() => setMenuOpen(false)} className="text-muted-foreground">
              Como funciona
            </a>
            <a href="#planos" onClick={() => setMenuOpen(false)} className="text-muted-foreground">
              Planos
            </a>
            <a href="#depoimentos" onClick={() => setMenuOpen(false)} className="text-muted-foreground">
              Depoimentos
            </a>
            <a
              href={corporateWhatsAppHref()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                onWhatsApp();
                setMenuOpen(false);
              }}
              className="inline-flex items-center gap-2 font-medium text-foreground"
            >
              <MessageCircle className="size-4 text-[#25D366]" aria-hidden />
              Fale conosco
            </a>
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-xl border border-border px-4 py-3 text-center text-sm"
            >
              Entrar
            </Link>
            <Link
              to="/cadastro"
              onClick={() => setMenuOpen(false)}
              className="rounded-xl border border-border px-4 py-3 text-center text-sm font-medium"
            >
              Criar conta
            </Link>
            <Link
              to={DEMO_BOOKING_PATH}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl border border-border px-4 py-3 text-center text-sm font-medium"
            >
              Studio feminino
            </Link>
            <Link
              to={DEMO_BARBER_PATH}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl bg-foreground px-4 py-3 text-center text-sm font-medium text-background"
            >
              Barbearias
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
