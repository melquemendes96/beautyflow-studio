import { WordMark } from "@/components/brand/Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="container-page grid gap-8 py-14 md:grid-cols-4">
        <div className="space-y-3">
          <WordMark />
          <p className="text-sm text-muted-foreground">
            Agenda inteligente para negócios de beleza.
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Produto</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Recursos</li><li>Planos</li><li>Demonstração</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Empresa</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Sobre</li><li>Contato</li><li>Blog</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold">Legal</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Termos</li><li>Privacidade</li><li>LGPD</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © 2026 JM BeautyFlow — Feito com elegância no Brasil.
      </div>
    </footer>
  );
}
