import React from 'react';
import './index.less';
import { Panel } from 'primereact/panel';

interface StatisticsData {
  min: number;
  max: number;
  mean: number;
  std: number;
  median: number;
  p1: number;
  p5: number;
  p95: number;
  p99: number;
}

interface StatisticsPanelProps {
  stats: StatisticsData | null;
  timestep: number;
}

const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ stats, timestep }) => {
  if (!stats) {
    return (
      <Panel header="统计信息" className="statistics-panel">
        <div className="text-center text-sm text-muted-foreground py-8">加载中...</div>
      </Panel>
    );
  }

  const formatNumber = (num: number) => {
    if (num === 0) return '0';
    if (Math.abs(num) < 0.001 || Math.abs(num) > 10000) {
      return num.toExponential(3);
    }
    return num.toFixed(4);
  };

  const statItems = [
    { label: '最小值', value: stats.min },
    { label: '最大值', value: stats.max, highlight: true },
    { label: '平均值', value: stats.mean },
    { label: '标准差', value: stats.std },
    { label: '中位数', value: stats.median },
    { label: '1%分位数', value: stats.p1, low: true },
    { label: '5%分位数', value: stats.p5, low: true },
    { label: '95%分位数', value: stats.p95, high: true },
    { label: '99%分位数', value: stats.p99, high: true },
  ];

  return (
    <Panel header={`统计信息 - 时间步 ${timestep}`} className="statistics-panel">
      <div className="grid grid-cols-3 gap-2">
        {statItems.map((item) => (
          <div key={item.label} className="stat-item text-center p-1.5 rounded-md bg-muted/50">
            <span className="stat-label text-xs text-muted-foreground block">{item.label}</span>
            <span className={`stat-value text-sm font-medium ${item.highlight ? 'text-primary' : item.low ? 'text-blue-500' : item.high ? 'text-red-500' : 'text-foreground'}`}>
              {formatNumber(item.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="stats-summary mt-3 pt-2 border-t flex justify-around">
        <div className="text-center">
          <span className="text-xs text-muted-foreground">密度范围</span>
          <div className="text-sm font-medium">{formatNumber(stats.max - stats.min)}</div>
        </div>
        <div className="text-center">
          <span className="text-xs text-muted-foreground">变异系数</span>
          <div className="text-sm font-medium">{formatNumber(stats.std / stats.mean)}</div>
        </div>
      </div>
    </Panel>
  );
};

export default StatisticsPanel;
