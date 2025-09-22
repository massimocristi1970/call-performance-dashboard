// js/renderers.js
import { dataLoader } from './data-loader.js';
import chartManager from './chart-manager.js';

// Helper: duration string -> seconds
function durationToSeconds(str) {
  if (!str) return 0;
  const parts = String(str).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(str) || 0;
}

// Helper: insert chart container
function ensureChartCanvas(containerId, chartId, title) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  let wrapper = container.querySelector(`#${chartId}-wrapper`);
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = `${chartId}-wrapper`;
    wrapper.className = 'chart-wrapper';
    wrapper.innerHTML = `
      <h3>${title}</h3>
      <canvas id="${chartId}"></canvas>
    `;
    container.appendChild(wrapper);
  }
  return wrapper.querySelector('canvas');
}

// Small helper to set text
function setTileText(containerId, label, value) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let tile = container.querySelector(`[data-label="${label}"]`);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'kpi-card';
    tile.dataset.label = label;
    tile.innerHTML = `
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
    `;
    container.appendChild(tile);
  } else {
    tile.querySelector('.kpi-value').textContent = value;
  }
}

class PageRenderer {
  constructor() {
    this.currentFilters = {};
  }

  updateFilters(filters) {
    this.currentFilters = filters || {};
  }

  // ---------------- INBOUND ----------------
  async renderInbound(filters) {
    const data = dataLoader.getData('inbound', filters);
    if (!data || data.length === 0) return;

    // Tiles
    setTileText('inbound-tiles', 'Total Calls', data.length.toLocaleString());

    // Charts
    ensureChartCanvas('inbound-charts', 'inbound-calls-over-time', 'Inbound Calls Over Time');
    chartManager.createCallsOverTimeChart('inbound-calls-over-time', data, { dateField: 'date_parsed' });

    ensureChartCanvas('inbound-charts', 'inbound-status', 'Inbound Status');
    chartManager.createStatusChart('inbound-status', data);

    ensureChartCanvas('inbound-charts', 'inbound-agent', 'Calls per Agent');
    chartManager.createAgentChart('inbound-agent', data);
  }

  // ---------------- OUTBOUND ----------------
  async renderOutbound(filters) {
    const callsData = dataLoader.getData('outbound', filters) || [];
    const connectRaw = dataLoader.getData('outbound_connectrate', filters) || [];

    const connectData = connectRaw.filter(r =>
      (r['Initial Direction'] || '').toLowerCase().includes('outbound')
    );

    // --- Tiles ---
    const totalOutboundCalls = callsData.reduce(
      (sum, r) => sum + (Number(r.OutboundCalls_numeric) || 0), 0
    );

    const totalOutboundRows = connectData.length;
    const connectedRows = connectData.reduce((acc, r) => {
      const sec = durationToSeconds(r['Duration']);
      return acc + (sec > 150 ? 1 : 0);
    }, 0);
    const connectRate = totalOutboundRows > 0 ? (connectedRows / totalOutboundRows) * 100 : 0;

    setTileText('outbound-tiles', 'Total Calls', totalOutboundCalls.toLocaleString());
    setTileText('outbound-tiles', 'Connect Rate', `${connectRate.toFixed(1)}%`);

    // --- Charts ---
    ensureChartCanvas('outbound-charts', 'outbound-calls-over-time', 'Outbound Calls Over Time');
    chartManager.createCallsOverTimeChart('outbound-calls-over-time', callsData, { dateField: 'date_parsed' });

    ensureChartCanvas('outbound-charts', 'outbound-agent', 'Calls per Agent');
    chartManager.createBarChart('outbound-agent', callsData, {
      groupBy: 'Agent',
      valueField: 'OutboundCalls_numeric',
      label: 'Calls per Agent'
    });

    ensureChartCanvas('outbound-charts', 'outbound-outcomes', 'Outbound Call Outcomes');
    const outcomesRows = [
      { label: 'Connected (>2:30)', value: connectedRows },
      { label: 'Not Connected', value: Math.max(totalOutboundRows - connectedRows, 0) }
    ];
    chartManager.createDoughnutChart('outbound-outcomes', outcomesRows, {
      labelField: 'label',
      valueField: 'value',
      title: 'Outbound Call Outcomes'
    });
  }

  // ---------------- FCR ----------------
  async renderFCR(filters) {
    const data = dataLoader.getData('fcr', filters);
    if (!data || data.length === 0) return;

    setTileText('fcr-tiles', 'Total Cases', data.length.toLocaleString());

    ensureChartCanvas('fcr-charts', 'fcr-cases-over-time', 'FCR Cases Over Time');
    chartManager.createCallsOverTimeChart('fcr-cases-over-time', data, { dateField: 'date_parsed' });
  }
}

const pageRenderer = new PageRenderer();
export default pageRenderer;
export { pageRenderer };
