import React, { useState, useRef, useEffect } from 'react';

const DUMMY_ORGS = [
  'AstraZeneca',
  'Pfizer',
  'Novartis',
  'Roche',
  'Keytruda',
  'Sanofi',
  'Merck',
  'Johnson & Johnson',
  'GlaxoSmithKline',
  'Eli Lilly',
  'Bristol-Myers Squibb',
  'AbbVie',
];

interface Props {
  onClose: () => void;
  onConfirm: (name: string, selectedOrgs: string[]) => void;
}

export function AddBenchmarkModal({ onClose, onConfirm }: Props) {
  const [step, setStep]       = useState<1 | 2>(1);
  const [name, setName]       = useState('');
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const nameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => { if (step === 2) searchRef.current?.focus(); }, [step]);

  const filteredOrgs = DUMMY_ORGS.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOrg = (org: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(org) ? next.delete(org) : next.add(org);
      return next;
    });

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(13,17,23,0.45)' }}
      onMouseDown={handleBackdrop}
    >
      <div
        className="w-full max-w-[480px] mx-4 bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="text-[#596066] hover:text-[#24292e] transition-colors -ml-1"
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M12.5 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <h2 className="text-[17px] font-semibold tracking-tight text-[#0d1117]">
              {step === 1 ? 'Create a benchmark' : 'Add organisations'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#596066] hover:text-[#24292e] transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Step pills ── */}
        <div className="flex gap-2 px-6 pt-4 pb-1">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ backgroundColor: s <= step ? '#4a56a8' : '#e4e6f0' }}
            />
          ))}
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {step === 1 ? (
            <>
              <p className="text-sm text-[#596066] leading-relaxed">
                Give your benchmark a name — you'll use this to identify it in charts and reports.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-[#24292e]">
                  Benchmark name <span className="text-red-400">*</span>
                </label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setStep(2); }}
                  placeholder="e.g. Top oncology groups"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm text-[#24292e] outline-none transition-shadow"
                  style={{
                    borderColor: '#d0d3e5',
                    boxShadow: '0 0 0 0px #4a56a8',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#4a56a8'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,86,168,0.15)'; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = '#d0d3e5'; e.currentTarget.style.boxShadow = '0 0 0 0px #4a56a8'; }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[#596066] leading-relaxed">
                Select the organisations to include in{' '}
                <span className="font-semibold text-[#24292e]">{name}</span>.
                {selected.size > 0 && (
                  <span className="ml-2 font-semibold text-[#4a56a8]">{selected.size} selected</span>
                )}
              </p>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organisations…"
                className="w-full px-3 py-2.5 rounded-lg border text-sm text-[#24292e] outline-none"
                style={{ borderColor: '#d0d3e5' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#4a56a8'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = '#d0d3e5'; }}
              />
              <div className="flex flex-col gap-0.5 -mx-2">
                {filteredOrgs.map((org) => (
                  <button
                    key={org}
                    onClick={() => toggleOrg(org)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                    style={{ backgroundColor: selected.has(org) ? '#eef0f9' : 'transparent' }}
                    onMouseEnter={(e) => { if (!selected.has(org)) e.currentTarget.style.backgroundColor = '#f6f7fb'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = selected.has(org) ? '#eef0f9' : 'transparent'; }}
                  >
                    {/* Checkbox */}
                    <div
                      className="w-[18px] h-[18px] rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        backgroundColor: selected.has(org) ? '#4a56a8' : 'transparent',
                        borderColor: selected.has(org) ? '#4a56a8' : '#bec2d6',
                      }}
                    >
                      {selected.has(org) && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm font-medium text-[#24292e]">{org}</span>
                  </button>
                ))}
                {filteredOrgs.length === 0 && (
                  <p className="py-6 text-center text-sm text-[#596066]">No organisations found</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#596066] hover:text-[#24292e] transition-colors"
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!name.trim()}
              className="px-5 py-2 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#4a56a8' }}
              onMouseEnter={(e) => { if (name.trim()) e.currentTarget.style.backgroundColor = '#3d4991'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#4a56a8'; }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={() => { if (selected.size > 0) onConfirm(name.trim(), Array.from(selected)); }}
              disabled={selected.size === 0}
              className="px-5 py-2 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#4a56a8' }}
              onMouseEnter={(e) => { if (selected.size > 0) e.currentTarget.style.backgroundColor = '#3d4991'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#4a56a8'; }}
            >
              Create benchmark
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
