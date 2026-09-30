/** Tiny trend line (single series, no axes). Null values are gaps. */
export function Sparkline({ values, color = "#2E7D32", label, width = 96, height = 28 }: {
  values: (number | null)[]; color?: string; label: string; width?: number; height?: number;
}) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const x = (i: number) => (i * (width - 4)) / (values.length - 1) + 2;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    const prev = i > 0 ? values[i - 1] : null;
    d += `${prev == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const lastIndex = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop()!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastIndex)} cy={y(values[lastIndex]!)} r={2.5} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
