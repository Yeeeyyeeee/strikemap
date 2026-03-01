"use client";

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: Segment[];
  size?: number;
  centerText?: string;
  centerSub?: string;
}

export default function DonutChart({
  segments,
  size = 180,
  centerText,
  centerSub,
}: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const strokeWidth = size * 0.12;
  const circumference = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dashLen = circumference * pct;
          const dashOffset = -offset;
          offset += dashLen;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLen} ${circumference - dashLen}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={0.85}
            />
          );
        })}
        {centerText && (
          <>
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              fill="#e5e5e5"
              fontSize={size * 0.14}
              fontWeight="bold"
              fontFamily="JetBrains Mono, monospace"
            >
              {centerText}
            </text>
            {centerSub && (
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fill="#999"
                fontSize={size * 0.07}
                fontFamily="Inter, sans-serif"
              >
                {centerSub}
              </text>
            )}
          </>
        )}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ background: seg.color }}
            />
            {seg.label} ({seg.value})
          </div>
        ))}
      </div>
    </div>
  );
}
