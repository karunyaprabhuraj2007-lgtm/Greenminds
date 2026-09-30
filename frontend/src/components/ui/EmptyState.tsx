import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

/** Designed empty state: what is missing and the next action. */
export function EmptyState({ icon, title, body, action, compact }: {
  icon: IconName; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "px-4 py-6" : "px-6 py-12"}`}>
      <span className={`mb-3 flex items-center justify-center rounded-full bg-navy-50 text-navy-600 ${compact ? "h-9 w-9" : "h-12 w-12"}`}>
        <Icon name={icon} className={compact ? "h-4 w-4" : "h-6 w-6"} />
      </span>
      <h3 className={`font-semibold text-navy ${compact ? "text-sm" : "text-base"}`}>{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
