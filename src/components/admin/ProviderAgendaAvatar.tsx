import { UserRound } from "lucide-react";

export type AgendaProviderInfo = {
  display_name?: string | null;
  photo_url?: string | null;
  color?: string | null;
} | null | undefined;

const DEFAULT_PROVIDER_COLOR = "#1a1a1a";

type ProviderAgendaAvatarProps = {
  provider: AgendaProviderInfo;
  size?: "sm" | "md";
  showName?: boolean;
};

export function ProviderAgendaAvatar({ provider, size = "md", showName = false }: ProviderAgendaAvatarProps) {
  if (!provider?.display_name && !provider?.photo_url) return null;

  const color = provider?.color?.trim() || DEFAULT_PROVIDER_COLOR;
  const dim = size === "sm" ? "size-7" : "size-11";
  const iconSize = size === "sm" ? "size-3.5" : "size-5";
  const name = provider?.display_name?.trim() || "Prestador";

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={`${dim} overflow-hidden rounded-full border-[3px] bg-secondary`}
        style={{ borderColor: color }}
        title={name}
        aria-label={`Prestador: ${name}`}
      >
        {provider?.photo_url ? (
          <img src={provider.photo_url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <UserRound className={iconSize} />
          </div>
        )}
      </div>
      {showName ? (
        <span className="max-w-[4.25rem] truncate text-center text-[9px] leading-tight text-muted-foreground">
          {name.split(" ")[0]}
        </span>
      ) : null}
    </div>
  );
}

export function providerAgendaLabel(provider: AgendaProviderInfo): string | null {
  const name = provider?.display_name?.trim();
  return name || null;
}
