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
  async renderOutbound(filters = {}) {
  const outboundData = dataLoader.getData('outbound', filters);
  const connectRateData = dataLoader.getData('outbound_connectrate', filters);

  const container = document.getElementById('outbound-content');
  container.innerHTML = '';

  if ((!outboundData || outboundData.length === 0) &&
      (!connectRateData || connectRateData.length === 0)) {
    container.appendChild(this.renderNoData());
    return;
  }

  // ---- KPIs ----
  const totalCalls = outboundData.reduce((sum, r) => sum + (r.OutboundCalls_numeric || 0), 0);

  // filter only outbound rows
  const outboundOnly = connectRateData.filter(r => 
    r['Initial Direction'] && r['Initial Direction'].toLowerCase().includes('outbound')
  );

  // compute connect stats
  let totalOutboundConnect = 0;
  let connectedCalls = 0;
  outboundOnly.forEach(r => {
    const dur = parseDurationToSeconds(r['Duration']);
    totalOutboundConnect++;
    if (dur > 150) connectedCalls++;
  });
  const connectRate = totalOutboundConnect > 0 ? (connectedCalls / totalOutboundConnect) * 100 : 0;

  container.appendChild(this.renderKPI('📤', totalCalls.toLocaleString(), 'Total Outbound Calls'));
  container.appendChild(this.renderKPI('📈', connectRate.toFixed(1) + '%', 'Connect Rate'));

  // ---- Charts ----
  // Calls over time (using outbound.csv)
  chartManager.createTimeSeriesChart({
    id: 'outbound-calls-over-time',
    rows: outboundData,
    valueField: 'OutboundCalls_numeric',
    title: 'Outbound Calls Over Time',
    color: CONFIG.dataSources.outbound.color
  });

  // Calls per agent (using outbound.csv)
  chartManager.createBarChart({
    id: 'outbound-agent',
    rows: outboundData,
    labelField: 'Agent',
    valueField: 'OutboundCalls_numeric',
    title: 'Calls Per Agent',
    color: CONFIG.dataSources.outbound.color
  });

  // Call outcomes (from connectrate.csv)
  chartManager.createDoughnutChart({
    id: 'outbound-outcomes',
    rows: [
      { label: 'Connected >2:30', value: connectedCalls },
      { label: 'Not Connected', value: totalOutboundConnect - connectedCalls }
    ],
    title: 'Outbound Call Outcomes',
    colors: ['#10b981', '#f87171']
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
