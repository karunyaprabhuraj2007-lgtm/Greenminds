import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";

type Tone = "success" | "error" | "info";
interface ToastItem { id: number; tone: Tone; title: string; body?: string }

const ToastContext = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

const STYLE: Record<Tone, { icon: "check" | "alert" | "info"; cls: string }> = {
  success: { icon: "check", cls: "text-accent-700 bg-accent-50" },
  error: { icon: "alert", cls: "text-red-700 bg-red-50" },
  info: { icon: "info", cls: "text-navy-600 bg-navy-50" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.tone === "error" ? 8000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" role="region" aria-label="Notifications" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex animate-fade-in items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-e3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${STYLE[t.tone].cls}`}>
                <Icon name={STYLE[t.tone].icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{t.title}</p>
                {t.body && <p className="mt-0.5 break-words text-xs text-slate-600">{t.body}</p>}
              </div>
              <button className="text-slate-400 hover:text-slate-700" aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
