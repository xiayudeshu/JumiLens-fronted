import React from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore, type ThumbnailCompareMode, type ThumbnailView } from '@/store/volumeStore';
import { Slider } from 'primereact/slider';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';

const ThumbnailControls: React.FC = observer(() => {
  return (
    <div className="thumb-ctls standalone">
      <div className="thumb-ctl-group">
        <label>视角</label>
        <Dropdown value={volumeStore.thumbnailView} onChange={(e) => volumeStore.setThumbnailView(e.value as ThumbnailView)}
          options={[
            { label: '当前视角', value: 'current' },
            { label: '俯视', value: 'top' },
            { label: '正视', value: 'front' },
            { label: '侧视', value: 'side' },
          ]}
          className="h-auto py-1 text-xs" />
        {volumeStore.thumbnailView === 'current' && (
          <Button outlined size="small" onClick={() => volumeStore.refreshThumbnails()}
            tooltip="刷新当前视角缩略图">
            刷新
          </Button>
        )}
      </div>

      <div className="thumb-ctl-group">
        <label>对比</label>
        <Dropdown value={volumeStore.thumbnailCompareMode} onChange={(e) => volumeStore.setThumbnailCompareMode(e.value as ThumbnailCompareMode)}
          options={[
            { label: '关闭', value: 'off' },
            { label: '上一步', value: 'prev' },
            { label: '参考步', value: 'ref' },
          ]}
          className="h-auto py-1 text-xs" />
        {volumeStore.thumbnailCompareMode === 'ref' && (
          <Dropdown value={String(volumeStore.thumbnailCompareRefIndex)} onChange={(e) => volumeStore.setThumbnailCompareRefIndex(Number(e.value))}
            options={volumeStore.thumbnailSteps.map((step, idx) => ({ label: `第${step}步`, value: String(idx) }))}
            className="h-auto py-1 text-xs" />
        )}
        <Button
          severity={volumeStore.thumbnailCompareOverlay ? undefined : "secondary"}
          outlined={!volumeStore.thumbnailCompareOverlay}
          size="small"
          onClick={() => volumeStore.toggleThumbnailCompareOverlay()}
          tooltip="叠加基础密度"
        >
          叠加
        </Button>
      </div>

      <div className="thumb-ctl-group">
        <label>低密度</label>
        <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailLowRange[0]} onChange={(e) => volumeStore.setThumbnailLowRange(e.value as number, volumeStore.thumbnailLowRange[1])} className="h-3 flex-1 mx-0.5" />
        <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailLowRange[1]} onChange={(e) => volumeStore.setThumbnailLowRange(volumeStore.thumbnailLowRange[0], e.value as number)} className="h-3 flex-1 mx-0.5" />
        <span className="ctl-range-val">
          {volumeStore.thumbnailLowRange[0].toFixed(2)}-{volumeStore.thumbnailLowRange[1].toFixed(2)}
        </span>
      </div>

      <div className="thumb-ctl-group">
        <label>中密度</label>
        <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailMidRange[0]} onChange={(e) => volumeStore.setThumbnailMidRange(e.value as number, volumeStore.thumbnailMidRange[1])} className="h-3 flex-1 mx-0.5" />
        <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailMidRange[1]} onChange={(e) => volumeStore.setThumbnailMidRange(volumeStore.thumbnailMidRange[0], e.value as number)} className="h-3 flex-1 mx-0.5" />
        <span className="ctl-range-val">
          {volumeStore.thumbnailMidRange[0].toFixed(2)}-{volumeStore.thumbnailMidRange[1].toFixed(2)}
        </span>
      </div>

      <div className="thumb-ctl-group">
        <label>高密度</label>
        <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailHighRange[0]} onChange={(e) => volumeStore.setThumbnailHighRange(e.value as number, volumeStore.thumbnailHighRange[1])} className="h-3 flex-1 mx-0.5" />
        <Slider min={0} max={1} step={0.01} value={volumeStore.thumbnailHighRange[1]} onChange={(e) => volumeStore.setThumbnailHighRange(volumeStore.thumbnailHighRange[0], e.value as number)} className="h-3 flex-1 mx-0.5" />
        <span className="ctl-range-val">
          {volumeStore.thumbnailHighRange[0].toFixed(2)}-{volumeStore.thumbnailHighRange[1].toFixed(2)}
        </span>
      </div>
    </div>
  );
});

export default ThumbnailControls;
