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
      const template = document.getElementById('kpi-template');
      const node = template.content.cloneNode(true);
      const card = node.querySelector('.kpi-card');

      const icon = card.querySelector('.kpi-icon');
      icon.textContent = kpiDef.icon;
      icon.style.background = `${kpiDef.color}20`;
      icon.style.color = kpiDef.color;

      card.querySelector('.kpi-value').textContent = formatNumber(kpis[kpiDef.key], kpiDef.format);
      card.querySelector('.kpi-label').textContent = kpiDef.label;

      kpiGrid.appendChild(node);
    });

    // --- 2. Charts ---
    const chartGrid = container.querySelector('.charts-grid');

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
      const abandoned = data.filter(r => isAbandoned(r.status)).length;
      result.totalCalls = total;
      result.abandonRate = total ? (abandoned / total) * 100 : 0;
      result.avgHandleTime = this.avgNumeric(data, 'duration_numeric');
      result.avgWaitTime = this.avgNumeric(data, 'waitTime_numeric');
    }

    if (pageKey === 'outbound') {
      const total = data.length;
      const connected = data.filter(r => isConnected(r.status)).length;
      result.totalCalls = total;
      result.connectRate = total ? (connected / total) * 100 : 0;
      result.avgTalkTime = this.avgNumeric(data, 'duration_numeric');
      result.campaignCount = new Set(data.map(r => r.Campaign || r.campaign || '')).size;
    }

    if (pageKey === 'fcr') {
      const total = data.length;
      const resolved = data.filter(r => String(r.resolved).toLowerCase() === 'true').length;
      result.totalCases = total;
      result.fcrRate = total ? (resolved / total) * 100 : 0;
      result.avgResolutionTime = this.avgNumeric(data, 'duration_numeric');
      result.escalationRate = total ? ((total - resolved) / total) * 100 : 0;
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
