// js/renderers.js - Complete working solution
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, isAbandoned, cleanNumber } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor(){ this.currentFilters = {}; }
  updateFilters(filters) { this.currentFilters = { ...filters }; }

  async renderPage(pageKey, containerId){
    // Get data for the page
    let data = dataLoader.getData(pageKey, this.currentFilters || {});

    const container = document.getElementById(containerId);
    if(!container) return;

    // Handle no data case
    if(!data || data.length === 0){
      const noDataTemplate = document.getElementById('no-data-template');
      if (noDataTemplate) {
        container.innerHTML = noDataTemplate.innerHTML;
      } else {
        container.innerHTML = '<div style="text-align: center; padding: 40px;"><h3>No Data Available</h3></div>';
      }
      return;
    }

    // Create the basic structure
    container.innerHTML = `
      <div class="kpis-grid"></div>
      <div class="charts-grid"></div>
    `;

    // Render KPIs
    this.renderKPIs(pageKey, data, container.querySelector('.kpis-grid'));

    // Render Charts
    this.renderCharts(pageKey, data, container.querySelector('.charts-grid'));
  }

  renderKPIs(pageKey, data, kpiGrid) {
    const defs = getKPIConfig(pageKey);
    const kpis = this.calculateKPIs(pageKey, data);

    defs.forEach(def => {
      if(!(def.key in kpis)) return;
      
      const kpiCard = document.createElement('div');
      kpiCard.className = 'kpi-card';
      kpiCard.innerHTML = `
        <div class="kpi-icon" style="background: ${def.color}20; color: ${def.color};">
          ${def.icon}
        </div>
        <div class="kpi-content">
          <div class="kpi-value">${formatNumber(kpis[def.key], def.format)}</div>
          <div class="kpi-label">${def.label}</div>
        </div>
      `;
      
      kpiGrid.appendChild(kpiCard);
    });
  }

  renderCharts(pageKey, data, chartsGrid) {
    if (pageKey === 'inbound') {
      this.createChart(chartsGrid, 'Inbound Calls Over Time', `${pageKey}-calls-over-time`);
      this.createChart(chartsGrid, 'Status Distribution', `${pageKey}-status`);  
      this.createChart(chartsGrid, 'Top Agents', `${pageKey}-agent`);

      // Create the actual charts
      setTimeout(() => {
        chartManager.createCallsOverTimeChart(`${pageKey}-calls-over-time`, data, {
          dateField: '__chartDate',
          color: CONFIG.dataSources[pageKey].color
        });

        chartManager.createStatusChart(`${pageKey}-status`, data, 
          getFieldMapping(pageKey,'status')[0] || 'Disposition');

        chartManager.createAgentChart(`${pageKey}-agent`, data, 
          getFieldMapping(pageKey,'agent')[0] || 'Agent Name');
      }, 100);
    }

    if (pageKey === 'outbound') {
      this.createChart(chartsGrid, 'Outbound Calls Over Time', `${pageKey}-calls-over-time`);
      this.createChart(chartsGrid, 'Call Outcomes', `${pageKey}-outcomes`);
      this.createChart(chartsGrid, 'Calls per Agent', `${pageKey}-agent`);

      setTimeout(() => {
        chartManager.createCallsOverTimeChart(`${pageKey}-calls-over-time`, data, {
          dateField: '__chartDate',
          valueField: 'TotalCalls_numeric',
          color: CONFIG.dataSources[pageKey].color
        });

        const answered = data.reduce((s, r) => s + (cleanNumber(r.AnsweredCalls_numeric) || 0), 0);
        const missed = data.reduce((s, r) => s + (cleanNumber(r.MissedCalls_numeric) || 0), 0);
        const vm = data.reduce((s, r) => s + (cleanNumber(r.VoicemailCalls_numeric) || 0), 0);
        
        chartManager.createDoughnutChart(`${pageKey}-outcomes`, data, {
          labels: ['Answered', 'Missed', 'Voicemail'],
          data: [answered, missed, vm]
        });

        const byAgent = {};
        data.forEach(r => {
          const agent = r.Agent || 'Unknown';
          if (agent && agent !== 'Unknown') {
            byAgent[agent] = (byAgent[agent] || 0) + (cleanNumber(r.TotalCalls_numeric) || 0);
          }
        });
        
        const sortedAgents = Object.entries(byAgent)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);
        
        if (sortedAgents.length > 0) {
          chartManager.createBarChart(`${pageKey}-agent`, data, { 
            labels: sortedAgents.map(([agent]) => agent),
            data: sortedAgents.map(([, calls]) => calls),
            label: 'Total Calls', 
            multiColor: true 
          });
        }
      }, 100);
    }

    if (pageKey === 'fcr') {
      this.createChart(chartsGrid, 'Cases Over Time', `${pageKey}-cases-over-time`);

      setTimeout(() => {
        const valueField = data[0] && 'Count_numeric' in data[0] ? 'Count_numeric' : 'Count';
        chartManager.createCallsOverTimeChart(`${pageKey}-cases-over-time`, data, {
          dateField: '__chartDate',
          valueField,
          color: CONFIG.dataSources[pageKey].color
        });
      }, 100);
    }
  }

  createChart(parent, title, canvasId) {
    const chartCard = document.createElement('div');
    chartCard.className = 'chart-card';
    chartCard.innerHTML = `
      <div class="chart-header">
        <h3 class="chart-title">${title}</h3>
        <div class="chart-actions">
          <button class="chart-action" title="Fullscreen">⛶</button>
          <button class="chart-action" title="Download">💾</button>
        </div>
      </div>
      <div class="chart-container" style="padding: 24px; position: relative; height: 300px;">
        <canvas class="chart-canvas" id="${canvasId}" style="max-width: 100%; max-height: 100%;"></canvas>
      </div>
    `;
    parent.appendChild(chartCard);
  }

  calculateKPIs(pageKey, data) {
    const out = {};

    if (pageKey === 'inbound') {
      const total = data.length;
      const abandoned = data.filter(r => isAbandoned(r.Disposition || '')).length;

      out.totalCalls = total;
      out.abandonRate = total > 0 ? (abandoned / total) * 100 : 0;
      out.avgHandleTime = this.avg(data, 'duration_numeric') || this.avg(data, 'Talk Time') || 0;
      out.avgWaitTime = this.avg(data, 'waitTime_numeric') || this.avg(data, 'Wait Time') || 0;
    }

    if (pageKey === 'outbound') {
      const total = data.reduce((s, r) => s + (cleanNumber(r.TotalCalls_numeric) || 0), 0);
      const answered = data.reduce((s, r) => s + (cleanNumber(r.AnsweredCalls_numeric) || 0), 0);
      const duration = data.reduce((s, r) => s + (cleanNumber(r.TotalCallDuration_numeric) || 0), 0);

      out.totalCalls = total;
      out.connectRate = total > 0 ? (answered / total) * 100 : 0;
      out.avgTalkTime = answered > 0 ? (duration / answered) : 0;
    }

    if (pageKey === 'fcr') {
      const totalCases = data.reduce((s, r) => s + (cleanNumber(r.Count_numeric) || 0), 0);
      out.totalCases = totalCases;
    }

    return out;
  }

  avg(data, field) {
    const nums = data.map(r => cleanNumber(r[field])).filter(n => Number.isFinite(n) && n >= 0);
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  }

  async renderInbound() { return this.renderPage('inbound', 'inbound-content'); }
  async renderOutbound() { return this.renderPage('outbound', 'outbound-content'); }
  async renderFCR() { return this.renderPage('fcr', 'fcr-content'); }
}

export const pageRenderer = new PageRenderer();
export default pageRenderer;