import React from 'react';
import { observer } from 'mobx-react-lite';
import { volumeStore } from '@/store/volumeStore';
import { EvolutionChart } from '@/components';
import { Chip } from 'primereact/chip';
import './index.less';
import View1 from './view1/view1';
import HistogramPanel from './view2/HistogramPanel';

const Dashboard: React.FC = () => {
    return (
        <div className='dashboard-root'>
            <header className='header-root'>
                <span className='header-title'>ChinaVIS2026</span>
                <Chip
                    label={`时间步： ${volumeStore.currentStep} / 99`}
                    className="font-mono text-xs border-white/20 text-white bg-transparent
                               hover:bg-white/15 hover:border-white/30 cursor-default transition-colors"
                    style={{ paddingLeft: '1rem', paddingRight: '1rem' }}
                />
            </header>
            <main className='main-content'>
                {/* ======== 左侧: 3D立方体 + 传递函数 + 时间轴 ======== */}
                <div className='left-panel'>
                    <View1 />
                </div>
                {/* ======== 右侧: 密度直方图 | 密度统计演化 ======== */}
                <div className='right-panel'>
                    <div className='histogram-panel'>
                        <HistogramPanel />
                    </div>
                    <div className='evolution-panel'>
                        <EvolutionChart
                            currentStep={volumeStore.currentStep}
                            onJumpToStep={(step) => volumeStore.setTimeStep(step)}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default observer(Dashboard);
