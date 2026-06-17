import React, { useRef, useEffect, useCallback, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore, type ThumbnailCompareMode, type ThumbnailView } from '@/store/volumeStore';
import { Slider } from 'primereact/slider';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Divider } from 'primereact/divider';
import { Chip } from 'primereact/chip';
import { ColorPicker } from 'primereact/colorpicker';

// ═══════════════════════════════════════════════════════════════
// SliderRow — unified label | slider | value row
// ═══════════════════════════════════════════════════════════════
const SliderRow: React.FC<{
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onValueChange: (v: number) => void;
}> = ({ label, value, displayValue, min, max, step, onValueChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-foreground/70">{label}</span>
      <Chip label={displayValue} className="font-mono text-[10px] h-5 px-1.5" />
    </div>
    <Slider
      min={min} max={max} step={step}
      value={value}
      onChange={(e) => onValueChange(e.value as number)}
      style={{ width: '100%' }}
    />
  </div>
);

// ═══════════════════════════════════════════════════════════════
// SectionHeading — rounded shadow left-side accent heading
// ═══════════════════════════════════════════════════════════════
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="section-heading">{children}</h4>
);

// ═══════════════════════════════════════════════════════════════
// TF Ramp Canvas — color gradient + alpha strip + control points
// ═══════════════════════════════════════════════════════════════
const TfRampCanvas: React.FC<{
  selectedIndex: number | null;
  onSelectIndex: (i: number | null) => void;
}> = observer(({ selectedIndex, onSelectIndex }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const draw = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const PAD = 12;
    const COLOR_RATIO = 0.62;
    const colorH = Math.round(cssH * COLOR_RATIO);
    const innerW = cssW - PAD * 2;
    const points = volumeStore.transferFunction;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.roundRect(0, 0, cssW, cssH, 8);
    ctx.fill();

    // Color gradient + alpha strip
    for (let px = PAD; px < cssW - PAD; px++) {
      const t = (px - PAD) / (innerW - 1);
      let cr = 0, cg = 0, cb = 0, ca = 0;
      if (points.length > 0) {
        if (t <= points[0].position) {
          cr = points[0].color[0]; cg = points[0].color[1]; cb = points[0].color[2]; ca = points[0].opacity;
        } else if (t >= points[points.length - 1].position) {
          const last = points[points.length - 1];
          cr = last.color[0]; cg = last.color[1]; cb = last.color[2]; ca = last.opacity;
        } else {
          for (let i = 0; i < points.length - 1; i++) {
            if (t >= points[i].position && t <= points[i + 1].position) {
              const frac = (t - points[i].position) / (points[i + 1].position - points[i].position);
              cr = points[i].color[0] + (points[i + 1].color[0] - points[i].color[0]) * frac;
              cg = points[i].color[1] + (points[i + 1].color[1] - points[i].color[1]) * frac;
              cb = points[i].color[2] + (points[i + 1].color[2] - points[i].color[2]) * frac;
              ca = points[i].opacity + (points[i + 1].opacity - points[i].opacity) * frac;
              break;
            }
          }
        }
      }
      ctx.fillStyle = `rgb(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)})`;
      ctx.fillRect(px, 0, 1, colorH);
      for (let py = colorH; py < cssH; py++) {
        const checkSize = Math.max(3, Math.round(cssH * 0.08));
        const isChecker = (Math.floor(px / checkSize) + Math.floor((py - colorH) / checkSize)) % 2 === 0;
        const bg = isChecker ? 180 : 210;
        const ov = Math.round(ca * 255);
        const blended = Math.round(ov * ca + bg * (1 - ca));
        ctx.fillStyle = `rgb(${blended},${blended},${blended})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }

    // Tick marks (subtle separator between color & alpha)
    for (const tp of [0, 0.25, 0.5, 0.75, 1]) {
      const tx = PAD + tp * innerW;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(tx, colorH - 3); ctx.lineTo(tx, colorH + 3); ctx.stroke();
    }

    // Labels
    const fontSize = Math.max(10, Math.min(13, cssH * 0.22));
    ctx.font = `bold ${fontSize}px "Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    const drawLabel = (text: string, y: number) => {
      const m = ctx.measureText(text);
      const bw = m.width + 10, bh = fontSize + 6;
      const bx = PAD + 6, by = y - bh / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 5, y);
    };
    drawLabel('颜色', colorH / 2);
    if (cssH - colorH > 16) drawLabel('透明度', colorH + (cssH - colorH) / 2);

    // Control point handles
    const handleSize = Math.max(4, Math.min(6, cssH * 0.1));
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const px = PAD + pt.position * innerW;
      const isSelected = i === selectedIndex;
      const cx = colorH / 2;

      ctx.strokeStyle = isSelected ? 'rgba(255,200,0,0.65)' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = isSelected ? 1.5 : 0.6;
      ctx.setLineDash(isSelected ? [] : [3, 5]);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, cssH); ctx.stroke();
      ctx.setLineDash([]);

      if (isSelected) {
        const glowR = handleSize * 1.8;
        const glow = ctx.createRadialGradient(px, cx, 0, px, cx, glowR);
        glow.addColorStop(0, 'rgba(255,200,0,0.35)');
        glow.addColorStop(1, 'rgba(255,200,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(px, cx, glowR, 0, Math.PI * 2); ctx.fill();
      }

      const s = isSelected ? handleSize : handleSize * 0.7;
      ctx.beginPath();
      ctx.moveTo(px, cx - s); ctx.lineTo(px + s, cx);
      ctx.lineTo(px, cx + s); ctx.lineTo(px - s, cx);
      ctx.closePath();
      ctx.fillStyle = isSelected ? '#ffcc00' : '#ffffff'; ctx.fill();
      ctx.strokeStyle = isSelected ? '#b8860b' : 'rgba(0,0,0,0.55)';
      ctx.lineWidth = isSelected ? 1.5 : 1; ctx.stroke();
    }
  }, [selectedIndex]);

  useEffect(() => {
    draw();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [volumeStore.transferFunction, draw]);

  const cssToT = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const PAD = 12;
    const innerW = rect.width - PAD * 2;
    return Math.max(0, Math.min(1, (cssX - PAD) / innerW));
  }, []);

  const getClickTarget = useCallback((clientX: number) => {
    const t = cssToT(clientX);
    const points = volumeStore.transferFunction;
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].position - t);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return { index: best, dist: bestDist };
  }, [cssToT]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = getClickTarget(e.clientX);
    if (!target) return;
    if (target.dist < 0.04) { onSelectIndex(target.index); draggingRef.current = true; }
    else { onSelectIndex(null); draggingRef.current = false; }
  }, [getClickTarget, onSelectIndex]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current || selectedIndex === null) return;
    const t = cssToT(e.clientX);
    const points = [...volumeStore.transferFunction];
    points[selectedIndex] = { ...points[selectedIndex], position: t };
    volumeStore.setTransferFunction(points);
  }, [selectedIndex, cssToT]);

  const handleMouseUp = useCallback(() => { draggingRef.current = false; }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = getClickTarget(e.clientX);
    if (target && target.dist < 0.04) {
      if (volumeStore.transferFunction.length <= 2) return;
      volumeStore.setTransferFunction(volumeStore.transferFunction.filter((_, i) => i !== target.index));
      onSelectIndex(null);
      return;
    }
    const t = cssToT(e.clientX);
    const points = volumeStore.transferFunction;
    let insertColor: [number, number, number] = [1, 1, 1];
    let insertOpacity = 0.5;
    if (points.length > 0) {
      if (t <= points[0].position) {
        insertColor = [...points[0].color]; insertOpacity = points[0].opacity;
      } else if (t >= points[points.length - 1].position) {
        insertColor = [...points[points.length - 1].color]; insertOpacity = points[points.length - 1].opacity;
      } else {
        for (let i = 0; i < points.length - 1; i++) {
          if (t >= points[i].position && t <= points[i + 1].position) {
            const frac = (t - points[i].position) / (points[i + 1].position - points[i].position);
            insertColor = [
              points[i].color[0] + (points[i + 1].color[0] - points[i].color[0]) * frac,
              points[i].color[1] + (points[i + 1].color[1] - points[i].color[1]) * frac,
              points[i].color[2] + (points[i + 1].color[2] - points[i].color[2]) * frac,
            ];
            insertOpacity = points[i].opacity + (points[i + 1].opacity - points[i].opacity) * frac;
            break;
          }
        }
      }
    }
    const newPoints = [...points, { position: t, color: insertColor, opacity: insertOpacity }];
    volumeStore.setTransferFunction(newPoints);
    onSelectIndex(newPoints.length - 1);
  }, [getClickTarget, cssToT, onSelectIndex]);

  return (
    <div className="tf-ramp-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="tf-ramp"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// Control Point Editor
// ═══════════════════════════════════════════════════════════════
const ControlPointEditor: React.FC<{ selectedIndex: number | null }> = observer(({ selectedIndex }) => {
  const selectedPoint = selectedIndex !== null ? volumeStore.transferFunction[selectedIndex] : null;
  const colorHex = selectedPoint
    ? '#' + selectedPoint.color.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
    : '#ffffff';

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedIndex === null) return;
    const hex = e.target.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    volumeStore.setTransferFunction(volumeStore.transferFunction.map((p, i) =>
      i === selectedIndex ? { ...p, color: [r, g, b] as [number, number, number] } : p));
  }, [selectedIndex]);

  const handleOpacityChange = useCallback((v: number) => {
    if (selectedIndex === null) return;
    volumeStore.setTransferFunction(volumeStore.transferFunction.map((p, i) =>
      i === selectedIndex ? { ...p, opacity: v } : p));
  }, [selectedIndex]);

  const handlePositionChange = useCallback((v: number) => {
    if (selectedIndex === null) return;
    volumeStore.setTransferFunction(volumeStore.transferFunction.map((p, i) =>
      i === selectedIndex ? { ...p, position: v } : p));
  }, [selectedIndex]);

  if (!selectedPoint) {
    return (
      <div className="control-point-placeholder">
        <span className="text-[11px] text-muted-foreground/50">
          双击画布添加控制点 · 拖动调整位置
        </span>
      </div>
    );
  }

  return (
    <div className="control-point-editor">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">
          控制点 <span className="text-primary font-mono">#{selectedIndex! + 1}</span>
        </span>
       
      </div>
      <SliderRow label="位置" value={selectedPoint.position} displayValue={selectedPoint.position.toFixed(2)} min={0} max={1} step={0.01} onValueChange={handlePositionChange} />
      <div className="flex items-center gap-3" style={{ margin: '10px 0 10px 0' }}>
        <span className="text-[11px] text-foreground/70 w-10 shrink-0">颜色</span>
        <div className="flex items-center gap-2 flex-1">
          <ColorPicker
            value={colorHex}
            onChange={(e) => handleColorChange({ target: { value: '#' + (e.value as string) } } as React.ChangeEvent<HTMLInputElement>)}
          />
          <span className="text-[11px] text-muted-foreground font-mono">{colorHex}</span>
        </div>
      </div>
      <div style={{ marginBottom: 5 }}>
        <SliderRow label="透明度" value={selectedPoint.opacity} displayValue={selectedPoint.opacity.toFixed(2)} min={0} max={1} step={0.01} onValueChange={handleOpacityChange} />
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// Model Parameters Tab — transfer function + rendering + lighting
// ═══════════════════════════════════════════════════════════════
const ModelParamsTab: React.FC = observer(() => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  return (
    <div className="grid gap-5 pb-4">
      {/* 传递函数 */}
      <div className="grid gap-2.5">
        <SectionHeading>传递函数</SectionHeading>
        <TfRampCanvas selectedIndex={selectedIndex} onSelectIndex={setSelectedIndex} />
        <ControlPointEditor selectedIndex={selectedIndex} />
      </div>

      <Divider />

      {/* 渲染参数 */}
      <div className="grid gap-2">
        <SectionHeading>渲染参数</SectionHeading>
        <SliderRow label="采样步长" value={volumeStore.stepSize} displayValue={volumeStore.stepSize.toFixed(3)} min={0.004} max={0.05} step={0.001} onValueChange={(v) => volumeStore.setStepSize(v)} />
        <SliderRow label="密度缩放" value={volumeStore.densityScale} displayValue={volumeStore.densityScale.toFixed(1)} min={0.1} max={3.0} step={0.1} onValueChange={(v) => volumeStore.setDensityScale(v)} />
        <SliderRow label="梯度权重" value={volumeStore.gradWeight} displayValue={volumeStore.gradWeight.toFixed(2)} min={0} max={1} step={0.01} onValueChange={(v) => volumeStore.setGradWeight(v)} />
        <SliderRow label="低阈值" value={volumeStore.gradLow} displayValue={volumeStore.gradLow.toFixed(3)} min={0.001} max={0.2} step={0.001} onValueChange={(v) => volumeStore.setGradLow(v)} />
        <SliderRow label="高阈值" value={volumeStore.gradHigh} displayValue={volumeStore.gradHigh.toFixed(3)} min={0.005} max={0.5} step={0.005} onValueChange={(v) => volumeStore.setGradHigh(v)} />
      </div>

      <Divider />

      {/* 光照 */}
      <div className="grid gap-2">
        <SectionHeading>光照</SectionHeading>
        <SliderRow label="方位角" value={volumeStore.lightAzimuth} displayValue={`${Math.round(volumeStore.lightAzimuth)}°`} min={0} max={360} step={1} onValueChange={(v) => volumeStore.setLightAzimuth(v)} />
        <SliderRow label="仰角" value={volumeStore.lightElevation} displayValue={`${Math.round(volumeStore.lightElevation)}°`} min={-20} max={80} step={1} onValueChange={(v) => volumeStore.setLightElevation(v)} />
        <SliderRow label="强度" value={volumeStore.lightIntensity} displayValue={volumeStore.lightIntensity.toFixed(1)} min={0.2} max={2.5} step={0.1} onValueChange={(v) => volumeStore.setLightIntensity(v)} />
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// Diff Analysis Tab — diff mode + classification
// ═══════════════════════════════════════════════════════════════
const DiffAnalysisTab: React.FC = observer(() => {
  return (
    <div className="grid gap-5 pb-4">
      {/* 缩略图视角 + 对比模式 */}
      <div className="grid gap-2">
        <SectionHeading>缩略图视角</SectionHeading>
        <div className="flex items-center gap-2">
          <Dropdown value={volumeStore.thumbnailView} onChange={(e) => volumeStore.setThumbnailView(e.value as ThumbnailView)}
            options={[
              { label: '当前视角', value: 'current' },
              { label: '俯视', value: 'top' },
              { label: '正视', value: 'front' },
              { label: '侧视', value: 'side' },
            ]}
            className="inspector-dropdown flex-1" />
          {volumeStore.thumbnailView === 'current' && (
            <Button outlined size="small" severity="secondary" className="inspector-btn-sm" onClick={() => volumeStore.refreshThumbnails()}>
              刷新
            </Button>
          )}
        </div>
        {/* 对比模式 inline */}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <Dropdown value={volumeStore.thumbnailCompareMode} onChange={(e) => volumeStore.setThumbnailCompareMode(e.value as ThumbnailCompareMode)}
            options={[
              { label: '关闭对比', value: 'off' },
              { label: '上一步', value: 'prev' },
              { label: '参考步', value: 'ref' },
            ]}
            className="inspector-dropdown flex-1 min-w-[80px]" />
          {volumeStore.thumbnailCompareMode === 'ref' && (
            <Dropdown value={String(volumeStore.thumbnailCompareRefIndex)} onChange={(e) => volumeStore.setThumbnailCompareRefIndex(Number(e.value))}
              options={volumeStore.thumbnailSteps.map((step, idx) => ({ label: `第${step}步`, value: String(idx) }))}
              className="inspector-dropdown w-[90px]" />
          )}
          <Button
            severity={volumeStore.thumbnailCompareOverlay ? undefined : "secondary"}
            outlined={!volumeStore.thumbnailCompareOverlay}
            size="small"
            className="inspector-btn-sm"
            onClick={() => volumeStore.toggleThumbnailCompareOverlay()}
          >
            叠加
          </Button>
        </div>
      </div>

      <Divider />

      {/* 差异分析 */}
      <div className="grid gap-2">
        <SectionHeading>差异分析</SectionHeading>
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/80">差异模式</span>
          <div className="segmented-control">
            <button type="button"
              className={`segmented-control__item ${!volumeStore.diffMode ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); if (volumeStore.diffMode) volumeStore.toggleDiffMode(); }}
            >关闭</button>
            <button type="button"
              className={`segmented-control__item ${volumeStore.diffMode ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); if (!volumeStore.diffMode) volumeStore.toggleDiffMode(); }}
            >启用</button>
          </div>
        </div>
        {/* 图层显示 — always visible */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/80">图层显示</span>
          <div className="pill-toggles">
            <button type="button"
              className={`pill-toggle pill-toggle--original ${volumeStore.showOriginal ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); volumeStore.setShowOriginal(!volumeStore.showOriginal); }}
            >
              <span className="pill-toggle__dot" />原始体渲染
            </button>
            <button type="button"
              className={`pill-toggle pill-toggle--diff ${volumeStore.showDifference ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); volumeStore.setShowDifference(!volumeStore.showDifference); }}
            >
              <span className="pill-toggle__dot" />变化着色
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground/80 w-10 shrink-0">分类</span>
          <Dropdown value={String(volumeStore.categoryFilter)} onChange={(e) => volumeStore.setCategoryFilter(Number(e.value))}
            options={[
              { label: '全部分类', value: '-1' },
              ...(volumeStore.classBoundaries.length >= 2 ? (() => {
                const loPct = volumeStore.lowPercentile;
                const hiPct = volumeStore.highPercentile;
                const midPct = (hiPct - loPct).toFixed(1);
                const names = [`低密度 (底部 ${loPct}%)`, `正常 (中间 ${midPct}%)`, `高密度 (顶部 ${(100 - hiPct).toFixed(1)}%)`];
                return Array.from({ length: volumeStore.classBoundaries.length - 1 }, (_, i) => {
                  const lo = volumeStore.classBoundaries[i];
                  const hi = volumeStore.classBoundaries[i + 1];
                  return { label: `${names[i]}: [${lo.toFixed(3)}, ${hi.toFixed(3)})`, value: String(i) };
                });
              })() : []),
            ]}
            className="inspector-dropdown flex-1" />
        </div>
      </div>

      <Divider />

      {/* 分类百分位 */}
      <div className="grid gap-2">
        <SectionHeading>分类百分位</SectionHeading>
        <div>
          <SliderRow label="低密度 %" value={volumeStore.lowPercentile} displayValue={`${volumeStore.lowPercentile.toFixed(1)}%`} min={0.1} max={49} step={0.5} onValueChange={(v) => volumeStore.setLowPercentile(v)} />
          {volumeStore.classBoundaries.length >= 3 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">密度 &lt; {volumeStore.classBoundaries[1].toFixed(3)}</p>
          )}
        </div>
        <div>
          <SliderRow label="高密度 %" value={volumeStore.highPercentile} displayValue={`${volumeStore.highPercentile.toFixed(1)}%`} min={51} max={99.9} step={0.5} onValueChange={(v) => volumeStore.setHighPercentile(v)} />
          {volumeStore.classBoundaries.length >= 3 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">密度 &gt; {volumeStore.classBoundaries[2].toFixed(3)}</p>
          )}
        </div>
      </div>

      <Divider />

      {/* 密度范围 */}
      <div className="grid gap-2">
        <SectionHeading>密度范围</SectionHeading>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-foreground/70">低密度</span>
            <Chip label={`${volumeStore.thumbnailLowRange[0].toFixed(2)} – ${volumeStore.thumbnailLowRange[1].toFixed(2)}`} className="font-mono text-[10px] h-5 px-1.5" />
          </div>
          <div className="flex gap-2">
            <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailLowRange[0]} onChange={(e) => volumeStore.setThumbnailLowRange(e.value as number, volumeStore.thumbnailLowRange[1])} style={{ flex: 1 }} />
            <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailLowRange[1]} onChange={(e) => volumeStore.setThumbnailLowRange(volumeStore.thumbnailLowRange[0], e.value as number)} style={{ flex: 1 }} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-foreground/70">高密度</span>
            <Chip label={`${volumeStore.thumbnailHighRange[0].toFixed(2)} – ${volumeStore.thumbnailHighRange[1].toFixed(2)}`} className="font-mono text-[10px] h-5 px-1.5" />
          </div>
          <div className="flex gap-2">
            <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailHighRange[0]} onChange={(e) => volumeStore.setThumbnailHighRange(e.value as number, volumeStore.thumbnailHighRange[1])} style={{ flex: 1 }} />
            <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailHighRange[1]} onChange={(e) => volumeStore.setThumbnailHighRange(volumeStore.thumbnailHighRange[0], e.value as number)} style={{ flex: 1 }} />
          </div>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════
// RenderingInspector — main export (Menubar navigation)
// ═══════════════════════════════════════════════════════════════
const RenderingInspector: React.FC = observer(() => {
  const [activeTab, setActiveTab] = useState<'params' | 'diff'>('params');

  return (
    <div className="inspector-card">
      {/* Tab navigation — pill-style toggle at top */}
      <div className="inspector-tabs">
        <button type="button"
          className={`inspector-tab ${activeTab === 'params' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setActiveTab('params'); }}
        >模型参数设置</button>
        <button type="button"
          className={`inspector-tab ${activeTab === 'diff' ? 'active' : ''}`}
          onClick={(e) => { e.preventDefault(); setActiveTab('diff'); }}
        >差异分析</button>
      </div>
      {/* Content body */}
      <div className="inspector-card__body inspector-scrollbar">
        {activeTab === 'params' ? <ModelParamsTab /> : <DiffAnalysisTab />}
      </div>
    </div>
  );
});

export default RenderingInspector;
export { RenderingInspector };
