import { createFileRoute } from "@tanstack/react-router";
import { DemoShowcasePage } from "@/components/demo/DemoShowcasePage";
import { DEMO_BARBER_SHOWCASE } from "@/lib/demo-showcase-data";

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
  }),
  component: () => <DemoShowcasePage demo={DEMO_BARBER_SHOWCASE} key="barbearia" />,
});
