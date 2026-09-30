/** GreenMinds wordmark: leaf-in-field mark + name. */
export function Mark({ className = "h-8 w-8", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill={onDark ? "#1B365D" : "#0B1F3A"} />
      <path d="M7 23.5h18M7 19.5h18" stroke="#3A5578" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.5 23c0-7.5 5-12.5 13-13-.5 8-5.5 13-12 13.4" fill="#2E7D32" />
      <path d="M10.5 23.4 17 16.8" stroke="#D3E9D4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ inverted = false, subtitle = true }: { inverted?: boolean; subtitle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark onDark={inverted} />
      <span className="leading-tight">
        <span className={`block text-[15px] font-semibold tracking-tight ${inverted ? "text-white" : "text-navy"}`}>
          Green<span className={inverted ? "text-accent-200" : "text-accent-600"}>Minds</span>
        </span>
        {subtitle && <span className={`block text-2xs ${inverted ? "text-navy-200" : "text-slate-500"}`}>Crop Intelligence Platform</span>}
      </span>
    </span>
  );
}
