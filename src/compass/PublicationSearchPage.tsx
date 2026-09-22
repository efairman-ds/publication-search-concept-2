import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Collapse from '@mui/material/Collapse';
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
  Info,
  MagnifyingGlass,
  Plus,
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

/** The one truncation rule every concept chip uses (RemovableChip,
 *  SynonymOption, ConceptSummaryChip) — a fixed character count rather
 *  than a pixel-width CSS ellipsis, so a chip's visible length is the
 *  same regardless of which characters happen to be wide or narrow. The
 *  full, untruncated label is always still available via each chip's own
 *  Tooltip. */
const CONCEPT_CHIP_MAX_CHARS = 15;
function truncateConceptLabel(label: string): string {
  return label.length > CONCEPT_CHIP_MAX_CHARS ? `${label.slice(0, CONCEPT_CHIP_MAX_CHARS)}…` : label;
}

const STOPWORDS = new Set([
  'and', 'or', 'not', 'the', 'of', 'for', 'with', 'in', 'on', 'a', 'an', 'to', 'vs', 'from',
  // Generic command scaffolding in a full-sentence query ("show me the
  // publications of X") — carries no concept meaning of its own, same
  // category as the words above rather than a leftover "Metadata" concept.
  'show', 'me', 'publications', 'publication', 'documents', 'document', 'provide', 'papers', 'paper',
  // Generic "these are patients" scaffolding around a population
  // descriptor ("elderly patients", "women", "pediatric patients") — the
  // descriptor itself is what's meaningful and is what actually gets
  // recognised (see extractPopulationMatches); bare "patients" alongside
  // it carries no search meaning of its own.
  'patients', 'patient',
  // Generic labels for an identifier/title the user is about to name
  // (e.g. "publications with DOI 10.1016/...") rather than a search term
  // in their own right — the identifier/title itself is picked up by
  // extractDocumentIdentifierMatch/extractTitleMatch instead.
  'doi', 'dois',
  // Realistic HCP/Medical Affairs phrasing carries a lot of this kind of
  // scaffolding around the actual concept ("I want to track...", "What
  // are the relevant publications... for the indication X?", "the year
  // 2026", "the publications associated with these DOIs") — none of it
  // is itself a search term, same treatment as the command scaffolding
  // above.
  'want', 'track', 'about', 'all', 'what', 'are', 'relevant', 'indication', 'year', 'years', 'find',
  'associated', 'these', 'those',
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
  /** An extra, alternative way to satisfy the *same* OR-matching step
   *  orTerms drives — a publication passes if it matches any orTerm, OR
   *  this. Used for combination-drug "broad" search scope (see the page
   *  component's combinationScope): a publication discussing both of a
   *  combination drug's active ingredients in close proximity should
   *  count as a hit even when the trade name itself never appears (so a
   *  plain orTerm for the trade name alone wouldn't catch it). Only
   *  applies alongside a non-empty orTerms — deliberately not a way to
   *  match publications when the user has removed every concept, which
   *  should still mean "no criteria left, show everything" (see orTerms
   *  above), not "fall back to this instead." */
  orPredicate?: (p: SearchPublication) => boolean;
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
      list = list.filter((p) => {
        const h = publicationHaystack(p);
        return orTerms.some((t) => h.includes(t)) || (options.orPredicate?.(p) ?? false);
      });
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

/** `visible` false once the slim layout takes over — rendered via opacity
 *  rather than conditionally unmounted, and absolutely positioned rather
 *  than a normal-flow flex child, so hiding it can never shift anything
 *  else in the column. A plain conditional unmount changes the flex
 *  column's flow instantly with no way to animate that, which used to
 *  read as everything below it — the "Find publications" heading
 *  included — jumping upward the moment "View all publications" was
 *  clicked, instead of fading out in place. Positioned against the
 *  content column below, which is given `position: relative` for
 *  exactly this. */
function OrgBadge({ visible }: { visible: boolean }) {
  return (
    <Box sx={{
      position: 'absolute',
      top: '24px',
      right: 6,
      display: 'flex',
      alignItems: 'center',
      gap: 0.75,
      bgcolor: '#d1d4e3',
      borderRadius: '100px',
      px: 2,
      py: 1,
      whiteSpace: 'nowrap',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.5s ease',
      pointerEvents: visible ? 'auto' : 'none',
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
  showFilters,
  publicationFilter,
  onPublicationFilterChange,
  sortKey,
  sortDir,
  onSort,
}: {
  onBack: () => void;
  /** The filter/sort controls only make sense once there's an actual list
   *  to filter — a committed search or "View all publications" — not on
   *  the plain landing state. The bar itself (this whole component) stays
   *  mounted and visible regardless; only this one row's content is
   *  gated. */
  showFilters: boolean;
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
            above. Only relevant once there's a list to filter — hidden on
            the plain landing state, shown for a committed search or
            "View all publications" (see showFilters). */}
        {showFilters ? (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
            <FilterControls
              publicationFilter={publicationFilter}
              onPublicationFilterChange={onPublicationFilterChange}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
          </Box>
        ) : null}
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
        {/* Never wrapped in an opacity fade (see the page component,
            immediately above this card) — once docked, this escapes via
            its own `position: fixed` to stay visible/anchored in the slim
            bar, and opacity on an ancestor would still apply to it despite
            that; only the button and helper text below fade with the rest
            of this card's contents. */}
        <SearchCapsule value={query} onChange={onQueryChange} onSubmit={onSubmit} docked={docked} />
        <Box sx={{ flexShrink: 0, opacity: docked ? 0 : 1, transition: 'opacity 0.5s ease' }}>
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
      </Box>

      <Box sx={{ opacity: docked ? 0 : 1, transition: 'opacity 0.5s ease' }}>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', letterSpacing: '-0.01em', textAlign: 'left', mt: -1 }}>
          Search naturally. Compass handles complex search logic for you.
        </Typography>
      </Box>
    </Box>
  );
}

/** Static informational bar — Boolean logic is handled behind the scenes, so
 *  this exists purely to reassure the user, not as an interactive control. */
function BooleanInfoBar() {
  return (
    <Box sx={{
      // Matches the search card above exactly, so their left/right edges
      // align. mx: 'auto' (not alignSelf, which only centers a *direct*
      // flex child — this now sits one level deeper, inside a plain
      // opacity-fade wrapper Box, see the page component) centers a
      // fixed-width block regardless of what kind of parent it's in.
      width: '918px',
      mx: 'auto',
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
  // A combination-drug trade name — recognised here like any other Drug
  // (so it shows as a normal chip and drives the default/"narrow" search
  // same as always), but *also* registered in COMBINATION_DRUGS below
  // with its known active ingredients, which is what additionally makes
  // the narrow/broad search-scope control available for it.
  { pattern: 'entresto', category: 'Drug', label: 'Entresto' },
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

/** Population/demographic descriptors — sex/gender, age group, pregnancy
 *  — recognised as their own "Other" concept (see computeConceptState):
 *  a valid search criterion in its own right, but not a Drug, Disease,
 *  or Biomarker, so it's deliberately not just another CONCEPT_DICTIONARY
 *  entry. Matched with a word-boundary regex rather than
 *  CONCEPT_DICTIONARY's plain substring check — several of these
 *  (`men`/`man`, `male`) would otherwise false-positive inside common,
 *  unrelated words ("treatment", "government", "female", "management")
 *  purely because the letters happen to appear in sequence. */
const POPULATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bwomen\b/i, label: 'Women' },
  { pattern: /\bwoman\b/i, label: 'Women' },
  { pattern: /\bfemales?\b/i, label: 'Female patients' },
  { pattern: /\bmen\b/i, label: 'Men' },
  { pattern: /\bman\b/i, label: 'Men' },
  { pattern: /\bmales?\b/i, label: 'Male patients' },
  { pattern: /\bpregnant\b/i, label: 'Pregnant patients' },
  { pattern: /\belderly\b/i, label: 'Elderly patients' },
  { pattern: /\bgeriatric\b/i, label: 'Geriatric patients' },
  { pattern: /\b(?:pediatric|paediatric)\b/i, label: 'Pediatric patients' },
  { pattern: /\bchild(?:ren)?\b/i, label: 'Pediatric patients' },
  { pattern: /\badolescents?\b/i, label: 'Adolescent patients' },
  { pattern: /\binfants?\b/i, label: 'Infant patients' },
  { pattern: /\bneonat(?:al|es?)\b/i, label: 'Neonatal patients' },
  { pattern: /\badults?\b/i, label: 'Adult patients' },
];

/** Every population descriptor named in the query, each becoming its own
 *  "Other" concept — same multi-match/dedup shape as
 *  extractDocumentIdentifierMatches (more than one can appear, e.g.
 *  "elderly women"), deduped by label so "women"/"woman" both appearing
 *  doesn't produce two identical chips. */
function extractPopulationMatches(query: string): { value: string; consumedText: string }[] {
  const out: { value: string; consumedText: string }[] = [];
  const seen = new Set<string>();
  for (const { pattern, label } of POPULATION_PATTERNS) {
    const match = query.match(pattern);
    if (match && !seen.has(label)) {
      seen.add(label);
      out.push({ value: label, consumedText: match[0] });
    }
  }
  return out;
}

/** A trade name whose active ingredients are both known — lets the
 *  "broad" search-scope option (see the page component's
 *  combinationScope) additionally surface publications that discuss
 *  those ingredients together without ever naming the trade name; see
 *  ingredientsInProximity. Ingredients are lowercase — matched as exact,
 *  whole tokens, not substrings. */
interface CombinationDrug {
  tradeName: string;
  ingredients: string[];
}

const COMBINATION_DRUGS: CombinationDrug[] = [
  { tradeName: 'Entresto', ingredients: ['sacubitril', 'valsartan'] },
];

/** The trade name a query names, if it's a known combination drug —
 *  purely a function of the query text, independent of whether the
 *  user's currently chosen "narrow"/"broad" scope. */
function findCombinationDrug(query: string): CombinationDrug | null {
  const lower = query.toLowerCase();
  return COMBINATION_DRUGS.find((d) => lower.includes(d.tradeName.toLowerCase())) ?? null;
}

/** How many words apart two active ingredients can be and still count as
 *  "discussed together" for "broad" combination-drug search — a mock
 *  stand-in for real proximity/co-occurrence search over full text. */
const INGREDIENT_PROXIMITY_WINDOW = 12;

/** True if every one of `ingredients` appears as a whole word somewhere
 *  in `p`'s title + abstract, with the closest pair of occurrences (one
 *  per ingredient, checked across every pair for 3+ ingredients) no more
 *  than INGREDIENT_PROXIMITY_WINDOW words apart. Requires *every*
 *  ingredient to appear at least once — a publication naming only one of
 *  the two active ingredients never matches, regardless of proximity,
 *  since there's nothing for it to be "close to" in the first place. */
function ingredientsInProximity(p: SearchPublication, ingredients: string[]): boolean {
  const words = `${p.title} ${p.abstract ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const positions = ingredients.map((ingredient) => {
    const indexes: number[] = [];
    words.forEach((w, i) => { if (w === ingredient) indexes.push(i); });
    return indexes;
  });
  if (positions.some((indexes) => indexes.length === 0)) return false;
  for (let a = 0; a < positions.length; a++) {
    for (let b = a + 1; b < positions.length; b++) {
      let minDistance = Infinity;
      for (const i of positions[a]) {
        for (const j of positions[b]) minDistance = Math.min(minDistance, Math.abs(i - j));
      }
      if (minDistance > INGREDIENT_PROXIMITY_WINDOW) return false;
    }
  }
  return true;
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

/** Recognises every DOI in the raw query text as its own "Document
 *  identifier" concept — matched exactly against the publication's own
 *  `doi` field (case-insensitive) rather than a haystack substring, since
 *  a DOI is meant to identify one specific publication, not just
 *  contribute a loose keyword. Found the same way regardless of what (if
 *  anything) precedes the bare `10.xxxx/yyyy` pattern — a full URL
 *  (`https://doi.org/...`), a protocol-less one (`doi.org/...`), a
 *  "DOI:"/"DOI" prefix, or nothing at all. A "doi.org/" (with or without
 *  a leading protocol) prefix is matched as *part of* `consumedText`
 *  (though never part of the returned `value`, which is always just the
 *  bare DOI, matching how `doi` is stored on every publication) —
 *  otherwise stripping only the bare DOI back out of the query for
 *  leftover-word purposes would leave "doi"/"org"/"https" behind as
 *  stray, meaningless "Metadata" concepts of their own. A bare "DOI:"
 *  prefix doesn't need the same handling: "doi" is already a stopword
 *  (see STOPWORDS), so it's never treated as a leftover word regardless.
 *  A query can name more than one DOI (e.g. a comma- or "and"-separated
 *  list) — each one is extracted and later turned into its own separate
 *  concept/predicate, never merged into a single combined match.
 *  Trailing sentence/list punctuation (a comma or period right after a
 *  DOI, etc.) is trimmed off each match. */
function extractDocumentIdentifierMatches(query: string): { value: string; consumedText: string }[] {
  const matches = query.match(/\b(?:(?:https?:\/\/)?(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+/gi);
  if (!matches) return [];
  return matches.map((consumedText) => ({
    value: consumedText.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '').replace(/[.,;:]+$/, ''),
    consumedText,
  }));
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
  /** Set when the query names a known combination drug's trade name —
   *  purely a fact about the query text, independent of the page
   *  component's own combinationScope choice. Drives whether the
   *  narrow/broad search-scope control shows at all (see
   *  CombinationScopeControl) and, when it's present, supplies the
   *  ingredients that scope control's "broad" option searches for. */
  combinationDrug: CombinationDrug | null;
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
  const documentIdentifierMatches = extractDocumentIdentifierMatches(query);
  const titleMatch = extractTitleMatch(query);
  const populationMatches = extractPopulationMatches(query);
  const combinationDrug = findCombinationDrug(query);
  // Scrubbed so a digit sequence inside an already-recognised DOI or
  // title (e.g. the "2045" inside "10.1016/S1470-2045(23)00142-9") can't
  // also be misread as an unrelated year/date-range or publication-type
  // match — dictionary matching above deliberately still runs on the
  // original `query`, so a recognisable drug/disease word inside a quoted
  // title is still surfaced as its own concept.
  let metadataSourceQuery = query;
  for (const m of documentIdentifierMatches) metadataSourceQuery = metadataSourceQuery.replace(m.consumedText, ' ');
  if (titleMatch) metadataSourceQuery = metadataSourceQuery.replace(titleMatch.consumedText, ' ');
  for (const m of populationMatches) metadataSourceQuery = metadataSourceQuery.replace(m.consumedText, ' ');
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
  for (const m of documentIdentifierMatches) significantTerms(m.consumedText).forEach((w) => consumedWords.add(w));
  if (titleMatch) significantTerms(titleMatch.consumedText).forEach((w) => consumedWords.add(w));
  for (const m of populationMatches) significantTerms(m.consumedText).forEach((w) => consumedWords.add(w));
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
  // Each DOI the query names becomes its own concept/chip, independently
  // removable — but see matchPredicates below, where their individual
  // predicates are OR'd together rather than each being AND'd in
  // separately: a publication can only ever have one DOI, so requiring a
  // match against *every* named DOI at once would always return nothing.
  for (const m of documentIdentifierMatches) {
    const key = conceptKey('Document identifier', m.value);
    const doiValue = m.value;
    allConcepts.push({
      key, category: 'Document identifier', label: doiValue, term: null,
      predicate: (p) => p.doi.toLowerCase() === doiValue.toLowerCase(),
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
  // A population descriptor is a valid search criterion but isn't a
  // Drug/Disease/Biomarker/Device — "Other" rather than forcing it into
  // one of those, or leaving it to fall through as an undifferentiated
  // "Metadata" leftover word like a truly unrecognised one would.
  for (const m of populationMatches) {
    const key = conceptKey('Other', m.value);
    allConcepts.push({ key, category: 'Other', label: m.value, term: m.value.toLowerCase(), removed: removedConceptKeys.has(key) });
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
  // Document identifier predicates are combined with OR, not AND, into
  // one predicate — filterPublications ANDs everything in matchPredicates
  // together, and a publication can only ever have one DOI, so AND-ing
  // two or more DOI predicates directly (one query naming several DOIs)
  // would always match zero publications instead of the union of all of
  // them. Every other predicate (Title, Metadata, ...) still ANDs
  // normally against this combined one and against each other.
  const activeDocIdPredicates = active.filter((c) => c.category === 'Document identifier' && c.predicate).map((c) => c.predicate!);
  const otherPredicates = active.filter((c) => c.category !== 'Document identifier' && c.predicate).map((c) => c.predicate!);
  const matchPredicates = activeDocIdPredicates.length > 0
    ? [...otherPredicates, (p: SearchPublication) => activeDocIdPredicates.some((fn) => fn(p))]
    : otherPredicates;

  return { allConcepts, pendingClarification, filterQualifier, matchOrTerms, matchPredicates, combinationDrug };
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
      height: CONCEPT_CHIP_HEIGHT,
      boxSizing: 'border-box',
      bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
      border: '1px solid',
      borderColor: (t) => alpha(t.palette.primary.main, 0.24),
      borderRadius: '6px',
      pl: 1.25,
      pr: 0.75,
    }}>
      <Tooltip title={label} enterDelay={400} slotProps={tooltipSlotProps}>
        <Typography sx={{
          fontSize: 13, fontWeight: 600, color: 'primary.main', letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>
          {truncateConceptLabel(label)}
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

/** Shared shape for every category container in the expanded concept
 *  details (see ConceptDetails) — CategoryBox and the "Add concept"
 *  container both use this exact radius/padding so every container in
 *  that row reads as the same kind of thing, differing only in
 *  background. Padding is deliberately tight (proportional to a chip's
 *  own size, not a generic card inset) so the container hugs its content
 *  instead of reading as an oversized panel. */
const CATEGORY_CONTAINER_RADIUS = '8px';
const CATEGORY_CONTAINER_PADDING = { px: 1.25, py: 0.875 };
/** Every label inside a category container — the category name itself
 *  ("DRUG", "ADD CONCEPT", ...) and the inline "SYNONYMS" label — shares
 *  this exact styling, so the two read as the same kind of thing rather
 *  than one looking like an afterthought next to the other. Small, muted,
 *  and all-caps on purpose: the label is a quiet cue, not competing with
 *  the chips for attention. */
const CATEGORY_LABEL_SX = { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.disabled', whiteSpace: 'nowrap' } as const;
/** Every concept chip — selected (RemovableChip), addable (SynonymOption),
 *  and the collapsed summary's read-only chip (ConceptSummaryChip) — sets
 *  this exact height explicitly, rather than letting padding and content
 *  (a slightly larger label, an icon or not) settle it on their own. Text
 *  and icons still vertically centre within it (via `alignItems: center`
 *  on each chip's own flex root), so this is purely a floor/ceiling on
 *  the box itself — the one thing that guarantees every chip lines up at
 *  exactly the same height regardless of those per-chip differences. */
const CONCEPT_CHIP_HEIGHT = '28px';

/** One category — shown inside the banner's expanded state (see
 *  InterpretedConceptsBanner), not gated behind any dropdown or popover
 *  of its own. A white container (see CATEGORY_CONTAINER_*) gives each
 *  category a clear edge without a border line, and hugs its own content
 *  rather than stretching; several of these then sit side by side (see
 *  ConceptDetails) rather than one per line.
 *
 *  Label row: the category name, plus — once at least one synonym has
 *  actually been added to this category — a small "N concepts added"
 *  caption at the far right of that same row (synonym-derived concepts
 *  only; a category's originally-matched concept(s) don't count towards
 *  this). Beneath that: every concept as a removable (blue, "×") chip,
 *  immediately followed in the same wrapping row by any synonyms still
 *  available to add, each as its own addable (green, "+") chip — no
 *  "Synonyms:" text label; the colour/icon difference alone marks a chip
 *  as not-yet-added, and clicking one promotes it into a blue chip in
 *  this same row. */
function CategoryBox({
  category,
  concepts,
  onRemove,
  addedSynonyms,
  onAddSynonym,
}: {
  category: string;
  concepts: DisplayConcept[];
  onRemove: (key: string) => void;
  addedSynonyms: Record<string, string[]>;
  onAddSynonym: (parentKey: string, synonym: string) => void;
}) {
  const synonymOptions = concepts
    .filter((c) => parseSynonymConceptKey(c.key) === null)
    .flatMap((c) => (CONCEPT_SYNONYMS[c.label] ?? [])
      .filter((s) => !(addedSynonyms[c.key] ?? []).includes(s))
      .map((synonym) => ({ parentKey: c.key, synonym })));
  const addedCount = concepts.filter((c) => parseSynonymConceptKey(c.key) !== null).length;

  return (
    <Box sx={{
      bgcolor: '#fff', borderRadius: CATEGORY_CONTAINER_RADIUS, ...CATEGORY_CONTAINER_PADDING,
      display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Typography sx={CATEGORY_LABEL_SX}>
          {category}
        </Typography>
        {addedCount > 0 ? (
          // All-caps like the category label itself (see CATEGORY_LABEL_SX),
          // but a shade lighter and not bold — supporting metadata about
          // the category, not another label competing with it or with the
          // concept chips below for attention.
          <Typography sx={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: (t) => alpha(t.palette.text.disabled, 0.65), whiteSpace: 'nowrap',
          }}>
            {addedCount} concept{addedCount === 1 ? '' : 's'} added
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
        {concepts.map((c) => <RemovableChip key={c.key} label={c.label} onRemove={() => onRemove(c.key)} />)}
        {synonymOptions.map(({ parentKey, synonym }) => (
          <SynonymOption key={synonym} label={synonym} onClick={() => onAddSynonym(parentKey, synonym)} />
        ))}
      </Box>
    </Box>
  );
}

/** One concept, display-only — no remove control, no click behaviour —
 *  used only in the banner's collapsed summary (see
 *  InterpretedConceptsBanner). Same chip visual language as the
 *  interactive RemovableChip (tint, border, truncation) so it still reads
 *  as "a concept chip," just without the affordance to act on it; that
 *  distinction is the point — the collapsed view is a summary to scan,
 *  not something to edit. "Edit concepts" is how you get to the real,
 *  editable chips (see CategoryBox). */
function ConceptSummaryChip({ label }: { label: string }) {
  return (
    <Tooltip title={label} enterDelay={400} slotProps={tooltipSlotProps}>
      <Typography sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: CONCEPT_CHIP_HEIGHT,
        boxSizing: 'border-box',
        bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
        border: '1px solid',
        borderColor: (t) => alpha(t.palette.primary.main, 0.24),
        borderRadius: '6px',
        pl: 1.25, pr: 1.25,
        fontSize: 13, fontWeight: 600, color: 'primary.main', letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}>
        {truncateConceptLabel(label)}
      </Typography>
    </Tooltip>
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

/** All of the banner's category containers plus "Custom" (the add-a-
 *  concept category), shown once the banner is expanded (see
 *  InterpretedConceptsBanner) — never gated behind a dropdown or popover
 *  of its own. Laid out as one horizontal, wrapping row — category
 *  container → category container → ... → "Custom" — so several
 *  categories sit side by side where there's room, rather than one per
 *  line. "Custom" is the last item in that same row, kept visually
 *  distinct (its own, slightly-off-white background — see its own Box
 *  below) from the categories actually interpreted from the query, even
 *  though it's right alongside them. */
function ConceptDetails({
  groups,
  activeConcepts,
  onAdd,
  onRemove,
  addedSynonyms,
  onAddSynonym,
}: {
  groups: { category: string; concepts: DisplayConcept[] }[];
  /** Every currently-active concept across all categories — passed through
   *  to CustomConceptSearch so its suggestions never re-offer something
   *  already shown elsewhere. */
  activeConcepts: DisplayConcept[];
  onAdd: (option: CatalogConcept) => void;
  onRemove: (key: string) => void;
  addedSynonyms: Record<string, string[]>;
  onAddSynonym: (parentKey: string, synonym: string) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5 }}>
      {groups.map((g) => (
        <CategoryBox
          key={g.category}
          category={g.category}
          concepts={g.concepts}
          onRemove={onRemove}
          addedSynonyms={addedSynonyms}
          onAddSynonym={onAddSynonym}
        />
      ))}
      {/* "Custom" — same container shape as every CategoryBox (radius,
          padding, label-then-content), only the background differs, and
          only very slightly (a flat off-white, not grey, not an
          alpha-tinted mix of the page's own lavender-grey background),
          so this reads as secondary/less prominent than the categories
          actually interpreted from the query without any strong
          contrast, border, or other kind of visual separator. Since the
          banner itself already sits on a light tinted background
          (alpha(primary,0.06) — see InterpretedConceptsBanner), this
          stays close to that same lightness rather than a darker
          off-white that would read as its own, more separate card. The
          search field inside (see CustomConceptSearch) is pure white, so
          it still stands out clearly against this slightly-off container
          rather than blending into it. */}
      <Box sx={{
        bgcolor: '#FAFAF8',
        borderRadius: CATEGORY_CONTAINER_RADIUS, ...CATEGORY_CONTAINER_PADDING,
        display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 200,
      }}>
        <Typography sx={CATEGORY_LABEL_SX}>
          Custom
        </Typography>
        <CustomConceptSearch concepts={activeConcepts} onAdd={onAdd} />
      </Box>
    </Box>
  );
}

/** Compact "add a concept" search — the content of the "Add concept"
 *  category in ConceptDetails (see above). Focusing the (empty) field
 *  shows 5 related suggestions; typing searches the full catalog instead.
 *  Suggestions are computed from `concepts` (the banner's current, live
 *  display list) so anything already shown — matched from the query,
 *  added as a synonym, or already added here — never re-offers itself. */
function CustomConceptSearch({
  concepts,
  onAdd,
}: {
  concepts: DisplayConcept[];
  onAdd: (option: CatalogConcept) => void;
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
      <Box ref={anchorRef}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          // Pure white — deliberately distinct from the "Add concept"
          // container's own subtle off-white background (see
          // ConceptDetails), so the actual input field still reads
          // clearly as a search field rather than blending into its
          // surroundings.
          bgcolor: '#fff',
          border: '1px solid', borderColor: 'divider', borderRadius: '6px',
          px: 1, py: 0.25,
        }}>
          <MagnifyingGlass size={13} color="#8d96a5" style={{ flexShrink: 0 }} />
          <OutlinedInput
            inputRef={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Add a concept..."
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

// A synonym still available to add sits in the same chip row as its
// parent concept, coloured differently (green, "+") from an already-added
// concept (blue, "×" — see RemovableChip) so the two states read apart at
// a glance without needing a separate "Synonyms:" text label.
const SYNONYM_OPTION_COLOR = '#2e7d63';

/** One synonym still available to add — sits directly in a CategoryBox's
 *  chip row, right after its parent concept's own chip (see CategoryBox).
 *  Clicking it promotes the synonym into that same row as its own active,
 *  removable chip (see the page component's handleAddSynonym), immediately
 *  re-running search. */
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
        flexShrink: 0,
        height: CONCEPT_CHIP_HEIGHT,
        boxSizing: 'border-box',
        bgcolor: alpha(SYNONYM_OPTION_COLOR, 0.1),
        border: '1px solid',
        borderColor: alpha(SYNONYM_OPTION_COLOR, 0.3),
        borderRadius: '6px',
        // Same pl/pr pattern as RemovableChip (both end in an icon, so
        // both give it slightly less padding than the text side).
        pl: 1.25,
        pr: 0.75,
        cursor: 'pointer',
        '&:hover': { borderColor: alpha(SYNONYM_OPTION_COLOR, 0.5), bgcolor: alpha(SYNONYM_OPTION_COLOR, 0.16) },
      }}
    >
      <Tooltip title={label} enterDelay={400} slotProps={tooltipSlotProps}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: SYNONYM_OPTION_COLOR, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          {truncateConceptLabel(label)}
        </Typography>
      </Tooltip>
      <Plus size={11} weight="bold" color={SYNONYM_OPTION_COLOR} />
    </Box>
  );
}

/** Turns true `delayMs` after `active` becomes true, and turns false the
 *  instant `active` becomes false — used to fade the concepts banner/
 *  results content in only once its fold-open Collapse has nearly
 *  finished, while still fading it out immediately (no delay) on close.
 *  Deliberately state-driven rather than a CSS `transition-delay`: the
 *  Collapse each of these lives in uses `unmountOnExit`, so the opacity
 *  Box itself fully unmounts and remounts between a close and the next
 *  open even though the surrounding Collapse never does — and a
 *  freshly-mounted element's first paint never animates, there's no
 *  "previous frame" for a transition-delay to hold off from. Starting
 *  `delayed` at false
 *  unconditionally (regardless of `active`'s initial value) means even a
 *  fresh mount that wants to be open renders hidden for one tick, then
 *  gets a real second frame to fade in from — giving the CSS opacity
 *  transition an actual before/after to animate between. The instant
 *  reset-to-false on `active` going false is applied *during* render
 *  (not from an effect) for the same reason `closingLinger` is: an effect
 *  would lag by one committed, painted frame. */
function useDelayedTrue(active: boolean, delayMs: number) {
  const [delayed, setDelayed] = useState(false);
  const prevActiveRef = useRef(active);
  if (prevActiveRef.current !== active) {
    if (!active) setDelayed(false);
    prevActiveRef.current = active;
  }
  useEffect(() => {
    if (!active) return;
    const timeoutId = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timeoutId);
  }, [active, delayMs]);
  return delayed;
}

/** A vertical collapse that, unlike MUI's own Collapse (which always
 *  reveals/hides from the top, growing or shrinking its bottom edge),
 *  reveals/hides from the BOTTOM — its top edge is what moves. Used for the
 *  Interpreted Concepts banner so it folds downward when a committed search
 *  is left and unfolds upward from the bottom when one is re-committed,
 *  mirroring the results list's own (default, top-anchored) fold in the
 *  opposite direction — see the two Collapses in PublicationSearchPage.
 *  Height is measured (ResizeObserver, same pattern as
 *  ExpandablePublicationPreview above) rather than assumed, since the
 *  banner's natural height varies with how many concepts/synonyms it's
 *  showing. The outer Box clips to an animating `height`; the inner Box
 *  keeps its own natural height fixed and instead animates `marginTop`
 *  from 0 to `-naturalHeight` in lockstep, so the content's bottom edge
 *  (marginTop + naturalHeight) stays put — at `height` — throughout, while
 *  its top edge is what appears to travel. */
function BottomAnchoredCollapse({ in: open, timeout = 500, children }: { in: boolean; timeout?: number; children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setNaturalHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(([entry]) => setNaturalHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Box sx={{ height: open ? naturalHeight : 0, overflow: 'hidden', transition: `height ${timeout}ms ease` }}>
      <Box ref={contentRef} sx={{ marginTop: open ? 0 : -naturalHeight, transition: `margin-top ${timeout}ms ease` }}>
        {children}
      </Box>
    </Box>
  );
}

/** Capitalises a lowercase ingredient name ("sacubitril" -> "Sacubitril")
 *  for display — CombinationDrug.ingredients are stored lowercase since
 *  that's what ingredientsInProximity matches against. */
function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Narrow-vs-broad search-scope toggle — only ever rendered when the
 *  committed query names a known combination drug (see CombinationDrug/
 *  findCombinationDrug), right in the banner header area, so it's
 *  visible regardless of whether the banner is expanded. Two plain
 *  segments rather than a MUI ToggleButtonGroup, matching this file's
 *  existing hand-built control style (PlainDropdown, the collapse
 *  toggle, ...); a supporting caption line underneath (rather than only
 *  a tooltip) states in plain language what the *currently selected*
 *  option actually does, since a two-word label ("Narrow"/"Broad") alone
 *  doesn't explain the mechanism — the info icon's tooltip repeats the
 *  same explanation for both options at once, for anyone hovering before
 *  choosing either. */
function CombinationScopeControl({
  drug,
  scope,
  onChange,
}: {
  drug: CombinationDrug;
  scope: 'narrow' | 'broad';
  onChange: (scope: 'narrow' | 'broad') => void;
}) {
  const ingredientList = drug.ingredients.map(capitalise).join(' and ');
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
          Search scope:
        </Typography>
        <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: '8px', overflow: 'hidden', bgcolor: '#fff' }}>
          {(['narrow', 'broad'] as const).map((option) => (
            <Box
              key={option}
              role="button"
              aria-pressed={scope === option}
              onClick={() => onChange(option)}
              sx={{
                px: 1.5, py: 0.5, cursor: 'pointer', fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em',
                textTransform: 'capitalize', whiteSpace: 'nowrap',
                bgcolor: scope === option ? 'primary.main' : 'transparent',
                color: scope === option ? '#fff' : 'text.secondary',
                '&:hover': scope === option ? {} : { bgcolor: (t) => alpha(t.palette.primary.main, 0.08) },
              }}
            >
              {option}
            </Box>
          ))}
        </Box>
        <Tooltip
          title={`Narrow searches for "${drug.tradeName}" specifically. Broad also looks for publications that discuss ${ingredientList} together, even if "${drug.tradeName}" isn't named.`}
          placement="top"
          arrow
          slotProps={tooltipSlotProps}
        >
          <Box component="span" sx={{ display: 'inline-flex', cursor: 'help', color: 'text.disabled' }}>
            <Info size={14} />
          </Box>
        </Tooltip>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', letterSpacing: '-0.01em' }}>
        {scope === 'narrow'
          ? `Matching publications that mention "${drug.tradeName}" directly.`
          : `Also matching publications that discuss ${ingredientList} together, even without "${drug.tradeName}" named.`}
      </Typography>
    </Box>
  );
}

/** Sits directly above the publication list once a search is committed —
 *  same tinted-info visual language as BooleanInfoBar (primary at 6%
 *  opacity, rounded, no border), just reporting the mock-interpreted
 *  concepts grouped by category instead of carrying static copy.
 *
 *  Collapsed (the default), this is a simple, scannable summary — every
 *  active concept as a plain chip, no category boxes, no remove
 *  controls, no add-a-concept search — so the banner never reads as a
 *  query builder at a glance. "Edit concepts" expands it in place (see
 *  `expanded` below): the same concepts reorganise into ConceptDetails'
 *  categorised, editable containers directly beneath, still inside this
 *  same Box, never a separate dropdown/popover. "Collapse" drops
 *  straight back to the plain chip summary. */
function InterpretedConceptsBanner({
  query,
  concepts,
  onRemoveConcept,
  addedSynonyms,
  onAddSynonym,
  canUndo,
  onUndo,
  onAddCustomConcept,
  combinationDrug,
  combinationScope,
  onCombinationScopeChange,
}: {
  query: string;
  concepts: DisplayConcept[];
  onRemoveConcept: (key: string) => void;
  addedSynonyms: Record<string, string[]>;
  onAddSynonym: (parentKey: string, synonym: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onAddCustomConcept: (option: CatalogConcept) => void;
  /** Set only when the query names a known combination drug (see
   *  CombinationDrug/findCombinationDrug) — the narrow/broad control
   *  below only ever renders when this is non-null. */
  combinationDrug: CombinationDrug | null;
  combinationScope: 'narrow' | 'broad';
  onCombinationScopeChange: (scope: 'narrow' | 'broad') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // `concepts` (the prop) is the *full* history — active and removed alike
  // (see DisplayConcept.removed) — both the collapsed summary and the
  // expanded categories below only ever show the active ones; a removed
  // concept simply disappears (Undo, in the header, is how it comes back).
  const activeConcepts = useMemo(() => concepts.filter((c) => !c.removed), [concepts]);
  const groups = useMemo(() => groupConceptsByCategory(activeConcepts), [activeConcepts]);

  return (
    <Box sx={{
      // Same background treatment as ClarificationPanel (alpha(primary,0.06))
      // so the two read as one component family — everything else here
      // (radius, border-less, typography) is unchanged.
      bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
      borderRadius: '10px',
      // Balanced (equal horizontal/vertical) padding, up from the previous
      // px:2.5/py:2 mismatch, for more even breathing room around the
      // content — visual style, hierarchy and position otherwise
      // unchanged.
      px: 3,
      py: 3,
      display: 'flex',
      flexDirection: 'column',
      gap: 1.25,
      // The closer-to-the-spacer-above adjustment this used to carry
      // (mt: '-9.6px') now lives one level up, on the plain Box wrapping
      // this component's BottomAnchoredCollapse in the page component —
      // not here. BottomAnchoredCollapse's own root clips to a measured
      // height via `overflow: hidden`; a negative margin on *this* Box
      // (the thing actually measured) shifts it upward past that
      // measured height, so the clip cuts straight through the top-left/
      // top-right corner radius. Applying the same shift outside the
      // clipped element instead moves the whole already-sized banner as
      // a rigid unit, with nothing left inside to clip.
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flexShrink: 0 }}>
          {/* Steps back through the user's concept/synonym edits one at a
              time (see the page component's undoStack) — hidden entirely
              rather than shown disabled once there's nothing left to
              revert, per "hide Undo when there are no changes." */}
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
          {/* Plain text link, no icon — the only entry point into
              query-building; the collapsed summary below is otherwise
              entirely display-only. */}
          {groups.length > 0 ? (
            <Box
              role="button"
              onClick={() => setExpanded((v) => !v)}
              sx={{
                fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
                color: 'primary.main', cursor: 'pointer',
                '&:hover': { color: '#3d4891' },
              }}
            >
              {expanded ? 'Collapse' : 'Edit concepts'}
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Only ever rendered once the query names a known combination
          drug (see CombinationDrug/findCombinationDrug) — for every
          other, single-ingredient drug, nothing here changes at all. */}
      {combinationDrug ? (
        <CombinationScopeControl
          drug={combinationDrug}
          scope={combinationScope}
          onChange={onCombinationScopeChange}
        />
      ) : null}

      {groups.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', letterSpacing: '-0.01em' }}>
          No specific concepts recognised — showing broad results for this query.
        </Typography>
      ) : expanded ? (
        <ConceptDetails
          groups={groups}
          activeConcepts={activeConcepts}
          onAdd={onAddCustomConcept}
          onRemove={onRemoveConcept}
          addedSynonyms={addedSynonyms}
          onAddSynonym={onAddSynonym}
        />
      ) : (
        // Collapsed: every active concept, flat — no category grouping,
        // no chip-level controls. maxHeight/overflow is a safety net
        // against a pathologically large number of concepts, not
        // something expected to kick in normally.
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, maxHeight: 220, overflowY: 'auto' }}>
          {activeConcepts.map((c) => <ConceptSummaryChip key={c.key} label={c.label} />)}
        </Box>
      )}
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
  // "Narrow" (trade name only) vs "broad" (also match on ingredient
  // proximity) — only meaningful, and only shown, once conceptState.
  // combinationDrug is set (see CombinationScopeControl). Same lifecycle
  // as the rest of this group: scoped to one committed search, reset on
  // the next, so a stale "broad" choice never silently carries over onto
  // an unrelated later query.
  const [combinationScope, setCombinationScope] = useState<'narrow' | 'broad'>('narrow');
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
    setCombinationScope('narrow');
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
      // Only wired up once there's actually a combination drug to search
      // broadly for *and* the user has switched to that scope — narrow
      // (the default) relies purely on orTerms, same as any other drug.
      orPredicate: combinationScope === 'broad' && conceptState.combinationDrug
        ? (p) => ingredientsInProximity(p, conceptState.combinationDrug!.ingredients)
        : undefined,
    }),
    [committedQuery, publicationFilter, conceptState.matchOrTerms, conceptState.filterQualifier, conceptState.matchPredicates, conceptState.combinationDrug, combinationScope],
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

  // Fade-in for each half is delayed until its own fold-open Collapse is
  // nearly done (350ms into the 500ms animation); fade-out is immediate,
  // concurrent with fold-closed — see useDelayedTrue. Both the concepts
  // banner (BottomAnchoredCollapse) and the results Collapse below are
  // always rendered (never gated by an outer isCommittedSearch/expanded
  // conditional) — MUI's Collapse only plays its "enter" animation on a
  // genuine in:false→true prop change on an already-mounted instance; a
  // component that *mounts* already at in:true just renders pre-opened,
  // no animation, since Transition's `appear` isn't enabled by default.
  // Gating the Collapse itself behind a ternary (an earlier version of
  // this did exactly that, via a "just closed, linger one more cycle"
  // flag) recreates that exact fresh-mount case on every reopen.
  // `unmountOnExit` still reclaims each side's DOM once fully closed,
  // without the outer element ever actually unmounting.
  const bannerVisible = useDelayedTrue(isCommittedSearch, 350);
  const resultsVisible = useDelayedTrue(isCommittedSearch, 350);

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
      {/* Always rendered, unconditionally — never faded out or unmounted,
          regardless of showSlimLayout/expanded/committed-search state, so
          it stays visible through every transition. SlimSearchBar's own
          styling/positioning is untouched; only the wrapping Fade/
          unmountOnExit gate that used to hide it has been removed. */}
      <SlimSearchBar
        onBack={handleBackToSearch}
        showFilters={showSlimLayout}
        publicationFilter={publicationFilter}
        onPublicationFilterChange={setPublicationFilter}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={applySort}
      />

      <Box sx={{
        position: 'relative',
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
            (which has no query to interpret). Always rendered (in={} is
            what governs visibility, not a wrapping conditional) so this
            stays the same persistent Collapse instance across every
            open/close cycle — see the comment above bannerVisible/
            resultsVisible for why that matters. committedQuery/
            conceptState are only reset by the *next*
            handleFindPublications, so the banner keeps showing its last
            real content while folding away rather than going blank first.
            Folds downward (closes) / unfolds upward from the bottom
            (reopens) — see BottomAnchoredCollapse — the mirror image of
            the results list's own fold below, so the two meet in the
            middle. */}
        {/* mt here (not on the banner itself, one level down) pulls the
            whole collapse 30% closer to the spacer above than the column's
            own shared `gap` (32px) would otherwise leave it, without
            touching that gap (which also spaces unrelated siblings below).
            Deliberately outside BottomAnchoredCollapse: its root clips to a
            measured height via `overflow: hidden`, so a negative margin on
            the *measured* content shifts it upward past its own clip,
            slicing off the banner's top-left/top-right corner radius.
            Shifting this outer, unclipped Box instead moves the whole
            already-sized collapse as one rigid unit. */}
        <Box sx={{ mt: '-9.6px' }}>
          <BottomAnchoredCollapse in={isCommittedSearch} timeout={500}>
            <Box sx={{
              opacity: bannerVisible ? 1 : 0,
              transition: 'opacity 400ms ease',
            }}>
              <InterpretedConceptsBanner
                query={committedQuery}
                concepts={conceptState.allConcepts}
                onRemoveConcept={handleRemoveConcept}
                addedSynonyms={addedSynonyms}
                onAddSynonym={handleAddSynonym}
                canUndo={undoStack.length > 0}
                onUndo={handleUndo}
                onAddCustomConcept={handleAddCustomConcept}
                combinationDrug={conceptState.combinationDrug}
                combinationScope={combinationScope}
                onCombinationScopeChange={setCombinationScope}
              />
            </Box>
          </BottomAnchoredCollapse>
        </Box>

        {/* Absolutely positioned (see OrgBadge) — fades out in place rather
            than being conditionally unmounted, so nothing below it in this
            flex column has to shift when the slim layout takes over. */}
        <OrgBadge visible={!showSlimLayout} />

        {/* The header/search-area content fades out and collapses away into
            the sticky slim bar above once shown. unmountOnExit intentionally
            omitted — the search input inside must stay mounted throughout so
            it can dock via its own `docked` prop instead of ever being
            removed; see SearchCapsule. This keeps working the same way for a
            committed search as for the "browse full list" expand, since both
            now drive the same `showSlimLayout` flag.
            mt pushes the search area down for a more centred vertical
            balance against the (now shorter) preview below. Since the
            preview is the flex:1 item that fills whatever's left down to
            the bottom of the viewport, this fixed amount comes straight out
            of its height — the preview shrinks by exactly this much, its
            bottom edge/button position are otherwise untouched.
            The margin lives on this wrapping Box rather than on Collapse
            itself (or as a separate spacer flex item, which would pick up
            an extra `gap` on top of itself): Collapse drives its own
            `transition` inline while animating, which would silently win
            over — and so completely swallow — any transition declared via
            `sx` on that same element, leaving the margin to snap instantly
            instead of animating alongside it. */}
        <Box sx={{ mt: showSlimLayout ? 0 : '50px', transition: 'margin-top 0.5s ease' }}>
          <Collapse in={!showSlimLayout} timeout={500}>
            {/* Fades out over the same 500ms as the Collapse's own height
                animation (rather than being left to the height animation
                alone to imply), so the heading and search card visibly fade
                away in place instead of just shrinking.
                This opacity is applied individually to each piece below
                (the heading block, the "Find publications" button, the
                helper text, BooleanInfoBar) rather than once on a shared
                wrapper around all of them — SearchCapsule lives in here too
                (see SearchLandingCard) and, once docked, escapes via its
                own `position: fixed` to stay visible/anchored in the slim
                bar; opacity is a compositing property that still applies to
                position:fixed descendants despite them escaping normal
                layout, so a shared opacity:0 wrapper here would silently
                force the docked capsule invisible too. Individual opacity
                on everything *except* SearchCapsule avoids that. */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Box sx={{
                display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'center', maxWidth: 900, mx: 'auto',
                opacity: showSlimLayout ? 0 : 1,
                transition: 'opacity 0.5s ease',
              }}>
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
                <Box sx={{ opacity: showSlimLayout ? 0 : 1, transition: 'opacity 0.5s ease' }}>
                  <BooleanInfoBar />
                </Box>
              </Box>
            </Box>
          </Collapse>
        </Box>

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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: showSlimLayout ? 'none' : 1, minHeight: 0, mt: showSlimLayout ? '-32px' : '132px', transition: 'margin-top 0.5s ease' }}>
          {/* Standard (top-anchored) Collapse — the mirror image of the
              concepts banner's BottomAnchoredCollapse above: this folds
              upward (shrinks from the bottom) on close and unfolds
              downward from the top on reopen, so the two visibly close
              toward — and reopen from — a shared middle. Always rendered,
              same reasoning as the banner above: `unmountOnExit` reclaims
              the table's DOM once fully closed without the Collapse
              element itself ever being removed from the tree. */}
          <Collapse in={isCommittedSearch} timeout={500} unmountOnExit>
            <Box sx={{
              display: 'flex', flexDirection: 'column', gap: 1.5,
              opacity: resultsVisible ? 1 : 0,
              transition: 'opacity 400ms ease',
            }}>
              {phase === 'loading' ? (
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
              )}
            </Box>
          </Collapse>

          {/* Browse-full-list preview — mutually exclusive with the
              committed-results Collapse above, but left as a plain
              conditional (not folded/animated) since it isn't part of
              this request: the fold/close-toward-centre treatment is
              specifically for leaving/returning to a *committed* search,
              not for the initial preview-to-loading handoff on submit. */}
          {!isCommittedSearch ? (
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
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
