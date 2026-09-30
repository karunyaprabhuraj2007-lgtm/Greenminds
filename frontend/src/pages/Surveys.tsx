import { useNavigate } from "react-router-dom";
import { usePage } from "../app/page";
import type { Page, Survey } from "../app/types";
import { useApi } from "../app/useApi";
import { Button } from "../components/ui/Button";
import { StatusChip } from "../components/ui/Chip";
import { DataTable, type Column } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { fmtDate, fmtHa, titleCase } from "../lib/format";

export default function Surveys() {
  usePage("Surveys");
  const navigate = useNavigate();
  const { data, error } = useApi<Page<Survey>>("/api/surveys?page_size=500");

  const columns: Column<Survey>[] = [
    { key: "name", header: "Survey", value: (s) => s.name, render: (s) => <span className="font-medium text-navy">{s.name}</span> },
    { key: "date", header: "Survey date", value: (s) => s.survey_date ?? "", render: (s) => <span className="num">{fmtDate(s.survey_date)}</span> },
    { key: "type", header: "Type", value: (s) => s.type, render: (s) => titleCase(s.type) },
    { key: "district", header: "District", value: (s) => s.district_name ?? "", render: (s) => s.district_name ?? "–" },
    { key: "taluka", header: "Taluka", value: (s) => s.taluka_name ?? "", render: (s) => s.taluka_name ?? "–" },
    { key: "area", header: "Area", align: "right", value: (s) => s.aoi_area_ha, render: (s) => fmtHa(s.aoi_area_ha, 2) },
    { key: "plots", header: "Plots", align: "right", value: (s) => s.plot_count, render: (s) => s.plot_count.toLocaleString("en-IN") },
    { key: "s2", header: "Last clear S2", value: (s) => s.last_clear_satellite_date ?? "", render: (s) => <span className="num text-slate-600">{fmtDate(s.last_clear_satellite_date)}</span> },
    { key: "status", header: "Status", value: (s) => s.status, render: (s) => <StatusChip status={s.status} /> },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Surveys</h1>
          <p className="mt-1 text-sm text-slate-500">Every survey is dated and kept; repeat surveys of an area never overwrite older ones.</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => navigate("/surveys/new")}>New survey</Button>
      </div>
      {error && <EmptyState icon="alert" title="Could not load surveys" body={error} />}
      {!data && !error && <SkeletonCard lines={8} />}
      {data && (
        <DataTable rows={data.items} columns={columns} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/surveys/${s.id}`)}
          filterPlaceholder="Filter by name, district, taluka, status…" initialSort={{ key: "date", dir: "desc" }}
          empty={<EmptyState icon="surveys" title="No surveys yet" body="Create a survey by drawing or importing the area of interest."
            action={<Button variant="primary" icon="plus" onClick={() => navigate("/surveys/new")}>Plan your first survey</Button>} />} />
      )}
    </div>
  );
}
