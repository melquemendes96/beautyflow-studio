import { MessageCircle } from "lucide-react";
import { corporateWhatsAppHref } from "@/lib/app-constants";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function WhatsAppFloatingButton({ className }: Props) {
  return (
    <a
      href={corporateWhatsAppHref()}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackMarketingEvent("whatsapp_click", { placement: "floating" })}
      className={cn(
        "fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-50",
        "inline-flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-elegant",
        "transition hover:scale-105 hover:bg-[#1ebe57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/ring-offset-2",
        className,
      )}
      aria-label="Fale conosco no WhatsApp"
      title="Fale conosco no WhatsApp"
    >
      <MessageCircle className="size-7 fill-current" aria-hidden />
    </a>
  );
}
