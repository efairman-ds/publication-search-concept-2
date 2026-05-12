import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import { alpha } from '@mui/material/styles';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { WORKSPACES } from './workspaces';

type Props = {
  isVisible: boolean;
  leftOffset: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export default function WorkspaceFlyout({ isVisible, leftOffset, onMouseEnter, onMouseLeave }: Props) {
  const [search, setSearch] = useState('');

  const filtered = WORKSPACES.filter(w =>
    w.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      sx={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: leftOffset,
        width: 260,
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        // Side-panel elevation: directional shadow rather than MUI's centred defaults
        boxShadow: (t) => `4px 0 24px ${alpha(t.palette.text.primary, 0.07)}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 99,
        transition: (t) =>
          t.transitions.create(['left', 'opacity', 'transform'], {
            duration: t.transitions.duration.standard,
          }),
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transform: isVisible ? 'translateX(0)' : 'translateX(-6px)',
      }}
    >
      {/* ── Header ── */}
      <Box sx={{
        px: 2,
        pt: 1.5,
        pb: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <Typography sx={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'text.primary',
        }}>
          Workspaces
        </Typography>
        <Link
          component="button"
          underline="hover"
          onClick={() => {}}
          sx={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'primary.main',
            opacity: 0.8,
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            transition: (t) => t.transitions.create('opacity'),
            '&:hover': { opacity: 1 },
          }}
        >
          View all
        </Link>
      </Box>

      {/* ── Search ── */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search workspaces…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <MagnifyingGlass size={16} color="#8d96a5" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearch('')}
                    edge="end"
                    sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                  >
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
              borderRadius: (t) => `${(t.shape.borderRadius as number) * 0.8}px`,
              fontSize: 13,
              transition: (t) => t.transitions.create('background-color'),
              '&.Mui-focused': { bgcolor: 'background.paper' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main',
              },
            },
            '& .MuiInputBase-input': {
              fontSize: 13,
              py: '7px',
              '&::placeholder': { color: 'text.disabled', opacity: 1 },
            },
          }}
        />
      </Box>

      {/* ── Workspace list — flex:1 + overflow:auto makes it scroll when content exceeds height ── */}
      <List
        disablePadding
        sx={{
          flex: 1,
          overflowY: 'auto',
          py: 1,
          // Thin scrollbar using standard CSS; falls back gracefully on unsupported browsers
          scrollbarWidth: 'thin',
          scrollbarColor: (t) => `${t.palette.divider} transparent`,
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'divider',
            borderRadius: 2,
          },
        }}
      >
        {filtered.length > 0 ? (
          filtered.map(workspace => (
            <ListItemButton
              key={workspace}
              sx={{
                px: 2,
                py: 1,
                '&:hover': {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: 1.5, color: 'text.disabled' }}>
                <WorkspacesIcon sx={{ fontSize: 16 }} />
              </ListItemIcon>
              <ListItemText
                primary={workspace}
                slotProps={{
                  primary: {
                    sx: {
                      fontSize: 13,
                      fontWeight: 500,
                      letterSpacing: '-0.01em',
                      color: 'text.primary',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                  },
                }}
                sx={{ m: 0 }}
              />
            </ListItemButton>
          ))
        ) : (
          <Typography sx={{
            p: 2,
            fontSize: 13,
            color: 'text.disabled',
            textAlign: 'center',
          }}>
            No workspaces found
          </Typography>
        )}
      </List>
    </Box>
  );
}
