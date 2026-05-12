import { InfoIcon } from './icons';

interface Metric {
  value: number | string;
  label: string;
}

const DEFAULT_ROWS: [Metric, Metric][] = [
  [
    { value: 2900, label: 'Total mentions (mean)' },
    { value: 1480, label: 'Altmetric score (mean)' },
  ],
  [
    { value: 620,  label: 'Citations (mean)' },
    { value: 240,  label: 'Clinical guideline citations (mean)' },
  ],
];

function MetricCell({ metric }: { metric: Metric }) {
  return (
    <div className="flex flex-1 items-center gap-4 min-w-0">
      <span className="w-20 shrink-0 text-[32px] font-medium tracking-tight text-[#24292e] font-['Public_Sans',sans-serif]">
        {metric.value}
      </span>
      <span className="text-sm font-medium leading-5 tracking-tight text-[#535876]">
        {metric.label}
      </span>
    </div>
  );
}

interface PerformanceSnapshotCardProps {
  rows?: [Metric, Metric][];
}

export function PerformanceSnapshotCard({ rows = DEFAULT_ROWS }: PerformanceSnapshotCardProps) {
  return (
    <div className="flex-1 min-w-0 bg-white rounded-lg p-6 flex flex-col gap-4">

      {/* Card header */}
      <div className="flex items-center gap-1">
        <span className="text-base font-semibold tracking-tight text-[#24292e]">
          Performance snapshot
        </span>
        <div className="relative group inline-flex shrink-0">
          <InfoIcon className="text-[#596066]" />
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
            A summary of your workspace's mean performance across all key metrics over the selected time period.
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      </div>

      {/* Metrics grid — 2 rows × 2 cols */}
      <div className="flex flex-col gap-6">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-6">
            <MetricCell metric={row[0]} />
            <MetricCell metric={row[1]} />
          </div>
        ))}
      </div>

    </div>
  );
}
