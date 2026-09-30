import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface ConfirmOptions { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) ...` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOpts(o);
  }), []);
  const close = (v: boolean) => { resolver.current?.(v); setOpts(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onClose={() => close(false)} title={opts?.title ?? ""} description={opts?.body}
        footer={<>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant={opts?.danger ? "danger" : "primary"} onClick={() => close(true)}>{opts?.confirmLabel ?? "Confirm"}</Button>
        </>} />
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
