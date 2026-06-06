import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicBookingProvider } from "@/services/publicBookingService";
import { cn } from "@/lib/utils";

type ProviderPickerCarouselProps = {
  providers: PublicBookingProvider[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  primaryColor: string;
};

export function ProviderPickerCarousel({
  providers,
  selectedId,
  onSelect,
  primaryColor,
}: ProviderPickerCarouselProps) {
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
    <div className="mt-6">
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
                        ? "scale-100 border-2 bg-card shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]"
                        : "scale-[0.88] border-border/60 bg-secondary/30 opacity-60 hover:opacity-80",
                    )}
                    style={isActive ? { borderColor: primaryColor } : undefined}
                  >
                    {p.photo_url ? (
                      <img
                        src={p.photo_url}
                        alt=""
                        className={cn(
                          "rounded-full object-cover transition-all duration-300",
                          isActive ? "size-28 ring-4 ring-offset-2" : "size-20",
                        )}
                        style={isActive ? { ringColor: `${primaryColor}55` } : undefined}
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
                      )}
                    >
                      {p.display_name}
                    </div>
                    {p.is_owner ? (
                      <div className="mt-1 text-xs text-muted-foreground">Responsável pelo studio</div>
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
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ChevronLeft className="size-4 animate-pulse" aria-hidden />
            Deslize para escolher o profissional
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
                  index === selectedIndex ? "w-6" : "w-1.5 bg-border",
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
