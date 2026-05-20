/** Logo fictícia La Belle — somente vitrine /demo */
export function DemoLaBelleLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="120" height="120" rx="16" fill="#0a0a0a" />
      <circle cx="60" cy="42" r="18" fill="none" stroke="#c9a960" strokeWidth="1.5" />
      <path
        d="M48 52c4 8 20 8 24 0M52 38c2-6 14-6 16 0"
        stroke="#c9a960"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x="60"
        y="78"
        textAnchor="middle"
        fill="#c9a960"
        fontSize="11"
        fontWeight="700"
        fontFamily="Georgia, serif"
        letterSpacing="2"
      >
        LB
      </text>
      <text
        x="60"
        y="94"
        textAnchor="middle"
        fill="#f5f0e8"
        fontSize="7"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.8"
      >
        LA BELLE
      </text>
      <text
        x="60"
        y="106"
        textAnchor="middle"
        fill="#a8a8a8"
        fontSize="5.5"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.5"
      >
        BEAUTY STUDIO
      </text>
    </svg>
  );
}
