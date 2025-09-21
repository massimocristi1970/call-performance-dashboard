// js/renderers.js
import { dataLoader } from './data-loader.js';
import chartManager from './chart-manager.js';
import { showError } from './utils.js';

class PageRenderer {
  constructor() {
    this.currentFilters = {};
  }

  updateFilters(filters) {
    this.currentFilters = filters;
  }

  // ===== INBOUND =====
  async renderInbound(filters) {
    const data = dataLoader.getData('inbound', filters);
    if (!data.length) {
      showError("No inbound data available");
      return;
    }

    // KPIs
    const totalCalls = data.length;
    this.renderTile('inbound-total-calls', totalCalls, "Total Inbound Calls");

    const avgWait = (data.reduce((s, r) => s + (r.waitTime_numeric || 0), 0) / totalCalls).toFixed(1);
    this.renderTile('inbound-avg-wait', `${avgWait}s`, "Average Wait Time");

    // Charts
    chartManager.createTimeSeriesChart('inbound-calls-over-time', data, {
      valueField: 'Call ID',
      label: 'Inbound Calls'
    });

    chartManager.createStatusChart('inbound-status', data, {
      statusField: 'Call Status'
    });

    chartManager.createBarChart('inbound-agent', data, {
      groupBy: 'Agent',
      valueField: 'Call ID',
      label: 'Calls per Agent'
    });
  }

  // ===== OUTBOUND =====
  async renderOutbound(filters) {
    const data = dataLoader.getData('outbound', filters);
    const connectData = dataLoader.getData('outbound_connectrate', filters);

    if (!data.length && !connectData.length) {
      showError("No outbound data available");
      return;
    }

    // === KPIs ===
    const totalCalls = data.reduce((sum, r) => sum + (r.OutboundCalls_numeric || 0), 0);
    this.renderTile('outbound-total-calls', totalCalls, "Total Outbound Calls");

    const totalOut = connectData.length;
    const connected = connectData.filter(r => r.isConnected).length;
    const connectRate = totalOut > 0 ? ((connected / totalOut) * 100).toFixed(1) : 0;
    this.renderTile('outbound-connect-rate', `${connectRate}%`, "Connect Rate");

    // === Charts ===
    // Calls over time
    chartManager.createTimeSeriesChart('outbound-calls-over-time', data, {
      valueField: 'OutboundCalls_numeric',
      label: 'Outbound Calls'
    });

    // Outcomes (connected vs not connected)
    chartManager.createDoughnutChart('outbound-outcomes', connectData, {
      categories: [
        { field: 'isConnected', label: 'Connected', map: (r) => r.isConnected ? 1 : 0 },
        { field: 'isConnected', label: 'Not Connected', map: (r) => r.isConnected ? 0 : 1 }
      ]
    });

    // Calls per agent
    chartManager.createBarChart('outbound-agent', data, {
      groupBy: 'Agent',
      valueField: 'OutboundCalls_numeric',
      label: 'Calls per Agent'
    });
  }

  // ===== FCR =====
  async renderFCR(filters) {
    const data = dataLoader.getData('fcr', filters);
    if (!data.length) {
      showError("No FCR data available");
      return;
    }

    const totalCases = data.reduce((sum, r) => sum + (r.Count_numeric || 0), 0);
    this.renderTile('fcr-total-cases', totalCases, "Total FCR Cases");

    chartManager.createTimeSeriesChart('fcr-cases-over-time', data, {
      valueField: 'Count_numeric',
      label: 'FCR Cases'
    });
  }

  // ===== Helper to render a KPI tile =====
  renderTile(id, value, label) {
    const el = document.getElementById(id);
    if (!el) return;

    el.querySelector('.tile-value').textContent = value;
    el.querySelector('.tile-label').textContent = label;
  }
}

const pageRenderer = new PageRenderer();
export default pageRenderer;
