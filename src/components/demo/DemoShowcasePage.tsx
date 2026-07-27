import { useEffect } from "react";
import { DemoBookingPreview } from "@/components/demo/DemoBookingPreview";
import { DemoPhoneMockup } from "@/components/demo/DemoPhoneMockup";
import type { DemoShowcase } from "@/lib/demo-showcase-data";
import {
  DEMO_BEAUTY_SHOWCASE,
  collectDemoAssetUrls,
  prefetchDemoAssets,
} from "@/lib/demo-showcase-data";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

type Props = {
  demo?: DemoShowcase;
};

/**
 * Vitrine comercial — mesma experiência nas duas demos:
 * fundo claro fora do celular + mock de tela (tema interno do salão).
 */
export function DemoShowcasePage({ demo = DEMO_BEAUTY_SHOWCASE }: Props) {
  const dark = demo.theme === "dark";
  const assetUrls = collectDemoAssetUrls(demo);
  // Sempre claro fora do aparelho — contraste com a moldura/tela
  const pageBg = demo.id === "barbearia" ? "#ffffff" : demo.pageBg;

  useEffect(() => {
    prefetchDemoAssets(demo);
  }, [demo]);

  return (
    <div
      key={demo.id}
      className="demo-showcase-page min-h-screen w-full"
      style={{ backgroundColor: pageBg }}
    >
      <div className="sr-only" aria-hidden>
        {assetUrls.map((url) => (
          <img key={url} src={url} alt="" width={1} height={1} decoding="async" />
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar ao site
        </Link>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {demo.id === "barbearia" ? "Barbearias" : "Studio feminino"} · {demo.studio.name}
        </p>
      </div>

      <div className="flex w-full justify-center px-3 pb-10 sm:px-4 md:px-6 lg:px-8">
        <DemoPhoneMockup frameBg={demo.previewBg} dark={dark}>
          <DemoBookingPreview key={demo.id} variant="mobile" demo={demo} />
        </DemoPhoneMockup>
      </div>
    </div>
  );
}
