import React, { useMemo, useRef, useState, useCallback } from 'react';
import './index.less';
import { COLORS } from '@/constants/colors';
import { Button } from 'primereact/button';

const CH = COLORS.histogram;

interface StatisticsOverlay {
  min: number;
  max: number;
  mean: number;
  std: number;
  median: number;
  p1: number;
  p99: number;
}

interface DensityHistogramProps {
  bins: number[];
  binEdges: number[];
  logBins: number[];
  logBinEdges: number[];
  timestep: number;
  /** 原始数据的最小值 */
  dataMin: number;
  /** 原始数据的最大值 */
  dataMax: number;
  onRangeSelect?: (range: { min: number; max: number } | null) => void;
  selectedRange?: { min: number; max: number } | null;
  /** 统计信息，叠放在直方图上 */
  statistics?: StatisticsOverlay | null;
}

const DensityHistogram: React.FC<DensityHistogramProps> = ({
  bins,
  binEdges,
  logBins,
  logBinEdges,
  onRangeSelect,
  selectedRange,
  statistics,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // 始终使用对数分箱（直方图本质是对数密度直方图）
  const currentBins = logBins;
  const currentBinEdges = logBinEdges;

  // 计算统计数据
  const stats = useMemo(() => {
    if (currentBins.length === 0) return null;

    const total = currentBins.reduce((sum, count) => sum + count, 0);
    const maxCount = Math.max(...currentBins);

    return { total, maxCount };
  }, [currentBins]);

  // ── 绘制直方图 ──────────────────────────────────────────────
  const drawHistogram = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || currentBins.length === 0 || !stats) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;

    // Retina: buffer 尺寸 = CSS 尺寸 × dpr
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const width = cssW;
    const height = cssH;
    // 留出下方横轴 + Y轴的空间（无上横轴）
    const padding = { top: 14, right: 15, bottom: 60, left: 55 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // ── 清空 ──
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = CH.bg;
    ctx.fillRect(0, 0, width, height);

    // ── 水平网格线 ──
    ctx.strokeStyle = CH.grid;
    ctx.lineWidth = 1;
    const yGridLines = 5;
    for (let i = 0; i <= yGridLines; i++) {
      const y = padding.top + (chartHeight / yGridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    // ── 垂直网格线（与上下横轴标签对齐）──
    ctx.strokeStyle = CH.grid;
    ctx.setLineDash([3, 3]);
    const numXLabels = 7;
    for (let i = 0; i < numXLabels; i++) {
      const x = padding.left + (chartWidth / (numXLabels - 1)) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── 直方图条形 ──
    const binWidth = chartWidth / currentBins.length;
    const maxCount = stats.maxCount;

    for (let i = 0; i < currentBins.length; i++) {
      const count = currentBins[i];
      if (count === 0) continue;
      const barHeight = (count / maxCount) * chartHeight;
      const x = padding.left + i * binWidth;
      const y = padding.top + chartHeight - barHeight;

      // 判断是否在选中范围内
      let isSelected = false;
      if (selectedRange && logBinEdges.length > i) {
        const binMin = logBinEdges[i];
        const binMax = logBinEdges[i + 1] ?? binMin;
        isSelected = binMin >= selectedRange.min && binMax <= selectedRange.max;
      }

      if (isSelected) {
        ctx.fillStyle = CH.binSelected;
      } else {
        ctx.fillStyle = CH.binUnselected;
      }

      const gap = Math.max(0.5, binWidth * 0.08);
      ctx.fillRect(x + gap, y, binWidth - gap * 2, barHeight);
    }

    // ── 选中区域（拖拽中）──
    if (selectionStart !== null && selectionEnd !== null) {
      const sx = Math.min(selectionStart, selectionEnd);
      const ex = Math.max(selectionStart, selectionEnd);
      ctx.fillStyle = CH.dragFill;
      ctx.fillRect(sx, padding.top, ex - sx, chartHeight);
      ctx.strokeStyle = CH.dragStroke;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(sx, padding.top, ex - sx, chartHeight);
      ctx.setLineDash([]);
    }

    // ── 已确认选中范围指示 ──
    if (selectedRange && logBinEdges.length > 0) {
      const minIndex = logBinEdges.findIndex(edge => edge >= selectedRange.min);
      const maxIndex = logBinEdges.findIndex(edge => edge >= selectedRange.max);
      if (minIndex !== -1 && maxIndex !== -1) {
        const sx = padding.left + minIndex * binWidth;
        const ex = padding.left + maxIndex * binWidth;
        ctx.fillStyle = CH.confirmedFill;
        ctx.fillRect(sx, padding.top, ex - sx, chartHeight);
        ctx.strokeStyle = CH.confirmedStroke;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(sx, padding.top, ex - sx, chartHeight);
        ctx.setLineDash([]);
      }
    }

    // ── 坐标轴线 ──
    ctx.strokeStyle = CH.axis;
    ctx.lineWidth = 1.5;
    // Y 轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.stroke();
    // 下 X 轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    // ── Y 轴标签（频数）──
    ctx.fillStyle = CH.labelY;
    ctx.font = '10px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yGridLines; i++) {
      const value = (maxCount / yGridLines) * (yGridLines - i);
      const y = padding.top + (chartHeight / yGridLines) * i;
      let label: string;
      if (value >= 1e6) label = (value / 1e6).toFixed(1) + 'M';
      else if (value >= 1e3) label = (value / 1e3).toFixed(1) + 'K';
      else label = value.toFixed(0);
      ctx.fillText(label, padding.left - 8, y);
    }

    // ── 下横轴标签（log₁₀ 密度）──
    ctx.fillStyle = CH.labelX;
    ctx.font = '10px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // binEdges = 10^logBinEdges，抵消 calculateLogHistogram 的 log，
    // 得到数据原始坐标 = log₁₀(真实密度)
    for (let i = 0; i < numXLabels; i++) {
      const binIndex = Math.floor((binEdges.length - 1) * i / (numXLabels - 1));
      const value = binEdges[binIndex];
      const x = padding.left + (chartWidth / (numXLabels - 1)) * i;
      const label = value.toFixed(1);
      ctx.fillText(label, x, padding.top + chartHeight + 6);
    }

    // ── 轴标题 ──
    // Y 轴标题
    ctx.save();
    ctx.translate(14, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = CH.labelY;
    ctx.font = '11px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('频数', 0, 0);
    ctx.restore();

    // ── 统计标注线 (竖线标注在直方图上) ──
    if (statistics && logBinEdges.length >= 2) {
      const logMin = logBinEdges[0];
      const logMax = logBinEdges[logBinEdges.length - 1];
      const logSpan = logMax - logMin || 1;

      const toX = (rawVal: number) => {
        if (rawVal <= 0) return null;
        const logV = Math.log10(rawVal);
        if (logV < logMin || logV > logMax) return null;
        return padding.left + ((logV - logMin) / logSpan) * chartWidth;
      };

      const annotations: { value: number; color: string; dash: number[]; label: string }[] = [
        { value: statistics.p1,    color: CH.annotationP1P99,  dash: [4, 3], label: 'P1' },
        { value: statistics.p99,   color: CH.annotationP1P99,  dash: [4, 3], label: 'P99' },
        { value: statistics.mean,  color: CH.annotationMean,   dash: [],     label: 'Mean' },
        { value: statistics.median,color: CH.annotationMedian,  dash: [5, 3], label: 'Median' },
      ];

      if (statistics.min > 0 && Math.log10(statistics.min) >= logMin) {
        annotations.push({ value: statistics.min, color: CH.annotationMinMax, dash: [2, 4], label: 'Min' });
      }
      if (statistics.max > 0 && Math.log10(statistics.max) <= logMax) {
        annotations.push({ value: statistics.max, color: CH.annotationMinMax, dash: [2, 4], label: 'Max' });
      }

      // Sort by value so staggered labels don't overlap
      annotations.sort((a, b) => a.value - b.value);

      // 2-row stagger: close values get different heights, avoiding overlap
      const ROW_COUNT = 3;
      const ROW_GAP = 14;

      for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i];
        const ax = toX(ann.value);
        if (ax === null) continue;

        // Full-height vertical line from top axis to bottom axis
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.dash.length > 0 ? 1.2 : 1.6;
        ctx.setLineDash(ann.dash);
        ctx.beginPath();
        ctx.moveTo(ax, padding.top);
        ctx.lineTo(ax, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Staggered pill label
        const row = i % ROW_COUNT;
        const offsetY = row * ROW_GAP;

        const labelW = ctx.measureText(ann.label).width + 10;
        const labelH = 16;
        const lx = ax - labelW / 2;
        const ly = padding.top + 3 + offsetY;

        // Rounded pill background
        ctx.fillStyle = ann.color;
        ctx.beginPath();
        const lr = 3;
        const rx = lx, ry = ly, rw = labelW, rh = labelH;
        ctx.moveTo(rx + lr, ry);
        ctx.lineTo(rx + rw - lr, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + lr, lr);
        ctx.lineTo(rx + rw, ry + rh - lr);
        ctx.arcTo(rx + rw, ry + rh, rx + rw - lr, ry + rh, lr);
        ctx.lineTo(rx + lr, ry + rh);
        ctx.arcTo(rx, ry + rh, rx, ry + rh - lr, lr);
        ctx.lineTo(rx, ry + lr);
        ctx.arcTo(rx, ry, rx + lr, ry, lr);
        ctx.closePath();
        ctx.fill();

        // Pill border
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();

        // Pill text
        ctx.fillStyle = CH.pillText;
        ctx.font = 'bold 9px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ann.label, ax, ly + labelH / 2);
      }
    }

  }, [currentBins, logBinEdges, binEdges, stats, selectedRange, selectionStart, selectionEnd, statistics]);

  // ── 响应式重绘 ──
  React.useEffect(() => {
    drawHistogram();

    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => drawHistogram());
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawHistogram]);

  // ── 鼠标事件 ──
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x } = getCanvasCoords(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.getBoundingClientRect().width;
    const padding = { left: 62, right: 12 };
    const chartWidth = cssW - padding.left - padding.right;

    if (x >= padding.left && x <= padding.left + chartWidth) {
      setIsSelecting(true);
      setSelectionStart(x);
      setSelectionEnd(x);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;
    const { x } = getCanvasCoords(e);
    setSelectionEnd(x);
  };

  const handleMouseUp = () => {
    if (!isSelecting || !onRangeSelect) {
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || selectionStart === null || selectionEnd === null) {
      setIsSelecting(false);
      return;
    }

    const cssW = canvas.getBoundingClientRect().width;
    const padding = { left: 62, right: 12 };
    const chartWidth = cssW - padding.left - padding.right;
    const binWidth = chartWidth / currentBins.length;

    const startX = Math.min(selectionStart, selectionEnd);
    const endX = Math.max(selectionStart, selectionEnd);

    const startBin = Math.floor((startX - padding.left) / binWidth);
    const endBin = Math.floor((endX - padding.left) / binWidth);

    if (startBin >= 0 && endBin < currentBinEdges.length - 1 && startBin <= endBin) {
      const minDensity = logBinEdges[Math.max(0, startBin)];
      const maxDensity = logBinEdges[Math.min(logBinEdges.length - 1, endBin + 1)];
      onRangeSelect({ min: minDensity, max: maxDensity });
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const handleClearSelection = () => {
    if (onRangeSelect) {
      onRangeSelect(null);
    }
  };

  return (
    <div className="density-histogram" ref={containerRef}>
      <div className="evolution-chart-title">
        <span className="title-text">密度分布直方图</span>
        <span className="title-actions">
          {selectedRange && (
            <Button outlined size="small" onClick={handleClearSelection}>
              ✕ 清除选择
            </Button>
          )}
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

      <div className="histogram-canvas-wrap">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isSelecting ? 'col-resize' : 'crosshair' }}
        />
        {legendOpen && stats && (
          <div className="chart-legend-panel">
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: CH.binSelected }} />
              <span className="legend-label">已选</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: CH.binUnselected }} />
              <span className="legend-label">全部</span>
            </div>
            <div className="legend-divider" />
            <div className="legend-item legend-stat">
              <span className="legend-label">N={stats.total.toLocaleString()}</span>
            </div>
            <div className="legend-item legend-stat">
              <span className="legend-label">峰值={stats.maxCount.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DensityHistogram;
