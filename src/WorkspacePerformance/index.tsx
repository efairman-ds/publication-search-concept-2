import { useEffect, useMemo, useRef, useState } from 'react';
import { InfoIcon, CaretDownIcon } from './icons';
import { HorizontalBarChart } from './HorizontalBarChart';
import { BenchmarksCard, DEFAULT_BENCHMARKS } from './BenchmarksCard';
import type { Benchmark } from './BenchmarksCard';
import { PerformanceSnapshotCard } from './PerformanceSnapshotCard';
import { AddBenchmarkModal } from './AddBenchmarkModal';
import { getChartData } from './chartData';

const METRIC_TABS = [
  { id: 'total-mentions',      label: 'Total mentions' },
  { id: 'altmetric',           label: 'Altmetric' },
  { id: 'citations',           label: 'Citations' },
  { id: 'clinical-guidelines', label: 'Clinical guidelines citations' },
] as const;

const TIME_PERIODS = [
  { id: 'last-3-years',  label: 'Last 3 years' },
  { id: 'last-year',     label: 'Last year' },
  { id: 'last-6-months', label: 'Last 6 months' },
  { id: 'last-3-months', label: 'Last 3 months' },
  { id: 'last-month',    label: 'Last month' },
] as const;

type MetricTabId  = (typeof METRIC_TABS)[number]['id'];
type TimePeriodId = (typeof TIME_PERIODS)[number]['id'];

// Base max for total-mentions — used to normalise custom benchmark chart values
const BASE_MAX = 4000;

export function WorkspacePerformance() {
  const [activeTab,        setActiveTab]        = useState<MetricTabId>('total-mentions');
  const [timePeriod,       setTimePeriod]        = useState<TimePeriodId>('last-year');
  const [periodOpen,       setPeriodOpen]        = useState(false);
  const [benchmarks,       setBenchmarks]        = useState<Benchmark[]>(DEFAULT_BENCHMARKS);
  const [activeBenchmarks, setActiveBenchmarks]  = useState<Set<string>>(
    () => new Set(DEFAULT_BENCHMARKS.map((b) => b.name))
  );
  const [showModal,       setShowModal]       = useState(false);
  const [isRefreshing,    setIsRefreshing]    = useState(false);
  // Small per-refresh variance applied to all bar values so the chart visibly redraws
  const [refreshFactor,   setRefreshFactor]   = useState(1.0);
  // Info panel shown in the benchmarks card after a benchmark is added
  const [benchmarkPanel,  setBenchmarkPanel]  = useState<'processing' | 'ready' | null>(null);
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const periodRef = useRef<HTMLDivElement>(null);

  // Close time-period dropdown on outside click
  useEffect(() => {
    if (!periodOpen) return;
    const handler = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [periodOpen]);

  const toggleBenchmark = (name: string) =>
    setActiveBenchmarks((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const removeBenchmark = (id: string) => {
    const target = benchmarks.find((b) => b.id === id);
    if (!target) return;
    setBenchmarks((prev) => prev.filter((b) => b.id !== id));
    setActiveBenchmarks((prev) => { const next = new Set(prev); next.delete(target.name); return next; });
  };

  const handleAddBenchmark = (name: string, selectedOrgs: string[]) => {
    const tags = selectedOrgs.length <= 3
      ? selectedOrgs.join(', ')
      : `${selectedOrgs.slice(0, 3).join(', ')} (+${selectedOrgs.length - 3} more)`;

    const newBenchmark: Benchmark = {
      id: `custom-${Date.now()}`,
      name,
      value: Math.round(BASE_MAX * (0.45 + Math.random() * 0.35)),
      tags,
      tooltip: `Benchmark comparing ${selectedOrgs.length} organisation${selectedOrgs.length !== 1 ? 's' : ''}: ${selectedOrgs.slice(0, 2).join(', ')}${selectedOrgs.length > 2 ? '…' : ''}`,
      custom: true,
      state: 'processing', // starts in processing state until refreshed
    };

    setBenchmarks((prev) => [...prev, newBenchmark]);
    setActiveBenchmarks((prev) => new Set([...prev, name]));
    setShowModal(false);

    // Show processing panel, then auto-advance to ready after 5 s
    setBenchmarkPanel('processing');
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    panelTimerRef.current = setTimeout(() => setBenchmarkPanel('ready'), 5000);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setBenchmarkPanel(null);
    if (panelTimerRef.current) clearTimeout(panelTimerRef.current);
    // Advance all processing benchmarks → new
    setBenchmarks((prev) =>
      prev.map((b) => b.state === 'processing' ? { ...b, state: 'new' } : b)
    );
    // Apply a new random variance so the chart redraws with a visible change (±8%)
    setRefreshFactor(0.92 + Math.random() * 0.16);
    setTimeout(() => setIsRefreshing(false), 1400);
  };

  const currentPeriodLabel = TIME_PERIODS.find((p) => p.id === timePeriod)?.label ?? 'Last year';

  // Build chart data: start from period-scaled base, then merge in custom benchmarks
  const chartData = useMemo(() => {
    const base = getChartData(activeTab, timePeriod);
    const scale = base.maxValue / BASE_MAX;
    const rf    = refreshFactor;
    const vary  = (v: number) => Math.round(v * rf);

    // Default benchmarks that still exist (not removed), values varied by refreshFactor
    const activeDefaultNames = new Set(benchmarks.filter((b) => !b.custom).map((b) => b.name));
    const defaultChartBmarks = base.benchmarks
      .filter((b) => activeDefaultNames.has(b.label))
      .map((b) => ({ ...b, value: vary(b.value) }));

    // Custom benchmarks scaled to current tab's range and varied
    const customChartBmarks = benchmarks
      .filter((b) => b.custom)
      .map((b) => ({ label: b.name, value: vary(Math.round(b.value * scale)) }));

    return {
      ...base,
      workspaceTotal:    vary(base.workspaceTotal),
      workspaceSegments: base.workspaceSegments.map((s) => ({ ...s, value: vary(s.value) })),
      benchmarks: [...defaultChartBmarks, ...customChartBmarks],
    };
  }, [activeTab, timePeriod, benchmarks, refreshFactor]);

  return (
    <>
      {showModal && (
        <AddBenchmarkModal onClose={() => setShowModal(false)} onConfirm={handleAddBenchmark} />
      )}

      <div className="flex flex-col gap-6 w-full">

        {/* ── Header + tabs + chart ── */}
        <div className="flex flex-col gap-4">

          {/* Header row */}
          <div className="flex items-center gap-2 w-full flex-wrap">
            <div className="flex flex-1 items-center gap-2 min-w-0">
              <h2
                className="text-xl font-semibold tracking-tight whitespace-nowrap"
                style={{ color: '#0d1117' }}
              >
                Workspace performance
              </h2>
              <div className="relative group inline-flex shrink-0">
                <InfoIcon className="text-[#596066]" />
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  Shows how your workspace's research output compares to benchmarks across key metrics over the selected time period.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            </div>

            {/* Refresh CTA */}
            <div className="flex items-center gap-2 text-sm text-[#596066]">
              <span className="hidden sm:inline">
                {isRefreshing ? 'Updating…' : 'Last updated 2 hours ago'}
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1 font-semibold text-[#4a56a8] hover:text-[#3d4991] disabled:opacity-50 transition-colors"
              >
                <svg
                  width="15" height="15" viewBox="0 0 15 15" fill="none"
                  className={isRefreshing ? 'animate-spin' : ''}
                >
                  <path
                    d="M13 7.5A5.5 5.5 0 1 1 7.5 2c1.8 0 3.4.87 4.4 2.2"
                    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
                  />
                  <path d="M11 2l1 2.5-2.5 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {isRefreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>

            {/* Time-period dropdown */}
            <div className="relative ml-3" ref={periodRef}>
              <button
                onClick={() => setPeriodOpen((o) => !o)}
                className="flex items-center gap-1 text-base font-medium tracking-tight text-[#596066] hover:text-[#24292e] transition-colors"
                aria-haspopup="listbox"
                aria-expanded={periodOpen}
              >
                <span>{currentPeriodLabel}</span>
                <CaretDownIcon
                  className={`transition-transform duration-200 ${periodOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {periodOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-44 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50"
                  role="listbox"
                >
                  {TIME_PERIODS.map((period) => (
                    <button
                      key={period.id}
                      role="option"
                      aria-selected={timePeriod === period.id}
                      onClick={() => { setTimePeriod(period.id); setPeriodOpen(false); }}
                      className={[
                        'w-full px-4 py-2 text-sm text-left transition-colors',
                        timePeriod === period.id
                          ? 'bg-[#e4e6f0] text-[#4a56a8] font-semibold'
                          : 'text-[#24292e] hover:bg-gray-50 font-medium',
                      ].join(' ')}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Metric tab pills */}
          <div className="flex flex-wrap gap-3">
            {METRIC_TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'px-2.5 py-1 rounded-lg transition-colors text-sm font-semibold',
                    isActive
                      ? 'bg-[#979ab1] text-white'
                      : 'bg-[#e4e6f0] text-[rgba(0,0,0,0.87)] hover:bg-[#d0d3e5]',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Bar chart */}
          <HorizontalBarChart data={chartData} activeBenchmarks={activeBenchmarks} />
        </div>

        {/* ── Bottom cards ── */}
        <div className="flex flex-col sm:flex-row gap-4">
          <BenchmarksCard
            benchmarks={benchmarks}
            activeBenchmarks={activeBenchmarks}
            onToggle={toggleBenchmark}
            onRemove={removeBenchmark}
            onAddBenchmark={() => setShowModal(true)}
            onRefresh={handleRefresh}
            panelState={benchmarkPanel}
          />
          <PerformanceSnapshotCard />
        </div>

      </div>
    </>
  );
}

export default WorkspacePerformance;
