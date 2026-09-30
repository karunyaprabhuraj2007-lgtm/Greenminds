import type { ReactNode } from "react";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-accent-50 text-accent-800 ring-accent-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  brand: "bg-navy-50 text-navy ring-navy-100",
};

export function Chip({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} aria-hidden />}
      {children}
    </span>
  );
}

const SURVEY_STATUS: Record<string, { tone: Tone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  planned: { tone: "info", label: "Planned" },
  flying: { tone: "info", label: "Flying" },
  uploaded: { tone: "warning", label: "Uploaded" },
  processing: { tone: "warning", label: "Processing" },
  processed: { tone: "success", label: "Processed" },
  verified: { tone: "success", label: "Verified" },
  archived: { tone: "neutral", label: "Archived" },
  ready: { tone: "info", label: "Ready" },
  authorized: { tone: "success", label: "Authorized" },
  queued: { tone: "neutral", label: "Queued" },
  running: { tone: "info", label: "Running" },
  done: { tone: "success", label: "Done" },
  failed: { tone: "danger", label: "Failed" },
};

export function StatusChip({ status }: { status: string }) {
  const s = SURVEY_STATUS[status] ?? { tone: "neutral" as Tone, label: status };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
