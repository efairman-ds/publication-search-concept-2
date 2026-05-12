export interface BarSegment {
  color: string;
  value: number;
}

export interface ChartData {
  chartType: 'stacked' | 'single';
  workspaceTotal: number;
  workspaceSegments: BarSegment[];
  benchmarks: { label: string; value: number }[];
  maxValue: number;
  legendLabel: string;
}

// Baseline data keyed by tab ID (represents "Last year")
const BASE_DATA: Record<string, ChartData> = {
  'total-mentions': {
    chartType: 'stacked',
    workspaceTotal: 2900,
    workspaceSegments: [
      { color: '#2bb0e6', value: 1647 }, // Reach
      { color: '#e3488f', value: 481 },  // Engagement
      { color: '#5b4ae6', value: 479 },  // Impact
      { color: '#f1a644', value: 293 },  // Scientific Impact
    ],
    benchmarks: [
      { label: 'Benchmark 1', value: 3150 },
      { label: 'Benchmark 2', value: 2900 },
      { label: 'Benchmark 3', value: 2250 },
    ],
    maxValue: 4000,
    legendLabel: 'Total mentions (mean)',
  },

  altmetric: {
    chartType: 'single',
    workspaceTotal: 1480,
    workspaceSegments: [],
    benchmarks: [
      { label: 'Benchmark 1', value: 1120 },
      { label: 'Benchmark 2', value: 980 },
      { label: 'Benchmark 3', value: 720 },
    ],
    maxValue: 3000,
    legendLabel: 'Altmetric score (mean)',
  },

  citations: {
    chartType: 'single',
    workspaceTotal: 620,
    workspaceSegments: [],
    benchmarks: [
      { label: 'Benchmark 1', value: 980 },
      { label: 'Benchmark 2', value: 750 },
      { label: 'Benchmark 3', value: 500 },
    ],
    maxValue: 1500,
    legendLabel: 'Citations (mean)',
  },

  'clinical-guidelines': {
    chartType: 'single',
    workspaceTotal: 240,
    workspaceSegments: [],
    benchmarks: [
      { label: 'Benchmark 1', value: 340 },
      { label: 'Benchmark 2', value: 280 },
      { label: 'Benchmark 3', value: 180 },
    ],
    maxValue: 500,
    legendLabel: 'Clinical guideline citations (mean)',
  },
};

// Multipliers relative to the "last-year" baseline
const PERIOD_FACTOR: Record<string, number> = {
  'last-3-years':  1.38,
  'last-year':     1.00,
  'last-6-months': 0.62,
  'last-3-months': 0.38,
  'last-month':    0.20,
};

function scale(v: number, f: number) { return Math.round(v * f); }

export function getChartData(tabId: string, periodId: string): ChartData {
  const base = BASE_DATA[tabId] ?? BASE_DATA['total-mentions'];
  const f    = PERIOD_FACTOR[periodId] ?? 1;
  return {
    ...base,
    workspaceTotal:    scale(base.workspaceTotal, f),
    workspaceSegments: base.workspaceSegments.map((s) => ({ ...s, value: scale(s.value, f) })),
    benchmarks:        base.benchmarks.map((b)        => ({ ...b, value: scale(b.value, f) })),
  };
}

// Maximum possible workspace total for a given tab (used to normalise custom benchmark values)
export function getBaseTotal(tabId: string): number {
  return BASE_DATA[tabId]?.workspaceTotal ?? BASE_DATA['total-mentions'].workspaceTotal;
}
