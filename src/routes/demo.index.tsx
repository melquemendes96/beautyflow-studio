import { createFileRoute } from "@tanstack/react-router";
import { DemoShowcasePage } from "@/components/demo/DemoShowcasePage";
import { DEMO_BEAUTY_SHOWCASE } from "@/lib/demo-showcase-data";

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
  }),
  component: () => <DemoShowcasePage demo={DEMO_BEAUTY_SHOWCASE} key="beauty" />,
});
