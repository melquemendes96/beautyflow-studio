import { createFileRoute } from "@tanstack/react-router";
import { DemoShowcasePage } from "@/components/demo/DemoShowcasePage";
import {
  DEMO_BEAUTY_SHOWCASE,
  collectDemoAboveFoldAssetUrls,
} from "@/lib/demo-showcase-data";

const PRELOAD_LINKS = collectDemoAboveFoldAssetUrls(DEMO_BEAUTY_SHOWCASE).map((href) => ({
  rel: "preload" as const,
  href,
  as: "image" as const,
}));

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: "Studio feminino — JM BeautyFlow" },
      {
        name: "description",
        content:
          "Veja como fica a página de agendamento de um studio feminino no JM BeautyFlow.",
      },
    ],
    links: PRELOAD_LINKS,
  }),
  component: () => <DemoShowcasePage demo={DEMO_BEAUTY_SHOWCASE} key="beauty" />,
});
