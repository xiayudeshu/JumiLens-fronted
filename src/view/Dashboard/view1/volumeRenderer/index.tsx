import React, { useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { VolumeScene } from './volumeScene';
import { volumeStore } from '@/store/volumeStore';
import { loadTimeStep } from './loadData';
import {
  computePercentileBoundaries,
  buildPercentileBoundaries,
  buildClassLUT,
  classifyVolumeLUT,
  computeDiffVolume,
  computeDiffStats,
  generateDiffThumbnail,
  imageDataToDataURL,
  type PercentileThresholds,
} from './diffClassifier';
import { COLORS, hexToRgb } from '@/constants/colors';
import './index.less';

const THUMB_W = 120;
const THUMB_H = 90;
const DEBOUNCE_MS = 150;

const VolumeRenderer: React.FC = observer(() => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VolumeScene | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCallbackId = useRef<number | null>(null);
  const pendingThumbSteps = useRef<Set<number>>(new Set());
  const classLutRef = useRef<Uint8Array>(new Uint8Array(256));

  // ── MobX observables (destructured for React dependency tracking) ──
  const highlightedRange = volumeStore.highlightedRange;
  const currentStep = volumeStore.currentStep;
  const dataVersion = volumeStore.dataVersion;

  // ── Init scene ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const vs = new VolumeScene(containerRef.current);
    sceneRef.current = vs;

    const cached = volumeStore.getCachedData(0);
    if (cached) {
      vs.loadVolumeData(cached);
    } else {
      loadTimeStep(0).then(({ normalized, min, max }) => {
        volumeStore.cacheData(0, normalized, min, max);
        vs.loadVolumeData(normalized);
      });
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) vs.resize(width, height);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      vs.dispose();
    };
     
  }, []);

  // ── Load data for current step ──────────────────────────────
  useEffect(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    const step = volumeStore.currentStep;
    const cached = volumeStore.getCachedData(step);
    if (cached) {
      vs.loadVolumeData(cached);
    } else {
      volumeStore.isLoading = true;
      loadTimeStep(step).then(({ normalized, min, max }) => {
        volumeStore.cacheData(step, normalized, min, max);
        volumeStore.isLoading = false;
        vs.loadVolumeData(normalized);
      });
    }

    // Preload nearby steps
    for (let d = 1; d <= 3; d++) {
      for (const offset of [d, -d]) {
        const preloadStep = step + offset;
        if (preloadStep < 0 || preloadStep > 99) continue;
        if (volumeStore.getCachedData(preloadStep)) continue;
        loadTimeStep(preloadStep).then(({ normalized, min, max }) => {
          volumeStore.cacheData(preloadStep, normalized, min, max);
        });
      }
    }
  }, [volumeStore.currentStep]);

  // ── Ensure reference step data is always loaded ──────────────
  useEffect(() => {
    const refStep = volumeStore.referenceStep;
    if (!volumeStore.getCachedData(refStep)) {
      loadTimeStep(refStep).then(({ normalized, min, max }) => {
        volumeStore.cacheData(refStep, normalized, min, max);
      });
    }
  }, [volumeStore.referenceStep]);

  // ── Sync TF texture ─────────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.buildTFTexture(volumeStore.transferFunction);
  }, [volumeStore.transferFunction]);

  // ── Sync step size ──────────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.updateStepSize(volumeStore.stepSize);
  }, [volumeStore.stepSize]);

  // ── Sync density scale (YG) ──────────────────────────────────
  useEffect(() => {
    sceneRef.current?.updateDensityScale(volumeStore.densityScale);
  }, [volumeStore.densityScale]);

  // ── Sync gradient params (main) ──────────────────────────────
  useEffect(() => {
    sceneRef.current?.updateGradientParams(
      volumeStore.gradLow,
      volumeStore.gradHigh,
      volumeStore.gradWeight
    );
  }, [volumeStore.gradLow, volumeStore.gradHigh, volumeStore.gradWeight]);

  // ── Sync diff params (main) ──────────────────────────────────
  useEffect(() => {
    sceneRef.current?.setDiffMode(volumeStore.diffMode);
  }, [volumeStore.diffMode]);

  useEffect(() => {
    sceneRef.current?.setDiffToggles(
      volumeStore.showOriginal,
      volumeStore.showDifference
    );
  }, [volumeStore.showOriginal, volumeStore.showDifference]);

  // ── Sync lighting (YG) ───────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.updateLighting(
      volumeStore.lightAzimuth,
      volumeStore.lightElevation,
      volumeStore.lightIntensity
    );
  }, [
    volumeStore.lightAzimuth,
    volumeStore.lightElevation,
    volumeStore.lightIntensity,
  ]);

  // ── ZYJ: Sync highlighted range from density histogram ────────
  useEffect(() => {
    console.log('[volumeRenderer] useEffect triggered, highlightedRange:', highlightedRange);
    if (!highlightedRange) {
      console.log('[volumeRenderer] clearing highlight (null range)');
      sceneRef.current?.updateHighlightRange(null);
      return;
    }
    const dataRange = volumeStore.getDataRange(currentStep);
    console.log('[volumeRenderer] dataRange for step', currentStep, ':', dataRange);
    if (!dataRange || dataRange.max <= dataRange.min) {
      console.log('[volumeRenderer] invalid dataRange, clearing highlight');
      sceneRef.current?.updateHighlightRange(null);
      return;
    }
    // highlightedRange stores log10 density values (from log-scale histogram)
    // Convert: log10 → raw → normalized [0,1]
    const rawLow = Math.pow(10, highlightedRange.min);
    const rawHigh = Math.pow(10, highlightedRange.max);
    const dataSpan = dataRange.max - dataRange.min;
    const normLow = Math.max(0, Math.min(1, (rawLow - dataRange.min) / dataSpan));
    const normHigh = Math.max(0, Math.min(1, (rawHigh - dataRange.min) / dataSpan));
    console.log('[volumeRenderer] converted range: log10=[', highlightedRange.min, ',', highlightedRange.max, '] raw=[', rawLow, ',', rawHigh, '] normalized=[', normLow, ',', normHigh, ']');
    sceneRef.current?.updateHighlightRange({ min: normLow, max: normHigh });
  }, [highlightedRange, currentStep, dataVersion]);

  // ── Compute percentile-based class boundaries from reference step data ──
  useEffect(() => {
    const refData = volumeStore.getCachedData(volumeStore.referenceStep);
    if (!refData) return;

    const thresholds: PercentileThresholds = computePercentileBoundaries(
      refData,
      volumeStore.lowPercentile,
      volumeStore.highPercentile
    );
    const bounds = buildPercentileBoundaries(thresholds);
    volumeStore.setClassBoundaries(bounds.boundaries);
    classLutRef.current = buildClassLUT(bounds);

    // Boundaries changed → existing diffs are stale, recompute immediately
    scheduleDiffImmediate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    volumeStore.referenceStep,
    volumeStore.lowPercentile,
    volumeStore.highPercentile,
    volumeStore.dataVersion,
  ]);

  // ── Debounced diff computation ──────────────────────────────
  // 使用 diffStep（仅随2D缩略图点击更新）而非 currentStep（随播放/时间轴更新）
  const doComputeDiff = useCallback(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    const refStep = volumeStore.referenceStep;
    const diffStep = volumeStore.diffStep;
    const lut = classLutRef.current;
    const categoryFilter = volumeStore.categoryFilter;

    const refData = volumeStore.getCachedData(refStep);
    const cmpData = volumeStore.getCachedData(diffStep);
    if (!refData || !cmpData) return;

    // Classify both (LUT-based, ~5ms each)
    const refClasses = classifyVolumeLUT(refData, lut);
    volumeStore._refClassesCache = refClasses;

    const cmpClasses = classifyVolumeLUT(cmpData, lut);

    // Compute diff (single pass, ~3ms) — categoryFilter 实时读取
    const diffData = computeDiffVolume(refClasses, cmpClasses, categoryFilter);
    const stats = computeDiffStats(refClasses, cmpClasses, categoryFilter);

    // Cache
    volumeStore.cacheDiffStats(diffStep, stats);
    volumeStore.cacheDiffData(diffStep, diffData);

    // Upload to GPU only when 3D view step matches diff target
    if (diffStep === volumeStore.currentStep) {
      vs.loadDiffVolume(diffData);
    }

    // Generate thumbnail asynchronously
    pendingThumbSteps.current.add(diffStep);
    scheduleThumbnails();
  }, []);

  // ── Schedule diff computation with debounce ─────────────────
  const scheduleDiff = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      doComputeDiff();
      debounceTimer.current = null;
    }, DEBOUNCE_MS);
  }, [doComputeDiff]);

  // ── Immediate diff (no debounce) for first load ─────────────
  const scheduleDiffImmediate = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    doComputeDiff();
  }, [doComputeDiff]);

  // ── Diff on diffStep change OR new data arrival: immediate if cached, debounced otherwise ──
  // diffStep 仅随2D缩略图点击/Shift+Click折线图更新，不随播放/时间轴变化
  useEffect(() => {
    const step = volumeStore.diffStep;
    // If data already cached, compute diff immediately (no debounce)
    if (volumeStore.getCachedData(step)) {
      scheduleDiffImmediate();
    } else {
      scheduleDiff();
    }
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [volumeStore.diffStep, volumeStore.dataVersion, scheduleDiff, scheduleDiffImmediate]);

  // ── Immediate diff on category filter change ────────────────
  useEffect(() => {
    scheduleDiffImmediate();
  }, [volumeStore.categoryFilter, scheduleDiffImmediate]);

  // ── Show/hide diff overlay: 仅当 3D 视图步 = diff步 且开启diff模式时显示 ──
  useEffect(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    const match = volumeStore.currentStep === volumeStore.diffStep;
    const show = match && volumeStore.diffMode;
    vs.setDiffVisible(show);

    // 当匹配时，确保 diff 数据已上传
    if (show) {
      const cached = volumeStore.getCachedDiffData(volumeStore.diffStep);
      if (cached) {
        vs.loadDiffVolume(cached);
      }
    }
  }, [volumeStore.currentStep, volumeStore.diffStep, volumeStore.diffMode]);

  // ── Process thumbnails in idle time ─────────────────────────
  const processThumbBatch = useCallback(() => {
    idleCallbackId.current = null;

    const steps = Array.from(pendingThumbSteps.current);
    if (steps.length === 0) return;

    // Process up to 2 thumbnails per idle callback
    const batch = steps.splice(0, 2);
    batch.forEach((s) => pendingThumbSteps.current.delete(s));

    const refStep = volumeStore.referenceStep;
    const refData = volumeStore.getCachedData(refStep);
    if (!refData) {
      scheduleThumbnails();
      return;
    }

    const lut = classLutRef.current;
    const categoryFilter = volumeStore.categoryFilter;

    let refClasses = volumeStore._refClassesCache;
    if (!refClasses) {
      refClasses = classifyVolumeLUT(refData, lut);
      volumeStore._refClassesCache = refClasses;
    }

    for (const step of batch) {
      if (step === refStep) continue;
      const cmpData = volumeStore.getCachedData(step);
      if (!cmpData) continue;

      const cmpClasses = classifyVolumeLUT(cmpData, lut);
      const diffData = computeDiffVolume(refClasses, cmpClasses, categoryFilter);
      const stats = computeDiffStats(refClasses, cmpClasses, categoryFilter);
      const maxClassDiff = Math.max(1, volumeStore.classBoundaries.length - 1);
      const thumb = generateDiffThumbnail(diffData, THUMB_W, THUMB_H, maxClassDiff);
      const dataUrl = imageDataToDataURL(thumb);

      volumeStore.cacheDiffData(step, diffData);
      volumeStore.cacheDiffStats(step, stats);
      volumeStore.setDiffThumbnail(step, dataUrl);
    }

    // Increment version to trigger one batched re-render
    volumeStore.bumpThumbnailVersion();

    scheduleThumbnails();
  }, []);

  const scheduleThumbnails = useCallback(() => {
    if (idleCallbackId.current !== null) return;
    if (pendingThumbSteps.current.size === 0) return;

    if (typeof requestIdleCallback !== 'undefined') {
      idleCallbackId.current = requestIdleCallback(processThumbBatch, {
        timeout: 200,
      });
    } else {
      idleCallbackId.current = window.setTimeout(processThumbBatch, 0) as unknown as number;
    }
  }, [processThumbBatch]);

  // ── Enqueue comparison steps for thumbnail generation ───────
  useEffect(() => {
    for (const s of volumeStore.comparisonSteps) {
      if (s !== volumeStore.referenceStep) {
        const hasThumb = volumeStore.diffThumbnails.has(s);
        if (!hasThumb && volumeStore.getCachedData(s)) {
          pendingThumbSteps.current.add(s);
        }
      }
    }
    scheduleThumbnails();
    return () => {
      if (idleCallbackId.current !== null) {
        if (typeof requestIdleCallback !== 'undefined') {
          cancelIdleCallback(idleCallbackId.current);
        } else {
          clearTimeout(idleCallbackId.current);
        }
        idleCallbackId.current = null;
      }
    };
  }, [
    volumeStore.comparisonSteps,
    volumeStore.referenceStep,
    volumeStore.classBoundaries,
    volumeStore.categoryFilter,
    scheduleThumbnails,
  ]);

  // ── YG: Generate GPU thumbnails for key steps ────────────────
  useEffect(() => {
    const vs = sceneRef.current;
    if (!vs) return;

    let cancelled = false;

    const run = async () => {
      const steps = volumeStore.thumbnailSteps;
      if (steps.length === 0) return;

      // ── Phase 1: Parallel preload all uncached data ──
      const loadPromises = steps.map(async (step) => {
        if (volumeStore.getCachedData(step)) return;
        try {
          const loaded = await loadTimeStep(step);
          if (!cancelled) {
            volumeStore.cacheData(step, loaded.normalized, loaded.min, loaded.max);
          }
        } catch { /* skip */ }
      });
      await Promise.all(loadPromises);
      if (cancelled) return;

      // ── Phase 2: GPU render each step sequentially (shared state) ──
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        const step = steps[i];
        const data = volumeStore.getCachedData(step);
        if (!data) continue;

        // Reference data for diff mode
        let refStep: number | null = null;
        if (volumeStore.thumbnailCompareMode === 'prev') {
          refStep = i > 0 ? steps[i - 1] : null;
        } else if (volumeStore.thumbnailCompareMode === 'ref') {
          refStep = steps[volumeStore.thumbnailCompareRefIndex] ?? null;
          if (refStep === step) refStep = i > 0 ? steps[i - 1] : null;
        }

        let refData: Float32Array | undefined;
        if (volumeStore.thumbnailCompareMode !== 'off' && refStep !== null) {
          refData = volumeStore.getCachedData(refStep);
          if (!refData) {
            try {
              const loadedPrev = await loadTimeStep(refStep);
              if (cancelled) return;
              volumeStore.cacheData(refStep, loadedPrev.normalized, loadedPrev.min, loadedPrev.max);
              refData = loadedPrev.normalized;
            } catch { refData = undefined; }
          }
        }

        // ── Render at display resolution (360×270 = 4:3, more than enough for UI) ──
        const LOW_SIZE = { width: 360, height: 270 };
        const MID_SIZE = { width: 300, height: 225 };
        const HIGH_SIZE = { width: 240, height: 180 };

        if (!volumeStore.getThumbnailImage(step, 'low')) {
          const img =
            volumeStore.thumbnailCompareMode !== 'off' && refData
              ? vs.renderThumbnailDiff(
                  data, refData,
                  volumeStore.thumbnailLowRange,
                  volumeStore.thumbnailView,
                  volumeStore.thumbnailCompareOverlay,
                  LOW_SIZE
                )
              : vs.renderThumbnail(
                  data,
                  volumeStore.thumbnailLowRange,
                  hexToRgb(COLORS.density2D.lowPreview),
                  volumeStore.thumbnailView,
                  LOW_SIZE
                );
          volumeStore.setThumbnailImage(step, 'low', img);
        }

        if (!volumeStore.getThumbnailImage(step, 'mid')) {
          const img =
            volumeStore.thumbnailCompareMode !== 'off' && refData
              ? vs.renderThumbnailDiff(
                  data, refData,
                  volumeStore.thumbnailMidRange,
                  volumeStore.thumbnailView,
                  volumeStore.thumbnailCompareOverlay,
                  MID_SIZE
                )
              : vs.renderThumbnail(
                  data,
                  volumeStore.thumbnailMidRange,
                  hexToRgb(COLORS.density2D.midPreview),
                  volumeStore.thumbnailView,
                  MID_SIZE
                );
          volumeStore.setThumbnailImage(step, 'mid', img);
        }

        if (!volumeStore.getThumbnailImage(step, 'high')) {
          const img =
            volumeStore.thumbnailCompareMode !== 'off' && refData
              ? vs.renderThumbnailDiff(
                  data, refData,
                  volumeStore.thumbnailHighRange,
                  volumeStore.thumbnailView,
                  volumeStore.thumbnailCompareOverlay,
                  HIGH_SIZE
                )
              : vs.renderThumbnail(
                  data,
                  volumeStore.thumbnailHighRange,
                  hexToRgb(COLORS.density2D.highPreview),
                  volumeStore.thumbnailView,
                  HIGH_SIZE
                );
          volumeStore.setThumbnailImage(step, 'high', img);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [
    volumeStore.thumbnailView,
    volumeStore.thumbnailLowRange[0],
    volumeStore.thumbnailLowRange[1],
    volumeStore.thumbnailMidRange[0],
    volumeStore.thumbnailMidRange[1],
    volumeStore.thumbnailHighRange[0],
    volumeStore.thumbnailHighRange[1],
    volumeStore.thumbnailRefreshToken,
    volumeStore.thumbnailCompareMode,
    volumeStore.thumbnailCompareRefIndex,
    volumeStore.thumbnailCompareOverlay,
  ]);

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (idleCallbackId.current !== null) {
        if (typeof requestIdleCallback !== 'undefined') {
          cancelIdleCallback(idleCallbackId.current);
        } else {
          clearTimeout(idleCallbackId.current);
        }
      }
    };
  }, []);

  return (
    <div className="volume-renderer-root" ref={containerRef}>
      {volumeStore.isLoading && (
        <div className="volume-loading">
          <span>加载中 Step {volumeStore.currentStep}...</span>
        </div>
      )}
    </div>
  );
});

export default VolumeRenderer;
