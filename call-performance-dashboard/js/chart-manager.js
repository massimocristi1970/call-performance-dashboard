// js/chart-manager.js
import { cleanNumber, parseDate } from './utils.js';

class ChartManager {
  constructor() {
    this.instances = new Map(); // id -> Chart
  }

  _destroyIfExists(id) {
    const existing = this.instances.get(id);
    if (existing) {
      existing.destroy();
      this.instances.delete(id);
    }
  }

  destroyAllCharts() {
    this.instances.forEach(chart => chart.destroy());
    this.instances.clear();
  }

  resizeAllCharts() {
    this.instances.forEach(chart => {
      if (chart && typeof chart.resize === 'function') {
        chart.resize();
      }
    });
  }

  /**
   * Create/replace a time-series chart.
   * opts:
   *  - dateField: string (required) e.g. "__chartDate" or "date_parsed"
   *  - valueField: string | null (optional). If omitted, counts rows.
   *  - color: string (optional)
   *  - aggregate: "sum" | "count" (auto: "sum" if valueField provided, else "count")
   */
  createCallsOverTimeChart(id, rows, opts = {}) {
    const {
      dateField,
      valueField = null,
      color = '#3b82f6',
      aggregate = valueField ? 'sum' : 'count'
    } = opts;

    this._destroyIfExists(id);

    // Map -> aggregate by day
    const bucket = new Map(); // "YYYY-MM-DD" -> number
    for (const r of rows) {
      let d = r[dateField];

      // Normalize date – support Date object or string
      let dt = null;
      if (d instanceof Date) {
        dt = isNaN(d) ? null : d;
      } else if (typeof d === 'string' && d.trim()) {
        // try parse ISO or general date
        if (d.includes('T') || /^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const tryIso = new Date(d);
          dt = isNaN(tryIso) ? null : tryIso;
        } else {
          dt = parseDate(d);
        }
      }

      if (!dt || isNaN(dt)) continue;

      const key = dt.toISOString().slice(0, 10); // YYYY-MM-DD

      let v = 1;
      if (valueField) {
        const raw = r[valueField];
        v = typeof raw === 'number' ? raw : cleanNumber(raw);
        if (!Number.isFinite(v)) v = 0;
      }

      const prev = bucket.get(key) || 0;
      bucket.set(key, aggregate === 'count' ? prev + 1 : prev + v);
    }

    // Sort keys chronologically
    const keys = Array.from(bucket.keys()).sort();
    const labels = keys.map(k => {
      const date = new Date(k);
      return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    });
    const data = keys.map(k => bucket.get(k));

    const ctx = document.getElementById(id);
    if (!ctx) {
      console.warn(`Chart canvas with id '${id}' not found`);
      return;
    }

    const chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: valueField ? valueField.replace('_numeric', '').replace('_', ' ') : 'Count',
          data,
          borderColor: color,
          backgroundColor: color + '33',
          fill: true,
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { 
            grid: { display: false },
            ticks: { maxTicksLimit: 8 }
          },
          y: { 
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (context) => {
                const index = context[0].dataIndex;
                return keys[index]; // Show actual date
              },
              label: (ctx) => {
                const val = ctx.parsed.y;
                return `${val}`;
              }
            }
          }
        }
      }
    });

    this.instances.set(id, chart);
  }

  /**
   * Simple doughnut chart (e.g., outcomes).
   * dataSpec: { labels: string[], data: number[] }
   */
  createDoughnutChart(id, rows, dataSpec) {
    this._destroyIfExists(id);
    const ctx = document.getElementById(id);
    if (!ctx) {
      console.warn(`Chart canvas with id '${id}' not found`);
      return;
    }

    // Filter out zero values and corresponding labels
    const filteredLabels = [];
    const filteredData = [];
    for (let i = 0; i < dataSpec.labels.length; i++) {
      const value = Number.isFinite(dataSpec.data[i]) ? dataSpec.data[i] : cleanNumber(dataSpec.data[i]);
      if (value > 0) {
        filteredLabels.push(dataSpec.labels[i]);
        filteredData.push(value);
      }
    }

    const chart = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: filteredLabels,
        datasets: [{
          data: filteredData,
          backgroundColor: [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom',
            labels: {
              padding: 15,
              usePointStyle: true
            }
          }
        },
        cutout: '60%'
      }
    });

    this.instances.set(id, chart);
  }

  /**
   * Bar chart, single series.
   * opts: { labels: string[], data: number[], label?: string, multiColor?: boolean }
   */
  createBarChart(id, rows, opts = {}) {
    const { labels = [], data = [], label = 'Value', multiColor = false } = opts;
    this._destroyIfExists(id);
    const ctx = document.getElementById(id);
    if (!ctx) {
      console.warn(`Chart canvas with id '${id}' not found`);
      return;
    }

    const colors = multiColor 
      ? ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']
      : '#3b82f6';

    const chart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data: data.map(v => (Number.isFinite(v) ? v : cleanNumber(v))),
          backgroundColor: multiColor ? colors : colors + '80',
          borderColor: multiColor ? colors : colors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { 
            grid: { display: false },
            ticks: { maxRotation: 45 }
          },
          y: { 
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });

    this.instances.set(id, chart);
  }

  /**
   * Status distribution (pie) based on a status field.
   */
  createStatusChart(id, rows, statusField = 'status') {
    this._destroyIfExists(id);
    const counts = new Map();
    for (const r of rows) {
      const s = (r[statusField] || 'Unknown').toString().trim();
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    
    const labels = Array.from(counts.keys()).filter(key => counts.get(key) > 0);
    const data = labels.map(key => counts.get(key));

    const ctx = document.getElementById(id);
    if (!ctx) {
      console.warn(`Chart canvas with id '${id}' not found`);
      return;
    }
    
    const chart = new window.Chart(ctx, {
      type: 'pie',
      data: { 
        labels, 
        datasets: [{ 
          data,
          backgroundColor: [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'
          ]
        }] 
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { 
            position: 'bottom',
            labels: {
              padding: 15,
              usePointStyle: true
            }
          }
        }
      }
    });
    this.instances.set(id, chart);
  }

  /**
   * Agent leaderboard (counts rows per agent).
   */
  createAgentChart(id, rows, agentField = 'agent') {
    this._destroyIfExists(id);

    const byAgent = new Map();
    for (const r of rows) {
      const a = (r[agentField] || 'Unknown').toString().trim();
      if (a && a !== 'Unknown' && a !== '') {
        byAgent.set(a, (byAgent.get(a) || 0) + 1);
      }
    }

    const top = Array.from(byAgent.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const labels = top.map(([k]) => k);
    const data = top.map(([, v]) => v);

    const ctx = document.getElementById(id);
    if (!ctx) {
      console.warn(`Chart canvas with id '${id}' not found`);
      return;
    }

    const chart = new window.Chart(ctx, {
      type: 'bar',
      data: { 
        labels, 
        datasets: [{ 
          data,
          backgroundColor: '#3b82f680',
          borderColor: '#3b82f6',
          borderWidth: 1
        }] 
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { 
            grid: { display: false },
            ticks: { maxRotation: 45 }
          },
          y: { 
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        },
        plugins: { 
          legend: { display: false }
        }
      }
    });

    this.instances.set(id, chart);
  }
}

const chartManager = new ChartManager();
export default chartManager;