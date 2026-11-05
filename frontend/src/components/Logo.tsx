import { cn } from "../lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="md-g" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7AF0DC" />
          <stop offset="1" stopColor="#0D9488" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#0C1517" stroke="#1F3A3A" />
      <path d="M8 11.5 16 7l8 4.5v9L16 25l-8-4.5v-9Z" stroke="url(#md-g)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 11.5 16 16l8-4.5M16 16v9" stroke="url(#md-g)" strokeWidth="2" strokeLinejoin="round" opacity=".5" />
      <circle cx="16" cy="16" r="1.6" fill="#7AF0DC" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="leading-none">
          <div className="text-[14.5px] font-semibold tracking-[-0.01em] text-fg">
            Mock<span className="text-brand-400">Dock</span>
          </div>
          <div className="mt-1 text-[10.5px] font-medium text-fg-faint">API mocking studio</div>
        </div>
      )}
    </div>
  );
}
