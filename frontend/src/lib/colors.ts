/**
 * Map and chart colours. Categorical slots are assigned in a fixed order
 * (crop order comes from config/map.yaml), never cycled. Status colours are
 * reserved for health state and always paired with a label.
 */
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const OTHER_GRAY = "#9a9994";

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

// Health classes: reserved semantic colours, always shown with a text label.
export const HEALTH_COLORS: Record<string, string> = {
  healthy: "#1B8A2F",
  moderate: "#D69E2E",
  severe: "#C53030",
};

export const HEALTH_LABELS: Record<string, string> = {
  healthy: "Healthy",
  moderate: "Moderate",
  severe: "Stressed",
};

/** Sequential single-hue ramps (light -> dark). */
export const BLUE_RAMP = ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#184f95"];
export const ORANGE_RAMP = ["#fde3d6", "#f8b99a", "#f18c60", "#eb6834", "#c24e1f", "#8f3813"];
export const RED_RAMP = ["#fbdada", "#f3a8a8", "#ea7474", "#e34948", "#b52f2f", "#822020"];
/** matplotlib "YlGn" (what the tile server uses for NDVI): sequential, colour-vision-deficiency safe. */
export const NDVI_GRADIENT = ["#ffffe5", "#d9f0a3", "#78c679", "#238443", "#004529"];

export function cropColor(crop: string | null | undefined, cropOrder: string[]): string {
  if (!crop) return OTHER_GRAY;
  const i = cropOrder.indexOf(crop);
  return i >= 0 && i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER_GRAY;
}

/** Evenly spaced stops for a MapLibre `interpolate` expression over [min, max]. */
export function rampStops(ramp: string[], min: number, max: number): (number | string)[] {
  const out: (number | string)[] = [];
  ramp.forEach((c, i) => out.push(min + ((max - min) * i) / (ramp.length - 1), c));
  return out;
}
