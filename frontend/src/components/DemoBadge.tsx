/** Visible marker required on every seeded / demo number (CLAUDE.md rule 4). */
export function DemoBadge({ label = "Demo data", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      title="Seeded demonstration data - not a real survey result"
      className={`inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ${className}`}
    >
      {label}
    </span>
  );
}
