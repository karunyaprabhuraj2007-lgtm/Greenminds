export const fmtHa = (v: number | null | undefined, digits = 1) =>
  v == null ? "–" : `${v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })} ha`;

export const fmtPct = (v: number | null | undefined, digits = 1) => (v == null ? "–" : `${v.toFixed(digits)}%`);

export const fmtNum = (v: number | null | undefined, digits = 2) => (v == null ? "–" : v.toFixed(digits));

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–";

export const titleCase = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "–";
