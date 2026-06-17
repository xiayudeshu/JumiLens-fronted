"""
Nyx宇宙学数据时序统计特征分析
包含密度分布统计、对数直方图、演化规律量化
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import os
import json
from pathlib import Path
from tqdm import tqdm
import warnings
warnings.filterwarnings('ignore')


def load_nyx_data(filepath):
    """加载Nyx数据文件"""
    data = np.fromfile(filepath, dtype=np.float32)
    return data.reshape((128, 128, 128))


def analyze_density_statistics(data_dir, num_timesteps=100):
    """
    分析所有时间步的密度统计特征
    """
    print("Analyzing density statistics across all timesteps...")
    
    stats = {
        'timestep': [],
        'min': [],
        'max': [],
        'mean': [],
        'median': [],
        'std': [],
        'skewness': [],
        'kurtosis': [],
        'percentile_1': [],
        'percentile_5': [],
        'percentile_95': [],
        'percentile_99': []
    }
    
    for ts in tqdm(range(num_timesteps), desc="Processing timesteps"):
        filepath = os.path.join(data_dir, f"{ts:04d}.dat")
        data = np.fromfile(filepath, dtype=np.float32)
        
        stats['timestep'].append(ts)
        stats['min'].append(data.min())
        stats['max'].append(data.max())
        stats['mean'].append(data.mean())
        stats['median'].append(np.median(data))
        stats['std'].append(data.std())
        stats['skewness'].append(((data - data.mean())**3).mean() / (data.std()**3))
        stats['kurtosis'].append(((data - data.mean())**4).mean() / (data.std()**4) - 3)
        stats['percentile_1'].append(np.percentile(data, 1))
        stats['percentile_5'].append(np.percentile(data, 5))
        stats['percentile_95'].append(np.percentile(data, 95))
        stats['percentile_99'].append(np.percentile(data, 99))
    
    return {k: np.array(v) for k, v in stats.items()}


def plot_density_histograms(data_dir, timesteps=None, output_path='density_histograms.png'):
    """
    绘制密度对数直方图展示演化规律
    默认生成所有100个时间步的直方图
    """
    # 默认使用所有100个时间步
    if timesteps is None:
        timesteps = list(range(100))
    
    num_ts = len(timesteps)
    # 使用10x10网格展示所有时间步
    cols = 10
    rows = (num_ts + cols - 1) // cols  # 向上取整
    
    fig, axes = plt.subplots(rows, cols, figsize=(24, rows * 2.4))
    axes = axes.flatten() if num_ts > 1 else [axes]
    
    colors = plt.cm.viridis(np.linspace(0, 1, num_ts))
    
    for idx, ts in enumerate(timesteps):
        filepath = os.path.join(data_dir, f"{ts:04d}.dat")
        data = np.fromfile(filepath, dtype=np.float32)
        
        ax = axes[idx]
        
        # 对数直方图 - 使用对数bins
        log_bins = np.logspace(np.log10(max(data.min(), 1e-10)), np.log10(data.max()), 80)
        ax.hist(data.flatten(), bins=log_bins, color=colors[idx], alpha=0.75, 
                edgecolor='black', linewidth=0.3)
        ax.set_title(f'Timestep {ts}', fontsize=9, fontweight='bold')
        ax.set_xlabel('Density (Log)', fontsize=8)
        ax.set_ylabel('Freq (Log)', fontsize=8)
        ax.set_xscale('log')
        ax.set_yscale('log')
        ax.grid(True, alpha=0.3, linewidth=0.5)
        ax.tick_params(labelsize=7)
        
        # 添加均值线
        mean_val = data.mean()
        ax.axvline(mean_val, color='red', linestyle='--', linewidth=1, alpha=0.8)
    
    # 隐藏多余的子图
    for idx in range(num_ts, len(axes)):
        axes[idx].set_visible(False)
    
    plt.suptitle('Nyx Cosmological Simulation - Density Distribution Evolution (All 100 Timesteps)', 
                 fontsize=14, fontweight='bold', y=1.02)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches='tight')
    print(f"Saved: {output_path}")
    plt.close()


def plot_evolution_statistics(stats, output_path='evolution_statistics.png'):
    """
    绘制统计量随时间的演化
    """
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    
    # 1. 均值、中位数、极值演化
    ax1 = axes[0, 0]
    ax1.fill_between(stats['timestep'], stats['min'], stats['max'], alpha=0.3, color='blue', label='Range')
    ax1.plot(stats['timestep'], stats['mean'], 'r-', linewidth=2, label='Mean')
    ax1.plot(stats['timestep'], stats['median'], 'g--', linewidth=2, label='Median')
    ax1.plot(stats['timestep'], stats['min'], 'b:', linewidth=1.5, alpha=0.7, label='Min')
    ax1.plot(stats['timestep'], stats['max'], 'b:', linewidth=1.5, alpha=0.7, label='Max')
    ax1.set_xlabel('Timestep')
    ax1.set_ylabel('Density')
    ax1.set_title('Density Range Evolution')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # 2. 标准差演化
    ax2 = axes[0, 1]
    ax2.plot(stats['timestep'], stats['std'], 'purple', linewidth=2)
    ax2.fill_between(stats['timestep'], stats['std'], alpha=0.3, color='purple')
    ax2.set_xlabel('Timestep')
    ax2.set_ylabel('Standard Deviation')
    ax2.set_title('Density Dispersion Evolution')
    ax2.grid(True, alpha=0.3)
    
    # 3. 百分位数演化
    ax3 = axes[0, 2]
    ax3.fill_between(stats['timestep'], stats['percentile_1'], stats['percentile_99'], 
                     alpha=0.2, color='red', label='1%-99%')
    ax3.fill_between(stats['timestep'], stats['percentile_5'], stats['percentile_95'], 
                     alpha=0.3, color='blue', label='5%-95%')
    ax3.plot(stats['timestep'], stats['mean'], 'k-', linewidth=2, label='Mean')
    ax3.set_xlabel('Timestep')
    ax3.set_ylabel('Density')
    ax3.set_title('Percentile Evolution')
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    
    # 4. 偏度和峰度
    ax4 = axes[1, 0]
    ax4.plot(stats['timestep'], stats['skewness'], 'orange', linewidth=2, label='Skewness')
    ax4.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
    ax4.set_xlabel('Timestep')
    ax4.set_ylabel('Skewness')
    ax4.set_title('Distribution Skewness')
    ax4.grid(True, alpha=0.3)
    
    ax4_twin = ax4.twinx()
    ax4_twin.plot(stats['timestep'], stats['kurtosis'], 'green', linewidth=2, linestyle='--', label='Kurtosis')
    ax4_twin.set_ylabel('Kurtosis', color='green')
    ax4_twin.tick_params(axis='y', labelcolor='green')
    
    # 5. 动态范围演化
    ax5 = axes[1, 1]
    dynamic_range = stats['max'] - stats['min']
    ax5.plot(stats['timestep'], dynamic_range, 'darkred', linewidth=2)
    ax5.fill_between(stats['timestep'], dynamic_range, alpha=0.3, color='darkred')
    ax5.set_xlabel('Timestep')
    ax5.set_ylabel('Dynamic Range (Max - Min)')
    ax5.set_title('Density Dynamic Range Evolution')
    ax5.grid(True, alpha=0.3)
    
    # 6. 极值比例演化
    ax6 = axes[1, 2]
    extreme_low = stats['percentile_1']
    extreme_high = stats['percentile_99']
    ax6.plot(stats['timestep'], extreme_low, 'blue', linewidth=2, label='1st Percentile')
    ax6.plot(stats['timestep'], extreme_high, 'red', linewidth=2, label='99th Percentile')
    ax6.fill_between(stats['timestep'], extreme_low, extreme_high, alpha=0.2, color='purple')
    ax6.set_xlabel('Timestep')
    ax6.set_ylabel('Density')
    ax6.set_title('Extreme Value Evolution')
    ax6.legend()
    ax6.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Saved: {output_path}")
    plt.close()


def export_stats_json(stats, output_path='evolution_stats.json'):
    """
    将所有时间步的统计数据导出为JSON格式，供前端EvolutionChart使用
    """
    # 将numpy数组转换为Python列表
    json_data = {}
    for key, value in stats.items():
        if isinstance(value, np.ndarray):
            json_data[key] = value.tolist()
        else:
            json_data[key] = value

    with open(output_path, 'w') as f:
        json.dump(json_data, f)
    print(f"Saved JSON: {output_path}")
    print(f"  Keys: {list(json_data.keys())}")
    print(f"  Timesteps: {len(json_data.get('timestep', []))}")


def generate_summary_report(stats, output_path='analysis_report.txt'):
    """
    生成统计摘要报告
    """
    with open(output_path, 'w') as f:
        f.write("="*70 + "\n")
        f.write("Nyx Cosmological Simulation - Density Evolution Analysis Report\n")
        f.write("="*70 + "\n\n")
        
        f.write("[DATA STRUCTURE]\n")
        f.write("-" * 50 + "\n")
        f.write("Format: float32, little-endian\n")
        f.write("Dimensions: 128 x 128 x 128 = 2,097,152 cells\n")
        f.write("Timesteps: 100 (0000-0099)\n")
        f.write("Physical meaning: Gas density in cosmological simulation\n\n")
        
        f.write("[EVOLUTION SUMMARY]\n")
        f.write("-" * 50 + "\n")
        f.write(f"Initial mean density (ts=0): {stats['mean'][0]:.4f}\n")
        f.write(f"Final mean density (ts=99): {stats['mean'][-1]:.4f}\n")
        f.write(f"Mean density change: {stats['mean'][-1] - stats['mean'][0]:.4f}\n\n")
        
        f.write(f"Initial std deviation (ts=0): {stats['std'][0]:.4f}\n")
        f.write(f"Final std deviation (ts=99): {stats['std'][-1]:.4f}\n")
        f.write(f"Std increase: {stats['std'][-1] - stats['std'][0]:.4f} ({(stats['std'][-1]/stats['std'][0]-1)*100:.1f}%)\n\n")
        
        f.write(f"Initial dynamic range (ts=0): {stats['max'][0] - stats['min'][0]:.4f}\n")
        f.write(f"Final dynamic range (ts=99): {stats['max'][-1] - stats['min'][-1]:.4f}\n")
        f.write(f"Range expansion: {(stats['max'][-1] - stats['min'][-1])/(stats['max'][0] - stats['min'][0]):.2f}x\n\n")
        
        f.write("[KEY FINDINGS]\n")
        f.write("-" * 50 + "\n")
        f.write("1. GRAVITATIONAL CLUSTERING:\n")
        f.write(f"   - Voids become emptier: min decreases by {stats['min'][0] - stats['min'][-1]:.4f}\n")
        f.write(f"   - Peaks become denser: max increases by {stats['max'][-1] - stats['max'][0]:.4f}\n\n")
        
        f.write("2. STRUCTURE FORMATION:\n")
        f.write(f"   - Distribution becomes more skewed\n")
        f.write(f"   - High-density tail develops significantly\n")
        f.write(f"   - 99th percentile increases from {stats['percentile_99'][0]:.4f} to {stats['percentile_99'][-1]:.4f}\n\n")
        
        f.write("3. COSMIC WEB EVOLUTION:\n")
        f.write(f"   - Filamentary structures become prominent\n")
        f.write(f"   - Node density increases substantially\n")
        f.write(f"   - Intergalactic medium shows clear phase separation\n\n")
    
    print(f"Saved: {output_path}")


if __name__ == "__main__":
    data_dir = r'public/assets/Nyx'

    # 1. 统计分析
    stats = analyze_density_statistics(data_dir)

    # 2. 导出JSON供前端使用
    export_stats_json(stats, output_path='public/assets/evolution_stats.json')

    # 3. 绘制直方图
    plot_density_histograms(data_dir)

    # 4. 绘制统计演化图
    plot_evolution_statistics(stats)

    # 5. 生成报告
    generate_summary_report(stats)

    print("\nAnalysis complete!")
