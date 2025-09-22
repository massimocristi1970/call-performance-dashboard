// js/renderers.js
import { dataLoader } from './data-loader.js';
import chartManager from './chart-manager.js';
import { durationToSeconds } from './utils.js';

class PageRenderer {
  updateFilters(filters) {
    this.currentFilters = filters;
  }

  // ---------- INBOUND ----------
  async renderInbound(filters) {
    const data = dataLoader.getData('inbound', filters);
    if (!data.length) return;

    chartManager.createChart('inbound-calls-over-time', data, {
      type: 'line',
      x: 'date_parsed',
      y: () => 1,
      agg: 'count',
      label: 'Inbound Calls'
    });

    chartManager.createChart('inbound-status', data, {
      type: 'doughnut',
      groupBy: 'Status',
      label: 'Inbound Status'
    });

    chartManager.createChart('inbound-agent', data, {
      type: 'bar',
      groupBy: 'Agent',
      label: 'Calls per Agent'
    });
  }

  // ---------- OUTBOUND ----------
  async renderOutbound(filters) {
    const callsData = dataLoader.getData('outbound', filters);
    const connectData = dataLoader.getData('outbound_connectrate', filters)
      .filter(r => r['Initial Direction'] === 'Outbound');

    if (!callsData.length && !connectData.length) return;

    // ---- Tiles ----
    const totalCalls = callsData.reduce((sum, r) => sum + (r.OutboundCalls_numeric || 0), 0);

    const totalOutbound = connectData.length;
    const connected = connectData.filter(r => durationToSeconds(r.Duration) > 150).length;
    const connectRate = totalOutbound ? (connected / totalOutbound) * 100 : 0;

    this.updateTile('outbound-total-calls', totalCalls);
    this.updateTile('outbound-connect-rate', connectRate.toFixed(1) + '%');

    // ---- Charts ----
    chartManager.createChart('outbound-calls-over-time', callsData, {
      type: 'line',
      x: 'date_parsed',
      y: r => r.OutboundCalls_numeric || 0,
      agg: 'sum',
      label: 'Outbound Calls'
    });

    chartManager.createChart('outbound-outcomes', connectData, {
      type: 'doughnut',
      groupBy: r => durationToSeconds(r.Duration) > 150 ? 'Connected' : 'Not Connected',
      label: 'Call Outcomes'
    });

    chartManager.createChart('outbound-agent', connectData, {
      type: 'bar',
      groupBy: 'Agent',
      label: 'Calls per Agent'
    });
  }

  // ---------- FCR ----------
  async renderFCR(filters) {
    const data = dataLoader.getData('fcr', filters);
    if (!data.length) return;

    chartManager.createChart('fcr-cases-over-time', data, {
      type: 'line',
      x: 'date_parsed',
      y: 'Count_numeric',
      agg: 'sum',
      label: 'FCR Cases'
    });
  }

  // ---------- Helper ----------
  updateTile(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
}

export const pageRenderer = new PageRenderer();
export default pageRenderer;
