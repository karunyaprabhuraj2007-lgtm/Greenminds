import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";

/** Modal dialog: focus moves in on open, Esc closes, focus is trapped, returns on close. */
export function Dialog({ open, onClose, title, description, children, footer, width = "max-w-md" }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? []).filter((el) => !el.hasAttribute("disabled"));
    (focusables()[1] ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const els = focusables();
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); previous?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`w-full ${width} animate-fade-in rounded-xl bg-white shadow-e3`}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h2 id="dialog-title" className="text-base font-semibold text-navy">{title}</h2>
            {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
          </div>
          <IconButton icon="close" label="Close dialog" onClick={onClose} />
        </div>
        {children && <div className="px-5 pt-4">{children}</div>}
        {footer && <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
        {!footer && <div className="h-5" />}
      </div>
    </div>,
    document.body,
  );
}
