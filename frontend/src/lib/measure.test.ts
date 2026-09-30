// Known-answer tests. Run: npm test  (node --test, no extra dependency)
import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceM, formatArea, formatDistance, pathLengthM, polygonAreaM2, type LngLat } from "./measure.ts";

const close = (actual: number, expected: number, relTol: number) =>
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relTol, `${actual} not within ${relTol} of ${expected}`);

test("one degree of latitude is ~111.2 km", () => {
  close(distanceM([74.5, 18], [74.5, 19]), 111_195, 0.001);
});

test("one degree of longitude at 60N is half of that at the equator", () => {
  close(distanceM([0, 60], [1, 60]), distanceM([0, 0], [1, 0]) / 2, 0.001);
});

test("Pune to Mumbai great-circle distance is ~120 km", () => {
  // Pune (18.5204, 73.8567) - Mumbai (19.0760, 72.8777): ~119.8 km
  close(distanceM([73.8567, 18.5204], [72.8777, 19.076]), 119_800, 0.01);
});

test("path length sums segments", () => {
  const pts: LngLat[] = [[74.5, 18], [74.5, 18.001], [74.5, 18.002]];
  close(pathLengthM(pts), distanceM(pts[0], pts[2]), 1e-6);
});

test("1 km x 1 km square at 18N is ~100 ha", () => {
  const dLat = 1000 / 111_195;
  const dLon = dLat / Math.cos((18 * Math.PI) / 180);
  const ring: LngLat[] = [[74.5, 18], [74.5 + dLon, 18], [74.5 + dLon, 18 + dLat], [74.5, 18 + dLat]];
  close(polygonAreaM2(ring), 1_000_000, 0.005);
  // closed ring and reversed orientation give the same area
  close(polygonAreaM2([...ring, ring[0]]), 1_000_000, 0.005);
  close(polygonAreaM2([...ring].reverse()), 1_000_000, 0.005);
});

test("degenerate polygons have zero area", () => {
  assert.equal(polygonAreaM2([[0, 0], [1, 1]]), 0);
});

test("formatting", () => {
  assert.equal(formatDistance(12.345), "12.3 m");
  assert.equal(formatDistance(2500), "2.50 km");
  assert.equal(formatArea(950), "950 m²");
  assert.equal(formatArea(25_000), "2.50 ha");
});
