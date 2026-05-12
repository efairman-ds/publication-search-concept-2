import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';
import Sidebar from './Sidebar';
import WorkspaceFlyout from './WorkspaceFlyout';
import WorkspacesPage from './WorkspacesPage';
import Onboarding from './Onboarding';
import { SHARED_WORKSPACES } from './workspaceData';

const COLLAPSED_WIDTH = 72;
const EXPANDED_WIDTH  = 220;
const CLOSE_DELAY_MS  = 150;

function CompassDemoInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flyoutOpen,  setFlyoutOpen]  = useState(false);
  const [activeNavId, setActiveNavId] = useState('home');
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem('compass_onboarding_complete') !== 'true'
  );

  const favouriteNames = favouriteIds
    .map(id => SHARED_WORKSPACES.find(w => w.id === id)?.name)
    .filter((n): n is string => !!n);

  const handleToggleFavourite = useCallback((id: string) => {
    setFavouriteIds(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  }, []);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setSidebarOpen(false);
      setFlyoutOpen(false);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  const handleSidebarEnter      = useCallback(() => { cancelClose(); setSidebarOpen(true); }, [cancelClose]);
  const handleSidebarLeave      = useCallback(() => { scheduleClose(); }, [scheduleClose]);
  const handleWorkspacesEnter   = useCallback(() => { cancelClose(); setSidebarOpen(true); setFlyoutOpen(true); setActiveNavId('workspaces'); }, [cancelClose]);
  const handleOtherNavItemEnter = useCallback(() => { cancelClose(); setSidebarOpen(true); setFlyoutOpen(false); }, [cancelClose]);
  const handleFlyoutEnter       = useCallback(() => { cancelClose(); }, [cancelClose]);
  const handleFlyoutLeave       = useCallback(() => { scheduleClose(); }, [scheduleClose]);

  const flyoutLeft = sidebarOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}

      <Sidebar
        isExpanded={sidebarOpen}
        activeNavId={activeNavId}
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
        onWorkspacesEnter={handleWorkspacesEnter}
        onOtherNavItemEnter={handleOtherNavItemEnter}
        favouriteNames={favouriteNames}
      />

      <WorkspaceFlyout
        isVisible={flyoutOpen}
        leftOffset={flyoutLeft}
        onMouseEnter={handleFlyoutEnter}
        onMouseLeave={handleFlyoutLeave}
      />

      <WorkspacesPage
        sharedWorkspaces={SHARED_WORKSPACES}
        favouriteIds={favouriteIds}
        onToggleFavourite={handleToggleFavourite}
      />
    </Box>
  );
}

export default function CompassDemo() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CompassDemoInner />
    </ThemeProvider>
  );
}
