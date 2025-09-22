// js/renderers.js
import { dataLoader } from './data-loader.js';
import chartManager from './chart-manager.js';

// Local helper (do NOT add to utils.js)
function durationToSeconds(str) {
  if (!str) return 0;
  const parts = String(str).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(str) || 0;
}

// Small DOM helpers
function setTileText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
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

    const container = document.getElementById('inbound-content');
    container.innerHTML = `
      <div class="chart-card">
        <div class="chart-header"><h3>Inbound Calls Over Time</h3></div>
        <div class="chart-container"><canvas id="inbound-calls-over-time"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h3>Status Breakdown</h3></div>
        <div class="chart-container"><canvas id="inbound-status"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h3>Calls per Agent</h3></div>
        <div class="chart-container"><canvas id="inbound-agent"></canvas></div>
      </div>
    `;

    chartManager.createCallsOverTimeChart('inbound-calls-over-time', data, { dateField: 'date_parsed' });
    chartManager.createStatusChart('inbound-status', data);
    chartManager.createAgentChart('inbound-agent', data);
  }

  // ---------------- OUTBOUND ----------------
  async renderOutbound(filters) {
    const callsData = dataLoader.getData('outbound', filters) || [];
    const connectRaw = dataLoader.getData('outbound_connectrate', filters) || [];
    const connectData = connectRaw.filter(r => {
      const dir = (r['Initial Direction'] || '').toString().toLowerCase();
      return dir.includes('outbound');
    });

    const totalOutboundCalls = callsData.reduce(
      (sum, r) => sum + (Number(r.OutboundCalls_numeric) || 0), 0
    );

    const totalOutboundRows = connectData.length;
    const connectedRows = connectData.reduce((acc, r) => {
      const sec = durationToSeconds(r['Duration']);
      return acc + (sec > 150 ? 1 : 0);
    }, 0);
    const connectRate = totalOutboundRows > 0
      ? ((connectedRows / totalOutboundRows) * 100)
      : 0;

    setTileText('outbound-total-calls', totalOutboundCalls.toLocaleString());
    setTileText('outbound-connect-rate', `${connectRate.toFixed(1)}%`);

    const container = document.getElementById('outbound-content');
    container.innerHTML = `
      <div class="chart-card">
        <div class="chart-header"><h3>Outbound Calls Over Time</h3></div>
        <div class="chart-container"><canvas id="outbound-calls-over-time"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h3>Calls per Agent</h3></div>
        <div class="chart-container"><canvas id="outbound-agent"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><h3>Call Outcomes</h3></div>
        <div class="chart-container"><canvas id="outbound-outcomes"></canvas></div>
      </div>
    `;

    chartManager.createCallsOverTimeChart('outbound-calls-over-time', callsData, { dateField: 'date_parsed' });
    chartManager.createBarChart('outbound-agent', callsData, {
      groupBy: 'Agent',
      valueField: 'OutboundCalls_numeric',
      label: 'Calls per Agent'
    });

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

    const container = document.getElementById('fcr-content');
    container.innerHTML = `
      <div class="chart-card">
        <div class="chart-header"><h3>FCR Cases Over Time</h3></div>
        <div class="chart-container"><canvas id="fcr-cases-over-time"></canvas></div>
      </div>
    `;

    chartManager.createCallsOverTimeChart('fcr-cases-over-time', data, { dateField: 'date_parsed' });
  }
}

const pageRenderer = new PageRenderer();
export default pageRenderer;
export { pageRenderer };
