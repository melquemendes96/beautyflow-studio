import { DemoBookingPreview } from "@/components/demo/DemoBookingPreview";
import { DemoPhoneMockup } from "@/components/demo/DemoPhoneMockup";

/** Vitrine /demo — desktop largo + mockup mobile à direita. */
export function DemoShowcasePage() {
  return (
    <div className="demo-showcase-page min-h-screen w-full bg-[#fdf9f4]">
      <div className="w-full px-2 py-6 sm:px-3 md:py-8 lg:px-4 xl:px-5">
        <div className="flex flex-col items-stretch gap-8 xl:flex-row xl:items-start xl:gap-6 2xl:gap-8">
          <div className="min-w-0 w-full flex-1">
            <DemoBookingPreview variant="desktop" />
          </div>

          <div className="hidden shrink-0 xl:block">
            <DemoPhoneMockup>
              <DemoBookingPreview variant="mobile" />
            </DemoPhoneMockup>
          </div>
        </div>

        <div className="mx-auto mt-6 w-full max-w-[400px] overflow-hidden rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] xl:hidden">
          <DemoBookingPreview variant="mobile" />
        </div>
      </div>
    </div>
  );
}
