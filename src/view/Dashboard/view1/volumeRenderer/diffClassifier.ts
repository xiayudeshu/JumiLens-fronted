import { COLORS, hexToRgb } from '@/constants/colors';

export interface ClassBoundaries {
  boundaries: number[];
  intervals: number;
}

export interface DiffStats {
  growthCount: number;
  declineCount: number;
  totalVoxels: number;
}

export interface PercentileThresholds {
  lowDensity: number;
  highDensity: number;
}

/**
 * Compute density thresholds from reference step data at given percentiles.
 *
 * Uses a 256-bin histogram (O(N) build, O(256) scan) to find the density values
 * at the `lowPct`-th and `highPct`-th percentiles of the reference step's
 * volume data distribution.
 *
 * Example: lowPct=1, highPct=99 → returns thresholds where 1% of voxels are
 * below lowDensity and 1% are above highDensity.
 */
export function computePercentileBoundaries(
  data: Float32Array,
  lowPct: number,
  highPct: number
): PercentileThresholds {
  const HIST_BINS = 256;
  const hist = new Uint32Array(HIST_BINS);

  // Build histogram
  for (let i = 0; i < data.length; i++) {
    const bucket = Math.min(HIST_BINS - 1, Math.max(0, Math.round(data[i] * (HIST_BINS - 1))));
    hist[bucket]++;
  }

  const total = data.length;
  const lowTarget = (total * lowPct) / 100;
  const highTarget = (total * highPct) / 100;

  let lowDensity = 0;
  let highDensity = 1;
  let accum = 0;

  for (let i = 0; i < HIST_BINS; i++) {
    accum += hist[i];
    if (accum >= lowTarget && lowDensity === 0 && accum > 0) {
      lowDensity = i / (HIST_BINS - 1);
    }
    if (accum >= highTarget) {
      highDensity = i / (HIST_BINS - 1);
      break;
    }
  }

  return { lowDensity, highDensity };
}

/**
 * Build ClassBoundaries from percentile thresholds.
 * Always produces exactly 3 classes: Low, Normal, High.
 */
export function buildPercentileBoundaries(
  thresholds: PercentileThresholds
): ClassBoundaries {
  return {
    boundaries: [0, thresholds.lowDensity, thresholds.highDensity, 1],
    intervals: 3,
  };
}

/**
 * Build a 256-entry lookup table from boundaries.
 * LUT[quantizedDensity] = classIndex
 * This replaces O(intervals) per-voxel inner loop with O(1) array lookup.
 */
export function buildClassLUT(boundaries: ClassBoundaries): Uint8Array {
  const lut = new Uint8Array(256);
  const b = boundaries.boundaries;
  const numIntervals = boundaries.intervals;

  if (numIntervals <= 1) {
    return lut; // all zeros
  }

  for (let i = 0; i < 256; i++) {
    const density = i / 255;
    let cls = numIntervals - 1; // default: last interval
    for (let j = 0; j < numIntervals; j++) {
      if (density >= b[j] && density < b[j + 1]) {
        cls = j;
        break;
      }
    }
    lut[i] = cls;
  }
  return lut;
}

/**
 * Classify every voxel using a pre-built LUT.
 * Density values are quantized to 0..255 and looked up in O(1).
 */
export function classifyVolumeLUT(
  data: Float32Array,
  lut: Uint8Array
): Uint8Array {
  const N = data.length;
  const classes = new Uint8Array(N);

  for (let i = 0; i < N; i++) {
    const idx = Math.min(255, Math.max(0, Math.round(data[i] * 255)));
    classes[i] = lut[idx];
  }
  return classes;
}

/**
 * Legacy wrapper — builds LUT internally, for backward compatibility.
 */
export function classifyVolume(
  data: Float32Array,
  boundaries: ClassBoundaries
): Uint8Array {
  const lut = buildClassLUT(boundaries);
  return classifyVolumeLUT(data, lut);
}

/**
 * Compute per-voxel class change between reference and comparison steps.
 * Returns Float32Array (N elements):
 *   > 0  = growth by N classes   (red overlay)
 *   < 0  = decline by N classes  (blue overlay)
 *   = 0  = no class change
 */
export function computeDiffVolume(
  refClasses: Uint8Array,
  cmpClasses: Uint8Array,
  categoryFilter: number = -1
): Float32Array {
  const N = refClasses.length;
  const diff = new Float32Array(N);

  if (categoryFilter >= 0) {
    for (let i = 0; i < N; i++) {
      const ref = refClasses[i];
      const cmp = cmpClasses[i];
      if (ref === cmp) continue;
      if (ref !== categoryFilter && cmp !== categoryFilter) continue;
      diff[i] = cmp - ref;
    }
  } else {
    for (let i = 0; i < N; i++) {
      const ref = refClasses[i];
      const cmp = cmpClasses[i];
      if (ref !== cmp) diff[i] = cmp - ref;
    }
  }

  return diff;
}

/**
 * Count growth and decline voxels from classified data.
 */
export function computeDiffStats(
  refClasses: Uint8Array,
  cmpClasses: Uint8Array,
  categoryFilter: number = -1
): DiffStats {
  const N = refClasses.length;
  let growthCount = 0;
  let declineCount = 0;

  if (categoryFilter >= 0) {
    for (let i = 0; i < N; i++) {
      const ref = refClasses[i];
      const cmp = cmpClasses[i];
      if (ref === cmp) continue;
      if (ref !== categoryFilter && cmp !== categoryFilter) continue;
      if (cmp > ref) growthCount++;
      else declineCount++;
    }
  } else {
    for (let i = 0; i < N; i++) {
      const ref = refClasses[i];
      const cmp = cmpClasses[i];
      if (ref === cmp) continue;
      if (cmp > ref) growthCount++;
      else declineCount++;
    }
  }

  return { growthCount, declineCount, totalVoxels: N };
}

/**
 * Generate a downsampled MIP thumbnail from diff data by striding.
 * Uses stride sampling to reduce operations: for a 120x90 thumbnail
 * from 128³ data, we sample every-other voxel, drastically cutting work.
 *
 * @param maxClassDiff Maximum possible |class difference| (numClasses - 1).
 *   Used to normalise colour intensity. Default 2 (for 3-class system).
 */
export function generateDiffThumbnail(
  diffData: Float32Array,
  width: number,
  height: number,
  maxClassDiff: number = 2
): ImageData {
  const N = 128;
  const N2 = N * N;
  const pixelData = new Uint8ClampedArray(width * height * 4);

  // Stride: skip voxels for performance (~100k operations instead of 1.4M)
  const strideX = Math.max(1, Math.floor(N / width));
  const strideY = Math.max(1, Math.floor(N / height));
  const strideZ = Math.max(1, Math.floor(N / 8)); // sample ~8 slices along Z

  for (let py = 0; py < height; py++) {
    const vyStart = Math.floor(((height - 1 - py) / height) * N);
    const vyEnd = Math.min(N, vyStart + strideY);
    const rowBase = py * width * 4;

    for (let px = 0; px < width; px++) {
      const vxStart = Math.floor((px / width) * N);
      const vxEnd = Math.min(N, vxStart + strideX);

      let maxGrowth = 0;
      let maxDecline = 0;

      for (let vy = vyStart; vy < vyEnd; vy++) {
        for (let vx = vxStart; vx < vxEnd; vx++) {
          const xyIdx = vx + vy * N;
          for (let vz = 0; vz < N; vz += strideZ) {
            const val = diffData[xyIdx + vz * N2];
            if (val > maxGrowth) maxGrowth = val;
            else if (-val > maxDecline) maxDecline = -val;
          }
        }
      }

      const pixelIdx = rowBase + px * 4;
      const total = maxGrowth + maxDecline;

      if (total > 0) {
        const div = Math.max(1, maxClassDiff);
        const gNorm = Math.min(1, maxGrowth / div);
        const dNorm = Math.min(1, maxDecline / div);
        const intensity = Math.max(gNorm, dNorm);

        // Pure red (growth), pure blue (decline), purple when both
        const r = Math.round(255 * gNorm * intensity);
        const b = Math.round(255 * dNorm * intensity);
        const g = Math.round(Math.min(r, b) * 0.12);
        const a = Math.round(Math.max(40, 220 * intensity));

        pixelData[pixelIdx] = r;
        pixelData[pixelIdx + 1] = g;
        pixelData[pixelIdx + 2] = b;
        pixelData[pixelIdx + 3] = a;
      } else {
        const nc = hexToRgb(COLORS.diffLayer.noChange);
        pixelData[pixelIdx] = Math.round(nc[0] * 255);
        pixelData[pixelIdx + 1] = Math.round(nc[1] * 255);
        pixelData[pixelIdx + 2] = Math.round(nc[2] * 255);
        pixelData[pixelIdx + 3] = 30;
      }
    }
  }

  return new ImageData(pixelData, width, height);
}

/**
 * Convert ImageData to a data URL string.
 */
export function imageDataToDataURL(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
