import { useEffect } from "react";

/** Is the event coming from a text field (where single-key shortcuts must not fire)? */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

/**
 * Global shortcuts. `bindings` keys are "mod+k", "?", or two-key sequences
 * like "g d" (press g, then d within 1 s).
 */
export function useHotkeys(bindings: Record<string, () => void>) {
  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k" && bindings["mod+k"]) {
        e.preventDefault();
        bindings["mod+k"]();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (pending) {
        const fn = bindings[`${pending} ${key}`];
        pending = null;
        clearTimeout(timer);
        if (fn) { e.preventDefault(); fn(); }
        return;
      }
      if (Object.keys(bindings).some((b) => b.startsWith(`${key} `))) {
        pending = key;
        timer = setTimeout(() => (pending = null), 1000);
        return;
      }
      const fn = bindings[e.key] ?? bindings[key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(timer); };
  }, [bindings]);
}
