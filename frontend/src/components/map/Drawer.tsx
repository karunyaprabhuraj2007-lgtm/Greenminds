import { useRef, useState, type ReactNode } from "react";
import { IconButton } from "../ui/Button";

/** Right-hand details drawer, resizable by dragging (or arrow keys on) its left edge. */
export function Drawer({ title, subtitle, onClose, children, footer }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const [width, setWidth] = useState(380);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const clamp = (w: number) => Math.min(Math.max(w, 320), Math.min(720, window.innerWidth - 200));
  return (
    <aside className="floating absolute bottom-3 right-3 top-3 z-20 flex flex-col overflow-hidden" style={{ width }} aria-label="Details">
      <div
        role="separator" aria-orientation="vertical" aria-label="Resize panel" tabIndex={0} aria-valuenow={width} aria-valuemin={320} aria-valuemax={720}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-accent-200 focus-visible:bg-accent-200"
        onPointerDown={(e) => { drag.current = { x: e.clientX, w: width }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => drag.current && setWidth(clamp(drag.current.w + drag.current.x - e.clientX))}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") setWidth((w) => clamp(w + 24)); if (e.key === "ArrowRight") setWidth((w) => clamp(w - 24)); }}
      />
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-navy">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
        </div>
        <IconButton icon="close" label="Close panel (Esc)" onClick={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
    </aside>
  );
}
