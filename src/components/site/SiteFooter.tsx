import { Link } from "@tanstack/react-router";
import { WordMark } from "@/components/brand/Logo";
import { DEMO_BOOKING_PATH, corporateWhatsAppHref } from "@/lib/app-constants";
import { trackMarketingEvent } from "@/lib/marketing-analytics";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="container-page grid gap-8 py-14 md:grid-cols-4">
        <div className="space-y-3">
          <WordMark />
          <p className="text-sm text-muted-foreground">Agenda inteligente para negócios de beleza.</p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Produto</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="#beneficios" className="hover:text-foreground">
                Recursos
              </a>
            </li>
            <li>
              <a href="#planos" className="hover:text-foreground">
                Planos
              </a>
            </li>
            <li>
              <Link to={DEMO_BOOKING_PATH} className="hover:text-foreground">
                Demonstração
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Empresa</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <a
                href={corporateWhatsAppHref()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackMarketingEvent("whatsapp_click", { placement: "footer" })}
                className="hover:text-foreground"
              >
                Fale conosco
              </a>
            </li>
            <li>
              <a
                href={corporateWhatsAppHref()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackMarketingEvent("whatsapp_click", { placement: "footer_contato" })}
                className="hover:text-foreground"
              >
                Contato (WhatsApp)
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Legal</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Termos</li>
            <li>Privacidade</li>
            <li>LGPD</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © 2026 JM BeautyFlow — Feito com elegância no Brasil.
      </div>
    </footer>
  );
}
