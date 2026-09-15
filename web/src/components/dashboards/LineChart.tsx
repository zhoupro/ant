import { useMemo } from "react";

import { cn } from "@/lib/utils";

export interface LineChartSeries {
  key: string;
  label: string;
  values: number[];
  color: string;
}

export interface LineChartProps {
  labels: string[];
  series: LineChartSeries[];
  hidden?: Set<string>;
  onToggle?: (key: string) => void;
  height?: number;
  className?: string;
}

// 5 套常用颜色;沿用 Tailwind 调色板,与暗色模式兼容。
const PALETTE = [
  "#0ea5e9",
  "#f97316",
  "#10b981",
  "#a855f7",
  "#f43f5e",
];

export function LineChart({
  labels,
  series,
  hidden,
  onToggle,
  height = 220,
  className,
}: LineChartProps) {
  const padding = { top: 16, right: 16, bottom: 28, left: 40 };
  const width = 560;

  const data = useMemo(() => {
    return series.map((s, i) => ({
      ...s,
      color: s.color || PALETTE[i % PALETTE.length],
    }));
  }, [series]);

  const visibleSeries = data.filter((s) => !hidden?.has(s.key));
  const allValues = visibleSeries.flatMap((s) => s.values);
  const minY = allValues.length ? Math.min(...allValues) : 0;
  const maxY = allValues.length ? Math.max(...allValues) : 1;
  // 给 y 轴留 5% 上下边距,避免线条贴边。
  const span = maxY - minY || 1;
  const yLo = minY - span * 0.05;
  const yHi = maxY + span * 0.05;

  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const stepX = labels.length > 1 ? innerW / (labels.length - 1) : 0;

  const xOf = (i: number) => padding.left + i * stepX;
  const yOf = (v: number) =>
    padding.top + innerH - ((v - yLo) / (yHi - yLo)) * innerH;

  const gridYValues = computeTicks(yLo, yHi, 4);
  const xTickIndexes = pickLabelTicks(labels.length, innerW);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <svg
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {gridYValues.map((yv) => (
          <g key={yv}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yOf(yv)}
              y2={yOf(yv)}
              stroke="currentColor"
              className="text-border"
              strokeDasharray="2 4"
            />
            <text
              x={padding.left - 6}
              y={yOf(yv)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {formatTick(yv)}
            </text>
          </g>
        ))}
        {labels.map((label, i) =>
          xTickIndexes.includes(i) ? (
            <text
              key={i}
              x={xOf(i)}
              y={height - padding.bottom + 14}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {label}
            </text>
          ) : null,
        )}
        {visibleSeries.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            points={s.values
              .map((v, i) => `${xOf(i)},${yOf(v)}`)
              .join(" ")}
          />
        ))}
        {visibleSeries.map((s) =>
          s.values.map((v, i) => (
            <circle
              key={`${s.key}-${i}`}
              cx={xOf(i)}
              cy={yOf(v)}
              r={2.5}
              fill={s.color}
            />
          )),
        )}
      </svg>
      <div className="flex flex-wrap gap-2 text-[11px]">
        {data.map((s) => {
          const off = hidden?.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onToggle?.(s.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-opacity",
                off ? "opacity-40" : "opacity-100",
                onToggle ? "hover:bg-muted" : "cursor-default",
              )}
              aria-pressed={!off}
              disabled={!onToggle}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0];
  const span = max - min;
  if (span === 0) return [min];
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  let step = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (c >= raw) {
      step = c;
      break;
    }
  }
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) {
    if (v >= min - step / 2 && v <= max + step / 2) {
      out.push(Number(v.toFixed(6)));
    }
  }
  return out;
}

function pickLabelTicks(total: number, width: number): number[] {
  if (total === 0) return [];
  // 大致按像素宽度算:每 ~80px 显示一个标签。
  const maxTicks = Math.max(2, Math.floor(width / 80));
  if (total <= maxTicks) return Array.from({ length: total }, (_, i) => i);
  const step = Math.ceil(total / maxTicks);
  const out: number[] = [];
  for (let i = 0; i < total; i += step) out.push(i);
  if (out[out.length - 1] !== total - 1) out.push(total - 1);
  return out;
}

function formatTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}