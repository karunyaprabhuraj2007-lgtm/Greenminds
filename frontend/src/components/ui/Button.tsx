import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-700 active:bg-navy-800 shadow-e1",
  accent: "bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800 shadow-e1",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 shadow-e1",
  ghost: "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  danger: "bg-red-700 text-white hover:bg-red-800 shadow-e1",
};
const SIZE: Record<Size, string> = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-9 px-4 text-sm gap-2" };

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", icon, loading, children, className = "", disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex shrink-0 items-center justify-center rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
      ) : icon ? (
        <Icon name={icon} className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : null}
      {children}
    </button>
  );
});

export function IconButton({ icon, label, className = "", active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy disabled:opacity-40 ${active ? "bg-navy-50 text-navy" : ""} ${className}`}
      {...rest}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}
