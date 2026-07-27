import { DemoBookingPreview } from "@/components/demo/DemoBookingPreview";
import { DemoPhoneMockup } from "@/components/demo/DemoPhoneMockup";
import type { DemoShowcase } from "@/lib/demo-showcase-data";
import { DEMO_BEAUTY_SHOWCASE } from "@/lib/demo-showcase-data";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

type Props = {
  demo?: DemoShowcase;
};

/**
 * Vitrine comercial.
 * Mobile: só a demonstração no celular.
 * Desktop (lg+): PC + mockup do celular lado a lado.
 */
export function DemoShowcasePage({ demo = DEMO_BEAUTY_SHOWCASE }: Props) {
  const dark = demo.theme === "dark";

  return (
    <div
      key={demo.id}
      className="demo-showcase-page min-h-screen w-full"
      style={{ backgroundColor: demo.pageBg }}
    >
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className={`inline-flex items-center gap-1.5 text-sm transition hover:opacity-80 ${
            dark ? "text-[#bbb]" : "text-muted-foreground"
          }`}
        >
          <ArrowLeft className="size-4" />
          Voltar ao site
        </Link>
        <p className={`text-xs font-medium uppercase tracking-wider ${dark ? "text-[#888]" : "text-muted-foreground"}`}>
          {demo.id === "barbearia" ? "Barbearias" : "Studio feminino"} · {demo.studio.name}
        </p>
      </div>

      <div className="w-full px-3 pb-10 sm:px-4 md:px-6 lg:px-8">
        {/* Mobile / tablet: apenas celular */}
        <div className="flex justify-center lg:hidden">
          <DemoPhoneMockup frameBg={demo.previewBg} dark={dark}>
            <DemoBookingPreview key={`${demo.id}-mobile`} variant="mobile" demo={demo} />
          </DemoPhoneMockup>
        </div>

        {/* Desktop: PC + celular */}
        <div className="hidden lg:flex lg:items-start lg:justify-center lg:gap-8 xl:gap-10">
          <div className="min-w-0 max-w-[920px] flex-1">
            <DemoBookingPreview key={`${demo.id}-desktop`} variant="desktop" demo={demo} />
          </div>
          <div className="shrink-0 pt-2">
            <DemoPhoneMockup frameBg={demo.previewBg} dark={dark}>
              <DemoBookingPreview key={`${demo.id}-phone`} variant="mobile" demo={demo} />
            </DemoPhoneMockup>
          </div>
        </div>
      </div>
    </div>
  );
}
