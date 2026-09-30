import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardState, satelliteState } from "./emptyStates.ts";

const pt = (ndvi: number | null, clear: number) => ({ ndvi_mean: ndvi, clear_fraction: clear });

test("satellite: loading, never fetched, running", () => {
  assert.equal(satelliteState(null), "loading");
  assert.equal(satelliteState({ series: [], min_clear_fraction: 0.6, job: null }), "never");
  assert.equal(satelliteState({ series: [], min_clear_fraction: 0.6, job: { status: "running" } }), "running");
});

test("satellite: failed without data vs finished with no scenes", () => {
  assert.equal(satelliteState({ series: [], min_clear_fraction: 0.6, job: { status: "failed" } }), "failed-no-data");
  assert.equal(satelliteState({ series: [], min_clear_fraction: 0.6, job: { status: "done" } }), "no-scenes");
});

test("satellite: scenes but none clear enough", () => {
  assert.equal(satelliteState({ series: [pt(null, 0), pt(0.7, 0.4)], min_clear_fraction: 0.6, job: { status: "done" } }), "all-cloudy");
  assert.equal(satelliteState({ series: [pt(null, 0), pt(0.7, 0.9)], min_clear_fraction: 0.6 }), "ok");
});

test("dashboard states", () => {
  const cards = (plots: number, health: number) => ({ plots_mapped: plots, health_assessed_plots: health });
  assert.equal(dashboardState(undefined), "loading");
  assert.equal(dashboardState({ empty: true, level: "state", cards: cards(0, 0) }), "first-run");
  // an empty district is not a first run: it shows zeros and the district table
  assert.equal(dashboardState({ empty: true, level: "district", cards: cards(0, 0) }), "no-plots");
  assert.equal(dashboardState({ empty: false, level: "state", cards: cards(4, 0) }), "no-health");
  assert.equal(dashboardState({ empty: false, level: "state", cards: cards(4, 4) }), "ok");
});
