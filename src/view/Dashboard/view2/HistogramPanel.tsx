import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { DensityHistogram } from '@/components';
import { Button } from 'primereact/button';
import {
  loadNyxData,
  calculateLogHistogram,
  calculateStatistics,
  type HistogramData,
} from '@/utils/nyxDataLoader';
import { volumeStore } from '@/store/volumeStore';

const DATA_DIMENSIONS = { x: 128, y: 128, z: 128 };

const HistogramPanel: React.FC = observer(() => {
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  const [statistics, setStatistics] = useState<ReturnType<typeof calculateStatistics> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataRange, setDataRange] = useState<{ min: number; max: number }>({ min: 0, max: 1 });

  const currentTimestep = volumeStore.currentStep;

  const loadData = useCallback(async (timestep: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const filename = timestep.toString().padStart(4, '0') + '.dat';
      const url = `/assets/Nyx/${filename}`;
      const data = await loadNyxData(url, timestep, DATA_DIMENSIONS);
      setDataRange({ min: data.min, max: data.max });
      const safeLogMin = data.min > 0 ? Math.log10(data.min) : undefined;
      const safeLogMax = data.max > 0 ? Math.log10(data.max) : undefined;
      const histogram = calculateLogHistogram(data.data, 80, safeLogMin, safeLogMax);
      setHistogramData(histogram);
      const stats = calculateStatistics(data.data);
      setStatistics(stats);
    } catch (err) {
      console.error('Failed to load histogram data:', err);
      setError(`加载时间步 ${timestep} 失败`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(currentTimestep);
  }, [currentTimestep, loadData]);

  const handleRangeSelect = useCallback((range: { min: number; max: number } | null) => {
    volumeStore.setHighlightedRange(range);
  }, []);

  const handleRetry = useCallback(() => {
    void loadData(currentTimestep);
  }, [loadData, currentTimestep]);

  if (error) {
    return (
      <div className="panel-error">
        <h3>错误</h3>
        <p>{error}</p>
        <Button outlined onClick={handleRetry}>重试</Button>
      </div>
    );
  }

  return (
    <DensityHistogram
      bins={histogramData?.bins ?? []}
      binEdges={histogramData?.binEdges ?? []}
      logBins={histogramData?.logBins ?? []}
      logBinEdges={histogramData?.logBinEdges ?? []}
      timestep={currentTimestep}
      dataMin={dataRange.min}
      dataMax={dataRange.max}
      onRangeSelect={handleRangeSelect}
      selectedRange={volumeStore.highlightedRange}
      statistics={statistics}
    />
  );
});

export default HistogramPanel;
