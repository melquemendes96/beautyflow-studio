import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marcas fictícias para prova social na landing (não são clientes reais). */
const BEAUTY_BRANDS = [
  {
    name: "Glow Lash Studio",
    logo: (
      <svg viewBox="0 0 40 40" aria-hidden className="size-full">
        <rect width="40" height="40" rx="20" fill="#FFF7ED" />
        <path
          d="M11 26c2.5-8 5-12 9-12s6.5 4 9 12"
          stroke="#C9A87C"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <text x="20" y="22" textAnchor="middle" fill="#8B6914" fontSize="9" fontWeight="600" fontFamily="Georgia, serif">
          glow
        </text>
      </svg>
    ),
  },
  {
    name: "Bella Nails & Spa",
    logo: (
      <svg viewBox="0 0 40 40" aria-hidden className="size-full">
        <rect width="40" height="40" rx="20" fill="#FFF1F2" />
        <circle cx="20" cy="14" r="3.5" fill="#E11D48" opacity="0.85" />
        <path d="M16 18h8v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V18z" fill="#BE123C" opacity="0.9" />
        <text x="20" y="34" textAnchor="middle" fill="#9F1239" fontSize="6.5" fontWeight="700" letterSpacing="0.6">
          BELLA
        </text>
      </svg>
    ),
  },
  {
    name: "Aura Estética",
    logo: (
      <svg viewBox="0 0 40 40" aria-hidden className="size-full">
        <rect width="40" height="40" rx="20" fill="#F0FDF4" />
        <path
          d="M20 10c-1 6-6 8-6 13a6 6 0 0 0 12 0c0-5-5-7-6-13z"
          fill="#86EFAC"
          opacity="0.9"
        />
        <text x="20" y="33" textAnchor="middle" fill="#166534" fontSize="7" fontWeight="600" letterSpacing="0.4">
          aura
        </text>
      </svg>
    ),
  },
  {
    name: "Rose Atelier",
    logo: (
      <svg viewBox="0 0 40 40" aria-hidden className="size-full">
        <rect width="40" height="40" rx="20" fill="#FDF2F8" />
        <circle cx="20" cy="16" r="5" fill="#F472B6" opacity="0.35" />
        <circle cx="17" cy="15" r="4" fill="#EC4899" opacity="0.55" />
        <circle cx="23" cy="15" r="4" fill="#DB2777" opacity="0.55" />
        <text x="20" y="33" textAnchor="middle" fill="#9D174D" fontSize="6.5" fontWeight="600" fontStyle="italic" fontFamily="Georgia, serif">
          rose
        </text>
      </svg>
    ),
  },
] as const;

type SocialProofBrandsProps = {
  className?: string;
};

export function SocialProofBrands({ className }: SocialProofBrandsProps) {
  return (
    <div className={cn("flex items-center gap-6 text-sm text-muted-foreground", className)}>
      <div className="flex -space-x-2" aria-label="Marcas de beleza que usam a plataforma">
        {BEAUTY_BRANDS.map((brand) => (
          <div
            key={brand.name}
            title={brand.name}
            className="size-9 shrink-0 overflow-hidden rounded-full border-2 border-background shadow-sm ring-1 ring-border/40"
          >
            {brand.logo}
          </div>
        ))}
      </div>
      <div>
        <div className="flex items-center gap-1 text-gold" aria-hidden>
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="size-3.5 fill-current" />
          ))}
        </div>
        <span className="text-xs">+ de 500 profissionais já amam</span>
      </div>
    </div>
  );
}
