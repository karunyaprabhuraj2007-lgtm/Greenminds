import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { homePath } from "../app/nav";
import { Wordmark } from "../components/Wordmark";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";

/** Decorative field-parcel line pattern for the brand panel (no gradients). */
function ParcelPattern() {
  return (
    <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="#AEBFD4" strokeWidth="1">
        <path d="M0 80 L130 60 L170 150 L60 190 Z" /><path d="M130 60 L260 40 L300 120 L170 150" />
        <path d="M260 40 L400 30 L400 110 L300 120" /><path d="M60 190 L170 150 L210 260 L90 300 Z" />
        <path d="M170 150 L300 120 L340 230 L210 260" /><path d="M300 120 L400 110 L400 220 L340 230" />
        <path d="M90 300 L210 260 L240 400 L110 400 Z" /><path d="M210 260 L340 230 L380 400 L240 400" />
        <path d="M0 190 L60 190 L90 300 L0 320" />
      </g>
      <path d="M170 150 L300 120 L340 230 L210 260 Z" fill="#2E7D32" opacity="0.6" />
    </svg>
  );
}

export default function Login() {
  const { user, login, can } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Sign in · GreenMinds"; }, []);
  if (user) return <Navigate to={homePath(can)} replace />;

  const emailError = touched && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address" : null;
  const passwordError = touched && !password ? "Enter your password" : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-navy p-10 text-white lg:flex lg:flex-col">
        <ParcelPattern />
        <div className="relative"><Wordmark inverted /></div>
        <div className="relative mt-auto max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Plot-level crop intelligence for Maharashtra.
          </h1>
          <p className="mt-4 text-sm leading-6 text-navy-100">
            Drone surveys, Sentinel-2 monitoring and field verification in one geospatial workspace for
            district and state officers.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-xs text-navy-200">
            <div><dt>Boundaries</dt><dd className="mt-1 text-white">geoBoundaries</dd></div>
            <div><dt>Satellite</dt><dd className="mt-1 text-white">Sentinel-2 L2A</dd></div>
            <div><dt>Weather</dt><dd className="mt-1 text-white">Open-Meteo</dd></div>
          </dl>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Wordmark /></div>
          <h2 className="text-2xl font-semibold tracking-tight text-navy">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your departmental account. Your role and district come from your account.</p>
          <form onSubmit={submit} noValidate className="mt-8 space-y-5">
            <Field id="email" label="Email" error={emailError}>
              <input id="email" type="email" autoComplete="username" className={`input ${emailError ? "input-error" : ""}`}
                value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!emailError}
                aria-describedby={emailError ? "email-error" : undefined} autoFocus />
            </Field>
            <Field id="password" label="Password" error={passwordError}>
              <input id="password" type="password" autoComplete="current-password" className={`input ${passwordError ? "input-error" : ""}`}
                value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!passwordError}
                aria-describedby={passwordError ? "password-error" : undefined} />
            </Field>
            {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={busy}>Sign in</Button>
          </form>
          <p className="mt-10 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            Decision-support system. Satellite and AI outputs are advisory; final decisions are made by authorized officers.
          </p>
        </div>
      </main>
    </div>
  );
}
