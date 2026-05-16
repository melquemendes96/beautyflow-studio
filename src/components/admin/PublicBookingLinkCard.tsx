import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from "@/lib/public-booking-slug";

type PublicBookingLinkCardProps = {
  slug: string | null | undefined;
  companyName?: string | null;
  className?: string;
};

export function PublicBookingLinkCard({ slug, companyName, className }: PublicBookingLinkCardProps) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const normalizedSlug = useMemo(() => normalizePublicBookingSlug(slug ?? ""), [slug]);
  const bookingPath = `/agendar/${encodeURIComponent(normalizedSlug || "exemplo")}`;
  const bookingFullUrl = origin ? `${origin}${bookingPath}` : bookingPath;

  const copyBookingLink = async () => {
    if (!normalizedSlug || !isValidPublicBookingSlug(normalizedSlug)) {
      toast.error("Salve um slug válido em Configurações antes de copiar o link.");
      return;
    }
    const toCopy = origin ? `${origin}/agendar/${encodeURIComponent(normalizedSlug)}` : bookingPath;
    try {
      await navigator.clipboard.writeText(toCopy);
      toast.success("Link copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente o texto acima.");
    }
  };

  return (
    <div className={`space-y-3 rounded-2xl border border-border bg-secondary/20 p-4 ${className ?? ""}`}>
      <p className="text-sm font-medium text-foreground">Link público de agendamento</p>
      <p className="text-xs text-muted-foreground">
        Endereço que suas clientes acessam sem login. Slug definido em Configurações (
        <span className="font-mono text-foreground/90">companies.slug</span>).
      </p>
      {companyName ? (
        <p className="text-xs text-muted-foreground">
          Empresa: <span className="font-medium text-foreground">{companyName}</span>
        </p>
      ) : null}
      <div className="rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed break-all text-foreground">
        {bookingFullUrl}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyBookingLink()}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium transition hover:bg-secondary"
        >
          <Copy className="size-3.5" />
          Copiar link
        </button>
        {normalizedSlug && isValidPublicBookingSlug(normalizedSlug) ? (
          <a
            href={origin ? `${origin}/agendar/${encodeURIComponent(normalizedSlug)}` : bookingPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium transition hover:bg-secondary"
          >
            <ExternalLink className="size-3.5" />
            Abrir página pública
          </a>
        ) : null}
      </div>
      {!normalizedSlug || !isValidPublicBookingSlug(normalizedSlug) ? (
        <p className="text-xs text-destructive">
          Slug inválido ou ausente. Defina o slug em Configurações e salve.
        </p>
      ) : null}
    </div>
  );
}
