"use client";

interface DataPoint {
  label: string;
  value: number;
}

interface AreaChartProps {
  data: DataPoint[];
  color?: string;
  height?: number;
}

export default function AreaChart({ data, color = "#ef4444", height = 120 }: AreaChartProps) {
  if (data.length < 2) return null;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const w = 600;
  const h = height;
  const padY = 10;
  const usableH = h - padY * 2;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: padY + usableH - (d.value / maxVal) * usableH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  // Show ~5 labels evenly spaced
  const labelStep = Math.max(1, Math.floor(data.length / 5));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h + 20}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" opacity="0.8" />
        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text
              key={i}
              x={p.x}
              y={h + 16}
              textAnchor="middle"
              fill="#666"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {data[i].label.slice(5)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}
