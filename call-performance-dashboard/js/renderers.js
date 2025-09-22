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

// Small DOM helpers (match your existing cards/tiles pattern)
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

  // ---------------- INBOUND (unchanged) ----------------
  async renderInbound(filters) {
    const data = dataLoader.getData('inbound', filters);
    if (!data || data.length === 0) return;

    // Time series: count of inbound calls per day
    chartManager.createTimeSeriesChart('inbound-calls-over-time', data, {
      valueField: null, // null => counts rows
      label: 'Inbound Calls'
    });

    // Status doughnut
    chartManager.createStatusChart('inbound-status', data);

    // Calls per agent (inbound)
    chartManager.createAgentChart('inbound-agent', data);
  }

  // ---------------- OUTBOUND (updated as requested) ----------------
  async renderOutbound(filters) {
    // Primary outbound dataset
    const callsData = dataLoader.getData('outbound', filters) || [];
    // Connect-rate dataset (filter to outbound direction only)
    const connectRaw = dataLoader.getData('outbound_connectrate', filters) || [];
    const connectData = connectRaw.filter(r => {
      const dir = (r['Initial Direction'] || '').toString().toLowerCase();
      return dir.includes('outbound');
    });

    // ---- Tiles ----
    // Total Outbound Calls: sum of OutboundCalls_numeric from outbound_calls.csv
    const totalOutboundCalls = callsData.reduce(
      (sum, r) => sum + (Number(r.OutboundCalls_numeric) || 0), 0
    );

    // Connect Rate: from outbound_connectrate.csv (duration > 150s)
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

    // ---- Charts ----

    // Outbound Calls Over Time (use OutboundCalls_numeric)
    chartManager.createTimeSeriesChart('outbound-calls-over-time', callsData, {
      valueField: 'OutboundCalls_numeric',
      label: 'Outbound Calls'
    });

    // Calls per Agent (sum of OutboundCalls_numeric by Agent)
    chartManager.createBarChart('outbound-agent', callsData, {
      groupBy: 'Agent',
      valueField: 'OutboundCalls_numeric',
      label: 'Calls per Agent'
    });

    // Call Outcomes (doughnut) from connectrate file: Connected vs Not Connected
    // We pass rows array in the same structure your doughnut expects:
    const outcomesRows = [
      { label: 'Connected (>2:30)', value: connectedRows },
      { label: 'Not Connected', value: Math.max(totalOutboundRows - connectedRows, 0) }
    ];
    chartManager.createDoughnutChart('outbound-outcomes', outcomesRows, {
      // If your chart-manager expects rows + opts, this matches prior logs
      labelField: 'label',
      valueField: 'value',
      title: 'Outbound Call Outcomes'
    });
  }

  // ---------------- FCR (unchanged) ----------------
  async renderFCR(filters) {
    const data = dataLoader.getData('fcr', filters);
    if (!data || data.length === 0) return;

    chartManager.createTimeSeriesChart('fcr-cases-over-time', data, {
      valueField: 'Count_numeric',
      label: 'FCR Cases'
    });
  }
}

const pageRenderer = new PageRenderer();
export default pageRenderer;
export { pageRenderer };