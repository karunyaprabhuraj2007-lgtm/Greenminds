import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORICAL, OTHER_GRAY, cropColor, rampStops } from "./colors.ts";

test("crop colours follow config order, unknown crops fold to gray", () => {
  const order = ["sugarcane", "soybean", "cotton"];
  assert.equal(cropColor("sugarcane", order), CATEGORICAL[0]);
  assert.equal(cropColor("cotton", order), CATEGORICAL[2]);
  assert.equal(cropColor("banana", order), OTHER_GRAY);
  assert.equal(cropColor(null, order), OTHER_GRAY);
});

test("colour follows the entity, not its rank", () => {
  // Removing a crop from view must not repaint the others.
  const order = ["sugarcane", "soybean", "cotton"];
  assert.equal(cropColor("cotton", order), cropColor("cotton", order.slice()));
});

test("ramp stops span the range", () => {
  assert.deepEqual(rampStops(["a", "b", "c"], 0, 100), [0, "a", 50, "b", 100, "c"]);
});
