import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { ArrowRight, Buildings, FileText, UserCircle } from '@phosphor-icons/react';
import Sidebar from './Sidebar';

// ── Persistence ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'compass_onboarding_complete';
function markOnboardingComplete() {
  localStorage.setItem(STORAGE_KEY, 'true');
}

const noop = () => {};

// ── AstraZeneca org chip ───────────────────────────────────────────────────────

function OrgChip() {
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.75,
      px: 1.5, py: 0.75,
      borderRadius: '20px',
      border: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper',
    }}>
      <Buildings size={15} color="#676e76" />
      <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.primary', lineHeight: 1 }}>
        AstraZeneca
      </Typography>
    </Box>
  );
}

// ── Step indicator dots (ring+dot active, small dot inactive) ──────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', alignItems: 'center', mt: 3 }}>
      {Array.from({ length: total }).map((_, i) =>
        i === current ? (
          <Box key={i} sx={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid', borderColor: 'primary.main',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main' }} />
          </Box>
        ) : (
          <Box key={i} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
        )
      )}
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
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <WorkspacesIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary' }}>
          Oncology
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <FileText size={14} color="#676e76" />
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>156 publications</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <UserCircle size={14} color="#676e76" />
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Created by Chris Jones</Typography>
        </Box>
      </Box>

      <Box sx={{
        bgcolor: 'background.default', borderRadius: '8px', p: 1.5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Box>
          <Typography sx={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
            color: 'text.disabled', textTransform: 'uppercase', mb: 0.75,
          }}>
            Performance Score
          </Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
            1245
          </Typography>
        </Box>
        <PreviewSparkline />
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
  const next = () => setStep(s => s + 1);
  const finish = () => { markOnboardingComplete(); onComplete(); };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>

      {/* Collapsed sidebar — non-interactive during onboarding */}
      <Sidebar
        isExpanded={false}
        activeNavId="none"
        onMouseEnter={noop}
        onMouseLeave={noop}
        onWorkspacesEnter={noop}
        onOtherNavItemEnter={noop}
      />

      {/* Main content */}
      <Box sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Top bar — AstraZeneca chip */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 3, py: 1.5, flexShrink: 0, zIndex: 1 }}>
          <OrgChip />
        </Box>

        {/* Centered card */}
        <Box sx={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          px: 2, pb: 4, zIndex: 1,
        }}>
          <Box sx={{
            width: 500,
            maxWidth: 'calc(100% - 32px)',
            bgcolor: 'background.paper',
            borderRadius: '20px',
            p: 5,
            boxShadow: '0 2px 24px rgba(0,0,0,0.07)',
          }}>

            {/* ── Step 1: Welcome ── */}
            {step === 0 && (
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.75 }}>
                  Welcome to
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                  <Box
                    component="img"
                    src="/compass-logo-featured.svg"
                    alt="Compass"
                    sx={{ height: 52 }}
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
                  bgcolor: 'background.default', borderRadius: '12px', p: 2,
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

            <StepDots current={step} total={3} />
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
