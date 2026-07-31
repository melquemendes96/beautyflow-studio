import { createFileRoute } from "@tanstack/react-router";
import { DemoShowcasePage } from "@/components/demo/DemoShowcasePage";
import {
  DEMO_BARBER_SHOWCASE,
  collectDemoAboveFoldAssetUrls,
} from "@/lib/demo-showcase-data";

const PRELOAD_LINKS = collectDemoAboveFoldAssetUrls(DEMO_BARBER_SHOWCASE).map((href) => ({
  rel: "preload" as const,
  href,
  as: "image" as const,
}));

export const Route = createFileRoute("/demo/barbearia")({
  head: () => ({
    meta: [
      { title: "Barbearias — JM BeautyFlow" },
      {
        name: "description",
        content:
          "Veja como fica a página de agendamento de uma barbearia no JM BeautyFlow: corte, barba e combo.",
      },
    ],
    links: PRELOAD_LINKS,
  }),
  component: () => <DemoShowcasePage demo={DEMO_BARBER_SHOWCASE} key="barbearia" />,
});
