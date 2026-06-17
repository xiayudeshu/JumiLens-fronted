import React, { useRef, useCallback, useEffect, useState } from 'react';
import './index.less';
import { COLORS } from '@/constants/colors';
import { Button } from 'primereact/button';

const CE = COLORS.evolution;

// ── Types ──
interface EvolutionData {
  timesteps: number[];
  min: number[];
  max: number[];
  mean: number[];
  median: number[];
  std: number[];
  p1: number[];
  p99: number[];
}

interface EvolutionChartProps {
  currentStep: number;
  onJumpToStep?: (step: number) => void;
}

// ── Helpers ──
function formatNum(v: number): string {
  if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(1);
  if (Math.abs(v) >= 10000) return v.toExponential(1);
  return v.toFixed(3);
}

function logRange(min: number, max: number): [number, number] {
  // Ensure positive range for log scale
  const lo = min <= 0 ? 1e-10 : min;
  const hi = max <= 0 ? 1e-9 : max;
  return [Math.log10(lo), Math.log10(hi)];
}

// ── Component ──
const EvolutionChart: React.FC<EvolutionChartProps> = ({ currentStep, onJumpToStep }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<EvolutionData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    step: number;
    x: number;
    y: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
    p1: number;
    p99: number;
  } | null>(null);
  const hoverStepRef = useRef<number | null>(null);

  // Load data
  useEffect(() => {
    let cancelled = false;
    fetch('/assets/evolution_stats.json')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json as EvolutionData);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Draw ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;

    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = CE.bg;
    ctx.fillRect(0, 0, cssW, cssH);

    if (!data.timesteps.length) return;

    const n = data.timesteps.length;

    // Padding
    const pad = { top: 16, right: 16, bottom: 62, left: 62 };
    const chartW = cssW - pad.left - pad.right;
    const chartH = cssH - pad.top - pad.bottom;

    // ── X-scale ──
    const getX = (i: number) => pad.left + (i / (n - 1)) * chartW;

    // ── Y-scale in log₁₀ ──
    const allVals = [...data.min, ...data.max, ...data.p1, ...data.p99, ...data.mean, ...data.median];
    const posVals = allVals.filter((v) => v > 0);
    const yDataMin = posVals.length > 0 ? Math.min(...posVals) : 1e-10;
    const yDataMax = posVals.length > 0 ? Math.max(...posVals) : 1;
    const [yLogMin, yLogMax] = logRange(yDataMin, yDataMax);
    const yLogSpan = yLogMax - yLogMin || 1;
    const getY = (v: number) => {
      const lv = v <= 0 ? yLogMin : Math.log10(v);
      return pad.top + chartH - ((lv - yLogMin) / yLogSpan) * chartH;
    };
    const chartYBottom = pad.top + chartH;

    // ── Horizontal grid + Y labels ──
    const yTicks = 5;
    ctx.strokeStyle = CE.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= yTicks; i++) {
      const ly = pad.top + (chartH / yTicks) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, ly);
      ctx.lineTo(pad.left + chartW, ly);
      ctx.stroke();

      const logVal = yLogMin + (yLogSpan / yTicks) * (yTicks - i);
      const rawVal = Math.pow(10, logVal);
      ctx.fillStyle = CE.labelY;
      ctx.font = '9px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatNum(rawVal), pad.left - 6, ly);
    }

    // ── Vertical grid ──
    const xTicks = 5;
    ctx.strokeStyle = CE.grid;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i <= xTicks; i++) {
      const ti = Math.floor((n - 1) * i / xTicks);
      const lx = getX(ti);
      ctx.beginPath();
      ctx.moveTo(lx, pad.top);
      ctx.lineTo(lx, chartYBottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── Axes ──
    ctx.strokeStyle = CE.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, chartYBottom);
    ctx.lineTo(pad.left + chartW, chartYBottom);
    ctx.stroke();

    // ── X labels ──
    ctx.fillStyle = CE.labelX;
    ctx.font = '10px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= xTicks; i++) {
      const ti = Math.floor((n - 1) * i / xTicks);
      ctx.fillText(String(data.timesteps[ti]), getX(ti), chartYBottom + 6);
    }
    // X axis label
    ctx.fillStyle = CE.labelX;
    ctx.font = '11px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('Timestep', pad.left + chartW / 2, chartYBottom + 22);

    // ── Y axis label ──
    ctx.save();
    ctx.translate(12, pad.top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = CE.labelYTitle;
    ctx.font = '11px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('密度 (log₁₀)', 0, 0);
    ctx.restore();

    // ── Clip to chart area ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, chartW, chartH);
    ctx.clip();

    // ── LAYER 1: min–max fill (gray) ──
    ctx.fillStyle = CE.minMaxFill;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(data.max[0]));
    for (let i = 0; i < n; i++) ctx.lineTo(getX(i), getY(data.max[i]));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(getX(i), getY(data.min[i]));
    ctx.closePath();
    ctx.fill();

    // ── LAYER 2: p1–p99 fill (light red) ──
    ctx.fillStyle = CE.p1p99Fill;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(data.p99[0]));
    for (let i = 0; i < n; i++) ctx.lineTo(getX(i), getY(data.p99[i]));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(getX(i), getY(data.p1[i]));
    ctx.closePath();
    ctx.fill();

    // ── LAYER 3: mean±σ fill (light purple) ──
    {
      const upper = data.mean.map((m, i) => m + data.std[i]);
      const lower = data.mean.map((m, i) => Math.max(0, m - data.std[i]));
      ctx.fillStyle = CE.meanSigmaFill;
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(upper[0]));
      for (let i = 0; i < n; i++) ctx.lineTo(getX(i), getY(upper[i]));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(getX(i), getY(lower[i]));
      ctx.closePath();
      ctx.fill();
    }

    // ── LAYER 4: median dashed line (green) ──
    ctx.strokeStyle = CE.medianLine;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(data.median[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(getX(i), getY(data.median[i]));
    ctx.stroke();
    ctx.setLineDash([]);

    // ── LAYER 5: mean solid line (dark blue) ──
    ctx.strokeStyle = CE.meanLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(data.mean[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(getX(i), getY(data.mean[i]));
    ctx.stroke();

    // ── Current step indicator ──
    if (currentStep >= 0 && currentStep < n) {
      const sx = getX(currentStep);
      // Vertical dashed line
      ctx.strokeStyle = CE.stepIndicator;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, pad.top);
      ctx.lineTo(sx, chartYBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot on mean line
      ctx.fillStyle = CE.meanLine;
      ctx.beginPath();
      ctx.arc(sx, getY(data.mean[currentStep]), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CE.dotStroke;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Dot on median line
      ctx.fillStyle = CE.medianLine;
      ctx.beginPath();
      ctx.arc(sx, getY(data.median[currentStep]), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CE.dotStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Hover indicator ──
    const hs = hoverStepRef.current;
    if (hs !== null && hs >= 0 && hs < n && hs !== currentStep) {
      const hx = getX(hs);
      ctx.strokeStyle = CE.hoverIndicator;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, chartYBottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // un-clip

  }, [data, currentStep]);

  // ── Resize + redraw ──
  useEffect(() => {
    draw();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // ── Mouse: step from x ──
  const stepFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): number | null => {
      if (!data || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const cssW = rect.width;
      // Chart area bounds: pad.left to pad.left + chartW
      const pL = 62;
      const pR = 16;
      const chW = cssW - pL - pR;
      if (mx < pL || mx > pL + chW) return null;
      const ratio = (mx - pL) / chW;
      const step = Math.round(ratio * (data.timesteps.length - 1));
      return Math.max(0, Math.min(data.timesteps.length - 1, step));
    },
    [data],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const s = stepFromEvent(e);
      if (s !== null && onJumpToStep) onJumpToStep(s);
    },
    [stepFromEvent, onJumpToStep],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const s = stepFromEvent(e);
      hoverStepRef.current = s;
      if (s !== null && data) {
        setTooltip({
          step: s,
          x: e.nativeEvent.offsetX,
          y: e.nativeEvent.offsetY,
          min: data.min[s],
          max: data.max[s],
          mean: data.mean[s],
          median: data.median[s],
          std: data.std[s],
          p1: data.p1[s],
          p99: data.p99[s],
        });
      } else {
        setTooltip(null);
      }
      draw();
    },
    [stepFromEvent, data, draw],
  );

  const handleMouseLeave = useCallback(() => {
    hoverStepRef.current = null;
    setTooltip(null);
    draw();
  }, [draw]);

  // ── Render ──
  if (loadError) {
    return (
      <div className="evolution-chart-container">
        <div className="evolution-error">统计数据加载失败</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="evolution-chart-container">
        <div className="evolution-loading">加载统计数据...</div>
      </div>
    );
  }

  return (
    <div className="evolution-chart-container" ref={containerRef}>
      <div className="evolution-chart-title">
        <span className="title-text">密度统计演化</span>
        <span className="title-actions">
          <Button
            text
            rounded
            size="small"
            className={`legend-toggle${legendOpen ? ' active' : ''}`}
            onClick={() => setLegendOpen(!legendOpen)}
            tooltip="图例"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="8" cy="6" r="2" fill="currentColor" />
              <circle cx="16" cy="12" r="2" fill="currentColor" />
              <circle cx="10" cy="18" r="2" fill="currentColor" />
            </svg>
          </Button>
        </span>
      </div>
      <div className="evolution-canvas-wrap">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'pointer' }}
        />
        {legendOpen && data && (
          <div className="chart-legend-panel">
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: CE.legendMinMax, border: '1px solid rgba(0,0,0,0.15)' }} />
              <span className="legend-label">min–max</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: CE.legendP1P99, border: '1px solid rgba(0,0,0,0.15)' }} />
              <span className="legend-label">p1–p99</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: CE.legendMeanSigma, border: '1px solid rgba(0,0,0,0.15)' }} />
              <span className="legend-label">mean±σ</span>
            </div>
            <div className="legend-item">
              <span className="legend-dash" style={{ borderTop: `2px dashed ${CE.medianLine}` }} />
              <span className="legend-label">median</span>
            </div>
            <div className="legend-item">
              <span className="legend-line" style={{ borderTop: `2px solid ${CE.meanLine}` }} />
              <span className="legend-label">mean</span>
            </div>
          </div>
        )}
        {tooltip && (
          <div
            className="evolution-tooltip"
            style={{ left: Math.min(tooltip.x + 12, (containerRef.current?.getBoundingClientRect().width ?? 400) - 140), top: Math.max(0, tooltip.y - 50) }}
          >
            <div className="evolution-tooltip-step">Step {tooltip.step}</div>
            <div className="evolution-tooltip-grid">
              <span className="et-label">min</span><span className="et-value">{formatNum(tooltip.min)}</span>
              <span className="et-label">max</span><span className="et-value et-hi">{formatNum(tooltip.max)}</span>
              <span className="et-label">mean</span><span className="et-value">{formatNum(tooltip.mean)}</span>
              <span className="et-label">median</span><span className="et-value">{formatNum(tooltip.median)}</span>
              <span className="et-label">std</span><span className="et-value">{formatNum(tooltip.std)}</span>
              <span className="et-label">p1</span><span className="et-value et-lo">{formatNum(tooltip.p1)}</span>
              <span className="et-label">p99</span><span className="et-value et-hi">{formatNum(tooltip.p99)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvolutionChart;
