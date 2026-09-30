import { Link, useNavigate } from "react-router-dom";
import type { Page, Survey } from "../app/types";
import { useApi } from "../app/useApi";
import { DemoBadge } from "../components/DemoBadge";
import { fmtDate, fmtHa, titleCase } from "../lib/format";

export function Surveys() {
  const navigate = useNavigate();
  const { data, error } = useApi<Page<Survey>>("/api/surveys?page_size=200");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Every survey is dated and kept. Older surveys are never overwritten.</p>
        <Link to="/surveys/new" className="btn-primary">New survey</Link>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-th">Survey</th>
              <th className="table-th">Date</th>
              <th className="table-th">Type</th>
              <th className="table-th">Village</th>
              <th className="table-th text-right">Area</th>
              <th className="table-th text-right">Plots</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/surveys/${s.id}`)}>
                <td className="table-td font-medium text-navy">
                  {s.name} {s.is_demo && <DemoBadge label="Demo" className="ml-1" />}
                </td>
                <td className="table-td whitespace-nowrap">{fmtDate(s.survey_date)}</td>
                <td className="table-td">{titleCase(s.type)}</td>
                <td className="table-td">{s.village_name ?? s.district_name ?? "–"}</td>
                <td className="table-td text-right tabular-nums">{fmtHa(s.aoi_area_ha, 2)}</td>
                <td className="table-td text-right tabular-nums">{s.plot_count}</td>
                <td className="table-td capitalize">{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && <p className="p-4 text-sm text-slate-500">No surveys yet.</p>}
      </div>
    </div>
  );
}
