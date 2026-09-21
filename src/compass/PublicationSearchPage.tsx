import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import Fade from '@mui/material/Fade';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Pagination from '@mui/material/Pagination';
import Popper from '@mui/material/Popper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ArrowDown,
  ArrowUp,
  Bank,
  CaretDown,
  CaretUp,
  Check,
  Info,
  MagnifyingGlass,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import { alpha } from '@mui/material/styles';
import { PUBLICATIONS, type SearchOrganisation, type SearchPublication } from './publicationSearchData';

// ── Shared bits ──────────────────────────────────────────────────────────────

const tooltipSlotProps = {
  tooltip: {
    sx: {
      bgcolor: '#383f45',
      fontSize: 13,
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '-0.01em',
      px: 2,
      py: 1.5,
      borderRadius: '8px',
      maxWidth: 280,
    },
  },
  arrow: { sx: { color: '#383f45' } },
} as const;

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

const STOPWORDS = new Set([
  'and', 'or', 'not', 'the', 'of', 'for', 'with', 'in', 'on', 'a', 'an', 'to', 'vs', 'from',
  // Generic command scaffolding in a full-sentence query ("show me the
  // publications of X") — carries no concept meaning of its own, same
  // category as the words above rather than a leftover "Metadata" concept.
  'show', 'me', 'publications', 'publication',
  // Generic labels for an identifier/title the user is about to name
  // (e.g. "publications with DOI 10.1016/...") rather than a search term
  // in their own right — the identifier/title itself is picked up by
  // extractDocumentIdentifierMatch/extractTitleMatch instead.
  'doi',
  // Realistic HCP/Medical Affairs phrasing carries a lot of this kind of
  // scaffolding around the actual concept ("I want to track...", "What
  // are the relevant publications... for the indication X?", "the year
  // 2026") — none of it is itself a search term, same treatment as the
  // command scaffolding above.
  'want', 'track', 'about', 'all', 'what', 'are', 'relevant', 'indication', 'year', 'years', 'find',
]);

/** Splits a natural-language query into its meaningful words, so "nivolumab in
 *  prostate cancer" matches publications containing "prostate" and/or "cancer"
 *  rather than requiring that exact phrase verbatim in one field. */
function significantTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function publicationHaystack(p: SearchPublication): string {
  return [p.title, p.journal, p.area, p.authors, p.doi, ...p.organisations.map((o) => o.name)]
    .join(' ')
    .toLowerCase();
}

interface FilterOptions {
  /** Explicit OR-match terms, sourced from the surviving (non-removed)
   *  interpreted concepts (see computeConceptState) — takes over matching
   *  entirely when present, so removing a concept immediately drops its
   *  term from here and narrows/broadens results accordingly. When absent
   *  (or empty), falls back to tokenising `queryText` itself. */
  orTerms?: string[];
  /** AND-narrowing exact substring — e.g. a resolved ambiguity sub-category's
   *  qualifying phrase. Unlike orTerms, this must always be present. */
  requiredPhrase?: string;
  /** AND-narrowing structured field checks — one per surviving Metadata
   *  concept (year/publication type; see extractMetadataMatches). These
   *  match on the publication's actual fields rather than a haystack
   *  substring, so a bare year like "2024" can't spuriously match a DOI or
   *  title that happens to contain those digits. */
  predicates?: Array<(p: SearchPublication) => boolean>;
}

/** Shared by the landing preview's live-as-you-type list and the dedicated
 *  results view's committed-query list (see the page component) — same
 *  matching rules, just fed a different query string. The landing preview
 *  calls this with queryText:'' and no options, so it's unaffected by
 *  anything here (see the "preview never live-filters" comment at its call
 *  site). */
function filterPublications(queryText: string, publicationFilter: PublicationFilter, options?: FilterOptions): SearchPublication[] {
  const q = queryText.trim().toLowerCase();
  let list = PUBLICATIONS.filter((p) => publicationFilter === 'all' || p.area === 'Clinical trials');
  if (options?.orTerms !== undefined) {
    // Explicit term list from the surviving interpreted concepts — always
    // used as-is, even if empty. Empty here means "the user removed every
    // concept," which should read as "no criteria left" (show everything),
    // not silently fall back to re-matching the original, un-edited query.
    const orTerms = options.orTerms.map((t) => t.toLowerCase());
    if (orTerms.length > 0) {
      list = list.filter((p) => { const h = publicationHaystack(p); return orTerms.some((t) => h.includes(t)); });
    }
  } else if (q) {
    const terms = significantTerms(q);
    list = terms.length > 0
      // Natural-language queries ("nivolumab in prostate cancer") match publications
      // containing any of the meaningful terms, so the mock corpus still surfaces
      // relevant results even when it doesn't contain every literal word.
      ? list.filter((p) => { const h = publicationHaystack(p); return terms.some((t) => h.includes(t)); })
      // A short/stopword-only query (e.g. a bare DOI fragment) falls back to a
      // plain substring match across the same fields.
      : list.filter((p) => publicationHaystack(p).includes(q));
  }
  if (options?.requiredPhrase) {
    list = list.filter((p) => publicationHaystack(p).includes(options.requiredPhrase!));
  }
  if (options?.predicates && options.predicates.length > 0) {
    list = list.filter((p) => options.predicates!.every((fn) => fn(p)));
  }
  return list;
}

// ── Org badge (top-right) ─────────────────────────────────────────────────────

function OrgBadge() {
  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.75,
      bgcolor: '#d1d4e3',
      borderRadius: '100px',
      px: 2,
      py: 1,
      whiteSpace: 'nowrap',
      alignSelf: 'flex-end',
      // Cancels out the flex column's own 32px gap above this item, so the
      // page's own top padding is the only thing determining how far this
      // sits from the viewport top (see the page component's `pt`).
      mt: '-32px',
    }}>
      <Bank size={18} color="#383f45" />
      <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#383f45', letterSpacing: '-0.01em' }}>
        AstraZeneca
      </Typography>
    </Box>
  );
}

// ── Search capsule ────────────────────────────────────────────────────────────

/** The one persistent search input — same component instance whether it's
 *  sitting inline in the original search view or docked to the top once the
 *  full list is expanded. It is never conditionally mounted/unmounted for
 *  that transition (that was the bug: the inline version and the previous
 *  separate "slim bar" version were two different elements swapped via
 *  Collapse/Fade `unmountOnExit`, which is what made the search box appear
 *  to disappear). Docking is purely a style change on this same element —
 *  `position: fixed` lets it escape its now-collapsed (but still-mounted)
 *  ancestor without needing to leave it, and the `left` offset is computed
 *  in pure CSS (mirroring the page's own maxWidth:1440/mx:auto/px:6 column)
 *  so it lands exactly where the docked layout expects, at any viewport
 *  width, with no measurement/JS required. */
/** Rotating example queries for the idle-state typing animation below —
 *  realistic Medical Affairs publication-search queries (specific drugs,
 *  indications and performance metrics, not vague placeholders like "this
 *  therapy"), so the placeholder doubles as a hint at what to type rather
 *  than a generic filler string. Only ever shown in the undocked (main,
 *  not-yet-committed) search field — see SearchCapsule's `showAnimated`. */
const EXAMPLE_QUERIES = [
  'Show me the top five publications for pembrolizumab in metastatic melanoma',
  'Show me publications on nivolumab in advanced renal cell carcinoma',
  'Find pembrolizumab publications in melanoma and NSCLC',
  'Show me top publications on osimertinib in EGFR-mutated NSCLC',
  'Find publications with the highest Altmetric attention for pembrolizumab',
  'Show me trastuzumab publications in HER2-positive breast cancer',
  'Find the most cited publications on pembrolizumab in metastatic melanoma',
  'Show me top publications on atezolizumab in extensive-stage SCLC',
  'Find all metastatic colorectal cancer publications with other treatments',
];

/** Typewriter effect cycling through EXAMPLE_QUERIES — active only while
 *  the field is empty and the user hasn't focused it (see `active`).
 *  Renders nothing itself; just hands back the text to display and a
 *  blinking-cursor flag, so the caller can style/position it however it
 *  needs (see SearchCapsule, which overlays this at the exact position
 *  the real placeholder would occupy). */
function useTypewriterPlaceholder(active: boolean): string {
  const [displayed, setDisplayed] = useState('');
  const [cursorOn, setCursorOn] = useState(true);
  const exampleIndexRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    // True only in the brief gap after fully erasing one example and before
    // the next starts typing — the one moment it's safe for cleanup to NOT
    // advance the index again, since typeStep already did.
    let justAdvanced = false;

    const schedule = (fn: () => void, delay: number) => {
      timer = setTimeout(() => { if (!cancelled) fn(); }, delay);
    };

    function typeStep(charCount: number) {
      justAdvanced = false;
      const target = EXAMPLE_QUERIES[exampleIndexRef.current];
      setDisplayed(target.slice(0, charCount));
      if (charCount < target.length) {
        schedule(() => typeStep(charCount + 1), 45); // subtle, natural typing pace
      } else {
        schedule(() => deleteStep(target.length), 1400); // pause so it can be read
      }
    }

    function deleteStep(charCount: number) {
      const target = EXAMPLE_QUERIES[exampleIndexRef.current];
      setDisplayed(target.slice(0, charCount));
      if (charCount > 0) {
        schedule(() => deleteStep(charCount - 1), 25); // erasing reads faster than typing
      } else {
        justAdvanced = true;
        exampleIndexRef.current = (exampleIndexRef.current + 1) % EXAMPLE_QUERIES.length;
        schedule(() => typeStep(1), 300);
      }
    }

    typeStep(1);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Interrupted mid-cycle (user focused/typed) — skip ahead so the next
      // time this resumes, it continues the rotation rather than repeating
      // the example that got cut off.
      if (!justAdvanced) {
        exampleIndexRef.current = (exampleIndexRef.current + 1) % EXAMPLE_QUERIES.length;
      }
      setDisplayed('');
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(id);
  }, [active]);

  return active ? displayed + (cursorOn ? '|' : ' ') : '';
}

function SearchCapsule({
  value,
  onChange,
  onSubmit,
  docked = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  docked?: boolean;
}) {
  // Stops (and hides) the instant the field is focused, even before any
  // character is typed, so it can never fight with the user's own input.
  // Clearing the field resumes it — from the next example, not wherever it
  // was cut off — regardless of whether the field is still focused. Docked
  // (the slim, already-searched-state bar) never animates at all — it's a
  // static "Describe what you're looking for..." placeholder there, no loop.
  const [suppressed, setSuppressed] = useState(false);
  const showAnimated = !docked && value === '' && !suppressed;
  const animatedText = useTypewriterPlaceholder(showAnimated);

  // Some example queries are longer than the field is wide (realistic
  // Medical Affairs queries run long) — once the typed-so-far text overflows,
  // right-align it so the box scrolls to keep the most recently "typed"
  // end in view, the same way a real input scrolls to keep the caret
  // visible, rather than silently clipping further typing off the end.
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayOverflowing, setOverlayOverflowing] = useState(false);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    setOverlayOverflowing(el.scrollWidth > el.clientWidth);
  }, [animatedText]);

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      bgcolor: '#fff',
      border: '1px solid #d5d8de',
      borderRadius: docked ? '10px' : '12px',
      // Undocked: 30% narrower than the original 1152px full-width bar, 15%
      // taller than the original 57px, then a further 15% reduction on
      // both from that 806x66 baseline, narrowed again to 663 (width only)
      // to fit beside the "Find publications" button. Docked: the slim
      // anchored-bar size this same input takes on once the list expands.
      width: docked ? '420px' : '663px',
      height: docked ? '40px' : '56px',
      ...(docked
        ? {
            position: 'fixed',
            top: '12px',
            // 72px sidebar + the page column's own px:6 (48px) + however much
            // margin centres a maxWidth:1440 column in the remaining viewport
            // width — the exact left edge of the content column, at any
            // viewport size, computed the same way the column itself is.
            left: 'calc(120px + max(0px, (100vw - 1512px) / 2))',
            zIndex: 1301,
            mx: 0,
            // Collapse (now that it no longer unmounts its content, see the
            // page component) sets `visibility: hidden` on its wrapper once
            // fully collapsed. That's inherited by descendants by default,
            // which would hide this element too even though it has escaped
            // the collapsed box visually via `position: fixed` — visibility
            // isn't a layout property, so escaping the box doesn't escape
            // it. Force it back to visible explicitly while docked.
            visibility: 'visible',
          }
        : { position: 'static', mx: 'auto' }),
      pl: docked ? 2 : 3,
      pr: 1,
      py: docked ? 0 : 0.75,
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      transition: 'border-color 0.15s, box-shadow 0.15s, width 0.3s ease, height 0.3s ease, left 0.3s ease, top 0.3s ease',
      '&:focus-within': {
        borderColor: '#4a56a8',
        boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.12)}`,
      },
    }}>
      <MagnifyingGlass size={docked ? 15 : 20} color="#8d96a5" style={{ flexShrink: 0 }} />
      <Box sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <OutlinedInput
          fullWidth
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (e.target.value === '') setSuppressed(false);
          }}
          onFocus={() => setSuppressed(true)}
          onBlur={() => { if (value === '') setSuppressed(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit?.();
          }}
          placeholder={showAnimated ? '' : "Describe what you're looking for..."}
          sx={{
            fontSize: docked ? 13 : 16,
            letterSpacing: '-0.01em',
            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            '& .MuiOutlinedInput-input': { py: docked ? '6px' : '10px', px: 0 },
          }}
        />
        {showAnimated ? (
          <Box
            ref={overlayRef}
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: overlayOverflowing ? 'flex-end' : 'flex-start',
              pointerEvents: 'none',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              fontSize: docked ? 13 : 16,
              letterSpacing: '-0.01em',
              color: '#8d96a5',
              fontFamily: 'inherit',
            }}
          >
            {animatedText}
          </Box>
        ) : null}
      </Box>
      {value ? (
        <Box
          role="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: docked ? 20 : 28,
            height: docked ? 20 : 28,
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#8d96a5',
            transition: 'background-color 0.15s, color 0.15s',
            '&:hover': { bgcolor: '#f0f1f5', color: '#383f45' },
          }}
        >
          <X size={docked ? 12 : 16} />
        </Box>
      ) : null}
    </Box>
  );
}

// ── Toolbar: result count + filters ───────────────────────────────────────────

type PublicationFilter = 'all' | 'trials';
type SortKey = 'year' | 'altmetric' | 'citations';
type SortDir = 'asc' | 'desc';

function FilterPill({ label, onClick }: { label: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        bgcolor: '#eef0f5',
        borderRadius: '100px',
        px: 1.75,
        py: 0.75,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: '#e3e5ec' },
      }}
    >
      <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#383f45', letterSpacing: '-0.01em' }}>
        {label}
      </Typography>
      <CaretDown size={13} color="#676e76" />
    </Box>
  );
}

function PlainDropdown({ label, onClick }: { label: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        cursor: 'pointer',
        px: 0.5,
        py: 0.75,
        borderRadius: '6px',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.05) },
      }}
    >
      <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#383f45', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
      <CaretDown size={13} color="#676e76" />
    </Box>
  );
}

/** The "Filter by: ..." pill + date-sort dropdown, extracted so it can be
 *  reused as-is in two places: alongside the result count on the initial
 *  preview screen (its original position), and alongside the search bar in
 *  the fixed header once the full list is expanded — same styling, sizing
 *  and behaviour in both, just a different neighbour. */
function FilterControls({
  publicationFilter,
  onPublicationFilterChange,
  sortKey,
  sortDir,
  onSort,
}: {
  publicationFilter: PublicationFilter;
  onPublicationFilterChange: (f: PublicationFilter) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, dir: SortDir) => void;
}) {
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const dateLabel = sortKey !== 'year' ? 'Publication date' : sortDir === 'desc' ? 'Publication date: Newest' : 'Publication date: Oldest';

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'text.secondary', letterSpacing: '-0.01em' }}>
          Filter by:
        </Typography>
        <FilterPill
          label={publicationFilter === 'all' ? 'All publications' : 'Clinical trials only'}
          onClick={(e) => setFilterAnchor(e.currentTarget)}
        />
        <Tooltip
          title="Narrow results to a specific publication type, or leave as All publications to search the full corpus."
          placement="top"
          arrow
          slotProps={tooltipSlotProps}
        >
          <Box component="span" sx={{ display: 'inline-flex', cursor: 'help', color: 'text.disabled' }}>
            <Info size={18} />
          </Box>
        </Tooltip>
        <PlainDropdown
          label={dateLabel}
          onClick={(e) => setDateAnchor(e.currentTarget)}
        />
      </Box>

      <Menu
        anchorEl={filterAnchor}
        open={Boolean(filterAnchor)}
        onClose={() => setFilterAnchor(null)}
        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: '8px', minWidth: 190 } } }}
      >
        <MenuItem
          selected={publicationFilter === 'all'}
          onClick={() => { onPublicationFilterChange('all'); setFilterAnchor(null); }}
          sx={{ fontSize: 14, letterSpacing: '-0.01em', py: 1 }}
        >
          All publications
        </MenuItem>
        <MenuItem
          selected={publicationFilter === 'trials'}
          onClick={() => { onPublicationFilterChange('trials'); setFilterAnchor(null); }}
          sx={{ fontSize: 14, letterSpacing: '-0.01em', py: 1 }}
        >
          Clinical trials only
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={dateAnchor}
        open={Boolean(dateAnchor)}
        onClose={() => setDateAnchor(null)}
        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: '8px', minWidth: 170 } } }}
      >
        <MenuItem
          selected={sortKey === 'year' && sortDir === 'desc'}
          onClick={() => { onSort('year', 'desc'); setDateAnchor(null); }}
          sx={{ fontSize: 14, letterSpacing: '-0.01em', py: 1 }}
        >
          Newest first
        </MenuItem>
        <MenuItem
          selected={sortKey === 'year' && sortDir === 'asc'}
          onClick={() => { onSort('year', 'asc'); setDateAnchor(null); }}
          sx={{ fontSize: 14, letterSpacing: '-0.01em', py: 1 }}
        >
          Oldest first
        </MenuItem>
      </Menu>
    </>
  );
}

/** Mockup-only counter shown on the initial page — a fixed "big corpus"
 *  number, independent of the actual (500-item) test dataset or the current
 *  query, matching how the reference screenshot's own count worked. The
 *  full list view keeps the real, live count instead (see ResultsToolbar). */
const MOCK_INITIAL_COUNT = '334,056';

function ResultsToolbar({
  resultCount,
  initial,
}: {
  resultCount: number;
  /** True on the initial page — shows the fixed mockup count instead of the
   *  real one. False once the full list is expanded, where the real live
   *  count is shown. Filter controls were already absent here in both
   *  cases: on the full list view they live in the fixed header bar
   *  instead (see SlimSearchBar); the initial page now has none at all. */
  initial: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      {initial ? (
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em' }}>
          {MOCK_INITIAL_COUNT} publications
        </Typography>
      ) : (
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em' }}>
          Publications found{' '}
          <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
            ({formatCount(resultCount)} results)
          </Box>
        </Typography>
      )}
    </Box>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────

const GRID_TEMPLATE = '32px minmax(300px, 1fr) 64px 180px 210px 96px 96px';
const PAGE_SIZE = 30;

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left',
  interactive = true,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right';
  /** False on the initial page's non-interactive preview — same arrow/
   *  active-column styling, just no click handler, cursor, or hover. */
  interactive?: boolean;
}) {
  return (
    <Box
      onClick={interactive ? onClick : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 0.5,
        cursor: interactive ? 'pointer' : 'default',
        userSelect: 'none',
        color: active ? 'text.primary' : 'text.secondary',
        ...(interactive ? { '&:hover': { color: 'text.primary' } } : {}),
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>{label}</Typography>
      {dir === 'desc'
        ? <CaretDown size={13} weight={active ? 'bold' : 'regular'} />
        : <CaretUp size={13} weight={active ? 'bold' : 'regular'} />}
    </Box>
  );
}

function OrgLine({ org }: { org: SearchOrganisation }) {
  const Icon = org.category === 'government' ? Bank : UsersThree;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <Icon size={15} color="#8d96a5" style={{ flexShrink: 0 }} />
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 500,
          color: 'text.secondary',
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {org.name}
      </Typography>
    </Box>
  );
}

/** Groups a publication's organisations by government vs. everything else, each
 *  rendered as one line — "Primary name (+N others)" when a bucket holds more
 *  than one — mirroring how the reference screenshot condenses co-affiliations. */
function OrganisationsCell({ organisations }: { organisations: SearchOrganisation[] }) {
  const buckets: { category: 'government' | 'organisation'; orgs: SearchOrganisation[] }[] = [];
  for (const o of organisations) {
    const bucket = buckets.find((b) => b.category === o.category);
    if (bucket) bucket.orgs.push(o);
    else buckets.push({ category: o.category, orgs: [o] });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      {buckets.map((b) => (
        <OrgLine
          key={b.category}
          org={{
            category: b.category,
            name: b.orgs.length > 1
              ? `${b.orgs[0].name} (+${b.orgs.length - 1} other${b.orgs.length - 1 > 1 ? 's' : ''})`
              : b.orgs[0].name,
          }}
        />
      ))}
    </Box>
  );
}

function PublicationRow({
  pub,
  selected,
  onToggle,
  interactive = true,
}: {
  pub: SearchPublication;
  selected: boolean;
  onToggle: () => void;
  /** False on the initial page's non-interactive preview — same row
   *  appearance, just no hover highlight and a disabled (unselectable)
   *  checkbox. */
  interactive?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        columnGap: 2,
        alignItems: 'start',
        px: 2,
        py: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        transition: 'background-color 0.1s',
        ...(interactive ? { '&:hover': { bgcolor: '#fafafa' } } : {}),
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Checkbox
        size="small"
        checked={selected}
        onChange={onToggle}
        disabled={!interactive}
        sx={{ p: 0, mt: '2px', color: '#c4c8d1', '&.Mui-checked': { color: 'primary.main' } }}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
        <Typography sx={{
          fontSize: 15, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em', lineHeight: 1.4,
        }}>
          {pub.title}
        </Typography>
        <Typography sx={{
          fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: 'text.disabled', letterSpacing: 0,
        }}>
          {pub.doi}
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', letterSpacing: '-0.01em' }}>
          {pub.authors}
        </Typography>
      </Box>

      <Typography sx={{ fontSize: 14, color: 'text.primary', letterSpacing: '-0.01em', pt: '2px' }}>
        {pub.year}
      </Typography>

      <Typography sx={{
        fontSize: 14, color: 'text.secondary', letterSpacing: '-0.01em', pt: '2px',
        overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {pub.journal}
      </Typography>

      <Box sx={{ pt: '2px' }}>
        <OrganisationsCell organisations={pub.organisations} />
      </Box>

      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em', textAlign: 'right', pt: '2px' }}>
        {formatCount(pub.altmetric)}
      </Typography>

      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em', textAlign: 'right', pt: '2px' }}>
        {formatCount(pub.citations)}
      </Typography>
    </Box>
  );
}

function PublicationsTable({
  publications,
  sortKey,
  sortDir,
  onSort,
  selectedIds,
  onToggleRow,
  onToggleAll,
  pagination,
  interactive = true,
}: {
  publications: SearchPublication[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, dir?: SortDir) => void;
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  /** Only present on the full list view — the initial page's masked
   *  preview doesn't paginate (it's a height-clipped teaser, not the real
   *  list). `page`/`onChange` are 1-indexed to match MUI Pagination. */
  pagination?: { page: number; pageCount: number; onChange: (page: number) => void };
  /** False on the initial page's preview (before "View all publications" is
   *  clicked) — same appearance throughout, but sorting, row/select-all
   *  checkboxes, and row hover are all disabled, so the preview is purely a
   *  visual snapshot. Always true on the full list view. */
  interactive?: boolean;
}) {
  const allSelected = publications.length > 0 && publications.every((p) => selectedIds.has(p.id));
  const someSelected = !allSelected && publications.some((p) => selectedIds.has(p.id));

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', bgcolor: '#fff', overflow: 'hidden' }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        columnGap: 2,
        alignItems: 'center',
        px: 2,
        py: 1.5,
        bgcolor: '#f5f6fa',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}>
        <Checkbox
          size="small"
          checked={allSelected}
          indeterminate={someSelected}
          onChange={onToggleAll}
          disabled={!interactive}
          sx={{ p: 0, color: '#c4c8d1', '&.Mui-checked': { color: 'primary.main' } }}
        />
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', letterSpacing: '-0.01em' }}>
          Publication title
        </Typography>
        <SortableHeader label="Year" active={sortKey === 'year'} dir={sortKey === 'year' ? sortDir : 'desc'} onClick={() => onSort('year')} interactive={interactive} />
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', letterSpacing: '-0.01em' }}>
          Journal
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', letterSpacing: '-0.01em' }}>
          Organisations
        </Typography>
        <SortableHeader label="Altmetric" active={sortKey === 'altmetric'} dir={sortKey === 'altmetric' ? sortDir : 'desc'} onClick={() => onSort('altmetric')} align="right" interactive={interactive} />
        <SortableHeader label="Citations" active={sortKey === 'citations'} dir={sortKey === 'citations' ? sortDir : 'desc'} onClick={() => onSort('citations')} align="right" interactive={interactive} />
      </Box>

      {publications.length === 0 ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 15, color: 'text.disabled' }}>
            No publications match your search.
          </Typography>
        </Box>
      ) : (
        publications.map((pub) => (
          <PublicationRow
            key={pub.id}
            pub={pub}
            selected={selectedIds.has(pub.id)}
            onToggle={() => onToggleRow(pub.id)}
            interactive={interactive}
          />
        ))
      )}

      {pagination && pagination.pageCount > 1 ? (
        <Box sx={{
          display: 'flex',
          justifyContent: 'center',
          px: 2,
          py: 1.5,
          bgcolor: '#f5f6fa',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}>
          <Pagination
            page={pagination.page}
            count={pagination.pageCount}
            onChange={(_e, value) => pagination.onChange(value)}
            color="primary"
            size="small"
            shape="rounded"
          />
        </Box>
      ) : null}
    </Box>
  );
}

const PREVIEW_HEIGHT_FALLBACK = 480;

/** Wraps the (unchanged) publications table so it can grow smoothly from a
 *  short, gradient-masked "preview" into the full list, rather than the two
 *  states being an abrupt swap. The table itself never re-renders differently
 *  between the two — only this wrapper's max-height, the mask's opacity, and
 *  the CTA's opacity animate, all driven by the same `expanded` flag.
 *
 *  While collapsed, this component is a `flex: 1` child of the page's
 *  100vh-capped initial screen (see the page component below), so it
 *  naturally fills exactly whatever room is left beneath the header/search
 *  area — never more than the viewport allows. A ResizeObserver tracks that
 *  allotted height as `previewHeight` so the collapsed→expanded max-height
 *  transition has a real numeric starting point to animate from (an
 *  unconstrained flex size, with no maxHeight set at all, can't be
 *  transitioned smoothly). */
function ExpandablePublicationPreview({
  expanded,
  onExpand,
  children,
}: {
  expanded: boolean;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [previewHeight, setPreviewHeight] = useState(PREVIEW_HEIGHT_FALLBACK);
  const [contentHeight, setContentHeight] = useState(PREVIEW_HEIGHT_FALLBACK * 3);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setPreviewHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measures the table's natural height so the "grow" transition animates to
  // a real target rather than an arbitrarily large max-height (which would
  // make most of the visual growth happen in the first instant of the
  // transition rather than over its full duration).
  useLayoutEffect(() => {
    if (contentRef.current) setContentHeight(contentRef.current.scrollHeight);
  }, [children]);

  return (
    <Box ref={wrapperRef} sx={{ position: 'relative', flex: expanded ? 'none' : 1, minHeight: 0 }}>
      <Box
        sx={{
          overflow: 'hidden',
          maxHeight: expanded ? `${contentHeight}px` : `${previewHeight}px`,
          transition: 'max-height 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Box ref={contentRef}>{children}</Box>
      </Box>

      {/* Fades to transparent as the list expands, rather than disappearing
          abruptly — same background colour as the page, so it reads as the
          content dissolving into the page rather than a coloured overlay. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: expanded ? 0 : 1,
          transition: 'opacity 0.7s ease',
          background: 'linear-gradient(to bottom, rgba(228,230,240,0.2) 0%, rgba(228,230,240,0.8) 100%)',
        }}
      />

      {/* ~24px above the viewport's bottom edge (16px baseline + 24px extra,
          then brought down 8px twice) — the wrapper above fills the screen
          exactly up to the page's own bottom padding (removed while on this
          initial, unexpanded screen — see the page component), so
          bottom:24 here lands 24px from the browser window's edge, not just
          from this box. */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? 'none' : 'auto',
          transition: 'opacity 0.3s ease',
        }}
      >
        <Button
          onClick={onExpand}
          endIcon={<ArrowDown size={16} />}
          disableElevation
          sx={{
            bgcolor: '#4a56a8',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            borderRadius: '8px',
            px: 3,
            py: 1.25,
            textTransform: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(74,86,168,0.28)',
            '&:hover': { bgcolor: '#3d4891' },
          }}
        >
          View all publications
        </Button>
      </Box>
    </Box>
  );
}

/** The "existing main search field" (header + subline + full search capsule)
 *  collapses into this once the list expands — same query/onChange, same
 *  live-filtering, just docked to the top of the scroll container and far
 *  less visually prominent, so it stays out of the way of the list itself.
 *  `position: fixed` (anchored to the viewport, offset past the sidebar)
 *  rather than `sticky` — this main content column is a flex item inside a
 *  fixed-height flex row, and sticky positioning on a flex-item descendant
 *  of that layout doesn't hold; fixed sidesteps it entirely, which is also
 *  a more literal reading of "anchored to the top of the viewport". */
/** Purely the decorative chrome of the docked header bar — its background,
 *  border, and the filter controls. The search input itself is no longer
 *  rendered here; it's the same persistent `SearchCapsule` instance from
 *  the original search view, which docks on top of this via its own
 *  `position: fixed` (see SearchCapsule). This chrome can safely mount/
 *  unmount with the transition since it isn't "the search container" —
 *  only the input itself needed to stop being swapped. */
function SlimSearchBar({
  onBack,
  publicationFilter,
  onPublicationFilterChange,
  sortKey,
  sortDir,
  onSort,
}: {
  onBack: () => void;
  publicationFilter: PublicationFilter;
  onPublicationFilterChange: (f: PublicationFilter) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey, dir: SortDir) => void;
}) {
  return (
    <Box sx={{
      position: 'fixed',
      top: 0,
      left: '72px',
      right: 0,
      zIndex: 1300,
      bgcolor: 'background.paper',
      borderBottom: '1px solid',
      borderColor: 'divider',
      py: 1.5,
      display: 'flex',
      alignItems: 'center',
    }}>
      {/* Mirrors the content column's own left edge (px:6, maxWidth:1440,
          mx:auto) so the reserved search-capsule space lines up correctly,
          but the right side carries extra padding beyond that (pr, not
          px) to leave room for the always-visible "Back to search" label
          beside it — otherwise the two collide at viewport widths where
          this row's box is clamped to the full bar width rather than
          centered with slack. That means the filters no longer land on
          the exact same right boundary as the table below; accepted
          trade-off so the label can stay legible instead of overlapping. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, maxWidth: 1440, width: '100%', mx: 'auto', pl: 6, pr: '190px' }}>
        {/* Reserves the space the docked SearchCapsule floats on top of —
            same size, so the filters after it land exactly where they did
            when the input was rendered directly in this row. */}
        <Box aria-hidden sx={{ width: '420px', height: '40px', flexShrink: 0 }} />

        {/* Pushed to this row's own far right, within the reserved space
            above. */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          <FilterControls
            publicationFilter={publicationFilter}
            onPublicationFilterChange={onPublicationFilterChange}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
        </Box>
      </Box>

      {/* "Back to search" isn't part of the search-bar/filters alignment
          above — it stays anchored to the same fixed position beyond it,
          independent of the 1440 content column. Icon and label together
          form one clickable control; the label is always visible rather
          than only on hover, so no tooltip is needed. */}
      <Box
        role="button"
        aria-label="Back to search"
        onClick={onBack}
        sx={{
          position: 'absolute',
          right: 48,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          color: 'text.secondary',
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          '&:hover': { color: 'primary.main' },
        }}
      >
        <ArrowUp size={16} />
        Back to search
      </Box>
    </Box>
  );
}

// ── Empty-state search landing ────────────────────────────────────────────

/** Wraps the (unchanged) search capsule and a "Find publications" CTA in a
 *  card slightly lighter than the page background, with a natural-language
 *  helper line and a clickable example query — matching the reference
 *  screenshot's empty state without altering the capsule itself. */
function SearchLandingCard({
  query,
  onQueryChange,
  onSubmit,
  docked = false,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onSubmit: () => void;
  docked?: boolean;
}) {
  return (
    <Box sx={{
      // 15% narrower than the 1080px this card previously stretched to fill —
      // width only; height stays whatever the (unchanged) content naturally
      // needs. alignSelf centres it now that it no longer stretches to fill
      // the column's full width.
      width: '918px',
      alignSelf: 'center',
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: '12px',
      p: 3,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <SearchCapsule value={query} onChange={onQueryChange} onSubmit={onSubmit} docked={docked} />
        <Button
          onClick={onSubmit}
          disabled={!query.trim()}
          startIcon={<MagnifyingGlass size={17} />}
          disableElevation
          sx={{
            flexShrink: 0,
            bgcolor: '#4a56a8',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            borderRadius: '8px',
            px: 3,
            height: '56px',
            textTransform: 'none',
            whiteSpace: 'nowrap',
            '&:hover': { bgcolor: '#3d4891' },
            // Same disabled treatment used elsewhere for this button's colour
            // (e.g. AddBenchmarkModal's primary CTA): dim in place rather than
            // switching to MUI's default disabled grey.
            '&.Mui-disabled': { bgcolor: '#4a56a8', color: '#fff', opacity: 0.4, cursor: 'not-allowed' },
          }}
        >
          Find publications
        </Button>
      </Box>

      <Typography sx={{ fontSize: 13, color: 'text.secondary', letterSpacing: '-0.01em', textAlign: 'left', mt: -1 }}>
        Search naturally. Compass handles complex search logic for you.
      </Typography>
    </Box>
  );
}

/** Static informational bar — Boolean logic is handled behind the scenes, so
 *  this exists purely to reassure the user, not as an interactive control. */
function BooleanInfoBar() {
  return (
    <Box sx={{
      // Matches the search card above exactly, so their left/right edges align.
      width: '918px',
      alignSelf: 'center',
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
      borderRadius: '10px',
      px: 2,
      py: 1.5,
    }}>
      <Tooltip
        title="You don't need to construct search syntax yourself — describe what you're looking for in plain language and Compass handles the rest."
        placement="top"
        arrow
        slotProps={tooltipSlotProps}
      >
        <Box component="span" sx={{ display: 'inline-flex', cursor: 'help', color: 'primary.main', flexShrink: 0 }}>
          <Info size={18} />
        </Box>
      </Tooltip>
      <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'primary.main', letterSpacing: '-0.01em' }}>
        Boolean operators (AND, OR, NOT) or advanced filters are handled behind the scenes.
      </Typography>
    </Box>
  );
}

// ── Results view: interpreted concepts + loading interstitial ────────────────

/** Mock concept-extraction dictionary — substring matches against the
 *  committed query text, standing in for real NLP/entity extraction. Only
 *  covers the terms used in EXAMPLE_QUERIES; unrecognised queries just show
 *  no concept chips (see interpretQuery's fallback). Ordered irrelevant —
 *  overlapping matches (e.g. "her2" inside a longer disease match) are
 *  resolved generically in interpretQuery rather than by list order.
 *  'Disease' entries are deliberately just the umbrella disease name here
 *  — a more specific clinical indication, when one is known, comes from
 *  either the query itself or search clarification (see AMBIGUOUS_DISEASES
 *  and computeConceptState), not from this dictionary. */
const CONCEPT_DICTIONARY: { pattern: string; category: string; label: string }[] = [
  { pattern: 'nivolumab', category: 'Drug', label: 'Nivolumab' },
  { pattern: 'pembrolizumab', category: 'Drug', label: 'Pembrolizumab' },
  { pattern: 'trastuzumab', category: 'Drug', label: 'Trastuzumab' },
  { pattern: 'glp-1', category: 'Drug', label: 'GLP-1 therapies' },
  { pattern: 'sglt2', category: 'Drug', label: 'SGLT2 inhibitors' },
  { pattern: 'immune checkpoint inhibitor', category: 'Drug', label: 'Immune checkpoint inhibitors' },
  { pattern: 'kras', category: 'Biomarker', label: 'KRAS mutations' },
  { pattern: 'her2', category: 'Biomarker', label: 'HER2-positive' },
  // Disease and Indication are consolidated into one category (see
  // computeConceptState) — dictionary entries carry that final category
  // name directly, as the single source of truth, rather than remapping
  // 'Disease' at push time.
  { pattern: 'breast cancer', category: 'Disease / Indication', label: 'Breast cancer' },
  { pattern: 'prostate cancer', category: 'Disease / Indication', label: 'Prostate cancer' },
  { pattern: 'lung cancer', category: 'Disease / Indication', label: 'Lung cancer' },
  { pattern: 'colorectal cancer', category: 'Disease / Indication', label: 'Colorectal cancer' },
  { pattern: 'metastatic melanoma', category: 'Disease / Indication', label: 'Metastatic melanoma' },
  { pattern: 'melanoma', category: 'Disease / Indication', label: 'Melanoma' },
  { pattern: 'heart failure', category: 'Disease / Indication', label: 'Heart failure' },
  { pattern: 'cardiovascular', category: 'Disease / Indication', label: 'Cardiovascular outcomes' },
  { pattern: 'renal cell carcinoma', category: 'Disease / Indication', label: 'Renal cell carcinoma' },
  { pattern: 'intraocular lens', category: 'Device', label: 'Intraocular lens (IOL)' },
  { pattern: 'transcatheter aortic valve', category: 'Device', label: 'Transcatheter aortic valve (TAVI)' },
  // Plural listed separately (not just the singular substring) so a query
  // saying "cochlear implants" fully consumes the word via the matched
  // pattern itself — same longest-pattern-wins precedent as 'metastatic
  // melanoma' over bare 'melanoma' — rather than leaving a redundant
  // "Implants" leftover Metadata chip next to the recognised Device.
  { pattern: 'cochlear implants', category: 'Device', label: 'Cochlear implant' },
  { pattern: 'cochlear implant', category: 'Device', label: 'Cochlear implant' },
];

/** Substring-matches the query against CONCEPT_DICTIONARY, then drops any
 *  match whose pattern is wholly contained in a longer matched pattern (e.g.
 *  dropping bare "melanoma" once "metastatic melanoma" matched) — keeps
 *  overlapping mock entries from producing redundant chips. Keeps `pattern`
 *  in the result (not just category/label) so computeConceptState can both
 *  match publications by the exact recognised phrase and work out which
 *  query words are "left over" for the Other bucket. */
function interpretQuery(query: string): { pattern: string; category: string; label: string }[] {
  const lower = query.toLowerCase();
  const matches = CONCEPT_DICTIONARY.filter((e) => lower.includes(e.pattern));
  const kept = matches.filter((e) => !matches.some((other) => (
    other !== e && other.pattern.length > e.pattern.length && other.pattern.includes(e.pattern)
  )));
  const seen = new Set<string>();
  const out: { pattern: string; category: string; label: string }[] = [];
  for (const m of kept) {
    if (!seen.has(m.label)) {
      seen.add(m.label);
      out.push({ pattern: m.pattern, category: m.category, label: m.label });
    }
  }
  return out;
}

/** One concept a user can manually add via the Custom section's search
 *  (see CustomConceptSearch) — the same mock ontology CONCEPT_DICTIONARY
 *  already uses for natural-language matching, just addressable directly
 *  by label instead of requiring the right words in the query. `term` is
 *  the dictionary's own matching pattern (not always identical to
 *  `label.toLowerCase()`, e.g. "GLP-1 therapies" matches on "glp-1"), so a
 *  manually added concept contributes to search exactly as if the query
 *  had matched it directly. */
interface CatalogConcept {
  label: string;
  category: string;
  term: string;
}

const CONCEPT_CATALOG: CatalogConcept[] = CONCEPT_DICTIONARY.map((e) => ({
  label: e.label,
  category: e.category,
  term: e.pattern,
}));

interface ClarificationOptionConfig {
  key: string;
  label: string;
  indication: string;
  /** Substrings that, if already present in the raw query, mean the user
   *  already specified this sub-category — clarification is skipped and
   *  this option is applied directly (see computeConceptState). */
  qualifiers: string[];
}

interface AmbiguousDiseaseConfig {
  question: string;
  options: ClarificationOptionConfig[];
  broadLabel: string;
}

/** Diseases genuinely ambiguous enough, in this mock corpus, to be worth a
 *  clarification prompt — deliberately a short, hand-picked list rather
 *  than something derived automatically, per "only ask when ambiguity
 *  matters": most diseases in CONCEPT_DICTIONARY have no entry here at all,
 *  so they're never interrupted with a clarification question. */
const AMBIGUOUS_DISEASES: Record<string, AmbiguousDiseaseConfig> = {
  'Prostate cancer': {
    question: 'Multiple distinct medical sub-categories exist for "prostate cancer". Which specific clinical indication are you interested in?',
    options: [
      {
        key: 'mcrpc', label: 'Metastatic Castration-Resistant Prostate Cancer (mCRPC)',
        indication: 'Metastatic Castration-Resistant Prostate Cancer (mCRPC)',
        qualifiers: ['castration-resistant', 'mcrpc'],
      },
      {
        key: 'hspc', label: 'Hormone-Sensitive Prostate Cancer (HSPC)',
        indication: 'Hormone-Sensitive Prostate Cancer (HSPC)',
        qualifiers: ['hormone-sensitive', 'hspc'],
      },
    ],
    broadLabel: 'Broad Search (All Prostate Cancers)',
  },
  'Breast cancer': {
    question: 'Multiple distinct medical sub-categories exist for "breast cancer". Which specific clinical indication are you interested in?',
    options: [
      {
        key: 'her2', label: 'HER2-Positive Breast Cancer',
        indication: 'HER2-positive breast cancer',
        qualifiers: ['her2-positive', 'her2+'],
      },
      {
        key: 'tnbc', label: 'Triple-Negative Breast Cancer (TNBC)',
        indication: 'Triple-negative breast cancer',
        qualifiers: ['triple-negative', 'tnbc'],
      },
    ],
    broadLabel: 'Broad Search (All Breast Cancer Indications)',
  },
};

/** If the raw query already names one of a disease's specific sub-categories
 *  (e.g. "castration-resistant"), that option is already resolved — no
 *  clarification needed, per "only ask when ambiguity matters." */
function matchedQualifierOption(query: string, config: AmbiguousDiseaseConfig): ClarificationOptionConfig | null {
  const lower = query.toLowerCase();
  return config.options.find((o) => o.qualifiers.some((q) => lower.includes(q))) ?? null;
}

/** Mock synonym lookup for the "Unfold query" expanded state — illustrative
 *  only, standing in for a real ontology's alternate names. Concepts with no
 *  entry here just show no synonyms line. */
const CONCEPT_SYNONYMS: Record<string, string[]> = {
  Pembrolizumab: ['MK-3475', 'Keytruda'],
  Nivolumab: ['BMS-936558', 'Opdivo'],
  Trastuzumab: ['Herceptin'],
  'GLP-1 therapies': ['Glucagon-like peptide-1 receptor agonists'],
  'SGLT2 inhibitors': ['Sodium-glucose cotransporter-2 inhibitors'],
  'Prostate cancer': ['Prostatic carcinoma', 'Carcinoma of the prostate'],
  'Metastatic Castration-Resistant Prostate Cancer (mCRPC)': ['CRPC', 'Castrate-resistant prostate cancer'],
  'Hormone-Sensitive Prostate Cancer (HSPC)': ['Castration-sensitive prostate cancer', 'CSPC'],
  'Breast cancer': ['Mammary carcinoma'],
  'HER2-positive breast cancer': ['ERBB2-positive breast cancer'],
  'Triple-negative breast cancer': ['TNBC', 'ER/PR/HER2-negative breast cancer'],
  'Lung cancer': ['Pulmonary carcinoma'],
  Melanoma: ['Malignant melanoma'],
  'Heart failure': ['Cardiac failure'],
  'Renal cell carcinoma': ['Hypernephroma', 'Kidney cancer'],
  'Intraocular lens (IOL)': ['IOL', 'IOLs'],
  'Transcatheter aortic valve (TAVI)': ['TAVI', 'TAVR'],
  'Cochlear implant': ['Cochlear implantation'],
};

const CURRENT_YEAR = new Date().getFullYear();

/** One recognised structured filter pulled out of the raw query text —
 *  matched on the publication's actual fields via `predicate`, not a
 *  haystack substring, so these never get mixed up with regular text
 *  search (see FilterOptions.predicates). `consumedText` marks which
 *  words the match accounts for, so the same words don't also fall
 *  through into the Metadata leftover-word bucket. Date/date-range,
 *  publication type, and author affiliation are all just different kinds
 *  of document metadata — all of them land in the one generic "Metadata"
 *  category alongside any leftover word, rather than date getting a
 *  category of its own. */
interface MetadataMatch {
  label: string;
  predicate: (p: SearchPublication) => boolean;
  consumedText: string;
}

/** Recognises publication year (a single year, an explicit range, or
 *  "last N years"), publication type (Clinical Trial, Review,
 *  Meta-analysis, Systematic Review), and author affiliation (a known
 *  organisation named directly, or via a short alias) as structured
 *  document-metadata criteria. Mock/best-effort matching against this
 *  dataset's actual fields — there's no dedicated article-type value for
 *  Meta-analysis or Systematic Review, so those fall back to a
 *  title-text check. */
function extractMetadataMatches(query: string): MetadataMatch[] {
  const matches: MetadataMatch[] = [];
  const lower = query.toLowerCase();
  const consumedSpans: [number, number][] = [];

  const rangeRe = /\b(19|20)\d{2}\s*(?:-|–|to)\s*(19|20)\d{2}\b/gi;
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = rangeRe.exec(lower))) {
    const text = rangeMatch[0];
    const nums = (text.match(/(19|20)\d{2}/g) ?? []).map(Number);
    const start = Math.min(...nums);
    const end = Math.max(...nums);
    matches.push({ label: `${start}–${end}`, predicate: (p) => p.year >= start && p.year <= end, consumedText: text });
    consumedSpans.push([rangeMatch.index, rangeMatch.index + text.length]);
  }

  // "past" is at least as common as "last" in real Medical Affairs
  // phrasing ("publications of the past 3 years") — both resolve to the
  // same normalised "Last N years" label.
  const lastRe = /\b(?:last|past)\s+(\d+)\s+years?\b/i;
  const lastMatch = lower.match(lastRe);
  if (lastMatch && lastMatch.index !== undefined) {
    const n = Number(lastMatch[1]);
    const start = CURRENT_YEAR - n + 1;
    matches.push({ label: `Last ${n} years`, predicate: (p) => p.year >= start && p.year <= CURRENT_YEAR, consumedText: lastMatch[0] });
    consumedSpans.push([lastMatch.index, lastMatch.index + lastMatch[0].length]);
  }

  const yearRe = /\b(19|20)\d{2}\b/g;
  let yearMatch: RegExpExecArray | null;
  while ((yearMatch = yearRe.exec(lower))) {
    const idx = yearMatch.index;
    if (consumedSpans.some(([s, e]) => idx >= s && idx < e)) continue;
    const year = Number(yearMatch[0]);
    matches.push({ label: String(year), predicate: (p) => p.year === year, consumedText: yearMatch[0] });
  }

  // Matched substrings (not hardcoded singular strings) so a plural form in
  // the query — "clinical trials", "systematic reviews" — is still fully
  // consumed and doesn't leave a leftover "Trials"/"Reviews" Metadata chip.
  const systematicReviewMatch = query.match(/\bsystematic reviews?\b/i);
  if (systematicReviewMatch) {
    matches.push({
      label: 'Systematic Review',
      predicate: (p) => p.title.toLowerCase().includes('systematic review'),
      consumedText: systematicReviewMatch[0],
    });
  } else {
    const reviewMatch = query.match(/\breview articles?\b|\breviews?\b/i);
    if (reviewMatch) {
      matches.push({
        label: 'Review',
        predicate: (p) => p.articleType === 'Review' || p.title.toLowerCase().includes('review'),
        consumedText: reviewMatch[0],
      });
    }
  }
  const metaAnalysisMatch = query.match(/\bmeta[- ]analys[ie]s\b/i);
  if (metaAnalysisMatch) {
    matches.push({
      label: 'Meta-analysis',
      predicate: (p) => p.title.toLowerCase().includes('meta-analysis') || p.title.toLowerCase().includes('meta analysis'),
      consumedText: metaAnalysisMatch[0],
    });
  }
  const clinicalTrialMatch = query.match(/\bclinical trials?\b/i);
  if (clinicalTrialMatch) {
    matches.push({
      label: 'Clinical Trial',
      predicate: (p) => p.area === 'Clinical trials',
      consumedText: clinicalTrialMatch[0],
    });
  }

  const affiliationMatch = extractAuthorAffiliationMatch(query);
  if (affiliationMatch) {
    matches.push({
      label: affiliationMatch.value,
      predicate: (p) => p.organisations.some((o) => o.name.toLowerCase() === affiliationMatch.value.toLowerCase()),
      consumedText: affiliationMatch.consumedText,
    });
  }

  return matches;
}

/** Every organisation name actually used in this mock dataset — the
 *  catalog author-affiliation matching checks the query against, so it
 *  stays in sync automatically rather than needing its own hand-kept list. */
const KNOWN_ORGANISATIONS: string[] = Array.from(
  new Set(PUBLICATIONS.flatMap((p) => p.organisations.map((o) => o.name))),
);

/** Short aliases for a few organisations that a real query is more likely
 *  to use than their full dataset name. */
const ORG_ALIASES: Record<string, string> = {
  'j&j': 'Johnson & Johnson Vision',
  jnj: 'Johnson & Johnson Vision',
  bms: 'Bristol Myers Squibb',
  msk: 'Memorial Sloan Kettering Cancer Center',
  mskcc: 'Memorial Sloan Kettering Cancer Center',
  nci: 'National Cancer Institute',
  who: 'World Health Organization',
  ema: 'European Medicines Agency',
};

/** Recognises a known organisation named in the query — directly, or via
 *  a short alias — as an author-affiliation concept. Checked against
 *  KNOWN_ORGANISATIONS longest-name-first, so e.g. "Memorial Sloan
 *  Kettering Cancer Center" wins outright over any shorter name it
 *  happens to contain. */
function extractAuthorAffiliationMatch(query: string): { value: string; consumedText: string } | null {
  const lower = query.toLowerCase();
  for (const [alias, fullName] of Object.entries(ORG_ALIASES)) {
    const match = query.match(new RegExp(`\\b${alias}\\b`, 'i'));
    if (match) return { value: fullName, consumedText: match[0] };
  }
  const sorted = [...KNOWN_ORGANISATIONS].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (lower.includes(name.toLowerCase())) return { value: name, consumedText: name };
  }
  return null;
}

/** Recognises a DOI in the raw query text (e.g. "10.1056/NEJMoa2301842")
 *  as a "Document identifier" concept — matched exactly against the
 *  publication's own `doi` field (case-insensitive) rather than a
 *  haystack substring, since a DOI is meant to identify one specific
 *  publication, not just contribute a loose keyword. Trailing sentence
 *  punctuation (a period after the DOI, etc.) is trimmed off the match. */
function extractDocumentIdentifierMatch(query: string): { value: string; consumedText: string } | null {
  const match = query.match(/\b10\.\d{4,9}\/\S+/);
  if (!match) return null;
  const value = match[0].replace(/[.,;:]+$/, '');
  return { value, consumedText: match[0] };
}

/** Recognises a search-by-title query as a "Title" concept — either an
 *  explicitly quoted phrase, or (for a query that isn't quoted at all) an
 *  exact match against one of this dataset's own publication titles.
 *  Matched against the publication's `title` field specifically (not the
 *  full haystack), so a title search can't accidentally hit on an
 *  unrelated field. */
function extractTitleMatch(query: string): { value: string; consumedText: string } | null {
  const quoted = query.match(/"([^"]{8,})"/);
  if (quoted) return { value: quoted[1], consumedText: quoted[0] };
  const trimmed = query.trim().replace(/^"+|"+$/g, '');
  const exact = PUBLICATIONS.find((p) => p.title.toLowerCase() === trimmed.toLowerCase());
  if (exact) return { value: exact.title, consumedText: query.trim() };
  return null;
}

interface PendingClarification {
  disease: string;
  question: string;
  options: { key: string; label: string }[];
  broadLabel: string;
}

/** Which specific option (or 'broad') the user picked for an ambiguous
 *  disease — tied to one committed search; reset whenever a new query is
 *  committed (see the page component's handleFindPublications), so the same
 *  clarification question is never silently skipped for a genuinely new
 *  search, per "don't ask again unless the user changes their search." */
export interface ClarificationResolution {
  disease: string;
  optionKey: string;
}

/** One concept interpreted from the query, active or removed. `key` is
 *  stable across renders (used both as the React list key and as the
 *  identity tracked in `removedConceptKeys`, see the page component) —
 *  `${category}:${label}`, since labels are already deduped within a
 *  category by interpretQuery. `term` is what actually drives search
 *  matching (see computeConceptState's `matchOrTerms`); it's null for
 *  concepts that match on a structured field via `predicate` instead, or
 *  that are purely informational (never search terms in the first place).
 *  `removed` marks a concept the user took out of their active search via
 *  its chip's × — it still appears here (and in Query details) so it's
 *  never lost from view, just excluded from the active category boxes and
 *  from matching; see InterpretedConceptsBanner and Undo. */
interface DisplayConcept {
  key: string;
  category: string;
  label: string;
  term: string | null;
  /** Set for concepts that match on the publication's actual fields
   *  (Metadata, Document identifier, Title) rather than a text term; see
   *  ConceptState.matchPredicates. */
  predicate?: (p: SearchPublication) => boolean;
  removed: boolean;
}

interface ConceptState {
  /** Every concept interpreted from the query, active or removed, in
   *  display order, ready to group — see DisplayConcept.removed. The
   *  active category boxes and Query details both derive from this same
   *  list, just filtering differently (see InterpretedConceptsBanner). */
  allConcepts: DisplayConcept[];
  pendingClarification: PendingClarification | null;
  /** Extra AND-filter term once a specific sub-category is resolved (either
   *  directly from the query, or via clarification) — see filterPublications. */
  filterQualifier: string | null;
  /** OR-match terms actually used to search — one per surviving (non-removed)
   *  concept that has one. Removing a concept drops its term from here, so
   *  the search updates immediately; see filterPublications. */
  matchOrTerms: string[];
  /** AND-narrowing structured filters — one per surviving concept that
   *  matches on a field instead of a text term (see FilterOptions.predicates). */
  matchPredicates: Array<(p: SearchPublication) => boolean>;
}

function conceptKey(category: string, label: string): string {
  return `${category}:${label}`;
}

/** Identity for a synonym that's been promoted from the Query details list
 *  into its own removable chip in the parent concept's category box (see
 *  the page component's addedSynonyms/handleAddSynonym). Uses a `|||`
 *  separator rather than `:` since `parentKey` itself already contains one
 *  (conceptKey's own "${category}:${label}" format). */
function synonymConceptKey(parentKey: string, synonym: string): string {
  return `Synonym|||${parentKey}|||${synonym}`;
}

function parseSynonymConceptKey(key: string): { parentKey: string; synonym: string } | null {
  if (!key.startsWith('Synonym|||')) return null;
  const [, parentKey, synonym] = key.split('|||');
  return { parentKey, synonym };
}

/** One entry in the page component's undoStack — records how to *reverse*
 *  a single concept/synonym edit, in the order those edits were made, so
 *  repeated Undo clicks step back through them one at a time. Each variant
 *  is the inverse of the edit that pushed it:
 *  - a concept's × (handleRemoveConcept, non-synonym branch) pushes
 *    'restoreConcept' — undo un-removes it, restoring both the chip and
 *    (for concepts with a search term) its contribution to matching.
 *  - a Query details synonym click (handleAddSynonym) pushes
 *    'removeAddedSynonym' — undo takes it back out of the category box and
 *    returns it to the synonyms list.
 *  - a synonym chip's × (handleRemoveConcept, synonym branch) pushes
 *    'restoreRemovedSynonym' — undo re-adds it as a chip.
 *  - adding a concept via the Custom section's search (handleAddCustomConcept)
 *    pushes 'removeCustomConcept' — undo deletes it outright rather than
 *    marking it removed, since it never existed until this add; removing
 *    an *existing* Custom chip via its own × still goes through the
 *    ordinary 'restoreConcept' case above. */
type UndoStep =
  | { kind: 'restoreConcept'; key: string }
  | { kind: 'removeAddedSynonym'; parentKey: string; synonym: string }
  | { kind: 'restoreRemovedSynonym'; parentKey: string; synonym: string }
  | { kind: 'removeCustomConcept'; label: string };

/** Single source of truth for query interpretation + search clarification:
 *  finds the query's matched concepts, decides whether its disease (if any)
 *  needs clarification, and resolves it using either the query's own
 *  wording or the user's stored choice. Used by the page component both to
 *  narrow the actual search (matchOrTerms/filterQualifier) and to drive the
 *  banner/clarification panel (the rest), so the two can never disagree.
 *
 *  Any significant query word not covered by a recognised dictionary
 *  pattern, or by Document identifier/Title extraction, is surfaced
 *  as its own "Metadata" concept rather than silently dropped — an honest
 *  "I don't know what more specific category this is" rather than
 *  guessing/inventing one, just without a dedicated category of its own.
 *  `removedConceptKeys` lets the user hide (and, for search-affecting
 *  concepts, un-match) individual concepts one at a time — every concept
 *  is still returned here regardless (see DisplayConcept.removed), so
 *  Query details can keep showing what was originally interpreted. */
function computeConceptState(
  query: string,
  resolution: ClarificationResolution | null,
  removedConceptKeys: Set<string>,
  addedSynonyms: Record<string, string[]>,
  customConcepts: CatalogConcept[],
): ConceptState {
  const matches = interpretQuery(query);
  const documentIdentifierMatch = extractDocumentIdentifierMatch(query);
  const titleMatch = extractTitleMatch(query);
  // Scrubbed so a digit sequence inside an already-recognised DOI or
  // title (e.g. the "2045" inside "10.1016/S1470-2045(23)00142-9") can't
  // also be misread as an unrelated year/date-range or publication-type
  // match — dictionary matching above deliberately still runs on the
  // original `query`, so a recognisable drug/disease word inside a quoted
  // title is still surfaced as its own concept.
  let metadataSourceQuery = query;
  if (documentIdentifierMatch) metadataSourceQuery = metadataSourceQuery.replace(documentIdentifierMatch.consumedText, ' ');
  if (titleMatch) metadataSourceQuery = metadataSourceQuery.replace(titleMatch.consumedText, ' ');
  const metadataMatches = extractMetadataMatches(metadataSourceQuery);
  const primaryDisease = matches.find((m) => m.category === 'Disease / Indication')?.label ?? null;

  let indication: string | null = null;
  let filterQualifier: string | null = null;
  let pendingClarification: PendingClarification | null = null;
  // Which of the query's own words directly named the resolved sub-option
  // (e.g. "castration-resistant") — only set on a direct match, since a
  // clarification-panel answer resolves a sub-option the raw query never
  // actually said. Folded into consumedWords below so that phrase doesn't
  // also turn up as a leftover "Metadata" concept.
  let qualifierConsumedText: string | null = null;

  if (primaryDisease) {
    const config = AMBIGUOUS_DISEASES[primaryDisease];
    const directOption = config ? matchedQualifierOption(query, config) : null;
    if (directOption) {
      // Already specific in the query itself — resolve directly, no prompt.
      indication = directOption.indication;
      filterQualifier = directOption.qualifiers[0];
      const lower = query.toLowerCase();
      qualifierConsumedText = directOption.qualifiers.find((q) => lower.includes(q)) ?? null;
    } else if (config) {
      const active = resolution && resolution.disease === primaryDisease ? resolution : null;
      if (active?.optionKey === 'broad') {
        // Preserves the broader intent — deliberately no narrower indication.
        indication = null;
      } else if (active) {
        const opt = config.options.find((o) => o.key === active.optionKey);
        indication = opt?.indication ?? null;
        filterQualifier = opt?.qualifiers[0] ?? null;
      } else {
        pendingClarification = {
          disease: primaryDisease,
          question: config.question,
          options: config.options.map((o) => ({ key: o.key, label: o.label })),
          broadLabel: config.broadLabel,
        };
      }
    }
  }

  // Every word a matched dictionary pattern, or a Document identifier/Title/
  // Date/type match, accounts for — whatever's left over from the query's
  // own significant words becomes a "Metadata" concept, one per leftover
  // word, rather than a fabricated category.
  const consumedWords = new Set<string>();
  for (const m of matches) significantTerms(m.pattern).forEach((w) => consumedWords.add(w));
  for (const m of metadataMatches) significantTerms(m.consumedText).forEach((w) => consumedWords.add(w));
  if (qualifierConsumedText) significantTerms(qualifierConsumedText).forEach((w) => consumedWords.add(w));
  if (documentIdentifierMatch) significantTerms(documentIdentifierMatch.consumedText).forEach((w) => consumedWords.add(w));
  if (titleMatch) significantTerms(titleMatch.consumedText).forEach((w) => consumedWords.add(w));
  const otherWords = significantTerms(query).filter((w) => !consumedWords.has(w));

  // Pushes every concept regardless of removedConceptKeys — `removed`
  // records whether this one is currently active, but nothing is ever
  // left out of the returned list, so Query details can still show it
  // (see the doc comment above and InterpretedConceptsBanner).
  const allConcepts: DisplayConcept[] = [];
  for (const m of matches) {
    const key = conceptKey(m.category, m.label);
    const removed = removedConceptKeys.has(key);
    allConcepts.push({ key, category: m.category, label: m.label, term: m.pattern, removed });
    // A synonym the user has activated from this concept's Query details
    // list joins the same category as its own removable chip — see
    // synonymConceptKey/handleAddSynonym. Its presence in `addedSynonyms`
    // *is* the toggle: removing the chip deletes it from that list
    // (returning it to Query details) rather than adding to
    // removedConceptKeys, which would have no way back — so unlike every
    // other push here, there's no separate removed state to track.
    if (!removed) {
      for (const syn of addedSynonyms[key] ?? []) {
        allConcepts.push({ key: synonymConceptKey(key, syn), category: m.category, label: syn, term: syn, removed: false });
      }
    }
  }
  if (documentIdentifierMatch) {
    const key = conceptKey('Document identifier', documentIdentifierMatch.value);
    allConcepts.push({
      key, category: 'Document identifier', label: documentIdentifierMatch.value, term: null,
      predicate: (p) => p.doi.toLowerCase() === documentIdentifierMatch.value.toLowerCase(),
      removed: removedConceptKeys.has(key),
    });
  }
  if (titleMatch) {
    const key = conceptKey('Title', titleMatch.value);
    allConcepts.push({
      key, category: 'Title', label: titleMatch.value, term: null,
      predicate: (p) => p.title.toLowerCase().includes(titleMatch.value.toLowerCase()),
      removed: removedConceptKeys.has(key),
    });
  }
  for (const m of metadataMatches) {
    const key = conceptKey('Metadata', m.label);
    allConcepts.push({ key, category: 'Metadata', label: m.label, term: null, predicate: m.predicate, removed: removedConceptKeys.has(key) });
  }
  for (const w of otherWords) {
    const label = w[0].toUpperCase() + w.slice(1);
    const key = conceptKey('Metadata', label);
    allConcepts.push({ key, category: 'Metadata', label, term: w, removed: removedConceptKeys.has(key) });
  }
  if (indication) {
    const key = conceptKey('Disease / Indication', indication);
    allConcepts.push({ key, category: 'Disease / Indication', label: indication, term: null, removed: removedConceptKeys.has(key) });
  }
  // Manually added via the Custom section's search (see CustomConceptSearch)
  // — appended last so Custom reads as an extension of the query's own
  // interpreted concepts rather than mixed in among them. Gated by
  // removedConceptKeys exactly like every other concept, so its chip's ×
  // (and Undo) work through the same existing mechanism, no special case.
  for (const c of customConcepts) {
    const key = conceptKey('Custom', c.label);
    allConcepts.push({ key, category: 'Custom', label: c.label, term: c.term, removed: removedConceptKeys.has(key) });
  }

  const active = allConcepts.filter((c) => !c.removed);
  const matchOrTerms = active.filter((c) => c.term).map((c) => c.term!.toLowerCase());
  const matchPredicates = active.filter((c) => c.predicate).map((c) => c.predicate!);

  return { allConcepts, pendingClarification, filterQualifier, matchOrTerms, matchPredicates };
}

/** One extracted concept's value, pill-styled, with a small × so the user
 *  can remove it individually — removal both hides the chip and (for
 *  concepts that have a search `term`) drops it from matching, updating
 *  results immediately; see the page component's removedConceptKeys.
 *  The label is capped to a fixed width with an ellipsis — long values
 *  (a Document identifier, a full Title, an unusually long Custom concept)
 *  truncate rather than force the chip (and its category box) to grow
 *  unpredictably or wrap onto a second line; a Tooltip on hover always
 *  reveals the untruncated value, whether or not it actually got cut off. */
function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      flexShrink: 0,
      bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
      border: '1px solid',
      borderColor: (t) => alpha(t.palette.primary.main, 0.24),
      borderRadius: '6px',
      pl: 1.25,
      pr: 0.75,
      py: 0.5,
    }}>
      <Tooltip title={label} enterDelay={400} slotProps={tooltipSlotProps}>
        <Typography sx={{
          fontSize: 13, fontWeight: 600, color: 'primary.main', letterSpacing: '-0.01em',
          maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </Typography>
      </Tooltip>
      <Box
        role="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          color: (t) => alpha(t.palette.primary.main, 0.55),
          '&:hover': { color: 'primary.main' },
        }}
      >
        <X size={11} />
      </Box>
    </Box>
  );
}

/** Inline cap per category box — beyond this, concepts move into the
 *  "Show N more" flyout rather than crowding the banner. */
const MAX_VISIBLE_CONCEPTS_PER_CATEGORY = 3;

/** One category's box — its label plus up to MAX_VISIBLE_CONCEPTS_PER_CATEGORY
 *  of its extracted concepts as removable chips. A real box (border, own
 *  background) rather than a bare label + row of standalone chips, so each
 *  category reads as one discrete, scannable unit. */
function CategoryBox({
  category,
  concepts,
  onRemove,
  onShowMore,
  footer,
}: {
  category: string;
  concepts: DisplayConcept[];
  onRemove: (key: string) => void;
  onShowMore: () => void;
  /** Extra content rendered below the chip row, inside the same box — used
   *  by the Custom category's inline search (see CustomConceptSearch) so
   *  it inherits this exact shell/spacing rather than a separate one. */
  footer?: ReactNode;
}) {
  const visible = concepts.slice(0, MAX_VISIBLE_CONCEPTS_PER_CATEGORY);
  const overflow = concepts.length - MAX_VISIBLE_CONCEPTS_PER_CATEGORY;
  return (
    <Box sx={{
      bgcolor: '#fff',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: '10px',
      px: 1.5,
      py: 1.25,
      display: 'flex',
      flexDirection: 'column',
      gap: 0.75,
      minWidth: 0,
    }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.disabled', whiteSpace: 'nowrap' }}>
        {category}
      </Typography>
      {concepts.length > 0 ? (
        // nowrap — combined with each chip's own fixed-width truncation
        // (see RemovableChip), this box stays exactly one line tall
        // regardless of how many concepts it holds or how long their
        // labels are, rather than wrapping onto a second line.
        <Box sx={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 0.75 }}>
          {visible.map((c) => <RemovableChip key={c.key} label={c.label} onRemove={() => onRemove(c.key)} />)}
          {overflow > 0 ? (
            <Box
              role="button"
              onClick={onShowMore}
              sx={{
                fontSize: 12, fontWeight: 600, color: 'primary.main', cursor: 'pointer',
                flexShrink: 0, whiteSpace: 'nowrap', '&:hover': { color: '#3d4891' },
              }}
            >
              Show {overflow} more
            </Box>
          ) : null}
        </Box>
      ) : null}
      {footer}
    </Box>
  );
}

/** Opened via a category box's "Show N more" — every concept in that one
 *  category, each still removable the same way as the inline chips, so
 *  trimming a long tail (e.g. many "Metadata" leftovers) doesn't require
 *  cramming them all into the banner itself. */
/** Opened via the Custom category box's "Show N more" specifically — same
 *  flyout shell as every other category (see CategoryMoreFlyout), just
 *  with a fuller header (a real title + a dynamic count, rather than the
 *  bare uppercase category label) and its own "add a concept" search and
 *  "Clear all" beneath the chips, since Custom is the one category whose
 *  members are user-managed rather than purely interpreted from the query. */
function CustomFlyoutHeader({ count }: { count: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'text.primary' }}>
        Interpreted concepts
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', letterSpacing: '-0.01em' }}>
        {count > 0 ? `${count} custom concept${count === 1 ? '' : 's'} added to this search` : 'No custom concepts added'}
      </Typography>
    </Box>
  );
}

function CategoryMoreFlyout({
  open,
  category,
  concepts,
  onRemove,
  onClose,
  activeConcepts,
  onAddCustomConcept,
  onClearAllCustom,
}: {
  open: boolean;
  category: string | null;
  concepts: DisplayConcept[];
  onRemove: (key: string) => void;
  onClose: () => void;
  /** Every currently-active concept across all categories — only used to
   *  drive the Custom flyout's own "add a concept" search (see
   *  CustomConceptSearch), which needs the full picture to avoid
   *  re-suggesting something already shown elsewhere in the banner. */
  activeConcepts: DisplayConcept[];
  onAddCustomConcept: (option: CatalogConcept) => void;
  onClearAllCustom: () => void;
}) {
  const isCustom = category === 'Custom';
  return (
    // zIndex overrides MUI's default theme.zIndex.drawer (1200) — the
    // fixed slim search bar (1300) and its docked capsule (1301) both sit
    // above that, so without this override the flyout renders underneath
    // them instead of over them.
    <Drawer anchor="right" open={open} onClose={onClose} sx={{ zIndex: 1400 }} slotProps={{ paper: { sx: { width: 340 } } }}>
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          {isCustom ? (
            <CustomFlyoutHeader count={concepts.length} />
          ) : (
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.disabled' }}>
              {category}
            </Typography>
          )}
          <Box
            role="button"
            aria-label="Close"
            onClick={onClose}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'text.secondary', flexShrink: 0,
              '&:hover': { color: 'text.primary' },
            }}
          >
            <X size={16} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {concepts.map((c) => <RemovableChip key={c.key} label={c.label} onRemove={() => onRemove(c.key)} />)}
          </Box>
          {isCustom ? (
            <>
              <CustomConceptSearch
                concepts={activeConcepts}
                onAdd={onAddCustomConcept}
                placeholder="Search or add a concept..."
              />
              {concepts.length > 0 ? (
                <Box
                  role="button"
                  aria-label="Clear all custom concepts"
                  onClick={onClearAllCustom}
                  sx={{
                    fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em',
                    color: 'text.disabled', cursor: 'pointer', alignSelf: 'flex-start',
                    '&:hover': { color: 'text.secondary' },
                  }}
                >
                  Clear all
                </Box>
              ) : null}
            </>
          ) : null}
        </Box>
      </Box>
    </Drawer>
  );
}

/** Groups a flat concept list by category, preserving each category's
 *  first-seen order, so multiple concepts of the same type (e.g. two drugs)
 *  land together in one CategoryBox instead of one box per concept. */
function groupConceptsByCategory(concepts: DisplayConcept[]): { category: string; concepts: DisplayConcept[] }[] {
  const order: string[] = [];
  const byCategory = new Map<string, DisplayConcept[]>();
  for (const c of concepts) {
    if (!byCategory.has(c.category)) {
      byCategory.set(c.category, []);
      order.push(c.category);
    }
    byCategory.get(c.category)!.push(c);
  }
  return order.map((category) => ({ category, concepts: byCategory.get(category)! }));
}

/** Ranks CONCEPT_CATALOG entries not already shown anywhere in the banner
 *  for the empty-input "top 5 related" suggestions — concepts from
 *  categories the query already touched (e.g. another Drug, once one's
 *  already matched) surface first, on the theory that they're more likely
 *  relevant than an arbitrary unrelated one; the rest fill any remaining
 *  slots in catalog order. */
function relatedCatalogSuggestions(
  excludeLabels: Set<string>,
  presentCategories: Set<string>,
  limit: number,
): CatalogConcept[] {
  const available = CONCEPT_CATALOG.filter((c) => !excludeLabels.has(c.label));
  const prioritized = available.filter((c) => presentCategories.has(c.category));
  const rest = available.filter((c) => !presentCategories.has(c.category));
  return [...prioritized, ...rest].slice(0, limit);
}

/** Inline "add a concept" control that lives inside the Custom category
 *  box (see InterpretedConceptsBanner) — a compact search rather than a
 *  modal, since adding one concept shouldn't feel like leaving the banner.
 *  Suggestions are computed from `concepts` (the banner's current, live
 *  display list) so anything already shown — matched from the query,
 *  added as a synonym, or already added here — never re-offers itself. */
function CustomConceptSearch({
  concepts,
  onAdd,
  placeholder = 'Add a concept...',
}: {
  concepts: DisplayConcept[];
  onAdd: (option: CatalogConcept) => void;
  /** Defaults to the banner's own copy — the Custom flyout (see
   *  CategoryMoreFlyout) passes a slightly fuller "Search or add a
   *  concept..." instead, without needing a second component. */
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState('');
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const excludeLabels = useMemo(() => new Set(concepts.map((c) => c.label)), [concepts]);
  const presentCategories = useMemo(
    () => new Set(concepts.filter((c) => c.category !== 'Custom').map((c) => c.category)),
    [concepts],
  );

  const query = inputValue.trim().toLowerCase();
  const options = query
    ? CONCEPT_CATALOG.filter((c) => !excludeLabels.has(c.label) && c.label.toLowerCase().includes(query)).slice(0, 8)
    : relatedCatalogSuggestions(excludeLabels, presentCategories, 5);

  const handleAdd = (option: CatalogConcept) => {
    onAdd(option);
    setInputValue('');
    // Stays open and focused (rather than closing) — options recompute
    // against the newly-updated `concepts` on the next render, so adding
    // several concepts in a row doesn't need refocusing each time.
    inputRef.current?.focus();
  };

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box ref={anchorRef} sx={{ mt: 0.25 }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          bgcolor: (t) => alpha(t.palette.text.primary, 0.03),
          border: '1px solid', borderColor: 'divider', borderRadius: '6px',
          px: 1, py: 0.25,
        }}>
          <MagnifyingGlass size={13} color="#8d96a5" style={{ flexShrink: 0 }} />
          <OutlinedInput
            inputRef={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            fullWidth
            sx={{
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '& .MuiOutlinedInput-input': { py: '3px', px: 0, fontSize: 12, letterSpacing: '-0.01em' },
            }}
          />
        </Box>
        <Popper
          open={open && options.length > 0}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          // 1450 — above the Custom flyout's own Drawer (zIndex 1400, see
          // CategoryMoreFlyout), since this same search now also renders
          // inside that flyout; still comfortably above the fixed slim
          // search bar (1300/1301) for its original inline use in the
          // main banner.
          style={{ zIndex: 1450, width: 220 }}
        >
          <Box sx={{
            mt: 0.5, bgcolor: '#fff', border: '1px solid', borderColor: 'divider',
            borderRadius: '8px', boxShadow: '0 4px 16px rgba(20, 24, 32, 0.12)',
            py: 0.5, maxHeight: 240, overflowY: 'auto',
          }}>
            {!query ? (
              <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.disabled', px: 1.5, py: 0.5 }}>
                Suggested
              </Typography>
            ) : null}
            {options.map((opt) => (
              <Box
                key={opt.label}
                role="button"
                aria-label={`Add ${opt.label}`}
                // Fires before the input's onBlur, so the dropdown doesn't
                // close (and the click target vanish) before onClick runs.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAdd(opt)}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
                  px: 1.5, py: 0.75, cursor: 'pointer',
                  '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
                }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em' }}>
                  {opt.label}
                </Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  {opt.category}
                </Typography>
              </Box>
            ))}
          </Box>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

/** One synonym still available to add, shown as a small tick-icon chip in
 *  Query details — clicking it promotes the synonym into its parent
 *  concept's category box above as its own active, removable chip (see
 *  the page component's handleAddSynonym), immediately re-running search. */
function SynonymOption({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box
      role="button"
      aria-label={`Add ${label} to the query`}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        bgcolor: '#fff',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '6px',
        px: 1,
        py: 0.375,
        cursor: 'pointer',
        '&:hover': { borderColor: (t) => alpha(t.palette.primary.main, 0.4), bgcolor: (t) => alpha(t.palette.primary.main, 0.05) },
      }}
    >
      <Check size={11} weight="bold" color="#8d96a5" />
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: 'text.secondary', letterSpacing: '-0.01em' }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Small muted pill marking a concept that's no longer active in the
 *  search — Query details keeps showing it (rather than dropping it from
 *  view entirely) so the user can always see what was originally
 *  interpreted; Undo (in the banner header) is how it comes back. */
function RemovedBadge() {
  return (
    <Typography sx={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: 'text.disabled', bgcolor: (t) => alpha(t.palette.text.disabled, 0.12),
      borderRadius: '4px', px: 0.75, py: 0.125, flexShrink: 0,
    }}>
      Removed
    </Typography>
  );
}

/** "View query details" expanded-state row for one concept — no internal
 *  IDs or boolean/technical search-term detail anymore, just the concept's
 *  name and (for concepts with one) its available synonyms; visually
 *  secondary (small, muted) to the human-readable pills above, and only
 *  shown once the user opts in. Category isn't repeated per row here — the
 *  group heading above it (see InterpretedConceptsBanner) already says so.
 *  Synonym-derived concepts (promoted via SynonymOption below) don't get
 *  their own row here — see InterpretedConceptsBanner's filter. A removed
 *  concept shows a muted, struck-through name and a "Removed" badge
 *  instead of its synonyms — adding a synonym to something no longer in
 *  the active search wouldn't make sense. The label is truncated with a
 *  Tooltip reveal, same as the chips above, since this row has no fixed
 *  width limit of its own but a Custom-added value could still be
 *  arbitrarily long. */
function ConceptDetailRow({
  label,
  removed,
  addedSynonyms,
  onAddSynonym,
}: {
  label: string;
  removed: boolean;
  addedSynonyms: string[];
  onAddSynonym: (synonym: string) => void;
}) {
  const availableSynonyms = removed ? [] : (CONCEPT_SYNONYMS[label] ?? []).filter((s) => !addedSynonyms.includes(s));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Tooltip title={label} enterDelay={400} slotProps={tooltipSlotProps}>
          <Typography sx={{
            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3,
            color: removed ? 'text.disabled' : 'text.primary',
            textDecoration: removed ? 'line-through' : 'none',
            maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {label}
          </Typography>
        </Tooltip>
        {removed ? <RemovedBadge /> : null}
      </Box>
      {availableSynonyms.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.25 }}>
          <Typography sx={{ fontSize: 12, color: 'text.disabled', letterSpacing: '-0.01em' }}>
            Synonyms — click to add to the query:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {availableSynonyms.map((s) => (
              <SynonymOption key={s} label={s} onClick={() => onAddSynonym(s)} />
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

/** Sits directly above the publication list once a search is committed —
 *  same tinted-info visual language as BooleanInfoBar (primary at 6%
 *  opacity, rounded, no border), just reporting the mock-interpreted
 *  concepts grouped by category instead of carrying static copy. Read-only:
 *  these aren't editable search filters, just Compass's own summary of
 *  what it understood from the query (which stays visible, unchanged,
 *  in the search bar itself).
 *
 *  "Unfold query" (collapsed by default) reveals the underlying synonyms/
 *  search-terms/OCIDs behind each concept — technical detail kept hidden
 *  until the user explicitly asks to verify the interpretation, per "hide
 *  raw synonyms and OCIDs by default." */
function InterpretedConceptsBanner({
  query,
  concepts,
  onRemoveConcept,
  addedSynonyms,
  onAddSynonym,
  canUndo,
  onUndo,
  onAddCustomConcept,
  onClearAllCustom,
}: {
  query: string;
  concepts: DisplayConcept[];
  onRemoveConcept: (key: string) => void;
  addedSynonyms: Record<string, string[]>;
  onAddSynonym: (parentKey: string, synonym: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onAddCustomConcept: (option: CatalogConcept) => void;
  onClearAllCustom: () => void;
}) {
  const [unfolded, setUnfolded] = useState(false);
  // Which category's "Show N more" flyout is open, if any — purely a local
  // display concern (unlike removal, which must persist in page state so
  // computeConceptState sees it on every recompute).
  const [moreFlyoutCategory, setMoreFlyoutCategory] = useState<string | null>(null);
  // `concepts` (the prop) is the *full* history — active and removed alike
  // (see DisplayConcept.removed) — so the active category boxes below
  // filter down to just the active ones, while Query details further down
  // uses the unfiltered prop directly, so a removed concept keeps showing
  // there instead of disappearing.
  const activeConcepts = useMemo(() => concepts.filter((c) => !c.removed), [concepts]);
  const groups = useMemo(() => groupConceptsByCategory(activeConcepts), [activeConcepts]);
  // Custom gets its own dedicated, always-rendered box below (see JSX) so
  // its "add a concept" search is a stable, visible entry point even
  // before anything's been added — unlike the other categories, which only
  // appear once the query actually produced a concept for them.
  const interpretedGroups = groups.filter((g) => g.category !== 'Custom');
  const flyoutGroup = groups.find((g) => g.category === moreFlyoutCategory) ?? null;
  const customConcepts = activeConcepts.filter((c) => c.category === 'Custom');
  // Query details shows one row per *originally matched/derived* concept,
  // active or removed — a synonym promoted from that row into its own chip
  // (see SynonymOption) doesn't get a second, redundant row of its own.
  // Grouped by category (same grouping as the active boxes above) so a
  // removed concept still shows up under its original category heading
  // rather than in some undifferentiated flat list.
  const detailGroups = useMemo(
    () => groupConceptsByCategory(concepts.filter((c) => parseSynonymConceptKey(c.key) === null)),
    [concepts],
  );

  return (
    <Box sx={{
      // Same background treatment as ClarificationPanel (alpha(primary,0.06))
      // so the two read as one component family — everything else here
      // (radius, border-less, typography) is unchanged.
      bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
      borderRadius: '10px',
      px: 2.5,
      py: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 1.25,
      // Sits directly after the reserved slim-bar spacer (see the page
      // component); this pulls it 30% closer to that spacer than the
      // column's own shared `gap` (32px) would otherwise leave it, without
      // touching that gap (which also spaces unrelated siblings below).
      mt: '-9.6px',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary', letterSpacing: '-0.01em' }}>
            Interpreted concepts for:
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em' }}>
            "{query}"
          </Typography>
        </Box>

        {/* `concepts.length` (the full history, active and removed alike)
            covers the fold toggle: even once every concept is removed,
            there's still something worth viewing in Query details. `canUndo`
            covers Undo separately, for the one case that history can't:
            before a search is even committed, when there's no history yet. */}
        {canUndo || concepts.length > 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flexShrink: 0 }}>
            {/* Steps back through the user's concept/synonym edits one at a
                time (see the page component's undoStack) — hidden entirely
                rather than shown disabled once there's nothing left to
                revert, per "hide Undo when there are no changes." Muted
                text.disabled (rather than the toggle's primary.main) keeps
                it visually secondary to the query content, only darkening
                on hover to confirm it's interactive. */}
            {canUndo ? (
              <Box
                role="button"
                aria-label="Undo last query change"
                onClick={onUndo}
                sx={{
                  fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
                  color: 'text.disabled', cursor: 'pointer',
                  '&:hover': { color: 'text.secondary' },
                }}
              >
                Undo
              </Box>
            ) : null}
            {concepts.length > 0 ? (
              <Box
                role="button"
                onClick={() => setUnfolded((v) => !v)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  cursor: 'pointer',
                  // primary.main (not text.secondary) — text.secondary's ~3.8:1
                  // contrast against this tinted background falls short of the
                  // 4.5:1 AA minimum for text this size; primary.main clears
                  // ~4.9:1 while staying within the banner's existing palette
                  // (already used for the concept pills below). Hover darkens
                  // to the same shade already used for button hovers elsewhere
                  // in this file, rather than introducing a new colour.
                  color: 'primary.main',
                  '&:hover': { color: '#3d4891' },
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                  {unfolded ? 'Hide query details' : 'View query details'}
                </Typography>
                {unfolded ? <CaretUp size={12} /> : <CaretDown size={12} />}
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>

      {interpretedGroups.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', letterSpacing: '-0.01em' }}>
          No specific concepts recognised — showing broad results for this query.
        </Typography>
      ) : null}

      {/* Wraps to as many lines as needed for the common case; capped and
          scrollable only as a safety net against a pathologically large
          number of recognised categories, so the banner itself never grows
          unbounded. Custom is always rendered here too — even with nothing
          added yet — so its search stays a visible, stable entry point
          rather than something that only appears after a first add. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.25, maxHeight: 220, overflowY: 'auto' }}>
        {interpretedGroups.map((g) => (
          <CategoryBox
            key={g.category}
            category={g.category}
            concepts={g.concepts}
            onRemove={onRemoveConcept}
            onShowMore={() => setMoreFlyoutCategory(g.category)}
          />
        ))}
        <CategoryBox
          category="Custom"
          concepts={customConcepts}
          onRemove={onRemoveConcept}
          onShowMore={() => setMoreFlyoutCategory('Custom')}
          footer={<CustomConceptSearch concepts={activeConcepts} onAdd={onAddCustomConcept} />}
        />
      </Box>

      {unfolded ? (
        <Box sx={{
          display: 'flex', flexDirection: 'column', gap: 1.5,
          pt: 1.25, mt: 0.25, borderTop: '1px solid',
          borderColor: (t) => alpha(t.palette.primary.main, 0.15),
        }}>
          {detailGroups.map((g) => (
            <Box key={g.category} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* Same uppercase small-caption style as each CategoryBox's
                  own header above, so Query details reads as the same
                  category structure just in more detail, not a separate
                  system. */}
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.disabled' }}>
                {g.category}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {g.concepts.map((c) => (
                  <ConceptDetailRow
                    key={c.key}
                    label={c.label}
                    removed={c.removed}
                    addedSynonyms={addedSynonyms[c.key] ?? []}
                    onAddSynonym={(synonym) => onAddSynonym(c.key, synonym)}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}

      <CategoryMoreFlyout
        open={moreFlyoutCategory !== null}
        category={moreFlyoutCategory}
        concepts={flyoutGroup?.concepts ?? []}
        onRemove={onRemoveConcept}
        onClose={() => setMoreFlyoutCategory(null)}
        activeConcepts={activeConcepts}
        onAddCustomConcept={onAddCustomConcept}
        onClearAllCustom={onClearAllCustom}
      />
    </Box>
  );
}

/** One selectable sub-category option within the Clarification Required
 *  panel — an outlined card rather than the panel's own filled broad-search
 *  button, so the two read as distinct actions (see ClarificationPanel). */
function ClarificationOptionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box
      role="button"
      onClick={onClick}
      sx={{
        flex: '1 1 240px',
        bgcolor: '#fff',
        border: '1px solid',
        borderColor: (t) => alpha(t.palette.primary.main, 0.3),
        borderRadius: '10px',
        px: 2,
        py: 1.5,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.1)}`,
        },
      }}
    >
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em' }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Compact, non-modal "Clarification Required" panel — sits between the
 *  Interpreted Concepts banner and the publication list, only while the
 *  active disease is ambiguous and unresolved (see computeConceptState).
 *  Results are already showing (broadly) beneath it; picking an option
 *  narrows them rather than gating them, so this never blocks the page. */
function ClarificationPanel({
  question,
  options,
  broadLabel,
  onSelectOption,
  onSelectBroad,
}: {
  question: string;
  options: { key: string; label: string }[];
  broadLabel: string;
  onSelectOption: (key: string) => void;
  onSelectBroad: () => void;
}) {
  return (
    <Box sx={{
      bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
      border: '1px solid',
      borderColor: (t) => alpha(t.palette.primary.main, 0.35),
      borderRadius: '12px',
      p: 2.5,
      display: 'flex',
      flexDirection: 'column',
      gap: 1.5,
      // This panel always sits between the Interpreted Concepts banner and
      // the "Publications found" heading (see the page component), so its
      // own margins are the simplest way to retune just those two gaps
      // without touching the column's shared `gap` (which also spaces
      // other, unrelated siblings). mt pulls it closer to the banner above;
      // mb adds clear separation before the results heading below.
      mt: '-16px',
      mb: '24px',
    }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'primary.main', letterSpacing: '-0.01em' }}>
        Clarification Required
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', letterSpacing: '-0.01em', lineHeight: 1.5 }}>
        {question}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
        {options.map((o) => (
          <ClarificationOptionButton key={o.key} label={o.label} onClick={() => onSelectOption(o.key)} />
        ))}
      </Box>
      {/* Filled/primary, visually distinct from the outlined specific
          options above — the explicit fallback that keeps every relevant
          publication in view rather than narrowing to one sub-category. */}
      <Button
        onClick={onSelectBroad}
        disableElevation
        sx={{
          alignSelf: 'flex-start',
          bgcolor: 'primary.main',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          borderRadius: '10px',
          px: 2.5,
          py: 1.1,
          textTransform: 'none',
          '&:hover': { bgcolor: '#3d4891' },
        }}
      >
        {broadLabel}
      </Button>
    </Box>
  );
}

/** ~2s interstitial shown in the results area while a committed search
 *  "runs" — see the page component's handleFindPublications. */
function FindingPublicationsLoader() {
  return (
    <Box sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: '12px', bgcolor: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 2, py: 10,
    }}>
      <CircularProgress size={28} sx={{ color: 'primary.main' }} />
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em' }}>
        Finding publications...
      </Typography>
    </Box>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PublicationSearchPage() {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('citations');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const mainRef = useRef<HTMLDivElement>(null);

  // Committing a search from the main search bar navigates away to a
  // dedicated results view (see ResultsView) rather than updating the
  // landing preview in place — `phase` tracks that view, `committedQuery`
  // freezes the query it was run for so further edits to the (still-visible)
  // search field don't change the results until the user searches again.
  const [phase, setPhase] = useState<'landing' | 'loading' | 'results'>('landing');
  const [committedQuery, setCommittedQuery] = useState('');
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Which sub-category choice (or 'broad') the user picked for the current
  // committed query's ambiguous disease, if any — see computeConceptState.
  // Reset on every new commit so a changed search is always re-evaluated
  // fresh, per "don't ask the same clarification question again unless the
  // user changes their search."
  const [clarificationResolution, setClarificationResolution] = useState<ClarificationResolution | null>(null);
  // Concepts the user has individually removed from the banner (× on a
  // chip, or from a "Show N more" flyout) — keyed by conceptKey(category,
  // label), same lifecycle as clarificationResolution: scoped to one
  // committed search, reset on the next.
  const [removedConceptKeys, setRemovedConceptKeys] = useState<Set<string>>(new Set());
  // Synonyms the user has promoted from a concept's Query details list into
  // their own active chip, keyed by the parent concept's key — same
  // lifecycle as removedConceptKeys/clarificationResolution above.
  const [addedSynonyms, setAddedSynonyms] = useState<Record<string, string[]>>({});
  // Concepts added manually via the Custom section's search (see
  // CustomConceptSearch/handleAddCustomConcept) — same lifecycle as
  // addedSynonyms/removedConceptKeys above.
  const [customConcepts, setCustomConcepts] = useState<CatalogConcept[]>([]);
  // One entry per concept/synonym edit, in the order they were made — see
  // UndoStep. Same lifecycle as removedConceptKeys/addedSynonyms above:
  // scoped to one committed search, reset on the next.
  const [undoStack, setUndoStack] = useState<UndoStep[]>([]);
  // Brief, unobtrusive "results are updating" overlay shown on the
  // publication list while a concept/synonym edit's search re-runs — purely
  // cosmetic (the underlying filtering below is already synchronous), just
  // giving the user a moment of visible feedback that something changed.
  const [isRefreshingResults, setIsRefreshingResults] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
  }, []);

  const triggerBriefRefresh = () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    setIsRefreshingResults(true);
    refreshTimeoutRef.current = setTimeout(() => setIsRefreshingResults(false), 500);
  };

  // Jumps the results list back to the top the instant a new pagination
  // page renders — setting scrollTop directly is inherently non-animated
  // (unlike scrollTo({behavior: 'smooth'})), and useLayoutEffect runs after
  // the new page's rows are in the DOM but before the browser paints, so
  // there's no visible frame of the old scroll position with new content.
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [page]);

  /** Fires on Enter/"Find publications" from either the landing card or the
   *  results view's own search interface — always (re)commits the query and
   *  (re)runs the ~2s loading interstitial before showing results. */
  const handleFindPublications = () => {
    if (!query.trim()) return;
    setCommittedQuery(query.trim());
    setClarificationResolution(null);
    setRemovedConceptKeys(new Set());
    setAddedSynonyms({});
    setCustomConcepts([]);
    setUndoStack([]);
    setPage(1);
    setPhase('loading');
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => setPhase('results'), 2000);
  };

  const handleBackToSearch = () => {
    setExpanded(false);
    setPhase('landing');
  };

  /** Fires from the Clarification Required panel — either a specific
   *  sub-category button or the broad-search fallback (see
   *  ClarificationPanel). Both resolve the same way: store the choice,
   *  which computeConceptState then reflects in the banner and uses to
   *  narrow (or deliberately not narrow, for broad) resultsFiltered below. */
  const handleClarificationSelect = (disease: string, optionKey: string) => {
    setClarificationResolution({ disease, optionKey });
  };

  /** Fires from a concept chip's × (inline or in a "Show N more" flyout).
   *  A chip for a synonym the user added themselves (see handleAddSynonym)
   *  is removed from addedSynonyms instead — deleting it from there both
   *  hides the chip *and* returns the synonym to its parent's Query details
   *  list, so it can be added again; a normal matched/Other/derived
   *  concept's key goes into removedConceptKeys as before, which has no
   *  such "available again" list to return to. Either way, the results
   *  update immediately (computeConceptState reads both on every recompute),
   *  with a brief refresh indicator on the list itself. */
  const handleRemoveConcept = (key: string) => {
    const synonymRef = parseSynonymConceptKey(key);
    if (synonymRef) {
      setAddedSynonyms((prev) => ({
        ...prev,
        [synonymRef.parentKey]: (prev[synonymRef.parentKey] ?? []).filter((s) => s !== synonymRef.synonym),
      }));
      setUndoStack((prev) => [...prev, { kind: 'restoreRemovedSynonym', parentKey: synonymRef.parentKey, synonym: synonymRef.synonym }]);
    } else {
      setRemovedConceptKeys((prev) => new Set(prev).add(key));
      setUndoStack((prev) => [...prev, { kind: 'restoreConcept', key }]);
    }
    triggerBriefRefresh();
  };

  /** Fires from a Query details synonym chip (see SynonymOption) — promotes
   *  that synonym into its parent concept's category box as its own active,
   *  removable chip, which computeConceptState folds into matchOrTerms on
   *  the next recompute. */
  const handleAddSynonym = (parentKey: string, synonym: string) => {
    setAddedSynonyms((prev) => ({ ...prev, [parentKey]: [...(prev[parentKey] ?? []), synonym] }));
    setUndoStack((prev) => [...prev, { kind: 'removeAddedSynonym', parentKey, synonym }]);
    triggerBriefRefresh();
  };

  /** Fires from the banner's "Undo" button — reverses the most recent
   *  concept/synonym edit (see UndoStep) and pops it off undoStack, so
   *  repeated clicks step back through the user's changes one at a time.
   *  Reads `undoStack`'s current value directly rather than inside a
   *  setState updater (same pattern as handleFindPublications reading
   *  `query`), since this only ever runs from a click, after the latest
   *  render has already committed. */
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const step = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    if (step.kind === 'restoreConcept') {
      setRemovedConceptKeys((prev) => {
        const next = new Set(prev);
        next.delete(step.key);
        return next;
      });
    } else if (step.kind === 'removeAddedSynonym') {
      setAddedSynonyms((prev) => ({
        ...prev,
        [step.parentKey]: (prev[step.parentKey] ?? []).filter((s) => s !== step.synonym),
      }));
    } else if (step.kind === 'restoreRemovedSynonym') {
      setAddedSynonyms((prev) => ({
        ...prev,
        [step.parentKey]: [...(prev[step.parentKey] ?? []), step.synonym],
      }));
    } else {
      // removeCustomConcept — undoing an add deletes it outright rather
      // than marking it removed, since it never existed until this add.
      setCustomConcepts((prev) => prev.filter((c) => c.label !== step.label));
    }
    triggerBriefRefresh();
  };

  /** Fires from the Custom section's search (see CustomConceptSearch) —
   *  adds a manually-picked concept, which computeConceptState folds into
   *  its own "Custom" category box and matchOrTerms on the next recompute. */
  const handleAddCustomConcept = (option: CatalogConcept) => {
    setCustomConcepts((prev) => [...prev, option]);
    setUndoStack((prev) => [...prev, { kind: 'removeCustomConcept', label: option.label }]);
    triggerBriefRefresh();
  };

  /** Fires from the Custom flyout's "Clear all" (see CategoryMoreFlyout) —
   *  removes every currently-active custom concept in one go by running
   *  each through the exact same path as its own individual × would
   *  (handleRemoveConcept), so Undo still steps back through them one at
   *  a time afterward rather than needing a separate bulk-undo case. */
  const handleClearAllCustomConcepts = () => {
    const activeCustomKeys = conceptState.allConcepts
      .filter((c) => c.category === 'Custom' && !c.removed)
      .map((c) => c.key);
    activeCustomKeys.forEach((key) => handleRemoveConcept(key));
  };

  /** Table column headers toggle direction on repeat clicks (pass no `dir`);
   *  the toolbar's "Publication date" menu sets year + an explicit direction. */
  const applySort = (key: SortKey, dir?: SortDir) => {
    if (dir) {
      setSortKey(key);
      setSortDir(dir);
    } else if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // The landing page's preview/"browse full list" flow is a static teaser of
  // the corpus, not a live search result — it must never react to the query
  // text being typed (only "Find publications" commits a search, at which
  // point resultsFiltered below takes over). publicationFilter (the "All
  // publications"/"Clinical trials only" toggle) is a separate, legitimate
  // live control here, so it's the only thing this still depends on.
  const filtered = useMemo(
    () => filterPublications('', publicationFilter),
    [publicationFilter],
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => (sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return list;
  }, [filtered, sortKey, sortDir]);

  // Single source of truth for the committed query's interpreted concepts,
  // pending ambiguity, and the resulting search parameters — see
  // computeConceptState.
  // Single source of truth for the committed query's interpreted concepts,
  // clarification state, and any extra AND-filter term a resolved
  // sub-category narrows to — see computeConceptState.
  const conceptState = useMemo(
    () => computeConceptState(committedQuery, clarificationResolution, removedConceptKeys, addedSynonyms, customConcepts),
    [committedQuery, clarificationResolution, removedConceptKeys, addedSynonyms, customConcepts],
  );

  // The results view's own list, driven by the frozen `committedQuery`
  // rather than the live `query` — see handleFindPublications. Matched via
  // conceptState.matchOrTerms (one term per surviving, non-removed concept)
  // rather than re-tokenising committedQuery directly, so removing a
  // concept chip immediately drops its contribution to the results; further
  // narrowed by conceptState.filterQualifier once a specific sub-category
  // is resolved (directly from the query, or via clarification).
  const resultsFiltered = useMemo(
    () => filterPublications(committedQuery, publicationFilter, {
      orTerms: conceptState.matchOrTerms,
      requiredPhrase: conceptState.filterQualifier ?? undefined,
      predicates: conceptState.matchPredicates,
    }),
    [committedQuery, publicationFilter, conceptState.matchOrTerms, conceptState.filterQualifier, conceptState.matchPredicates],
  );

  const resultsSorted = useMemo(() => {
    const list = [...resultsFiltered];
    list.sort((a, b) => (sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return list;
  }, [resultsFiltered, sortKey, sortDir]);

  // Resets to page 1 whenever the underlying result set changes (a new
  // query or filter) — sorting alone doesn't reset it, since it's the same
  // set of results just reordered, and staying on the current page reads
  // more naturally there. Both flows share the same `page` state, but only
  // one is ever visible at a time (see `phase`), so resetting it on either
  // one's own result-set change is harmless for the other.
  useEffect(() => setPage(1), [filtered]);
  useEffect(() => setPage(1), [resultsFiltered]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  const resultsPageCount = Math.max(1, Math.ceil(resultsSorted.length / PAGE_SIZE));
  const resultsPaginated = useMemo(
    () => resultsSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [resultsSorted, page],
  );

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Takes the active list explicitly since the landing preview and the
  // results view each have their own (see `sorted`/`resultsSorted`).
  const toggleAll = (list: SearchPublication[]) => {
    setSelectedIds((prev) => {
      const allSelected = list.length > 0 && list.every((p) => prev.has(p.id));
      if (allSelected) return new Set();
      return new Set(list.map((p) => p.id));
    });
  };

  // A committed search (phase !== 'landing') uses this exact same pinned
  // slim-bar chrome as the old "browse full list" expand — see showSlimLayout
  // below — rather than a bespoke layout of its own.
  const isCommittedSearch = phase !== 'landing';
  // Governs both the pinned SlimSearchBar/docked-capsule chrome and the main
  // box's scroll/height behaviour: the true landing screen (no expand, no
  // committed search) is the only state capped to exactly one viewport with
  // no scrolling.
  const showSlimLayout = expanded || isCommittedSearch;

  return (
    <Box
      component="main"
      ref={mainRef}
      sx={{
        ml: '72px',
        flex: 1,
        height: showSlimLayout ? 'auto' : '100vh',
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        overflowY: showSlimLayout ? 'auto' : 'hidden',
      }}
    >
      <Fade in={showSlimLayout} timeout={500} unmountOnExit>
        <div>
          <SlimSearchBar
            onBack={handleBackToSearch}
            publicationFilter={publicationFilter}
            onPublicationFilterChange={setPublicationFilter}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={applySort}
          />
        </div>
      </Fade>

      <Box sx={{
        px: 6,
        // Vertical space at the top of the page.
        pt: '32px',
        pb: showSlimLayout ? 4 : 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        maxWidth: 1440,
        width: '100%',
        mx: 'auto',
        flex: showSlimLayout ? 'none' : 1,
        minHeight: 0,
      }}>
        {/* Reserves the space the fixed slim search bar occupies once shown,
            so content doesn't jump underneath it (fixed elements don't
            otherwise take up room in the normal flow). */}
        <Box sx={{ height: showSlimLayout ? '65px' : 0, transition: 'height 0.5s ease', flexShrink: 0 }} />

        {/* Interpreted concepts sits between the slim bar and the results,
            full-width within this same 1440 content column — only for a
            committed search, never for the plain "browse full list" expand
            (which has no query to interpret). */}
        {isCommittedSearch ? (
          <InterpretedConceptsBanner
            query={committedQuery}
            concepts={conceptState.allConcepts}
            onRemoveConcept={handleRemoveConcept}
            addedSynonyms={addedSynonyms}
            onAddSynonym={handleAddSynonym}
            canUndo={undoStack.length > 0}
            onUndo={handleUndo}
            onAddCustomConcept={handleAddCustomConcept}
            onClearAllCustom={handleClearAllCustomConcepts}
          />
        ) : null}

        {/* Once the slim bar is showing, the org badge simply isn't rendered
            rather than being its own Collapse — one less flex item means one
            less reserved gap left behind above the results once this and the
            header/capsule block below are both gone. */}
        {showSlimLayout ? null : <OrgBadge />}

        {/* The header/search-area content collapses away into the sticky slim
            bar above once shown. unmountOnExit intentionally omitted — the
            search input inside must stay mounted throughout so it can dock
            via its own `docked` prop instead of ever being removed; see
            SearchCapsule. This keeps working the same way for a committed
            search as for the "browse full list" expand, since both now
            drive the same `showSlimLayout` flag.
            mt pushes the search area down for a more centred vertical
            balance against the (now shorter) preview below. Since the
            preview is the flex:1 item that fills whatever's left down to
            the bottom of the viewport, this fixed amount comes straight out
            of its height — the preview shrinks by exactly this much, its
            bottom edge/button position are otherwise untouched. Applied as
            margin on Collapse directly (rather than a separate spacer flex
            item) so it doesn't pick up an extra `gap` on top of itself. */}
        <Collapse in={!showSlimLayout} timeout={500} sx={{ mt: showSlimLayout ? 0 : '50px' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'center', maxWidth: 900, mx: 'auto' }}>
              <Typography sx={{ fontSize: 28, fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                Find publications to start your workspace
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 400, color: 'text.secondary', letterSpacing: '-0.01em' }}>
                Describe the treatment, disease or research topic you're exploring. Compass identifies relevant scientific concepts and publications for you.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 1080, width: '100%', mx: 'auto' }}>
              <SearchLandingCard
                query={query}
                onQueryChange={setQuery}
                onSubmit={handleFindPublications}
                docked={showSlimLayout}
              />
              <BooleanInfoBar />
            </Box>
          </Box>
        </Collapse>

        {/* Shown from first load, before any search. flex: 1 so the
            preview below fills whatever's left of the viewport while on the
            true landing screen (see ExpandablePublicationPreview above).
            mt adds extra separation from the search area above, on top of
            the column's own gap — the preview itself is untouched; it just
            ends up with slightly less of the viewport to fill, since it's
            still anchored to the bottom. */}
        {/* Once the slim bar is showing, the flex column's own `gap` (32px)
            applies at least twice before this block — once after the
            reserved slim-bar spacer, once after the (now zero-height)
            collapsed search area, plus once more after the concepts banner
            for a committed search — for up to 96px total gap above it. -32px
            here cancels one of those (a flat halving for the "browse full
            list" expand; a smaller proportional reduction alongside the
            concepts banner's own gap for a committed search), without
            touching either element's own size or the gap used everywhere
            else in this column. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: showSlimLayout ? 'none' : 1, minHeight: 0, mt: showSlimLayout ? '-32px' : '132px' }}>
          {isCommittedSearch ? (
            phase === 'loading' ? (
              <FindingPublicationsLoader />
            ) : (
              <>
                {/* Sits between the concepts banner and the results — a
                    contextual refinement step, not a gate: resultsSorted
                    below already reflects the broad interpretation, so
                    nothing is hidden while this is showing. */}
                {conceptState.pendingClarification ? (
                  <ClarificationPanel
                    question={conceptState.pendingClarification.question}
                    options={conceptState.pendingClarification.options}
                    broadLabel={conceptState.pendingClarification.broadLabel}
                    onSelectOption={(optionKey) => handleClarificationSelect(conceptState.pendingClarification!.disease, optionKey)}
                    onSelectBroad={() => handleClarificationSelect(conceptState.pendingClarification!.disease, 'broad')}
                  />
                ) : null}

                <ResultsToolbar resultCount={resultsSorted.length} initial={false} />
                {/* position:relative host for the brief "Refreshing
                    results..." overlay below — shown momentarily whenever a
                    concept/synonym edit re-runs the search (see
                    triggerBriefRefresh), distinct from and much shorter
                    than FindingPublicationsLoader's initial ~2s interstitial. */}
                <Box sx={{ position: 'relative' }}>
                  {isRefreshingResults ? (
                    <Box sx={{
                      position: 'absolute', inset: 0, zIndex: 2, borderRadius: '12px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: (t) => alpha(t.palette.background.paper, 0.7),
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} sx={{ color: 'primary.main' }} />
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', letterSpacing: '-0.01em' }}>
                          Refreshing results...
                        </Typography>
                      </Box>
                    </Box>
                  ) : null}
                  {/* The table's own grid columns (unchanged) have a real
                      combined minimum width; this scrolls horizontally
                      rather than letting the table clip if the viewport is
                      narrower than that. */}
                  <Box sx={{ overflowX: 'auto' }}>
                    <PublicationsTable
                      publications={resultsPaginated}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={applySort}
                      selectedIds={selectedIds}
                      onToggleRow={toggleRow}
                      onToggleAll={() => toggleAll(resultsSorted)}
                      pagination={{ page, pageCount: resultsPageCount, onChange: setPage }}
                    />
                  </Box>
                </Box>
              </>
            )
          ) : (
            <>
              <ResultsToolbar
                resultCount={sorted.length}
                initial={!expanded}
              />

              <ExpandablePublicationPreview expanded={expanded} onExpand={() => setExpanded(true)}>
                <PublicationsTable
                  publications={expanded ? paginated : sorted}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={applySort}
                  selectedIds={selectedIds}
                  onToggleRow={toggleRow}
                  onToggleAll={() => toggleAll(sorted)}
                  pagination={expanded ? { page, pageCount, onChange: setPage } : undefined}
                  interactive={expanded}
                />
              </ExpandablePublicationPreview>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
