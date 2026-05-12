import { useEffect, useRef, useState } from 'react';
import { InfoIcon, PlusIcon, CheckCircleIcon, BenchmarkIcon, DotsThreeIcon, EditIcon, TrashIcon } from './icons';

export interface Benchmark {
  id: string;
  name: string;
  value: number;
  tags: string;
  tooltip: string;
  custom?: boolean;
  state?: 'processing' | 'new'; // undefined = normal
}

export const DEFAULT_BENCHMARKS: Benchmark[] = [
  {
    id: '1',
    name: 'Benchmark 1',
    value: 3150,
    tags: 'Astrazeneca, Keytruda, Roche (+3 more)',
    tooltip: 'Tracks total mentions across 6 oncology-focused organisations over the selected period',
  },
  {
    id: '2',
    name: 'Benchmark 2',
    value: 2900,
    tags: 'Multiple Sclerosis, Novartis',
    tooltip: 'Compares output from 2 organisations matched by therapeutic area and research focus',
  },
  {
    id: '3',
    name: 'Benchmark 3',
    value: 2250,
    tags: 'Chronic Obstructive Pulmonary Disease, Pfizer (+3 more)',
    tooltip: 'Measures research impact across 5 respiratory disease organisations',
  },
];

/* ── Spinner icon shown while a benchmark is processing ── */
function ProcessingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="#e4e6f0" strokeWidth="1.5" />
      <path d="M22 12A10 10 0 0 0 12 2" stroke="#979ab1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface BenchmarkItemProps {
  benchmark: Benchmark;
  isActive: boolean;
  onToggle: (name: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

function BenchmarkItem({ benchmark, isActive, onToggle, onEdit, onRemove }: BenchmarkItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isProcessing = benchmark.state === 'processing';
  const isNew        = benchmark.state === 'new';

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const rowOpacity = isProcessing ? 'opacity-60' : isActive ? 'opacity-100' : 'opacity-50';

  return (
    <div className={`flex flex-col gap-0.5 transition-opacity duration-300 ${rowOpacity}`}>

      {/* Main row */}
      <div className="flex items-center gap-1 w-full">

        {/* Toggle / spinner */}
        {isProcessing ? (
          <div className="shrink-0 w-6 h-6 flex items-center justify-center">
            <ProcessingIcon />
          </div>
        ) : (
          <button
            onClick={() => onToggle(benchmark.name)}
            className="shrink-0 rounded-full transition-transform active:scale-90"
            aria-label={isActive ? `Deselect ${benchmark.name}` : `Select ${benchmark.name}`}
          >
            <CheckCircleIcon active={isActive} />
          </button>
        )}

        <div className="flex flex-1 items-center gap-2 min-w-0">

          {/* Benchmark icon + name + tooltip */}
          <div className="flex items-center gap-1 shrink-0 group relative">
            <BenchmarkIcon className="shrink-0 text-[#24292e]" />
            <span className="text-base font-medium tracking-tight text-[#24292e] whitespace-nowrap">
              {benchmark.name}
            </span>
            <div
              className="pointer-events-none absolute bottom-full left-0 mb-2 w-56 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
              role="tooltip"
            >
              {benchmark.tooltip}
              <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900" />
            </div>
          </div>

          {/* Value */}
          <span className="text-base font-medium text-[rgba(0,0,0,0.6)] tracking-tight">
            {benchmark.value.toLocaleString()}
          </span>

          {/* State chip */}
          {isProcessing && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-[#8c909a] text-white select-none">
              PROCESSING
            </span>
          )}
          {isNew && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-green-500 text-white select-none">
              NEW
            </span>
          )}

          <div className="flex-1 min-w-0" />

          {/* Ellipsis menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="text-[#596066] hover:text-[#24292e] transition-colors rounded p-0.5"
              aria-label={`Options for ${benchmark.name}`}
              aria-expanded={menuOpen}
            >
              <DotsThreeIcon />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                <button
                  onClick={() => { onEdit(benchmark.id); setMenuOpen(false); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#24292e] hover:bg-gray-50 transition-colors"
                >
                  <EditIcon className="text-[#596066]" />
                  Edit
                </button>
                <button
                  onClick={() => { onRemove(benchmark.id); setMenuOpen(false); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <TrashIcon className="text-red-400" />
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tags */}
      <p className="pl-8 text-sm font-medium tracking-tight text-[#8185a3]">
        {benchmark.tags}
      </p>
    </div>
  );
}

interface BenchmarksCardProps {
  benchmarks: Benchmark[];
  activeBenchmarks: Set<string>;
  onToggle: (name: string) => void;
  onRemove: (id: string) => void;
  onAddBenchmark: () => void;
  onRefresh: () => void;
  panelState: 'processing' | 'ready' | null;
}

export function BenchmarksCard({
  benchmarks,
  activeBenchmarks,
  onToggle,
  onRemove,
  onAddBenchmark,
  onRefresh,
  panelState,
}: BenchmarksCardProps) {
  const [_editingId, setEditingId] = useState<string | null>(null); // placeholder

  return (
    <div className="flex-1 min-w-0 bg-white rounded-lg p-6 flex flex-col gap-4">

      {/* Info panel — shown above title after a benchmark is added */}
      {panelState === 'processing' && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-blue-500" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.25" />
            <circle cx="8" cy="5.5" r="0.6" fill="currentColor" />
            <path d="M8 7.5v3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <p className="flex-1 text-[13px] leading-snug text-blue-800">
            Benchmark is processing and will appear here once ready. You'll receive an email when it's complete.
          </p>
        </div>
      )}

      {panelState === 'ready' && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5 text-green-600" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.25" />
            <path d="M5 8l2 2.5 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="flex-1 text-[13px] leading-snug text-green-800">
            Your benchmark is ready. Update to view the latest results.
          </p>
          <button
            onClick={onRefresh}
            className="shrink-0 text-[13px] font-semibold text-green-700 hover:text-green-900 transition-colors whitespace-nowrap"
          >
            Update benchmark
          </button>
        </div>
      )}

      {/* Card header */}
      <div className="flex items-center gap-4">
        <div className="flex flex-1 items-center gap-1 min-w-0">
          <span className="text-base font-semibold tracking-tight text-[#24292e]">Benchmarks</span>
          <div className="relative group inline-flex shrink-0">
            <InfoIcon className="text-[#596066]" />
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Benchmarks are groups of organisations you compare your performance against. Toggle them on or off to show or hide them in the chart.
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </div>
          </div>
        </div>
        <button
          onClick={onAddBenchmark}
          className="flex items-center gap-2 bg-[#4a56a8] hover:bg-[#3d4991] active:bg-[#323d80] text-white px-4 py-1.5 rounded-lg font-semibold text-[15px] transition-colors shrink-0"
        >
          <PlusIcon />
          Add a benchmark
        </button>
      </div>

      {/* Benchmark list */}
      <div className="flex flex-col gap-4">
        {benchmarks.map((b) => (
          <BenchmarkItem
            key={b.id}
            benchmark={b}
            isActive={activeBenchmarks.has(b.name)}
            onToggle={onToggle}
            onEdit={(id) => setEditingId(id)}
            onRemove={onRemove}
          />
        ))}
        {benchmarks.length === 0 && (
          <p className="text-sm text-[#596066] py-2">No benchmarks yet. Add one to get started.</p>
        )}
      </div>

    </div>
  );
}
