import { createFileRoute } from "@tanstack/react-router";
import { DemoShowcasePage } from "@/components/demo/DemoShowcasePage";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demonstração — JM BeautyFlow" },
      {
        name: "description",
        content:
          "Veja como sua página de agendamento pode ficar: premium, elegante e pronta para converter clientes.",
      },
    ],
  }),
  component: DemoShowcasePage,
});
