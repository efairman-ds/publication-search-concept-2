import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { ArrowRight, Buildings } from '@phosphor-icons/react';
import Sidebar from './Sidebar';

// ── Persistence ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'compass_onboarding_complete';
function markOnboardingComplete() {
  localStorage.setItem(STORAGE_KEY, 'true');
}

const noop = () => {};

// ── Step indicator dots (ring+dot active, clickable for visited steps) ────────

function StepDots({ current, total, onNavigate }: {
  current: number;
  total: number;
  onNavigate: (step: number) => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', alignItems: 'center', mt: 3 }}>
      {Array.from({ length: total }).map((_, i) => {
        const clickable = i < current;
        return i === current ? (
          <Box key={i} sx={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid', borderColor: 'primary.main',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main' }} />
          </Box>
        ) : (
          <Box
            key={i}
            onClick={clickable ? () => onNavigate(i) : undefined}
            sx={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              bgcolor: 'text.disabled',
              cursor: clickable ? 'pointer' : 'default',
              transition: 'opacity 0.15s',
              '&:hover': clickable ? { opacity: 0.7 } : {},
            }}
          />
        );
      })}
    </Box>
  );
}

// ── Preview sparkline (step 2) ─────────────────────────────────────────────────

const PREVIEW_SPARK = [58, 52, 56, 50, 54, 58, 55, 60, 57, 61, 63, 65];

function PreviewSparkline() {
  const W = 100, H = 36;
  const min = Math.min(...PREVIEW_SPARK);
  const max = Math.max(...PREVIEW_SPARK);
  const range = max - min || 1;
  const pts = PREVIEW_SPARK.map((v, i) => {
    const x = (i / (PREVIEW_SPARK.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="preview-spark-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9e9e9e" />
          <stop offset="100%" stopColor="#2e7d32" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke="url(#preview-spark-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Workspace preview card (step 2) ───────────────────────────────────────────

function WorkspacePreview() {
  return (
    <Box sx={{
      bgcolor: '#f6f7fb', border: '1px solid #bec2d6', borderRadius: '12px', p: 3,
      display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WorkspacesIcon sx={{ fontSize: 24, color: 'primary.main', flexShrink: 0 }} />
        <Typography sx={{
          flex: 1, fontSize: 18, fontWeight: 600, color: 'text.primary',
          letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', minWidth: 0,
        }}>
          Oncology
        </Typography>
      </Box>

      <Box sx={{
        bgcolor: '#fff', borderRadius: '4px', px: 2, py: 2.5,
        display: 'flex', alignItems: 'stretch',
      }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography sx={{
            fontSize: 10, fontWeight: 600, color: 'text.secondary',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            lineHeight: 1, mb: 0.75, textAlign: 'center',
          }}>
            Score
          </Typography>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 24, fontWeight: 600, color: 'text.primary', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              1,245
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography sx={{
            fontSize: 10, fontWeight: 600, color: 'text.secondary',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            lineHeight: 1, mb: 0.75, textAlign: 'center', whiteSpace: 'nowrap',
          }}>
            Trend (3M)
          </Typography>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <PreviewSparkline />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ── Benchmark mini bar (step 3) ────────────────────────────────────────────────

function BenchmarkBar({ value }: { value: number }) {
  const trackW = 80;
  const markerW = 14;
  const markerX = Math.round((value / 350) * (trackW - markerW));

  return (
    <Box sx={{ position: 'relative', width: trackW, height: 4, flexShrink: 0 }}>
      <Box sx={{
        position: 'absolute', left: 0, right: 0, height: 2, top: 1,
        bgcolor: 'divider', borderRadius: 1,
      }} />
      <Box sx={{
        position: 'absolute', left: markerX, width: markerW, height: 4, top: 0,
        bgcolor: '#f59e0b', borderRadius: 1,
      }} />
    </Box>
  );
}

// ── Benchmark row (step 3) ────────────────────────────────────────────────────

function BenchmarkRow({ name, value }: { name: string; value: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <CheckCircle sx={{ fontSize: 20, color: 'primary.main', flexShrink: 0 }} />
      <Buildings size={14} color="#676e76" style={{ flexShrink: 0 }} />
      <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'text.primary', flex: 1, minWidth: 0 }}>
        {name}
      </Typography>
      <BenchmarkBar value={value} />
      <Typography sx={{ fontSize: 14, color: 'text.secondary', minWidth: 28, textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
}

// ── Shared button style ────────────────────────────────────────────────────────

const btnSx = {
  borderRadius: '10px',
  fontWeight: 600,
  fontSize: 15,
  py: 1.5,
  textTransform: 'none' as const,
  letterSpacing: '-0.01em',
};

// ── Main export ────────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setSidebarOpen(false), 150);
  }, [cancelClose]);

  const next = () => { setDir(1); setStep(s => s + 1); };
  const navigate = (i: number) => { setDir(i > step ? 1 : -1); setStep(i); };
  const finish = () => { markOnboardingComplete(); onComplete(); };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>

      <Sidebar
        isExpanded={sidebarOpen}
        activeNavId="none"
        onMouseEnter={() => { cancelClose(); setSidebarOpen(true); }}
        onMouseLeave={scheduleClose}
        onWorkspacesEnter={noop}
        onOtherNavItemEnter={noop}
        hideNav
      />

      {/* Main content */}
      <Box sx={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>

        {/* Centered card */}
        <Box sx={{ px: 2, zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <Box sx={{
            width: 500,
            maxWidth: 'calc(100% - 32px)',
            bgcolor: 'background.paper',
            borderRadius: '20px',
            p: 5,
            boxShadow: '0 2px 24px rgba(0,0,0,0.07)',
          }}>

            <Box
              key={step}
              sx={{
                '@keyframes slideFromRight': {
                  from: { opacity: 0, transform: 'translateX(18px)' },
                  to:   { opacity: 1, transform: 'translateX(0)' },
                },
                '@keyframes slideFromLeft': {
                  from: { opacity: 0, transform: 'translateX(-18px)' },
                  to:   { opacity: 1, transform: 'translateX(0)' },
                },
                animation: `${dir > 0 ? 'slideFromRight' : 'slideFromLeft'} 0.22s ease both`,
              }}
            >

            {/* ── Step 1: Welcome ── */}
            {step === 0 && (
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.75 }}>
                  Welcome to
                </Typography>
                <Box sx={{ position: 'relative', height: 38, overflow: 'hidden', mb: 3 }}>
                  <Box
                    component="img"
                    src="/compass-logo-featured.svg"
                    alt="Compass"
                    sx={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 160, height: 'auto',
                    }}
                  />
                </Box>
                <Typography sx={{ fontSize: 15, color: 'text.secondary', lineHeight: 1.7, mb: 4 }}>
                  Compass helps you understand how your publications perform and how they compare
                  to relevant benchmarks, helping you to identify your work and opportunities to
                  improve your publication strategy.
                </Typography>
                <Button
                  variant="contained" fullWidth size="large"
                  onClick={next}
                  endIcon={<ArrowRight size={18} />}
                  sx={btnSx}
                >
                  Next
                </Button>
              </Box>
            )}

            {/* ── Step 2: Create a workspace ── */}
            {step === 1 && (
              <Box>
                <Typography sx={{
                  fontSize: 22, fontWeight: 700, color: 'text.primary',
                  textAlign: 'center', letterSpacing: '-0.02em', mb: 2.5,
                }}>
                  Create a workspace
                </Typography>
                <Box sx={{ mb: 2.5 }}>
                  <WorkspacePreview />
                </Box>
                <Typography sx={{
                  fontSize: 14, color: 'text.secondary', lineHeight: 1.7,
                  textAlign: 'center', mb: 3.5,
                }}>
                  Start by creating a workspace to collect your publications in one place
                  and track how your research is performing.
                </Typography>
                <Button
                  variant="contained" fullWidth size="large"
                  onClick={next}
                  endIcon={<ArrowRight size={18} />}
                  sx={btnSx}
                >
                  Next
                </Button>
              </Box>
            )}

            {/* ── Step 3: Set up benchmarks ── */}
            {step === 2 && (
              <Box>
                <Typography sx={{
                  fontSize: 22, fontWeight: 700, color: 'text.primary',
                  textAlign: 'center', letterSpacing: '-0.02em', mb: 2.5,
                }}>
                  Set up benchmarks
                </Typography>
                <Box sx={{
                  bgcolor: '#f6f7fb', borderRadius: '12px', p: 2,
                  display: 'flex', flexDirection: 'column', gap: 1.75, mb: 2.5,
                }}>
                  <BenchmarkRow name="Pfizer" value={275} />
                  <BenchmarkRow name="Nivolumab" value={210} />
                  <BenchmarkRow name="Gastric cancer" value={165} />
                </Box>
                <Typography sx={{
                  fontSize: 14, color: 'text.secondary', lineHeight: 1.7,
                  textAlign: 'center', mb: 3.5,
                }}>
                  Set up benchmarks to see how your research performs compared to relevant
                  disease areas, competitors, and key drugs.
                </Typography>
                <Button
                  variant="contained" fullWidth size="large"
                  onClick={finish}
                  sx={btnSx}
                >
                  Finish
                </Button>
              </Box>
            )}

            <StepDots current={step} total={3} onNavigate={navigate} />
            </Box>
          </Box>
        </Box>

        {/* Decorative watermark — bottom right */}
        <Box
          component="img"
          src="/watermark.svg"
          alt=""
          sx={{
            position: 'absolute',
            bottom: -40,
            right: -40,
            width: 380,
            height: 'auto',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      </Box>
    </Box>
  );
}
