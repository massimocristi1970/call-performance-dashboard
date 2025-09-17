// renderers.js
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, isAbandoned, isConnected, cleanNumber } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor() {
    this.currentFilters = {};
  }

  updateFilters(filters) {
    this.currentFilters = { ...filters };
  }

  /**
   * Render a page (inbound, outbound, fcr) dynamically
   */
  async renderPage(pageKey, containerId) {
    const data = dataLoader.getData(pageKey, this.currentFilters);
    const container = document.getElementById(containerId);
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = document.getElementById('no-data-template').innerHTML;
      return;
    }

    container.innerHTML = `
      <div class="kpis-grid"></div>
      <div class="charts-grid"></div>
    `;

    // --- 1. KPIs ---
    const kpiGrid = container.querySelector('.kpis-grid');
    const kpiDefs = getKPIConfig(pageKey);
    const kpis = this.calculateKPIs(pageKey, data);

    kpiDefs.forEach(kpiDef => {
      if (!(kpiDef.key in kpis)) return; // skip if KPI not available

      const template = document.getElementById('kpi-template');
      const node = template.content.cloneNode(true);
      const card = node.querySelector('.kpi-card');

      const icon = card.querySelector('.kpi-icon');
      icon.textContent = kpiDef.icon;
      icon.style.background = `${kpiDef.color}20`;
      icon.style.color = kpiDef.color;

      const valueEl = card.querySelector('.kpi-value');
      const value = kpis[kpiDef.key];
      valueEl.textContent = formatNumber(value, kpiDef.format);

      // Threshold colouring
      if (kpiDef.threshold) {
        const { warning, critical } = kpiDef.threshold;
        if (value >= critical) {
          valueEl.style.color = 'var(--error-color)';
        } else if (value >= warning) {
          valueEl.style.color = 'var(--warning-color)';
        }
      }

      card.querySelector('.kpi-label').textContent = kpiDef.label;
      kpiGrid.appendChild(node);
    });

    // --- 2. Charts ---
    const chartGrid = container.querySelector('.charts-grid');

    if (pageKey === 'fcr') {
      // FCR has only Date + Count
      const chartId = `${pageKey}-cases-over-time`;
      const chartWrapper = this.createChartWrapper('Cases Over Time', chartId);
      chartGrid.appendChild(chartWrapper);
      chartManager.createCallsOverTimeChart(chartId, data, {
        dateField: 'Date',
        valueField: 'Count',
        color: CONFIG.dataSources[pageKey].color
      });
      return; // skip status/agent charts
    }

    // Calls over time
    const callsChartId = `${pageKey}-calls-over-time`;
    const callsChartWrapper = this.createChartWrapper('Calls Over Time', callsChartId);
    chartGrid.appendChild(callsChartWrapper);
    chartManager.createCallsOverTimeChart(callsChartId, data, {
      dateField: getFieldMapping(pageKey, 'date')[0] || 'date',
      color: CONFIG.dataSources[pageKey].color
    });

    // Status distribution
    const statusChartId = `${pageKey}-status-dist`;
    const statusChartWrapper = this.createChartWrapper('Status Distribution', statusChartId);
    chartGrid.appendChild(statusChartWrapper);
    chartManager.createStatusChart(statusChartId, data, getFieldMapping(pageKey, 'status')[0] || 'status');

    // Agent performance
    const agentChartId = `${pageKey}-agent-perf`;
    const agentChartWrapper = this.createChartWrapper('Top Agents', agentChartId);
    chartGrid.appendChild(agentChartWrapper);
    chartManager.createAgentChart(agentChartId, data, getFieldMapping(pageKey, 'agent')[0] || 'agent');
  }

  /**
   * KPI calculations
   */
  calculateKPIs(pageKey, data) {
    const result = {};

    if (pageKey === 'inbound') {
      const total = data.length;
      const abandoned = data.filter(r => isAbandoned(r.Disposition)).length;
      result.totalCalls = total;
      result.abandonRate = total ? (abandoned / total) * 100 : 0;
      result.avgHandleTime = this.avgNumeric(data, 'Talk Time');
      result.avgWaitTime = this.avgNumeric(data, 'Wait Time');
    }

    if (pageKey === 'outbound') {
      const total = data.reduce((sum, r) => sum + cleanNumber(r['Total Calls']), 0);
      const answered = data.reduce((sum, r) => sum + cleanNumber(r['Answered Calls']), 0);
      const duration = data.reduce((sum, r) => sum + cleanNumber(r['Total Call Duration']), 0);

      result.totalCalls = total;
      result.connectRate = total ? (answered / total) * 100 : 0;
      result.avgTalkTime = total ? duration / total : 0;
      // campaignCount dropped (not in your CSV)
    }

    if (pageKey === 'fcr') {
      const total = data.reduce((sum, r) => sum + cleanNumber(r['Count']), 0);
      result.totalCases = total;
      // No resolved/escalation metrics available
    }

    return result;
  }

  avgNumeric(data, field) {
    const nums = data.map(r => cleanNumber(r[field])).filter(n => n > 0);
    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  /**
   * Helper: create chart wrapper from template
   */
  createChartWrapper(title, chartId) {
    const template = document.getElementById('chart-template');
    const node = template.content.cloneNode(true);
    node.querySelector('.chart-title').textContent = title;
    const canvas = node.querySelector('canvas');
    canvas.id = chartId;
    return node;
  }

  // --- Page entrypoints ---
  async renderInbound() { return this.renderPage('inbound', 'inbound-content'); }
  async renderOutbound() { return this.renderPage('outbound', 'outbound-content'); }
  async renderFCR() { return this.renderPage('fcr', 'fcr-content'); }
}

export const pageRenderer = new PageRenderer();
export default pageRenderer;
