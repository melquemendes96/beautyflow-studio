import { useTheme } from "@/contexts/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

export function AppToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} richColors closeButton />;
}
