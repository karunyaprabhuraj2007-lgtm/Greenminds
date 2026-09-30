import { useEffect } from "react";

/** Calls `reload` every `ms` while `active` is true. */
export function usePolling(active: boolean, reload: () => void, ms = 2000) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [active, reload, ms]);
}
