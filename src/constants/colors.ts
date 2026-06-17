/**
 * ── JumiLens 统一色彩配置 ───────────────────────────────────
 *
 * 所有图表/渲染/UI 颜色的唯一数据源。
 * 每个色组对应一个可视化模块，内部 key 使用语义化命名。
 *
 * 使用方式:
 *   import { COLORS, hexToRgb, rgba } from '@/constants/colors';
 *   ctx.fillStyle = COLORS.histogram.binSelected;
 *   uniform.value.set(...hexToRgb(COLORS.diffLayer.growth));
 */

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

/** hex → [r, g, b] (0‑1)，用于 Three.js Vector3 / WebGL */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** hex + alpha → rgba() CSS 字符串 */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

// ══════════════════════════════════════════════════════════════
// Color Tokens
// ══════════════════════════════════════════════════════════════

export const COLORS = {
  // ── 时间轴 (TailsLineChart) ──────────────────────────────
  timeAxis: {
    /** 偏度曲线 */
    skewness: '#C8960C',
    /** 高密度曲线 */
    highDensity: '#2878B5',
    /** 低密度曲线 */
    lowDensity: '#C44E52',
    /** 水平/垂直网格线 (细) */
    grid: '#e8e8e8',
    /** 主网格线 (0 / 1 边界) */
    gridMajor: '#d0d0d0',
    /** 坐标轴描边 */
    axis: '#999',
    /** 坐标轴刻度文字 */
    tickText: '#888',
    /** 当前步指示线 */
    indicator: '#555',
    /** 缩略图标记三角 */
    thumbMarker: '#C8960C',
    /** 交点圆点描边 */
    dotStroke: '#ffffff',
    /** 当前步高亮带 */
    highlightBand: 'rgba(0,0,0,0.04)',
  },

  // ── 高低密度 2D 预览缩略图 ────────────────────────────
  density2D: {
    /** 低密度体素高亮色 */
    lowPreview: '#4DCCFF',
    /** 中密度体素高亮色 */
    midPreview: '#50E3A4',
    /** 高密度体素高亮色 */
    highPreview: '#F21E14',
  },

  // ── 差异图层 (Diff layer) ──────────────────────────────
  diffLayer: {
    /** 增长 (red) — 3D 渲染用 */
    growth: '#F21E14',
    /** 下降 (blue) — 3D 渲染用 */
    decline: '#1417F2',
    /** 增长 预览缩略图 (较柔和) */
    growthPreview: '#FF4D33',
    /** 下降 预览缩略图 (较柔和) */
    declinePreview: '#3399FF',
    /** 差异开关 增长色标 (CSS) */
    swatchGrowth: '#ff3030',
    /** 差异开关 下降色标 (CSS) */
    swatchDecline: '#3060ff',
    /** 无变化体素 (diffClassifier) */
    noChange: '#161616',
  },

  // ── 密度直方图 (DensityHistogram) ──────────────────────
  histogram: {
    /** 画布背景 */
    bg: '#ffffff',
    /** 网格线 */
    grid: '#f5f5f5',
    /** 选中 bin */
    binSelected: '#ff6b6b',
    /** 未选中 bin */
    binUnselected: '#152c4d',
    /** 拖拽选区填充 */
    dragFill: 'rgba(255,107,107,0.12)',
    /** 拖拽选区描边 */
    dragStroke: '#ff6b6b',
    /** 已确认选区填充 */
    confirmedFill: 'rgba(250,173,20,0.12)',
    /** 已确认选区描边 */
    confirmedStroke: '#faad14',
    /** 坐标轴 */
    axis: '#d9d9d9',
    /** Y 轴标签 */
    labelY: '#8c8c8c',
    /** 下横轴标签 */
    labelX: '#555555',
    /** 上横轴标签 (归一化) */
    labelXTop: '#ff16fb',
    /** P1 / P99 标注线 */
    annotationP1P99: '#ff4d4f',
    /** Mean 标注线 */
    annotationMean: '#1d39c4',
    /** Median 标注线 */
    annotationMedian: '#52c41a',
    /** Min / Max 标注线 */
    annotationMinMax: '#999999',
    /** 标注药丸文字 */
    pillText: '#ffffff',
    /** 清除按钮边框/文字 */
    clearBtn: '#ff4d4f',
    /** 清除按钮 hover 背景 */
    clearBtnHoverBg: '#fff1f0',
    /** 选区信息背景 */
    selectionInfoBg: '#fffbe6',
    /** 选区信息边框 */
    selectionInfoBorder: '#ffe58f',
    /** 选区信息数值颜色 */
    infoValue: '#d46b08',
    /** 选区信息归一化数值颜色 */
    infoValueNorm: '#1677ff',
    /** 图例 / N 值文字 */
    legendText: '#8c8c8c',
  },

  // ── 密度演化统计 (EvolutionChart) ──────────────────────
  evolution: {
    /** 画布背景 */
    bg: '#ffffff',
    /** 网格线 */
    grid: '#f0f0f0',
    /** 坐标轴 */
    axis: '#d9d9d9',
    /** Y 轴标签 */
    labelY: '#999999',
    /** X 轴标签 */
    labelX: '#555555',
    /** X 轴标题 */
    labelXTitle: '#555555',
    /** Y 轴标题 */
    labelYTitle: '#8c8c8c',
    /** min‑max 区域填充 */
    minMaxFill: 'rgba(180,180,180,0.25)',
    /** p1‑p99 区域填充 */
    p1p99Fill: 'rgba(255,77,79,0.12)',
    /** mean ± sigma 区域填充 */
    meanSigmaFill: 'rgba(114,46,209,0.12)',
    /** Median 虚线 */
    medianLine: '#52c41a',
    /** Mean 实线 */
    meanLine: '#1d39c4',
    /** 当前步指示线 */
    stepIndicator: 'rgba(0,0,0,0.45)',
    /** 悬停指示线 */
    hoverIndicator: 'rgba(0,0,0,0.25)',
    /** 当前步圆点描边 */
    dotStroke: '#ffffff',
    /** 图例文字 */
    legendText: '#555555',
    /** 图例色块边框 */
    legendBorder: 'rgba(0,0,0,0.15)',
    /** 图例 fill 色块 (min‑max) */
    legendMinMax: 'rgba(180,180,180,0.5)',
    /** 图例 fill 色块 (p1‑p99) */
    legendP1P99: 'rgba(255,77,79,0.2)',
    /** 图例 fill 色块 (mean±σ) */
    legendMeanSigma: 'rgba(114,46,209,0.2)',
    /** 悬浮提示高值 */
    tooltipHi: '#ffa940',
    /** 悬浮提示低值 */
    tooltipLo: '#69c0ff',
  },
} as const;
