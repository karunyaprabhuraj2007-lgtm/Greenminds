/**
 * Empty-state decisions, kept pure so they are unit-tested. The UI never
 * invents numbers: when data is missing it shows one of these states.
 */

export type SatelliteState = "loading" | "never" | "running" | "failed-no-data" | "no-scenes" | "all-cloudy" | "ok";

interface JobLike { status: "queued" | "running" | "done" | "failed" }
interface SeriesLike { series: { ndvi_mean: number | null; clear_fraction: number }[]; min_clear_fraction: number; job?: JobLike | null }

export function satelliteState(d: SeriesLike | null | undefined): SatelliteState {
  if (!d) return "loading";
  if (d.series.length) {
    const clear = d.series.some((p) => p.ndvi_mean != null && p.clear_fraction >= d.min_clear_fraction);
    return clear ? "ok" : "all-cloudy";
  }
  if (!d.job) return "never";
  if (d.job.status === "queued" || d.job.status === "running") return "running";
  if (d.job.status === "failed") return "failed-no-data";
  return "no-scenes";
}

interface SummaryLike { empty: boolean; level: string; cards: { plots_mapped: number; health_assessed_plots: number } }

export type DashboardState = "loading" | "first-run" | "no-plots" | "no-health" | "ok";

export function dashboardState(s: SummaryLike | null | undefined): DashboardState {
  if (!s) return "loading";
  if (s.empty && s.level === "state") return "first-run";
  if (!s.cards.plots_mapped) return "no-plots";
  if (!s.cards.health_assessed_plots) return "no-health";
  return "ok";
}
