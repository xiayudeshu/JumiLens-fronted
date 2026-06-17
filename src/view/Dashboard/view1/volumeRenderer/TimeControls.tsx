import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Image } from 'primereact/image';

interface TimeControlsProps {
  onSortByChange: () => void;
  onJumpToStep: (step: number) => void;
  onSetReference: (step: number) => void;
  onToggleThumbnailStep: (step: number) => void;
}

const TimeControls: React.FC<TimeControlsProps> = observer(
  ({ onSortByChange, onJumpToStep, onSetReference, onToggleThumbnailStep }) => {
    const { referenceStep } = volumeStore;
    const [enlarged, setEnlarged] = useState<{ step: number; type: 'low' | 'high'; url: string } | null>(null);

    const canRemove = volumeStore.thumbnailSteps.length > 1;

    const renderThumb = (step: number, type: 'low' | 'high') => {
      const img = volumeStore.getThumbnailImage(step, type);
      const isRef = step === referenceStep;
      const rangeLabel = type === 'low' ? '低密度' : '高密度';
      return (
        <div
          key={`${type}-${step}`}
          className={`thumb-card${isRef ? ' reference' : ''}`}
          onClick={() => onJumpToStep(step)}
          onDoubleClick={() => { if (img) setEnlarged({ step, type, url: img }); }}
          onContextMenu={(e) => { e.preventDefault(); onSetReference(step); }}
          title={`Step ${step} ${rangeLabel}${isRef ? ' ★ 参考步' : ''}\n单击跳转 · 双击放大 · 右键设参考 · ${canRemove ? '✕ 移除缩略图' : ''}`}
        >
          <div className="thumb-card-img" style={{ backgroundImage: img ? `url(${img})` : undefined }}>
            {!img && <span className="thumb-card-loading">加载中...</span>}
            {isRef && <span className="thumb-card-star">★</span>}
            {/* {img && (
              <Button
                text rounded size="small"
                className="thumb-card-expand"
                onClick={(e) => { e.stopPropagation(); setEnlarged({ step, type, url: img }); }}
                tooltip="放大查看"
              >⛶</Button>
            )} */}
            {canRemove && (
              <Button
                text rounded size="small"
                className="thumb-card-remove"
                onClick={(e) => { e.stopPropagation(); onToggleThumbnailStep(step); }}
                tooltip="移除缩略图"
              >✕</Button>
            )}
          </div>
          <span className="thumb-card-label">{step}{isRef ? ' ★' : ''}</span>
        </div>
      );
    };

    return (
      <>
        <div className="time-controls">
          <div className="thumb-scroll-wrapper">
            <div className="thumb-rows">
              <div className="thumb-row-label thumb-row-label--low">
                <span>低密度</span>
              </div>
              <div className="thumb-cards">{volumeStore.thumbnailSteps.map(s => renderThumb(s, 'low'))}</div>
            </div>
            <div className="thumb-rows">
              <div className="thumb-row-label thumb-row-label--high">
                <span>高密度</span>
              </div>
              <div className="thumb-cards">{volumeStore.thumbnailSteps.map(s => renderThumb(s, 'high'))}</div>
            </div>
          </div>
        </div>

        {/* <Dialog
          visible={!!enlarged}
          onHide={() => setEnlarged(null)}
          header={`Step ${enlarged?.step} — ${enlarged?.type === 'low' ? '低密度' : '高密度'}${enlarged?.step === referenceStep ? ' ★ 参考步' : ''}`}
          className="max-w-[92vw]"
          style={{ width: '92vw' }}
          footer={
            <div className="flex gap-3 justify-center">
              <Button severity="help" onClick={() => { onSetReference(enlarged!.step); setEnlarged(null); }}>
                设为首选步
              </Button>
              <Button outlined onClick={() => setEnlarged(null)}>关闭</Button>
            </div>
          }
        >
          {enlarged && (
            <Image src={enlarged.url} alt={`Step ${enlarged.step}`} preview style={{ maxWidth: '88vw', maxHeight: '70vh' }} />
          )}
        </Dialog> */}
      </>
    );
  }
);

export default TimeControls;
