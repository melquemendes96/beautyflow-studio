import type { ReactNode } from "react";

/** Moldura de celular — apenas vitrine /demo */
export function DemoPhoneMockup({ children }: { children: ReactNode }) {
  return (
    <div className="demo-phone-mockup relative mx-auto w-[292px] shrink-0">
      <div className="rounded-[42px] border-[11px] border-[#121212] bg-[#121212] p-[7px] shadow-[0_28px_64px_-16px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute left-1/2 top-[18px] z-20 h-[22px] w-[88px] -translate-x-1/2 rounded-full bg-[#121212]" />
        <div className="relative h-[720px] overflow-hidden rounded-[32px] bg-[#fdf9f4]">
          <div className="demo-phone-scroll pointer-events-auto h-full overflow-x-hidden overflow-y-auto overscroll-contain">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
