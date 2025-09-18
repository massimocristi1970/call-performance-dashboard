// js/chart-manager.js - Debug version
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

  createCallsOverTimeChart(id, rows, opts = {}) {
    console.log(`Creating calls over time chart for ${id}:`, { rows: rows.length, opts });
    
    const {
      dateField,
      valueField = null,
      color = '#3b82f6',
      aggregate = valueField ? 'sum' : 'count'
    } = opts;

    this._destroyIfExists(id);

    // Check if canvas exists
    const ctx = document.getElementById(id);
    if (!ctx) {
      console.error(`Chart canvas with id '${id}' not found`);
      return;
    }
    console.log(`Canvas found for ${id}:`, ctx);

    // Check if Chart.js is available
    if (!window.Chart) {
      console.error('Chart.js not available');
      return;
    }

    // Map -> aggregate by day
    const bucket = new Map();
    console.log(`Processing ${rows.length} rows for chart ${id}`);
    
    for (const r of rows) {
      let d = r[dateField];
      console.log(`Row date field ${dateField}:`, d);

      // Normalize date
      let dt = null;
      if (d instanceof Date) {
        dt = isNaN(d) ? null : d;
      } else if (typeof d === 'string' && d.trim()) {
        if (d.includes('T') || /^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const tryIso = new Date(d);
          dt = isNaN(tryIso) ? null : tryIso;
        } else {
          dt = parseDate(d);
        }
      }

      if (!dt || isNaN(dt)) {
        console.log(`Failed to parse date for ${id}:`, d);
        continue;
      }

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

    console.log(`Chart ${id} bucket data:`, Object.fromEntries(bucket));

    // Sort keys chronologically
    const keys = Array.from(bucket.keys()).sort();
    const labels = keys.map(k => {
      const date = new Date(k);
      return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    });
    const data = keys.map(k => bucket.get(k));

    console.log(`Chart ${id} final data:`, { labels, data });

    try {
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
                  return keys[index];
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
      console.log(`Chart ${id} created successfully:`, chart);
    } catch (error) {
      console.error(`Error creating chart ${id}:`, error);
    }
  }

  createDoughnutChart(id, rows, dataSpec) {
    console.log(`Creating doughnut chart for ${id}:`, { rows: rows.length, dataSpec });
    
    this._destroyIfExists(id);
    const ctx = document.getElementById(id);
    if (!ctx) {
      console.error(`Chart canvas with id '${id}' not found`);
      return;
    }

    if (!window.Chart) {
      console.error('Chart.js not available');
      return;
    }

    // Filter out zero values
    const filteredLabels = [];
    const filteredData = [];
    for (let i = 0; i < dataSpec.labels.length; i++) {
      const value = Number.isFinite(dataSpec.data[i]) ? dataSpec.data[i] : cleanNumber(dataSpec.data[i]);
      if (value > 0) {
        filteredLabels.push(dataSpec.labels[i]);
        filteredData.push(value);
      }
    }

    console.log(`Doughnut chart ${id} filtered data:`, { filteredLabels, filteredData });

    try {
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
      console.log(`Doughnut chart ${id} created successfully:`, chart);
    } catch (error) {
      console.error(`Error creating doughnut chart ${id}:`, error);
    }
  }

  createBarChart(id, rows, opts = {}) {
    console.log(`Creating bar chart for ${id}:`, { rows: rows.length, opts });
    
    const { labels = [], data = [], label = 'Value', multiColor = false } = opts;
    this._destroyIfExists(id);
    const ctx = document.getElementById(id);
    if (!ctx) {
      console.error(`Chart canvas with id '${id}' not found`);
      return;
    }

    if (!window.Chart) {
      console.error('Chart.js not available');
      return;
    }

    const colors = multiColor 
      ? ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']
      : '#3b82f6';

    console.log(`Bar chart ${id} data:`, { labels, data });

    try {
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
      console.log(`Bar chart ${id} created successfully:`, chart);
    } catch (error) {
      console.error(`Error creating bar chart ${id}:`, error);
    }
  }

  createStatusChart(id, rows, statusField = 'status') {
    console.log(`Creating status chart for ${id}:`, { rows: rows.length, statusField });
    
    this._destroyIfExists(id);
    const counts = new Map();
    for (const r of rows) {
      const s = (r[statusField] || 'Unknown').toString().trim();
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    
    const labels = Array.from(counts.keys()).filter(key => counts.get(key) > 0);
    const data = labels.map(key => counts.get(key));

    console.log(`Status chart ${id} data:`, { labels, data });

    const ctx = document.getElementById(id);
    if (!ctx) {
      console.error(`Chart canvas with id '${id}' not found`);
      return;
    }
    
    if (!window.Chart) {
      console.error('Chart.js not available');
      return;
    }
    
    try {
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
      console.log(`Status chart ${id} created successfully:`, chart);
    } catch (error) {
      console.error(`Error creating status chart ${id}:`, error);
    }
  }

  createAgentChart(id, rows, agentField = 'agent') {
    console.log(`Creating agent chart for ${id}:`, { rows: rows.length, agentField });
    
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

    console.log(`Agent chart ${id} data:`, { labels, data });

    const ctx = document.getElementById(id);
    if (!ctx) {
      console.error(`Chart canvas with id '${id}' not found`);
      return;
    }

    if (!window.Chart) {
      console.error('Chart.js not available');
      return;
    }

    try {
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
      console.log(`Agent chart ${id} created successfully:`, chart);
    } catch (error) {
      console.error(`Error creating agent chart ${id}:`, error);
    }
  }
}

const chartManager = new ChartManager();
export default chartManager;