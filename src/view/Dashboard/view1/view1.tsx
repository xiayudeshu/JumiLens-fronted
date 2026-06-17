import React, { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import VolumeRenderer from './volumeRenderer';
import TimeControls from './volumeRenderer/TimeControls';
import RenderingInspector from './volumeRenderer/TransferFunctionEditor';
import TailsLineChart from './TailsLineChart';
import './index.less';

const View1 = observer(() => {

    const handleSortByChange = useCallback(() => {
        const entries: { step: number; total: number }[] = [];
        for (const s of volumeStore.comparisonSteps) {
            if (s === volumeStore.referenceStep) continue;
            const stats = volumeStore.getCachedDiffStats(s);
            if (stats) {
                entries.push({ step: s, total: stats.growthCount + stats.declineCount });
            }
        }
        entries.sort((a, b) => b.total - a.total);
        volumeStore.setSortedByChange(entries.map((e) => e.step));
    }, []);

    const handleJumpToStep = useCallback((step: number) => {
        volumeStore.setTimeStep(step);
        volumeStore.setDiffStep(step);
        volumeStore.addComparisonStep(step);
    }, []);

    const handleSetReference = useCallback((step: number) => {
        volumeStore.setReferenceStep(step);
    }, []);

    const handleToggleThumbnailStep = useCallback((step: number) => {
        volumeStore.toggleThumbnailStep(step);
    }, []);

    return (
        <div className="view1-root">
            {/* ════ 标题栏: 3D立方体 (与右侧"密度分布直方图"标题样式一致) ════ */}
            <div className="evolution-chart-title">3D 立方体</div>

            {/* ════ 上半部分: 3D立方体 + 传递函数 ════ */}
            <div className="view1-top">
                <div className="view1-cube">
                    <div className="block-body cube-body">
                        <VolumeRenderer />
                    </div>
                </div>
                <div className="view1-tf">
                    <RenderingInspector />
                </div>
            </div>

            {/* ════ 左下: 播放图表 + 缩略图 ════ */}
            <div className="view1-bottom">
               

                {/* Row: [▶3%] [图表94%] [倍速3%] */}
                <div className="chart-row">
                    <Button
                        text
                        rounded
                        className="play-btn-inline"
                        onClick={() => volumeStore.togglePlay()}
                        tooltip={volumeStore.isPlaying ? '暂停' : '播放'}
                        disabled={volumeStore.isLoading}
                    >
                        {volumeStore.isPlaying ? '⏸' : '▶'}
                    </Button>
                    <div className="tails-chart-wrapper">
                        <TailsLineChart
                            currentStep={volumeStore.currentStep}
                            thumbnailSteps={volumeStore.thumbnailSteps}
                            onJumpToStep={handleJumpToStep}
                            onToggleThumbnailStep={handleToggleThumbnailStep}
                        />
                    </div>
                    <Dropdown
                        value={String(volumeStore.playSpeed)}
                        onChange={(e) => volumeStore.setPlaySpeed(Number(e.value))}
                        options={[
                            { label: '1x', value: '1' },
                            { label: '2x', value: '2' },
                            { label: '4x', value: '4' },
                            { label: '8x', value: '8' },
                        ]}
                        className="speed-select-inline text-xs"
                    />
                </div>

                {/* Thumbnail rows */}
                <div className="timeline-body">
                    <TimeControls
                        onSortByChange={handleSortByChange}
                        onJumpToStep={handleJumpToStep}
                        onSetReference={handleSetReference}
                        onToggleThumbnailStep={handleToggleThumbnailStep}
                    />
                </div>
            </div>
        </div>
    );
});

export default View1;
