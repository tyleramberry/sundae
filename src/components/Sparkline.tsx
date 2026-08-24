// Lightweight SVG sparkline for the dashboard's weekly-score hero (spec
// #2). No chart library on purpose -- one polyline + a dot per point is
// the whole visualization, and hand-rolled SVG keeps the bundle honest.
//
// Inputs: an ordered series of 0-100 values, oldest first, up to 6
// points. Fewer than 2 data points renders a flat baseline with a single
// dot at the current value, per PRD ("If fewer than 2 data points exist
// (new user), render a flat line with a single dot at the current
// score.").
//
// Color: `text-accent` -- the calm-palette sage from spec #3. The
// polyline uses `stroke="currentColor"` so this component follows
// whatever text color the caller sets, which lets a future theme change
// pick up automatically.

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  ariaLabel?: string;
};

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 60;
const DEFAULT_STROKE = 2;

export default function Sparkline({
  values,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  strokeWidth = DEFAULT_STROKE,
  ariaLabel = "Weekly score trend",
}: SparklineProps) {
  const padY = Math.max(3, strokeWidth * 2); // leave room for dots
  const usableH = Math.max(1, height - padY * 2);

  // Fixed 0-100 domain so a low-scoring stretch doesn't visually stretch
  // to full-height and look identical to a top-scoring one.
  const yFor = (v: number) => padY + (1 - Math.max(0, Math.min(100, v)) / 100) * usableH;

  if (values.length === 0) {
    return (
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="text-emerald-600"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  if (values.length === 1) {
    const only = values[0];
    return (
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="text-emerald-600"
      >
        <line
          x1={0}
          y1={yFor(only)}
          x2={width}
          y2={yFor(only)}
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={strokeWidth}
        />
        <circle cx={width - padY} cy={yFor(only)} r={strokeWidth + 1.5} fill="currentColor" />
      </svg>
    );
  }

  const stepX = (width - padY * 2) / (values.length - 1);
  const points = values.map((v, i) => ({ x: padY + i * stepX, y: yFor(v) }));
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="text-emerald-600"
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? strokeWidth + 1.5 : strokeWidth}
          fill="currentColor"
          fillOpacity={i === points.length - 1 ? 1 : 0.65}
        />
      ))}
    </svg>
  );
}
