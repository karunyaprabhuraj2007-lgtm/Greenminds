import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="card max-w-lg p-6">
      <h2 className="text-lg font-semibold text-navy">Page not found</h2>
      <p className="mt-2 text-sm text-slate-600">This page does not exist or your role does not have access to it.</p>
      <Link to="/" className="btn-secondary mt-4">Go to start page</Link>
    </div>
  );
}
