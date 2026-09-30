import { Link } from "react-router-dom";
import { usePage } from "../app/page";
import { EmptyState } from "../components/ui/EmptyState";

export default function NotFound() {
  usePage("Page not found");
  return (
    <div className="p-6">
      <div className="card"><EmptyState icon="map" title="Page not found" body="This page does not exist, or your role does not have access to it."
        action={<Link to="/" className="text-sm font-medium text-navy-600 hover:underline">Go to start page</Link>} /></div>
    </div>
  );
}
