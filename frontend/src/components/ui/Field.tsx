import type { ReactNode } from "react";

/** Label + control + hint / inline error (aria-describedby wired by id). */
export function Field({ id, label, error, hint, required, children }: {
  id: string; label: string; error?: string | null; hint?: ReactNode; required?: boolean; children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {required && <span className="text-red-700" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-700" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
