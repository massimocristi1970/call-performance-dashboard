// Chart management module
import { CONFIG, getColorScheme } from './config.js';
import { 
  generateId, 
  formatNumber, 
  formatDate, 
  groupBy, 
  aggregateByPeriod,
  deepClone 
} from './utils.js';

class ChartManager {
  constructor() {
    this.charts = new Map();
    this.defaultOptions = deepClone(CONFIG.chartDefaults);
  }

  /**
   * Create a line chart showing trends over time
   */
  createLineChart(containerId, data, options = {}) {
    const config = {
      type: 'line',
      data: {
        labels: options.labels || [],
        datasets: [{
          label: options.label || 'Data',
          data: options.data || [],
          borderColor: options.color || getColorScheme('primary')[0],
          backgroundColor: `${options.color || getColorScheme('primary')[0]}20`,
          fill: options.fill || false,
          tension: options.tension || 0.2,
          pointBackgroundColor: options.color || getColorScheme('primary')[0],
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        ...this.defaultOptions,
        ...options.chartOptions,
        plugins: {
          ...this.defaultOptions.plugins,
          ...options.chartOptions?.plugins,
          tooltip: {
            ...this.defaultOptions.plugins.tooltip,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                const format = options.valueFormat || 'number';
                return `${context.dataset.label}: ${formatNumber(value, format)}`;
              }
            }
          }
        }
      }
    };

    return this.createChart(containerId, config);
  }

  /**
   * Create a bar chart for categorical data
   */
  createBarChart(containerId, data, options = {}) {
    const colors = options.colors || getColorScheme('mixed');
    
    const config = {
      type: options.horizontal ? 'bar' : 'bar',
      data: {
        labels: options.labels || [],
        datasets: [{
          label: options.label || 'Data',
          data: options.data || [],
          backgroundColor: options.multiColor ? colors : colors[0],
          borderColor: options.multiColor ? colors.map(c => c) : colors[0],
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        ...this.defaultOptions,
        indexAxis: options.horizontal ? 'y' : 'x',
        ...options.chartOptions,
        plugins: {
          ...this.defaultOptions.plugins,
          ...options.chartOptions?.plugins,
          tooltip: {
            ...this.defaultOptions.plugins.tooltip,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y || context.parsed.x;
                const format = options.valueFormat || 'number';
                return `${context.dataset.label}: ${formatNumber(value, format)}`;
              }
            }
          }
        }
      }
    };

    return this.createChart(containerId, config);
  }

  /**
   * Create a doughnut/pie chart
   */
  createDoughnutChart(containerId, data, options = {}) {
    const colors = getColorScheme('mixed');
    
    const config = {
      type: 'doughnut',
      data: {
        labels: options.labels || [],
        datasets: [{
          data: options.data || [],
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        ...this.defaultOptions,
        cutout: options.cutout || '60%',
        ...options.chartOptions,
        plugins: {
          ...this.defaultOptions.plugins,
          ...options.chartOptions?.plugins,
          tooltip: {
            ...this.defaultOptions.plugins.tooltip,
            callbacks: {
              label: (context) => {
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                const format = options.valueFormat || 'number';
                return `${context.label}: ${formatNumber(value, format)} (${percentage}%)`;
              }
            }
          }
        }
      }
    };

    return this.createChart(containerId, config);
  }

  /**
   * Create a chart with Chart.js
   */
  createChart(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container not found: ${containerId}`);
      return null;
    }

    // Find or create canvas
    let canvas = container.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      container.appendChild(canvas);
    }

    // Destroy existing chart if it exists
    this.destroyChart(containerId);

    try {
      const chart = new Chart(canvas, config);
      this.charts.set(containerId, chart);
      return chart;
    } catch (error) {
      console.error(`Error creating chart for ${containerId}:`, error);
      return null;
    }
  }

  /**
   * Destroy a specific chart
   */
  destroyChart(containerId) {
    const chart = this.charts.get(containerId);
    if (chart) {
      chart.destroy();
      this.charts.delete(containerId);
    }
  }

  /**
   * Destroy all charts
   */
  destroyAllCharts() {
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
  }

  /**
   * Update chart data
   */
  updateChart(containerId, newData, newLabels) {
    const chart = this.charts.get(containerId);
    if (!chart) return false;

    if (newLabels) {
      chart.data.labels = newLabels;
    }
    
    if (newData) {
      if (Array.isArray(newData)) {
        chart.data.datasets[0].data = newData;
      } else {
        // Multiple datasets
        chart.data.datasets.forEach((dataset, index) => {
          if (newData[index]) {
            dataset.data = newData[index];
          }
        });
      }
    }

    chart.update('active');
    return true;
  }

  /**
   * Create calls over time chart
   */
  createCallsOverTimeChart(containerId, data, options = {}) {
    const period = options.period || 'month';
    const dateField = options.dateField || 'date';
    const valueField = options.valueField || null;
    const aggregated = aggregateByPeriod(data, dateField, period);
    
    const sortedKeys = Object.keys(aggregated).sort();
    const labels = sortedKeys.map(key => {
      const date = new Date(key);
      return formatDate(date, 'chart');
    });
    
    const values = sortedKeys.map(key => {
      const periodData = aggregated[key];
      if (valueField) {
        return periodData.reduce((sum, row) => sum + (parseFloat(row[valueField]) || 0), 0);
      } else {
        return periodData.length;
      }
    });

    return this.createLineChart(containerId, data, {
      labels,
      data: values,
      label: options.label || 'Calls',
      color: options.color || getColorScheme('primary')[0],
      valueFormat: options.valueFormat || 'number',
      ...options
    });
  }

  /**
   * Create status distribution chart
   */
  createStatusChart(containerId, data, statusField, options = {}) {
    const grouped = groupBy(data, statusField);
    const labels = Object.keys(grouped).sort();
    const values = labels.map(label => grouped[label].length);

    return this.createDoughnutChart(containerId, data, {
      labels,
      data: values,
      valueFormat: options.valueFormat || 'number',
      ...options
    });
  }

  /**
   * Create agent performance chart
   */
  createAgentChart(containerId, data, agentField, options = {}) {
    const grouped = groupBy(data, agentField);
    const labels = Object.keys(grouped)
      .sort((a, b) => grouped[b].length - grouped[a].length)
      .slice(0, options.topN || 10);
    const values = labels.map(label => grouped[label].length);

    return this.createBarChart(containerId, data, {
      labels,
      data: values,
      label: options.label || 'Calls per Agent',
      multiColor: true,
      valueFormat: options.valueFormat || 'number',
      ...options
    });
  }

  /**
   * Create duration histogram
   */
  createDurationChart(containerId, data, durationField, options = {}) {
    const durations = data
      .map(row => parseFloat(row[durationField]) || 0)
      .filter(d => d > 0)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      console.warn('No duration data available for chart');
      return null;
    }

    // Create bins
    const binCount = options.bins || 10;
    const min = durations[0];
    const max = durations[durations.length - 1];
    const binSize = (max - min) / binCount;
    
    const bins = Array(binCount).fill(0);
    const labels = [];
    
    for (let i = 0; i < binCount; i++) {
      const start = min + (i * binSize);
      const end = min + ((i + 1) * binSize);
      labels.push(`${formatNumber(start, 'duration')} - ${formatNumber(end, 'duration')}`);
    }
    
    durations.forEach(duration => {
      const binIndex = Math.min(Math.floor((duration - min) / binSize), binCount - 1);
      bins[binIndex]++;
    });

    return this.createBarChart(containerId, data, {
      labels,
      data: bins,
      label: options.label || 'Call Duration Distribution',
      color: getColorScheme('primary')[0],
      valueFormat: 'number',
      ...options
    });
  }

  /**
   * Create metric comparison chart
   */
  createComparisonChart(containerId, datasets, options = {}) {
    const colors = getColorScheme('mixed');
    
    const chartDatasets = datasets.map((dataset, index) => ({
      label: dataset.label,
      data: dataset.data,
      borderColor: colors[index % colors.length],
      backgroundColor: `${colors[index % colors.length]}20`,
      fill: false,
      tension: 0.2
    }));

    const config = {
      type: 'line',
      data: {
        labels: options.labels || [],
        datasets: chartDatasets
      },
      options: {
        ...this.defaultOptions,
        ...options.chartOptions,
        plugins: {
          ...this.defaultOptions.plugins,
          ...options.chartOptions?.plugins,
          tooltip: {
            ...this.defaultOptions.plugins.tooltip,
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                const format = options.valueFormat || 'number';
                return `${context.dataset.label}: ${formatNumber(value, format)}`;
              }
            }
          }
        },
        hover: {
          mode: 'index',
          intersect: false
        }
      }
    };

    return this.createChart(containerId, config);
  }

  /**
   * Download chart as image
   */
  downloadChart(containerId, filename) {
    const chart = this.charts.get(containerId);
    if (!chart) {
      console.error(`Chart not found: ${containerId}`);
      return false;
    }

    try {
      const link = document.createElement('a');
      link.download = filename || `chart_${containerId}_${Date.now()}.png`;
      link.href = chart.toBase64Image('image/png', 1.0);
      link.click();
      return true;
    } catch (error) {
      console.error('Error downloading chart:', error);
      return false;
    }
  }

  /**
   * Resize all charts (useful for responsive updates)
   */
  resizeAllCharts() {
    this.charts.forEach(chart => {
      chart.resize();
    });
  }

  /**
   * Get chart data for export
   */
  getChartData(containerId) {
    const chart = this.charts.get(containerId);
    if (!chart) return null;

    return {
      labels: chart.data.labels,
      datasets: chart.data.datasets.map(dataset => ({
        label: dataset.label,
        data: dataset.data
      }))
    };
  }

  /**
   * Create animated counter for KPIs
   */
  animateValue(element, start, end, duration = 1000, format = 'number') {
    if (!element) return;

    const startTime = performance.now();
    const startValue = parseFloat(start) || 0;
    const endValue = parseFloat(end) || 0;
    const difference = endValue - startValue;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = startValue + (difference * easeOutQuart);
      
      element.textContent = formatNumber(current, format);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Create sparkline chart (mini chart for KPIs)
   */
  createSparkline(containerId, data, options = {}) {
    const config = {
      type: 'line',
      data: {
        labels: options.labels || data.map((_, i) => i),
        datasets: [{
          data: data,
          borderColor: options.color || getColorScheme('primary')[0],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: false
          }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            display: false
          }
        },
        elements: {
          point: {
            radius: 0
          }
        },
        animation: {
          duration: 0
        }
      }
    };

    return this.createChart(containerId, config);
  }
}

// Create and export singleton instance
export const chartManager = new ChartManager();

// Handle window resize
window.addEventListener('resize', () => {
  chartManager.resizeAllCharts();
});

export default chartManager;
