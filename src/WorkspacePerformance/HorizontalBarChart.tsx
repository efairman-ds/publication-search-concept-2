import { useEffect, useRef, useState } from 'react';
import type { ChartData } from './chartData';

function getXTicks(maxValue: number): number[] {
  const steps = [25, 50, 100, 150, 200, 250, 500, 1000];
  for (const step of steps) {
    const count = maxValue / step;
    if (count >= 5 && count <= 9 && maxValue % step === 0) {
      const ticks: number[] = [];
      for (let t = 0; t <= maxValue; t += step) ticks.push(t);
      return ticks;
    }
  }
  const step = Math.round(maxValue / 6);
  const ticks: number[] = [];
  for (let t = 0; t <= maxValue; t += step) ticks.push(t);
  return ticks;
}

const LEGEND_ITEMS = [
  { label: 'Reach',             color: '#2bb0e6' },
  { label: 'Engagement',        color: '#e3488f' },
  { label: 'Impact',            color: '#5b4ae6' },
  { label: 'Scientific Impact', color: '#f1a644' },
];

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const DUR  = '0.3s';
const BAR_T   = `width ${DUR} ${EASE}`;
const LABEL_T = `left ${DUR} ${EASE}`;

const SINGLE_BAR_GRADIENT = 'linear-gradient(90deg, #6b7eb5 0%, #27b8ae 100%)';

interface Props {
  data: ChartData;
  activeBenchmarks: Set<string>;
}

export function HorizontalBarChart({ data, activeBenchmarks }: Props) {
  const isSingle = data.chartType === 'single';

  const [segPcts, setSegPcts]     = useState<number[]>(() => isSingle ? [0] : data.workspaceSegments.map(() => 0));
  const [benchPcts, setBenchPcts] = useState<number[]>(() => data.benchmarks.map(() => 0));

  // Always-current ref so RAF callbacks read the latest activeBenchmarks
  const activeBenchmarksRef = useRef(activeBenchmarks);
  useEffect(() => { activeBenchmarksRef.current = activeBenchmarks; });

  // Tab change → full reset then draw-in
  useEffect(() => {
    const single = data.chartType === 'single';
    setSegPcts(single ? [0] : data.workspaceSegments.map(() => 0));
    setBenchPcts(data.benchmarks.map(() => 0));

    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setSegPcts(
          single
            ? [(data.workspaceTotal / data.maxValue) * 100]
            : data.workspaceSegments.map((s) => (s.value / data.maxValue) * 100)
        );
        setBenchPcts(data.benchmarks.map((b) =>
          activeBenchmarksRef.current.has(b.label) ? (b.value / data.maxValue) * 100 : 0
        ));
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Benchmark toggle → smooth update only (skip initial mount)
  const isFirstToggle = useRef(true);
  useEffect(() => {
    if (isFirstToggle.current) { isFirstToggle.current = false; return; }
    setBenchPcts(data.benchmarks.map((b) =>
      activeBenchmarks.has(b.label) ? (b.value / data.maxValue) * 100 : 0
    ));
  }, [activeBenchmarks]); // eslint-disable-line react-hooks/exhaustive-deps

  const xTicks = getXTicks(data.maxValue);
  const workspaceLabelPct = isSingle
    ? (segPcts[0] ?? 0)
    : segPcts.reduce((a, b) => a + b, 0);

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[520px]">

        {/* ── Chart body: labels | bars ── */}
        <div className="flex">

          {/* Y-axis label column */}
          <div className="w-36 shrink-0 flex flex-col pr-3 pt-3 pb-3">
            <div className="h-11 flex items-center">
              {isSingle ? (
                <span className="text-sm font-semibold leading-tight text-[#24292e]">
                  Your performance<br />(mean)
                </span>
              ) : (
                <span className="text-sm font-semibold leading-tight text-[#24292e]">
                  Workspace library performance
                </span>
              )}
            </div>
            <div className="h-4" />
            <div className="flex flex-col gap-3">
              {data.benchmarks.map((b) => (
                <div
                  key={b.label}
                  className={`h-7 flex items-center transition-opacity duration-300 ${
                    activeBenchmarks.has(b.label) ? 'opacity-100' : 'opacity-35'
                  }`}
                >
                  <span className="text-[13px] font-medium text-[#24292e]">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bars + grid column — overflow visible so labels spill into right gutter */}
          <div className="flex-1 relative min-w-0" style={{ overflow: 'visible' }}>
            {/* Grid lines span the full column height */}
            {xTicks.slice(1).map((tick) => (
              <div
                key={tick}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: `${(tick / data.maxValue) * 100}%`, borderLeft: '1px dashed #ced2d6', zIndex: 0 }}
              />
            ))}
            <div className="absolute left-0 top-0 bottom-0 w-px bg-[#ced2d6]" style={{ zIndex: 1 }} />

            {/* Padded content */}
            <div className="pt-3 pb-3">

              {/* Workspace bar */}
              <div className="h-11 relative" style={{ zIndex: 2 }}>
                <div className="flex h-full w-full">
                  {isSingle ? (
                    <div
                      className="h-full rounded-r-[4px]"
                      style={{
                        width: `${segPcts[0] ?? 0}%`,
                        background: SINGLE_BAR_GRADIENT,
                        transition: BAR_T,
                      }}
                    />
                  ) : (
                    data.workspaceSegments.map((seg, i) => (
                      <div
                        key={i}
                        className={i === data.workspaceSegments.length - 1 ? 'rounded-r-[4px]' : ''}
                        style={{ width: `${segPcts[i] ?? 0}%`, backgroundColor: seg.color, transition: BAR_T }}
                      />
                    ))
                  )}
                </div>
                <span
                  className="absolute top-1/2 whitespace-nowrap pointer-events-none text-2xl font-medium tracking-tight text-[#24292e] font-['Public_Sans',sans-serif]"
                  style={{ left: `${workspaceLabelPct}%`, transform: 'translateY(-50%) translateX(6px)', zIndex: 3, transition: LABEL_T }}
                >
                  {data.workspaceTotal.toLocaleString()}
                </span>
              </div>

              <div className="h-4" />

              {/* Benchmark bars */}
              <div className="flex flex-col gap-3">
                {data.benchmarks.map((b, i) => (
                  <div key={b.label} className="h-7 relative" style={{ zIndex: 2 }}>
                    <div
                      className="h-full bg-[#bec2d6] rounded-r-[4px]"
                      style={{ width: `${benchPcts[i] ?? 0}%`, transition: BAR_T }}
                    />
                    <span
                      className="absolute top-1/2 whitespace-nowrap pointer-events-none text-lg font-normal tracking-tight text-[#454c52] font-['Public_Sans',sans-serif]"
                      style={{
                        left: `${benchPcts[i] ?? 0}%`,
                        transform: 'translateY(-50%) translateX(6px)',
                        zIndex: 3,
                        transition: `${LABEL_T}, opacity 0.25s ease`,
                        opacity: activeBenchmarks.has(b.label) ? 1 : 0,
                      }}
                    >
                      {b.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

            </div>
          </div>
          {/* Right gutter — labels spill into this space */}
          <div className="w-20 shrink-0" />
        </div>

        {/* ── X-axis rule ── */}
        <div className="flex">
          <div className="w-36 shrink-0" />
          <div className="flex-1 h-px bg-[#ced2d6]" />
          <div className="w-20 shrink-0" />
        </div>

        {/* ── X-axis tick labels ── */}
        <div className="flex mt-1">
          <div className="w-36 shrink-0" />
          <div className="flex-1 relative h-5">
            {xTicks.map((tick) => (
              <div
                key={tick}
                className="absolute text-[13px] text-[#676e76] -translate-x-1/2"
                style={{ left: `${(tick / data.maxValue) * 100}%` }}
              >
                {tick.toLocaleString()}
              </div>
            ))}
          </div>
          <div className="w-20 shrink-0" />
        </div>

        {/* ── Legend ── min-height reserves space for the dot row so chart height is stable across tabs */}
        <div className="mt-6 flex flex-col items-center gap-3" style={{ minHeight: '68px' }}>
          <p className="text-[13.5px] font-medium text-[#454c52]">{data.legendLabel}</p>
          {!isSingle && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-sm font-medium tracking-tight text-[#24292e]">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
