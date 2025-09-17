// renderers.js
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, isAbandoned, cleanNumber } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor() { this.currentFilters = {}; }
  updateFilters(filters) { this.currentFilters = { ...filters }; }

  async renderPage(pageKey, containerId) {
    const data = dataLoader.getData(pageKey, this.currentFilters);
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = document.getElementById('no-data-template').innerHTML;
      return;
    }

    container.innerHTML = `<div class="kpis-grid"></div><div class="charts-grid"></div>`;

    // --- KPIs ---
    const kpiGrid = container.querySelector('.kpis-grid');
    const kpiDefs = getKPIConfig(pageKey);
    const kpis = this.calculateKPIs(pageKey, data);

    kpiDefs.forEach(k => {
      if (!(k.key in kpis)) return;
      const tpl = document.getElementById('kpi-template');
      const node = tpl.content.cloneNode(true);
      const card = node.querySelector('.kpi-card');

      const icon = card.querySelector('.kpi-icon');
      icon.textContent = k.icon;
      icon.style.background = `${k.color}20`;
      icon.style.color = k.color;

      const valueEl = card.querySelector('.kpi-value');
      const value = kpis[k.key];
      valueEl.textContent = formatNumber(value, k.format);

      // Threshold colouring (higher is worse for percentage KPIs like abandon/connect)
      if (k.threshold) {
        const { warning, critical } = k.threshold;
        if (value >= critical) valueEl.style.color = 'var(--error-color)';
        else if (value >= warning) valueEl.style.color = 'var(--warning-color)';
      }

      card.querySelector('.kpi-label').textContent = k.label;
      kpiGrid.appendChild(node);
    });

    // --- Charts ---
    const chartGrid = container.querySelector('.charts-grid');

    if (pageKey === 'fcr') {
      // Cases Over Time (uses Count)
      const chartId = `${pageKey}-cases-over-time`;
      chartGrid.appendChild(this.createChartWrapper('Cases Over Time', chartId));
      chartManager.createCallsOverTimeChart(chartId, data, {
        dateField: 'Date', valueField: 'Count_numeric' in data[0] ? 'Count_numeric' : 'Count',
        color: CONFIG.dataSources[pageKey].color
      });
      return;
    }

    if (pageKey === 'outbound') {
      // Calls Over Time by Total Calls
      const otId = `${pageKey}-calls-over-time`;
      chartGrid.appendChild(this.createChartWrapper('Outbound Calls Over Time', otId));
      chartManager.createCallsOverTimeChart(otId, data, {
        dateField: 'Date', valueField: 'TotalCalls_numeric', color: CONFIG.dataSources[pageKey].color
      });

      // Outcome distribution (Answered/Missed/Voicemail) — custom doughnut
      const distId = `${pageKey}-outcome-dist`;
      chartGrid.appendChild(this.createChartWrapper('Call Outcomes', distId));
      const answered = data.reduce((s, r) => s + cleanNumber(r['AnsweredCalls_numeric'] ?? r['Answered Calls']), 0);
      const missed   = data.reduce((s, r) => s + cleanNumber(r['MissedCalls_numeric'] ?? r['Missed Calls']), 0);
      const vm       = data.reduce((s, r) => s + cleanNumber(r['VoicemailCalls_numeric'] ?? r['Voicemail Calls']), 0);
      chartManager.createDoughnutChart(distId, data, {
        labels: ['Answered', 'Missed', 'Voicemail'],
        data: [answered, missed, vm]
      });

      // Agent performance (sum of Total Calls per Agent)
      const agId = `${pageKey}-agent-perf`;
      chartGrid.appendChild(this.createChartWrapper('Calls per Agent', agId));
      const byAgent = {};
      data.forEach(r => {
        const a = r.Agent || r['Agent'];
        if (!a) return;
        byAgent[a] = (byAgent[a] || 0) + cleanNumber(r['TotalCalls_numeric'] ?? r['Total Calls']);
      });
      const labels = Object.keys(byAgent).sort((a,b)=>byAgent[b]-byAgent[a]).slice(0,10);
      const values = labels.map(l => byAgent[l]);
      chartManager.createBarChart(agId, data, { labels, data: values, label: 'Total Calls', multiColor: true });

      return;
    }

    // Inbound defaults
    const callsChartId = `${pageKey}-calls-over-time`;
    chartGrid.appendChild(this.createChartWrapper('Inbound Calls Over Time', callsChartId));
    chartManager.createCallsOverTimeChart(callsChartId, data, {
      dateField: getFieldMapping(pageKey, 'date')[0] || 'Date/Time',
      color: CONFIG.dataSources[pageKey].color
    });

    const statusChartId = `${pageKey}-status-dist`;
    chartGrid.appendChild(this.createChartWrapper('Status Distribution', statusChartId));
    chartManager.createStatusChart(statusChartId, data, getFieldMapping(pageKey, 'status')[0] || 'Disposition');

    const agentChartId = `${pageKey}-agent-perf`;
    chartGrid.appendChild(this.createChartWrapper('Top Agents', agentChartId));
    chartManager.createAgentChart(agentChartId, data, getFieldMapping(pageKey, 'agent')[0] || 'Agent Name');
  }

  calculateKPIs(pageKey, data) {
    const r = {};

    if (pageKey === 'inbound') {
      const total = data.length;
      const abandoned = data.filter(x => isAbandoned(x.Disposition)).length;
      r.totalCalls = total;
      r.abandonRate = total ? (abandoned / total) * 100 : 0;
      r.avgHandleTime = this.avgNumeric(data, 'Talk Time');
      r.avgWaitTime   = this.avgNumeric(data, 'Wait Time');
    }

    if (pageKey === 'outbound') {
      const total    = data.reduce((s, x) => s + cleanNumber(x['TotalCalls_numeric'] ?? x['Total Calls']), 0);
      const answered = data.reduce((s, x) => s + cleanNumber(x['AnsweredCalls_numeric'] ?? x['Answered Calls']), 0);
      const duration = data.reduce((s, x) => s + cleanNumber(x['TotalCallDuration_numeric'] ?? x['Total Call Duration']), 0);
      r.totalCalls  = total;
      r.connectRate = total ? (answered / total) * 100 : 0;
      r.avgTalkTime = total ? (duration / total) : 0;
    }

    if (pageKey === 'fcr') {
      const total = data.reduce((s, x) => s + cleanNumber(x['Count_numeric'] ?? x['Count']), 0);
      r.totalCases = total;
    }

    return r;
  }

  avgNumeric(data, field) {
    const nums = data.map(r => cleanNumber(r[field])).filter(n => n >= 0);
    if (nums.length === 0) return 0;
    return nums.reduce((a,b)=>a+b,0) / nums.length;
  }

  createChartWrapper(title, chartId) {
    const tpl = document.getElementById('chart-template');
    const node = tpl.content.cloneNode(true);
    node.querySelector('.chart-title').textContent = title;
    const canvas = node.querySelector('canvas');
    canvas.id = chartId;
    return node;
  }

  async renderInbound() { return this.renderPage('inbound',  'inbound-content'); }
  async renderOutbound(){ return this.renderPage('outbound', 'outbound-content'); }
  async renderFCR()     { return this.renderPage('fcr',      'fcr-content'); }
}

export const pageRenderer = new PageRenderer();
export default pageRenderer;
