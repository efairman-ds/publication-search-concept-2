import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import { alpha } from '@mui/material/styles';
import { CaretRight, MagnifyingGlass, Question, Star, User } from '@phosphor-icons/react';
import { RECENTLY_VIEWED } from './workspaces';

// ── Nav items ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'search',     label: 'Search',     icon: <MagnifyingGlass size={20} /> },
  { id: 'workspaces', label: 'Workspaces', icon: <WorkspacesIcon sx={{ fontSize: 20 }} /> },
];

// ── Shared nav item button ─────────────────────────────────────────────────────

function NavButton({
  isExpanded,
  selected,
  onMouseEnter,
  icon,
  label,
  children,
}: {
  isExpanded: boolean;
  selected: boolean;
  onMouseEnter: () => void;
  icon: React.ReactNode;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <ListItemButton
      selected={selected}
      onMouseEnter={onMouseEnter}
      disableGutters
      sx={{
        borderRadius: (t) => `${t.shape.borderRadius}px`,
        height: 40,
        minHeight: 40,
        pl: '18px',
        pr: 1,
        py: 0,
        justifyContent: 'flex-start',
        color: selected ? 'primary.main' : '#383f45',
        transition: (t) =>
          t.transitions.create(['background-color', 'color'], {
            duration: t.transitions.duration.standard,
          }),
        '&:hover': {
          bgcolor: (t) => alpha(t.palette.primary.main, 0.07),
          color: selected ? 'primary.main' : '#383f45',
        },
        '&.Mui-selected': {
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
          color: 'primary.main',
        },
        '&.Mui-selected:hover': {
          bgcolor: (t) => alpha(t.palette.primary.main, 0.16),
        },
      }}
    >
      <ListItemIcon sx={{
        minWidth: 0,
        mr: 1.25,
        justifyContent: 'center',
        color: 'inherit',
        flexShrink: 0,
        transition: (t) => t.transitions.create('margin', { duration: t.transitions.duration.standard }),
      }}>
        {icon}
      </ListItemIcon>

      <ListItemText
        primary={label}
        slotProps={{
          primary: {
            sx: {
              ...typography13,
              fontWeight: selected ? 600 : 400,
              whiteSpace: 'nowrap',
            },
          },
        }}
        sx={{
          m: 0,
          opacity: isExpanded ? 1 : 0,
          maxWidth: isExpanded ? 160 : 0,
          overflow: 'hidden',
          transition: (t) =>
            t.transitions.create(['opacity', 'max-width'], {
              duration: t.transitions.duration.standard,
              delay: isExpanded ? 40 : 0,
            }),
        }}
      />

      {children}
    </ListItemButton>
  );
}

// Shared typography scale used consistently throughout
const typography13 = { fontSize: 14, letterSpacing: '-0.01em', lineHeight: 1 } as const;

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  isExpanded: boolean;
  activeNavId: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onWorkspacesEnter: () => void;
  onOtherNavItemEnter: () => void;
  favouriteNames?: string[];
};

export default function Sidebar({
  isExpanded,
  activeNavId,
  onMouseEnter,
  onMouseLeave,
  onWorkspacesEnter,
  onOtherNavItemEnter,
  favouriteNames = [],
}: Props) {
  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      sx={{
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        zIndex: 100,
        width: isExpanded ? 220 : 72,
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: (t) =>
          t.transitions.create('width', {
            duration: t.transitions.duration.standard,
            easing: t.transitions.easing.sharp,
          }),
      }}
    >
      {/* ── Logo ── */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.75,
        pt: '12px',
        pb: '10px',
        flexShrink: 0,
      }}>
        <Box sx={{ position: 'relative', height: 52, width: '100%' }}>
          <Box
            component="img"
            src="/compass-icon.png"
            alt=""
            sx={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              height: 36, width: 36,
              objectFit: 'contain',
              opacity: isExpanded ? 0 : 1,
              transition: (t) => t.transitions.create('opacity', { duration: t.transitions.duration.standard }),
            }}
          />
          <Box
            component="img"
            src="/compass-logo-featured.svg"
            alt="Compass"
            sx={{
              position: 'absolute', top: '50%', left: 16, right: 16,
              transform: 'translateY(-50%)',
              width: 'calc(100% - 32px)', height: 'auto',
              opacity: isExpanded ? 1 : 0,
              transition: (t) => t.transitions.create('opacity', {
                duration: t.transitions.duration.standard,
                delay: isExpanded ? 60 : 0,
              }),
            }}
          />
        </Box>
        <Divider sx={{ width: 56 }} />
      </Box>

      {/* ── Primary nav items ── */}
      <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: '4px', p: 1, flexShrink: 0 }}>
        {NAV_ITEMS.map(item => (
          <NavButton
            key={item.id}
            isExpanded={isExpanded}
            selected={activeNavId === item.id}
            onMouseEnter={item.id === 'workspaces' ? onWorkspacesEnter : onOtherNavItemEnter}
            icon={item.icon}
            label={item.label}
          >
            {/* Chevron on Workspaces — only rendered when expanded to avoid affecting centered layout */}
            {item.id === 'workspaces' && (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                overflow: 'hidden',
                ml: isExpanded ? 'auto' : 0,
                width: isExpanded ? 16 : 0,
                opacity: isExpanded ? 1 : 0,
                transition: (t) =>
                  t.transitions.create(['opacity', 'width', 'margin'], {
                    duration: t.transitions.duration.standard,
                    delay: isExpanded ? 40 : 0,
                  }),
              }}>
                <CaretRight size={16} />
              </Box>
            )}
          </NavButton>
        ))}
      </List>

      {/* ── Favourites section ── */}
      <Collapse in={isExpanded && favouriteNames.length > 0} timeout={220} unmountOnExit>
        <Box sx={{ px: 1, pt: 2, pb: 0.5 }}>
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: 'text.disabled',
              px: 1,
              pb: 1,
              lineHeight: 1,
            }}
          >
            Favourites
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {favouriteNames.map(name => (
              <ListItemButton
                key={name}
                disableGutters
                sx={{
                  borderRadius: (t) => `${t.shape.borderRadius}px`,
                  height: 36,
                  px: 1,
                  py: 0,
                  color: '#383f45',
                  transition: (t) => t.transitions.create(['background-color', 'color']),
                  '&:hover': {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.07),
                    color: '#383f45',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 1.25, color: 'inherit', flexShrink: 0 }}>
                  <Star size={16} />
                </ListItemIcon>
                <ListItemText
                  primary={name}
                  slotProps={{
                    primary: {
                      sx: {
                        fontSize: 14,
                        letterSpacing: '-0.01em',
                        fontWeight: 600,
                        color: '#383f45',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    },
                  }}
                  sx={{ m: 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Collapse>

      {/* ── Recently Viewed section ── */}
      <Collapse in={isExpanded} timeout={220} unmountOnExit={false}>
        <Box sx={{ px: 1, pt: 2, pb: 0.5 }}>
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: 'text.disabled',
              px: 1,
              pb: 1,
              lineHeight: 1,
            }}
          >
            Recently Viewed
          </Typography>

          <Divider sx={{ mb: 1 }} />

          <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {RECENTLY_VIEWED.map(name => (
              <ListItemButton
                key={name}
                disableGutters
                sx={{
                  borderRadius: (t) => `${t.shape.borderRadius}px`,
                  height: 36,
                  px: 1,
                  py: 0,
                  color: '#383f45',
                  transition: (t) => t.transitions.create(['background-color', 'color']),
                  '&:hover': {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.07),
                    color: '#383f45',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 1.25, color: 'inherit', flexShrink: 0 }}>
                  <WorkspacesIcon sx={{ fontSize: 16 }} />
                </ListItemIcon>
                <ListItemText
                  primary={name}
                  slotProps={{
                    primary: {
                      sx: {
                        fontSize: 14,
                        letterSpacing: '-0.01em',
                        fontWeight: 600,
                        color: '#383f45',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    },
                  }}
                  sx={{ m: 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Collapse>

      {/* ── Global nav — mt:auto pins it to the bottom ── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, mt: 'auto' }}>
        {[
          { icon: <User size={20} />, label: 'Account' },
          { icon: <Question size={20} />, label: 'Help' },
        ].map(({ icon, label }) => (
          <Box
            key={label}
            title={label}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48,
              borderRadius: '30px',
              cursor: 'pointer',
              color: 'text.disabled',
              transition: (t) => t.transitions.create(['background-color', 'color']),
              '&:hover': {
                bgcolor: (t) => alpha(t.palette.primary.main, 0.07),
                color: 'primary.main',
              },
            }}
          >
            {icon}
          </Box>
        ))}
        <Divider sx={{ width: '100%', my: 1 }} />
        <Typography sx={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'text.disabled',
          textAlign: 'center',
          pb: 2,
          lineHeight: 1.5,
        }}>
          Digital<br />Science
        </Typography>
      </Box>
    </Box>
  );
}
