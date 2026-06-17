import { makeAutoObservable, runInAction } from 'mobx';

export interface TFControlPoint {
  position: number;
  color: [number, number, number];
  opacity: number;
}

export interface ThumbnailStats {
  low: number;
  high: number;
  bins: number[];
}

export type ThumbnailView = 'current' | 'top' | 'front' | 'side';
export type ThumbnailCompareMode = 'off' | 'prev' | 'ref';

class VolumeStore {
  currentStep = 0;
  isPlaying = false;
  playSpeed = 2;
  isLoading = false;
  stepSize = 1 / 64;
  densityScale = 1.0;

  // ── Main: gradient / diff / classification ──
  gradLow = 0.02;
  gradHigh = 0.15;
  gradWeight = 0.6;
  referenceStep = 0;
  diffStep = 0; // 差异分析对比目标步（仅随2D缩略图点击更新）
  comparisonSteps: number[] = [0];
  diffEnabled = false;
  diffMode = false;
  showOriginal = true;
  showDifference = true;
  categoryFilter = -1;
  classBoundaries: number[] = [];
  lowPercentile = 1;
  highPercentile = 99;
  dataVersion = 0;
  diffThumbnails = new Map<number, string>();
  thumbnailVersion = 0;
  sortedByChange: number[] = [];

  // ── ZYJ: 密度直方图筛选高亮 ──
  highlightedRange: { min: number; max: number } | null = null;

  // ── YG: lighting / thumbnail analysis ──
  lightAzimuth = 45; // degrees
  lightElevation = 30; // degrees
  lightIntensity = 1.0;

  thumbnailStats = new Map<number, ThumbnailStats>();
  thumbnailImages = new Map<string, string>();
  thumbnailSteps = [0];
  thumbnailLowRange: [number, number] = [0.05, 0.25];
  thumbnailHighRange: [number, number] = [0.6, 0.9];
  thumbnailView: ThumbnailView = 'current';
  thumbnailCompareMode: ThumbnailCompareMode = 'off';
  thumbnailCompareRefIndex = 1;
  thumbnailCompareOverlay = true;
  thumbnailRefreshToken = 0;

  transferFunction: TFControlPoint[] = [
    { position: 0.0, color: [0.1, 0.0, 0.2], opacity: 0.0 },
    { position: 0.15, color: [0.0, 0.1, 0.5], opacity: 0.02 },
    { position: 0.3, color: [0.0, 0.4, 0.8], opacity: 0.08 },
    { position: 0.45, color: [0.2, 0.6, 0.6], opacity: 0.15 },
    { position: 0.6, color: [0.8, 0.7, 0.2], opacity: 0.35 },
    { position: 0.75, color: [1.0, 0.5, 0.1], opacity: 0.55 },
    { position: 0.9, color: [1.0, 0.2, 0.1], opacity: 0.75 },
    { position: 1.0, color: [1.0, 1.0, 1.0], opacity: 0.95 },
  ];

  private _dataCache = new Map<number, Float32Array>();
  private _dataMin = new Map<number, number>();
  private _dataMax = new Map<number, number>();
  private _playTimer: ReturnType<typeof setInterval> | null = null;
  _refClassesCache: Uint8Array | null = null;
  _diffDataCache = new Map<number, Float32Array>();
  _diffStatsCache = new Map<number, { growthCount: number; declineCount: number }>();

  constructor() {
    makeAutoObservable(this, {
      diffThumbnails: false,
      _dataCache: false,
      _dataMin: false,
      _dataMax: false,
      _playTimer: false,
      _refClassesCache: false,
      _diffDataCache: false,
      _diffStatsCache: false,
    });
  }

  setTimeStep = (step: number) => {
    this.currentStep = Math.max(0, Math.min(99, Math.round(step)));
  };

  setDiffStep = (step: number) => {
    this.diffStep = Math.max(0, Math.min(99, Math.round(step)));
  };

  advanceStep = (delta: number) => {
    let next = this.currentStep + delta;
    if (next > 99) next = 0;
    if (next < 0) next = 99;
    this.currentStep = next;
  };

  togglePlay = () => {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      const interval = 1000 / this.playSpeed;
      this._playTimer = setInterval(() => {
        runInAction(() => this.advanceStep(1));
      }, interval);
    } else {
      if (this._playTimer) {
        clearInterval(this._playTimer);
        this._playTimer = null;
      }
    }
  };

  setPlaySpeed = (speed: number) => {
    this.playSpeed = speed;
    if (this.isPlaying) {
      if (this._playTimer) clearInterval(this._playTimer);
      const interval = 1000 / speed;
      this._playTimer = setInterval(() => {
        runInAction(() => this.advanceStep(1));
      }, interval);
    }
  };

  setStepSize = (size: number) => {
    this.stepSize = size;
  };

  setDensityScale = (scale: number) => {
    this.densityScale = scale;
  };

  // ── Main: gradient setters ──
  setGradLow = (value: number) => {
    this.gradLow = value;
  };

  setGradHigh = (value: number) => {
    this.gradHigh = value;
  };

  setGradWeight = (value: number) => {
    this.gradWeight = value;
  };

  // ── Main: reference step / comparison ──
  setReferenceStep = (step: number) => {
    const clamped = Math.max(0, Math.min(99, Math.round(step)));
    this.referenceStep = clamped;
    if (!this.comparisonSteps.includes(clamped)) {
      this.comparisonSteps.push(clamped);
      this.comparisonSteps.sort((a, b) => a - b);
    }
    this._refClassesCache = null;
    this._diffDataCache.clear();
    this._diffStatsCache.clear();
    this.diffThumbnails.clear();
    this.sortedByChange = [];
  };

  addComparisonStep = (step: number) => {
    const clamped = Math.max(0, Math.min(99, Math.round(step)));
    if (!this.comparisonSteps.includes(clamped)) {
      this.comparisonSteps.push(clamped);
      this.comparisonSteps.sort((a, b) => a - b);
    }
  };

  removeComparisonStep = (step: number) => {
    if (step === this.referenceStep) return;
    this.comparisonSteps = this.comparisonSteps.filter((s) => s !== step);
    this._diffDataCache.delete(step);
    this._diffStatsCache.delete(step);
    this.diffThumbnails.delete(step);
    this.sortedByChange = [];
  };

  setDiffEnabled = (enabled: boolean) => {
    this.diffEnabled = enabled;
  };

  toggleDiffMode = () => {
    this.diffMode = !this.diffMode;
  };

  setShowOriginal = (show: boolean) => {
    this.showOriginal = show;
  };

  setShowDifference = (show: boolean) => {
    this.showDifference = show;
  };

  setCategoryFilter = (filter: number) => {
    this.categoryFilter = filter;
    this._refClassesCache = null;
    this._diffDataCache.clear();
    this._diffStatsCache.clear();
    this.sortedByChange = [];
  };

  setLowPercentile = (pct: number) => {
    const clamped = Math.max(0.1, Math.min(49, pct));
    if (clamped !== this.lowPercentile) {
      this.lowPercentile = clamped;
      if (this.lowPercentile >= this.highPercentile) {
        this.highPercentile = Math.min(99.9, this.lowPercentile + 1);
      }
      this._refClassesCache = null;
      this._diffDataCache.clear();
      this._diffStatsCache.clear();
      this.diffThumbnails.clear();
      this.sortedByChange = [];
    }
  };

  setHighPercentile = (pct: number) => {
    const clamped = Math.max(51, Math.min(99.9, pct));
    if (clamped !== this.highPercentile) {
      this.highPercentile = clamped;
      if (this.highPercentile <= this.lowPercentile) {
        this.lowPercentile = Math.max(0.1, this.highPercentile - 1);
      }
      this._refClassesCache = null;
      this._diffDataCache.clear();
      this._diffStatsCache.clear();
      this.diffThumbnails.clear();
      this.sortedByChange = [];
    }
  };

  setClassBoundaries = (boundaries: number[]) => {
    this.classBoundaries = boundaries;
    this._refClassesCache = null;
    this._diffDataCache.clear();
    this._diffStatsCache.clear();
    this.diffThumbnails.clear();
    this.sortedByChange = [];
  };

  // ── Main: diff cache ──
  getCachedDiffData = (step: number): Float32Array | undefined => {
    return this._diffDataCache.get(step);
  };

  cacheDiffData = (step: number, data: Float32Array) => {
    this._diffDataCache.set(step, data);
  };

  getCachedDiffStats = (
    step: number
  ): { growthCount: number; declineCount: number } | undefined => {
    return this._diffStatsCache.get(step);
  };

  cacheDiffStats = (
    step: number,
    stats: { growthCount: number; declineCount: number }
  ) => {
    this._diffStatsCache.set(step, stats);
  };

  setDiffThumbnail = (step: number, dataUrl: string) => {
    this.diffThumbnails.set(step, dataUrl);
  };

  setSortedByChange = (steps: number[]) => {
    this.sortedByChange = steps;
  };

  bumpThumbnailVersion = () => {
    this.thumbnailVersion++;
  };

  // ── YG: lighting setters ──
  setLightAzimuth = (deg: number) => {
    this.lightAzimuth = deg;
  };

  setLightElevation = (deg: number) => {
    this.lightElevation = deg;
  };

  setLightIntensity = (v: number) => {
    this.lightIntensity = v;
  };

  // ── ZYJ: 密度直方图筛选高亮 ──
  setHighlightedRange = (range: { min: number; max: number } | null) => {
    console.log('[volumeStore] setHighlightedRange:', range, 'previous:', this.highlightedRange);
    this.highlightedRange = range;
  };

  // ── YG: thumbnail analysis ──
  setTransferFunction = (points: TFControlPoint[]) => {
    this.transferFunction = [...points].sort((a, b) => a.position - b.position);
  };

  setThumbnailStats = (step: number, stats: ThumbnailStats) => {
    this.thumbnailStats.set(step, stats);
  };

  getThumbnailStats = (step: number): ThumbnailStats | undefined => {
    return this.thumbnailStats.get(step);
  };

  private buildThumbnailKey = (step: number, type: 'low' | 'high') => {
    const range = type === 'low' ? this.thumbnailLowRange : this.thumbnailHighRange;
    const compareFlag = `${this.thumbnailCompareMode}-r${this.thumbnailCompareRefIndex}-${this.thumbnailCompareOverlay ? 'o1' : 'o0'}`;
    return `${step}-${type}-${this.thumbnailView}-${range[0].toFixed(2)}-${range[1].toFixed(2)}-${compareFlag}`;
  };

  setThumbnailImage = (step: number, type: 'low' | 'high', dataUrl: string) => {
    const key = this.buildThumbnailKey(step, type);
    this.thumbnailImages.set(key, dataUrl);
  };

  getThumbnailImage = (step: number, type: 'low' | 'high'): string | undefined => {
    const key = this.buildThumbnailKey(step, type);
    return this.thumbnailImages.get(key);
  };

  setThumbnailLowRange = (min: number, max: number) => {
    this.thumbnailLowRange = [Math.min(min, max), Math.max(min, max)];
  };

  setThumbnailHighRange = (min: number, max: number) => {
    this.thumbnailHighRange = [Math.min(min, max), Math.max(min, max)];
  };

  setThumbnailView = (view: ThumbnailView) => {
    this.thumbnailView = view;
  };

  setThumbnailCompareMode = (mode: ThumbnailCompareMode) => {
    this.thumbnailCompareMode = mode;
  };

  setThumbnailCompareRefIndex = (idx: number) => {
    this.thumbnailCompareRefIndex = Math.max(0, Math.min(this.thumbnailSteps.length - 1, idx));
  };

  toggleThumbnailCompareOverlay = () => {
    this.thumbnailCompareOverlay = !this.thumbnailCompareOverlay;
  };

  toggleThumbnailStep = (step: number) => {
    const clamped = Math.max(0, Math.min(99, Math.round(step)));
    const idx = this.thumbnailSteps.indexOf(clamped);
    if (idx >= 0) {
      if (this.thumbnailSteps.length <= 1) return; // 至少保留一个
      this.thumbnailSteps = this.thumbnailSteps.filter((s) => s !== clamped);
    } else {
      this.thumbnailSteps = [...this.thumbnailSteps, clamped].sort((a, b) => a - b);
      // 同步加入差异分析系统
      if (!this.comparisonSteps.includes(clamped)) {
        this.comparisonSteps.push(clamped);
        this.comparisonSteps.sort((a, b) => a - b);
      }
      // 设为差异对比目标
      this.diffStep = clamped;
      // Trigger thumbnail generation for the new step
      this.thumbnailRefreshToken += 1;
    }
  };

  refreshThumbnails = () => {
    this.thumbnailRefreshToken += 1;
    if (this.thumbnailView === 'current') {
      const keys = Array.from(this.thumbnailImages.keys());
      for (const key of keys) {
        if (key.includes('-current-')) {
          this.thumbnailImages.delete(key);
        }
      }
    }
  };

  getCachedData = (step: number): Float32Array | undefined => {
    return this._dataCache.get(step);
  };

  getDataRange = (step: number): { min: number; max: number } | undefined => {
    const min = this._dataMin.get(step);
    const max = this._dataMax.get(step);
    if (min === undefined || max === undefined) return undefined;
    return { min, max };
  };

  cacheData = (step: number, data: Float32Array, min: number, max: number) => {
    this._dataCache.set(step, data);
    this._dataMin.set(step, min);
    this._dataMax.set(step, max);
    this.dataVersion++;

    const MAX_CACHE = 20;
    if (this._dataCache.size > MAX_CACHE) {
      const current = this.currentStep;
      let farthest = -1;
      let farthestDist = -1;
      for (const key of this._dataCache.keys()) {
        const dist = Math.abs(key - current);
        if (dist > farthestDist) {
          farthestDist = dist;
          farthest = key;
        }
      }
      if (farthest >= 0) {
        this._dataCache.delete(farthest);
        this._dataMin.delete(farthest);
        this._dataMax.delete(farthest);
      }
    }
  };
}

export const volumeStore = new VolumeStore();
