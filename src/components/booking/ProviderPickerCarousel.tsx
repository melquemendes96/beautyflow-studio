import { useCallback, useEffect, useState, type CSSProperties } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Formato compartilhado: agenda pública + demonstração comercial. */
export type ProviderPickerItem = {
  id: string;
  display_name: string;
  photo_url: string | null;
  color?: string | null;
  is_owner?: boolean;
  subtitle?: string | null;
};

type ProviderPickerCarouselProps = {
  providers: ProviderPickerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  primaryColor: string;
  className?: string;
  hint?: string;
  /** Visual da demo escura (barbearia) sem depender do tema global. */
  tone?: "default" | "dark";
};

export function ProviderPickerCarousel({
  providers,
  selectedId,
  onSelect,
  primaryColor,
  className,
  hint = "Deslize para escolher o profissional",
  tone = "default",
}: ProviderPickerCarouselProps) {
  const dark = tone === "dark";
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    dragFree: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollToProvider = useCallback(
    (index: number) => {
      emblaApi?.scrollTo(index);
    },
    [emblaApi],
  );

  useEffect(() => {
    if (!emblaApi || providers.length === 0) return;

    const onSelectSlide = () => {
      const index = emblaApi.selectedScrollSnap();
      setSelectedIndex(index);
      const provider = providers[index];
      if (provider) onSelect(provider.id);
    };

    emblaApi.on("select", onSelectSlide);
    emblaApi.on("reInit", onSelectSlide);
    onSelectSlide();

    return () => {
      emblaApi.off("select", onSelectSlide);
      emblaApi.off("reInit", onSelectSlide);
    };
  }, [emblaApi, providers, onSelect]);

  useEffect(() => {
    if (!emblaApi || !selectedId || providers.length === 0) return;
    const index = providers.findIndex((p) => p.id === selectedId);
    if (index >= 0 && index !== emblaApi.selectedScrollSnap()) {
      emblaApi.scrollTo(index, true);
    }
  }, [emblaApi, selectedId, providers]);

  if (providers.length === 0) return null;

  return (
    <div className={cn("mt-6", className)}>
      <div
        className="relative px-1"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex touch-pan-y">
            {providers.map((p, index) => {
              const isActive = index === selectedIndex;
              const subtitle =
                p.subtitle?.trim() || (p.is_owner ? "Responsável pelo studio" : null);
              return (
                <div
                  key={p.id}
                  className="min-w-0 shrink-0 grow-0 basis-[72%] pl-3 sm:basis-[58%] sm:pl-4"
                >
                  <button
                    type="button"
                    onClick={() => scrollToProvider(index)}
                    className={cn(
                      "mx-auto flex w-full max-w-[280px] flex-col items-center rounded-3xl border px-4 py-6 text-center transition-all duration-300 ease-out",
                      isActive
                        ? dark
                          ? "scale-100 border-2 bg-[#1c1c1c] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)]"
                          : "scale-100 border-2 bg-card shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]"
                        : dark
                          ? "scale-[0.88] border-[#2a2a2a] bg-[#171717] opacity-60 hover:opacity-80"
                          : "scale-[0.88] border-border/60 bg-secondary/30 opacity-60 hover:opacity-80",
                    )}
                    style={isActive ? { borderColor: primaryColor } : undefined}
                  >
                    {p.photo_url ? (
                      <img
                        src={p.photo_url}
                        alt=""
                        width={112}
                        height={112}
                        loading={isActive || index < 2 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={isActive ? "high" : "auto"}
                        className={cn(
                          "rounded-full object-cover object-top transition-all duration-300",
                          isActive
                            ? cn(
                                "size-28 ring-4 ring-offset-2",
                                dark ? "ring-offset-[#1c1c1c]" : "ring-offset-background",
                              )
                            : "size-20",
                        )}
                        style={
                          isActive
                            ? ({ ["--tw-ring-color"]: `${primaryColor}55` } as CSSProperties)
                            : undefined
                        }
                      />
                    ) : (
                      <div
                        className={cn(
                          "grid place-items-center rounded-full font-semibold text-white transition-all duration-300",
                          isActive ? "size-28 text-3xl" : "size-20 text-xl",
                        )}
                        style={{ backgroundColor: p.color ?? primaryColor }}
                      >
                        {p.display_name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div
                      className={cn(
                        "mt-4 font-display font-semibold transition-all duration-300",
                        isActive ? "text-xl" : "text-base",
                        dark ? "text-white" : undefined,
                      )}
                    >
                      {p.display_name}
                    </div>
                    {subtitle ? (
                      <div className={cn("mt-1 text-xs", dark ? "text-[#aaa]" : "text-muted-foreground")}>
                        {subtitle}
                      </div>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {providers.length > 1 ? (
        <>
          <p
            className={cn(
              "mt-5 flex items-center justify-center gap-2 text-xs",
              dark ? "text-[#aaa]" : "text-muted-foreground",
            )}
          >
            <ChevronLeft className="size-4 animate-pulse" aria-hidden />
            {hint}
            <ChevronRight className="size-4 animate-pulse" aria-hidden />
          </p>
          <div className="mt-3 flex justify-center gap-1.5">
            {providers.map((p, index) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Ir para ${p.display_name}`}
                onClick={() => scrollToProvider(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === selectedIndex ? "w-6" : dark ? "w-1.5 bg-[#333]" : "w-1.5 bg-border",
                )}
                style={index === selectedIndex ? { backgroundColor: primaryColor } : undefined}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
