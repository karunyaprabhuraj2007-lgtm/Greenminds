import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface Crumb {
  label: string;
  to?: string;
  onClick?: () => void;
}

interface PageState { crumbs: Crumb[]; setCrumbs: (c: Crumb[]) => void }
const PageContext = createContext<PageState>({ crumbs: [], setCrumbs: () => {} });

export function PageProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  return <PageContext.Provider value={{ crumbs, setCrumbs }}>{children}</PageContext.Provider>;
}

export const useCrumbs = () => useContext(PageContext).crumbs;

/** Sets the document title and the top-bar breadcrumb for the current page. */
export function usePage(title: string, crumbs?: Crumb[]) {
  const { setCrumbs } = useContext(PageContext);
  const key = JSON.stringify(crumbs?.map((c) => [c.label, c.to]) ?? [title]);
  useEffect(() => {
    document.title = `${title} · GreenMinds`;
    setCrumbs(crumbs ?? [{ label: title }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, key]);
}
