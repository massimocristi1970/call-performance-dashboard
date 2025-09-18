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

      // Normalize date — support Date object or string
      let dt = null;
      if (d instanceof Date) {
        dt = isNaN(d) ? null : d;
      } else if (typeof d === 'string' && d.trim()) {
        // try parse ISO or general date
        const tryIso = new Date(d);
        dt = isNaN(tryIso) ? parseDate(d) : tryIso;
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

    // If nothing bucketed, still render an empty chart (avoid crashing)
    const keys = Array.from(bucket.keys()).sort();
    const labels = keys;
    const data = keys.map(k => bucket.get(k));

    const ctx = document.getElementById(id);
    if (!ctx) return;

    const chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: valueField ? valueField : 'Count',
          data,
          borderColor: color,
          backgroundColor: color + '33',
          fill: true,
          tension: 0.25,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
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
    if (!ctx) return;

    const chart = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: dataSpec.labels,
        datasets: [{
          data: dataSpec.data.map(v => (Number.isFinite(v) ? v : cleanNumber(v))),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
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
    if (!ctx) return;

    const chart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data: data.map(v => (Number.isFinite(v) ? v : cleanNumber(v))),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true }
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
    const labels = Array.from(counts.keys());
    const data = Array.from(counts.values());

    const ctx = document.getElementById(id);
    if (!ctx) return;
    const chart = new window.Chart(ctx, {
      type: 'pie',
      data: { labels, datasets: [{ data }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
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
      byAgent.set(a, (byAgent.get(a) || 0) + 1);
    }

    const top = Array.from(byAgent.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const labels = top.map(([k]) => k);
    const data = top.map(([, v]) => v);

    const ctx = document.getElementById(id);
    if (!ctx) return;

    const chart = new window.Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true }
        },
        plugins: { legend: { display: false } }
      }
    });

    this.instances.set(id, chart);
  }
}

const chartManager = new ChartManager();
export default chartManager;
