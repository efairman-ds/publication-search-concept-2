import { createTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';

export { alpha };

export const theme = createTheme({
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    allVariants: {
      letterSpacing: '-0.01em',
    },
  },
  palette: {
    primary: {
      main: '#4a56a8',
    },
    text: {
      primary: '#24292e',
      secondary: '#676e76',
      disabled: '#8d96a5',
    },
    background: {
      default: '#e4e6f0',
      paper: '#fafcfe',
    },
    divider: '#e7e9ee',
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#e4e6f0',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          // MUI's default ripple colour; tint to match accent
          '& .MuiTouchRipple-root': {
            color: '#4a56a8',
          },
        },
      },
    },
  },
});
