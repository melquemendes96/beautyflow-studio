import type { ReactNode } from "react";

/** Moldura de celular — vitrine /demo (beauty e barbearia). */
export function DemoPhoneMockup({
  children,
  frameBg = "#fdf9f4",
  dark = false,
}: {
  children: ReactNode;
  frameBg?: string;
  dark?: boolean;
}) {
  return (
    <div className="demo-phone-mockup relative mx-auto w-[min(100%,320px)] shrink-0 sm:w-[320px] md:w-[340px]">
      <div
        className={`rounded-[42px] border-[11px] p-[7px] shadow-[0_28px_64px_-16px_rgba(0,0,0,0.55)] ${
          dark ? "border-[#0a0a0a] bg-[#0a0a0a]" : "border-[#121212] bg-[#121212]"
        }`}
      >
        <div
          className={`pointer-events-none absolute left-1/2 top-[18px] z-20 h-[22px] w-[88px] -translate-x-1/2 rounded-full ${
            dark ? "bg-[#0a0a0a]" : "bg-[#121212]"
          }`}
        />
        <div
          className="relative h-[min(78vh,740px)] overflow-hidden rounded-[32px] sm:h-[740px]"
          style={{ backgroundColor: frameBg }}
        >
          <div className="demo-phone-scroll pointer-events-auto h-full overflow-x-hidden overflow-y-auto overscroll-contain">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
