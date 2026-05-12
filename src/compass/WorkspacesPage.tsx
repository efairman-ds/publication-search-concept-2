import { useEffect, useId, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import {
  Buildings,
  CaretDown,
  DotsThree,
  FileText,
  Info,
  MagnifyingGlass,
  Plus,
  ShareNetwork,
  Star,
  UserCirclePlus,
} from '@phosphor-icons/react';
import { alpha } from '@mui/material/styles';
import type { Workspace } from './workspaceData';
import './border-animation.css';

// ── Sorting ────────────────────────────────────────────────────────────────────

type SortKey = 'lastUpdated' | 'scoreHigh' | 'scoreLow' | 'nameAZ' | 'nameZA' | 'trend' | 'trendDown';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'lastUpdated', label: 'Last updated' },
  { value: 'scoreHigh',   label: 'Score: high → low' },
  { value: 'scoreLow',    label: 'Score: low → high' },
  { value: 'nameAZ',      label: 'Name: A–Z' },
  { value: 'nameZA',      label: 'Name: Z–A' },
  { value: 'trend',       label: 'Trending up' },
  { value: 'trendDown',   label: 'Trending down' },
];

function sortWorkspaces(ws: Workspace[], key: SortKey): Workspace[] {
  const arr = [...ws];
  switch (key) {
    case 'lastUpdated': return arr.sort((a, b) => b.lastUpdated - a.lastUpdated);
    case 'scoreHigh':   return arr.sort((a, b) => b.score - a.score);
    case 'scoreLow':    return arr.sort((a, b) => a.score - b.score);
    case 'nameAZ':      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'nameZA':      return arr.sort((a, b) => b.name.localeCompare(a.name));
    case 'trend':       return arr.sort((a, b) => {
      const tA = a.sparkData[a.sparkData.length - 1] - a.sparkData[0];
      const tB = b.sparkData[b.sparkData.length - 1] - b.sparkData[0];
      return tB - tA;
    });
    case 'trendDown':   return arr.sort((a, b) => {
      const tA = a.sparkData[a.sparkData.length - 1] - a.sparkData[0];
      const tB = b.sparkData[b.sparkData.length - 1] - b.sparkData[0];
      return tA - tB;
    });
  }
}

function SortControl({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#383f45', whiteSpace: 'nowrap' }}>
        Sort by
      </Typography>
      <Select
        size="small"
        value={value}
        onChange={e => onChange(e.target.value as SortKey)}
        variant="outlined"
        sx={{
          fontSize: 14,
          fontWeight: 500,
          color: '#383f45',
          '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
          '& .MuiSelect-select': { py: '3px', pl: '6px' },
          '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.05), borderRadius: '6px' },
        }}
      >
        {SORT_OPTIONS.map(o => (
          <MenuItem key={o.value} value={o.value} sx={{ fontSize: 13 }}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}

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

// ── CTA banner ────────────────────────────────────────────────────────────────

function WorkspaceCTA() {
  return (
    <div className="cb-cta-outer">
    <div className="cb-cta-inner">
    <Box sx={{
      position: 'relative',
      borderRadius: '14px',
      py: 5,
      px: 4,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      textAlign: 'center',
    }}>
      {/* Decorative icon — right-aligned, inset to match container padding */}
      <WorkspacesIcon sx={{
        position: 'absolute',
        right: 32,
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: 200,
        color: '#4a56a8',
        opacity: 0.15,
        pointerEvents: 'none',
      }} />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Typography sx={{
          fontSize: 24,
          fontWeight: 700,
          color: '#23272e',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          mb: 1.5,
        }}>
          Track and benchmark your publication impact
        </Typography>
        <Typography sx={{
          fontSize: 16,
          fontWeight: 500,
          color: '#454c52',
          letterSpacing: '-0.01em',
          lineHeight: 1.5,
          maxWidth: 680,
          mx: 'auto',
        }}>
          Compare citation performance, benchmark against peers, and see how your research performs over time by building a workspace.
        </Typography>
      </Box>

      <Button
        variant="contained"
        startIcon={<Plus size={20} />}
        disableElevation
        sx={{
          position: 'relative',
          zIndex: 1,
          bgcolor: '#4a56a8',
          color: '#fff',
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          borderRadius: '8px',
          px: '22px',
          py: '14px',
          textTransform: 'none',
          whiteSpace: 'nowrap',
          '&:hover': { bgcolor: '#3d4891' },
        }}
      >
        Start a new workspace
      </Button>
    </Box>
    </div>
    </div>
  );
}

// ── Sparkline ──────────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  const uid = useId();
  const pathRef = useRef<SVGPathElement>(null);
  const W = 110, H = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / range) * (H - 6) - 3,
  ]);
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = data.reduce((a, b) => a + b, 0) / n;
  const slope = data.reduce((s, y, x) => s + (x - xMean) * (y - yMean), 0) /
                data.reduce((s, _, x) => s + (x - xMean) ** 2, 0);
  const endColor = slope >= 0 ? '#2e7d32' : '#c62828';
  const gradId = `spark-${uid}`;

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const raf = requestAnimationFrame(() => {
      const len = path.getTotalLength();
      if (!len) return;
      path.style.strokeDasharray = `${len}`;
      path.style.strokeDashoffset = `${len}`;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.4, 0, 0.2, 1)';
      path.style.strokeDashoffset = '0';
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b0b8cc" />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>
      <path ref={pathRef} d={linePath} fill="none" stroke={`url(#${gradId})`} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Workspace card ─────────────────────────────────────────────────────────────

interface CardProps {
  workspace: Workspace;
  onMenuOpen: (e: React.MouseEvent<HTMLButtonElement>, id: string) => void;
}

function WorkspaceCard({ workspace, onMenuOpen }: CardProps) {
  return (
    <Box sx={{
      bgcolor: '#fff',
      border: '1px solid #bec2d6',
      borderRadius: '12px',
      p: 3,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      minWidth: 0,
      cursor: 'pointer',
      transition: 'box-shadow 0.2s, border-color 0.2s',
      '&:hover': {
        boxShadow: '0 4px 20px rgba(74,86,168,0.13)',
        borderColor: '#a8aece',
      },
    }}>
      {/* Title row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WorkspacesIcon sx={{ fontSize: 24, color: 'primary.main', flexShrink: 0 }} />
        <Typography sx={{
          flex: 1,
          fontSize: 18,
          fontWeight: 600,
          color: 'text.primary',
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {workspace.name}
        </Typography>
        <IconButton
          size="small"
          onClick={(e) => onMenuOpen(e, workspace.id)}
          sx={{ flexShrink: 0, color: 'text.disabled', '&:hover': { color: 'text.primary', bgcolor: (t) => alpha(t.palette.primary.main, 0.06) } }}
        >
          <DotsThree size={20} weight="bold" />
        </IconButton>
      </Box>

      {/* Meta row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <FileText size={18} color="#8d96a5" style={{ flexShrink: 0 }} />
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'text.secondary', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {workspace.publications.toLocaleString()} publications
          </Typography>
        </Box>
        {workspace.createdBy && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <UserCirclePlus size={18} color="#8d96a5" style={{ flexShrink: 0 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'text.secondary', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              Created by {workspace.createdBy}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Score snapshot */}
      <Box sx={{
        bgcolor: '#f6f7fb',
        borderRadius: '4px',
        px: 2,
        py: 2.5,
        display: 'flex',
        alignItems: 'stretch',
      }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography sx={{
            fontSize: 10,
            fontWeight: 600,
            color: 'text.secondary',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1,
            mb: 0.75,
            textAlign: 'center',
          }}>
            Score
          </Typography>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <Typography sx={{
              fontSize: 24,
              fontWeight: 600,
              color: 'text.primary',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              textAlign: 'center',
            }}>
              {workspace.score.toLocaleString()}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography sx={{
            fontSize: 10,
            fontWeight: 600,
            color: 'text.secondary',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1,
            mb: 0.75,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}>
            Trend (3M)
          </Typography>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <Sparkline data={workspace.sparkData} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count, tooltip, collapsed, onToggle, sortControl }: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tooltip?: string;
  collapsed: boolean;
  onToggle: () => void;
  sortControl?: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {icon}
      <Typography sx={{ fontSize: 20, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.01em' }}>
        {title}{' '}
        <Box component="span" sx={{ fontWeight: 400 }}>({count})</Box>
      </Typography>
      {tooltip && (
        <Tooltip title={tooltip} placement="right" arrow slotProps={tooltipSlotProps}>
          <Box component="span" sx={{ display: 'inline-flex', cursor: 'help', color: 'text.disabled', ml: 0.25 }}>
            <Info size={20} />
          </Box>
        </Tooltip>
      )}
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {sortControl}
        <IconButton
          size="small"
          onClick={onToggle}
          sx={{
            color: 'text.disabled',
            '&:hover': { color: 'text.secondary', bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
          }}
        >
          <CaretDown
            size={28}
            style={{
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.25s',
            }}
          />
        </IconButton>
      </Box>
    </Box>
  );
}

// ── Card grid ──────────────────────────────────────────────────────────────────

function CardGrid({ workspaces, onMenuOpen }: { workspaces: Workspace[]; onMenuOpen: CardProps['onMenuOpen'] }) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
      gap: 2,
    }}>
      {workspaces.map(w => (
        <WorkspaceCard key={w.id} workspace={w} onMenuOpen={onMenuOpen} />
      ))}
    </Box>
  );
}

// ── Props / page ───────────────────────────────────────────────────────────────

interface Props {
  sharedWorkspaces: Workspace[];
  favouriteIds: string[];
  onToggleFavourite: (id: string) => void;
}

export default function WorkspacesPage({ sharedWorkspaces, favouriteIds, onToggleFavourite }: Props) {
  const [search, setSearch] = useState('');
  const [showAllShared, setShowAllShared] = useState(false);
  const [favCollapsed,    setFavCollapsed]    = useState(false);
  const [sharedCollapsed, setSharedCollapsed] = useState(false);
  const [sharedSort, setSharedSort] = useState<SortKey>('lastUpdated');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuCardId, setMenuCardId] = useState<string | null>(null);

  const filter = (ws: Workspace[]) =>
    search.trim() ? ws.filter(w => w.name.toLowerCase().includes(search.toLowerCase())) : ws;

  const favourited     = favouriteIds.map(id => sharedWorkspaces.find(w => w.id === id)).filter((w): w is Workspace => !!w);
  const filteredFav    = filter(favourited);
  const filteredShared = sortWorkspaces(filter(sharedWorkspaces), sharedSort);
  const shownShared    = showAllShared ? filteredShared : filteredShared.slice(0, 6);
  const hiddenCount    = filteredShared.length - 6;
  const noResults      = filteredFav.length === 0 && filteredShared.length === 0 && search.trim() !== '';

  const handleMenuOpen = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    setMenuAnchor(e.currentTarget);
    setMenuCardId(id);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuCardId(null);
  };

  const menuIsFav = menuCardId ? favouriteIds.includes(menuCardId) : false;

  const handleFavouriteClick = () => {
    if (menuCardId) onToggleFavourite(menuCardId);
    closeMenu();
  };

  return (
    <Box
      component="main"
      sx={{
        ml: '72px',
        flex: 1,
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflowY: 'auto',
      }}
    >
      {/* Watermark */}
      <Box
        component="img"
        src="/watermark.svg"
        aria-hidden
        sx={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 330,
          height: 370,
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: 0.5,
          zIndex: 0,
        }}
      />

      <Box sx={{ px: 8, py: 4, display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <WorkspacesIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Typography sx={{ fontSize: 28, fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              Workspaces
            </Typography>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: '#d1d4e3',
              borderRadius: '100px',
              px: 2,
              py: 1,
              whiteSpace: 'nowrap',
            }}>
              <Buildings size={20} color="#383f45" />
              <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#383f45', letterSpacing: '-0.01em' }}>
                AstraZeneca
              </Typography>
            </Box>
          </Box>

          <OutlinedInput
            size="small"
            placeholder="Search for a workspace"
            value={search}
            onChange={e => setSearch(e.target.value)}
            startAdornment={
              <InputAdornment position="start">
                <MagnifyingGlass size={16} color="#8d96a5" />
              </InputAdornment>
            }
            sx={{
              width: 235,
              bgcolor: '#fafafa',
              fontSize: 15,
              letterSpacing: '-0.01em',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#ced2d6' },
              '& .MuiOutlinedInput-input': { py: '10.5px' },
            }}
          />
        </Box>

        {/* ── CTA banner ── */}
        <WorkspaceCTA />

        {/* ── Favourites ── */}
        {filteredFav.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SectionHeader
              icon={<Star size={24} weight="fill" color="#f59e0b" />}
              title="Favourites"
              count={filteredFav.length}
              collapsed={favCollapsed}
              onToggle={() => setFavCollapsed(p => !p)}
            />
            <Collapse in={!favCollapsed} timeout={220}>
              <CardGrid workspaces={filteredFav} onMenuOpen={handleMenuOpen} />
            </Collapse>
          </Box>
        )}

        {/* ── Shared with you ── */}
        {filteredShared.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SectionHeader
              icon={<ShareNetwork size={24} color="#24292e" />}
              title="Shared with you"
              count={filteredShared.length}
              tooltip="Workspaces created by others in your organisation. Workspace score reflects the overall performance of your publications, based on citation impact, recency, and field relevance."
              collapsed={sharedCollapsed}
              onToggle={() => setSharedCollapsed(p => !p)}
              sortControl={<SortControl value={sharedSort} onChange={setSharedSort} />}
            />
            <Collapse in={!sharedCollapsed} timeout={220}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <CardGrid workspaces={shownShared} onMenuOpen={handleMenuOpen} />
                {filteredShared.length > 6 && (
                  <Button
                    fullWidth
                    disableElevation
                    onClick={() => setShowAllShared(p => !p)}
                    sx={{
                      bgcolor: '#d1d4e3',
                      color: 'rgba(0,0,0,0.6)',
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      borderRadius: '8px',
                      px: '22px',
                      py: '14px',
                      textTransform: 'none',
                      '&:hover': { bgcolor: alpha('#d1d4e3', 0.75) },
                    }}
                  >
                    {showAllShared ? 'Show fewer' : `View more (${hiddenCount})`}
                  </Button>
                )}
              </Box>
            </Collapse>
          </Box>
        )}

        {/* ── No results ── */}
        {noResults && (
          <Typography sx={{ color: 'text.disabled', textAlign: 'center', py: 8, fontSize: 16 }}>
            No workspaces match "{search}"
          </Typography>
        )}
      </Box>

      {/* ── Ellipsis menu ── */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              minWidth: 190,
            },
          },
        }}
      >
        <MenuItem onClick={handleFavouriteClick} sx={{ fontSize: 14, letterSpacing: '-0.01em', py: 1.25 }}>
          {menuIsFav ? 'Remove from favourites' : 'Add to favourites'}
        </MenuItem>
      </Menu>
    </Box>
  );
}
