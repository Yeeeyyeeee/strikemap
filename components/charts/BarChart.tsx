"use client";

interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  items: BarItem[];
  maxItems?: number;
  defaultColor?: string;
}

export default function BarChart({
  items,
  maxItems = 20,
  defaultColor = "#ef4444",
}: BarChartProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = sorted[0]?.value || 1;

  return (
    <div className="space-y-1.5">
      {sorted.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 w-28 truncate text-right shrink-0">
            {item.label}
          </span>
          <div className="flex-1 h-5 bg-[#1a1a1a] rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-300"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color || defaultColor,
                opacity: 0.8,
              }}
            />
          </div>
          <span className="text-xs text-neutral-500 w-8 text-right font-mono">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
