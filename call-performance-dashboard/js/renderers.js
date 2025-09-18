// js/renderers.js - Final Fix
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, isAbandoned, cleanNumber } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor(){ this.currentFilters = {}; }
  updateFilters(filters) { this.currentFilters = { ...filters }; }

  async renderPage(pageKey, containerId){
    console.log(`\n=== RENDERING ${pageKey.toUpperCase()} PAGE ===`);
    
    // Get data using current filters
    let data = dataLoader.getData(pageKey, this.currentFilters || {});
    console.log(`Data for rendering ${pageKey}:`, data.length, 'rows');

    const container = document.getElementById(containerId);
    if(!container) {
      console.error(`Container ${containerId} not found`);
      return;
    }

    if(!data || data.length === 0){
      console.log(`No data for ${pageKey}, showing no-data template`);
      const noDataTemplate = document.getElementById('no-data-template');
      if (noDataTemplate) {
        container.innerHTML = noDataTemplate.innerHTML;
      } else {
        container.innerHTML = '<div class="no-data-state"><h3>No Data Available</h3><p>No data found for the selected period.</p></div>';
      }
      return;
    }

    console.log(`Rendering ${pageKey} with ${data.length} rows`);
    container.innerHTML = `<div class="kpis-grid"></div><div class="charts-grid"></div>`;

    // KPIs
    const kpiGrid = container.querySelector('.kpis-grid');
    const defs = getKPIConfig(pageKey);
    const kpis = this.calculateKPIs(pageKey, data);
    console.log(`KPIs for ${pageKey}:`, kpis);

    defs.forEach(def => {
      if(!(def.key in kpis)) return;
      const tpl = document.getElementById('kpi-template');
      if (!tpl) {
        console.error('KPI template not found');
        return;
      }
      
      const node = tpl.content.cloneNode(true);
      const card = node.querySelector('.kpi-card');

      const icon = card.querySelector('.kpi-icon');
      icon.textContent = def.icon;
      icon.style.background = `${def.color}20`;
      icon.style.color = def.color;

      const valueEl = card.querySelector('.kpi-value');
      const val = kpis[def.key];
      valueEl.textContent = formatNumber(val, def.format);
      if(def.threshold){
        const { warning, critical } = def.threshold;
        if(val >= critical) valueEl.style.color = 'var(--error-color)';
        else if(val >= warning) valueEl.style.color = 'var(--warning-color)';
      }

      card.querySelector('.kpi-label').textContent = def.label;
      kpiGrid.appendChild(node);
    });

    // Charts
    const grid = container.querySelector('.charts-grid');

    if (pageKey === 'fcr') {
      console.log('Rendering FCR charts...');
      const id = `${pageKey}-cases-over-time`;
      grid.appendChild(this.chartWrap('Cases Over Time', id));
      
      // Use Count_numeric if available, otherwise Count
      const valueField = data[0] && 'Count_numeric' in data[0] ? 'Count_numeric' : 'Count';
      console.log(`Using ${valueField} for FCR chart`);
      
      chartManager.createCallsOverTimeChart(id, data, {
        dateField: '__chartDate',
        valueField,
        color: CONFIG.dataSources[pageKey].color
      });
      return;
    }

    if (pageKey === 'outbound') {
      console.log('Rendering outbound charts...');
      console.log('Sample outbound data:', data[0]);
      
      // Chart 1: Outbound calls over time
      const id1 = `${pageKey}-calls-over-time`;
      grid.appendChild(this.chartWrap('Outbound Calls Over Time', id1));
      chartManager.createCallsOverTimeChart(id1, data, {
        dateField: '__chartDate',
        valueField: 'TotalCalls_numeric',
        color: CONFIG.dataSources[pageKey].color
      });

      // Chart 2: Call outcomes
      const id2 = `${pageKey}-outcomes`;
      grid.appendChild(this.chartWrap('Call Outcomes', id2));
      const answered = data.reduce((s, r) => s + (cleanNumber(r.AnsweredCalls_numeric) || 0), 0);
      const missed   = data.reduce((s, r) => s + (cleanNumber(r.MissedCalls_numeric) || 0), 0);
      const vm       = data.reduce((s, r) => s + (cleanNumber(r.VoicemailCalls_numeric) || 0), 0);
      
      console.log('Outbound outcomes:', { answered, missed, vm });
      
      chartManager.createDoughnutChart(id2, data, {
        labels: ['Answered', 'Missed', 'Voicemail'],
        data: [answered, missed, vm]
      });

      // Chart 3: Calls per agent
      const byAgent = {};
      data.forEach(r => {
        const agent = r.Agent || 'Unknown';
        if (agent && agent !== 'Unknown') {
          const calls = cleanNumber(r.TotalCalls_numeric) || 0;
          byAgent[agent] = (byAgent[agent] || 0) + calls;
        }
      });
      
      const sortedAgents = Object.entries(byAgent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      const labels = sortedAgents.map(([agent]) => agent);
      const vals = sortedAgents.map(([, calls]) => calls);
      
      console.log('Agent data:', { byAgent, labels, vals });
      
      if (labels.length > 0) {
        const id3 = `${pageKey}-agent`;
        grid.appendChild(this.chartWrap('Calls per Agent', id3));
        chartManager.createBarChart(id3, data, { 
          labels, 
          data: vals, 
          label: 'Total Calls', 
          multiColor: true 
        });
      }
      return;
    }

    // Inbound - keep exactly the same
    console.log('Rendering inbound charts...');
    const idA = `${pageKey}-calls-over-time`;
    grid.appendChild(this.chartWrap('Inbound Calls Over Time', idA));
    chartManager.createCallsOverTimeChart(idA, data, {
      dateField: '__chartDate',
      color: CONFIG.dataSources[pageKey].color
    });

    const idB = `${pageKey}-status`;
    grid.appendChild(this.chartWrap('Status Distribution', idB));
    chartManager.createStatusChart(idB, data, getFieldMapping(pageKey,'status')[0] || 'Disposition');

    const idC = `${pageKey}-agent`;
    grid.appendChild(this.chartWrap('Top Agents', idC));
    chartManager.createAgentChart(idC, data, getFieldMapping(pageKey,'agent')[0] || 'Agent Name');
  }

  calculateKPIs(pageKey, data) {
    const out = {};
    console.log(`Calculating KPIs for ${pageKey} with ${data.length} rows`);

    if (pageKey === 'inbound') {
      const total = data.length;
      const abandoned = data.filter(r => isAbandoned(r.Disposition || '')).length;

      out.totalCalls  = total;
      out.abandonRate = total > 0 ? (abandoned / total) * 100 : 0;

      const avgHandleFromNumeric = this.avg(data, 'duration_numeric');
      const avgHandleFromRaw     = this.avg(data, 'Talk Time');
      out.avgHandleTime = avgHandleFromNumeric || avgHandleFromRaw || 0;

      const avgWaitFromNumeric = this.avg(data, 'waitTime_numeric');
      const avgWaitFromRaw     = this.avg(data, 'Wait Time');
      out.avgWaitTime = avgWaitFromNumeric || avgWaitFromRaw || 0;
    }

    if (pageKey === 'outbound') {
      const total = data.reduce((s, r) => {
        const calls = cleanNumber(r.TotalCalls_numeric) || cleanNumber(r['Total Calls']) || 0;
        return s + calls;
      }, 0);
      
      const answered = data.reduce((s, r) => {
        const calls = cleanNumber(r.AnsweredCalls_numeric) || cleanNumber(r['Answered Calls']) || 0;
        return s + calls;
      }, 0);
      
      const duration = data.reduce((s, r) => {
        const dur = cleanNumber(r.TotalCallDuration_numeric) || cleanNumber(r['Total Call Duration']) || 0;
        return s + dur;
      }, 0);

      out.totalCalls = total;
      out.connectRate = total > 0 ? (answered / total) * 100 : 0;
      out.avgTalkTime = answered > 0 ? (duration / answered) : 0;
      
      console.log('Outbound KPIs calculated:', out);
    }

    if (pageKey === 'fcr') {
      const totalCases = data.reduce((s, r) => {
        const count = cleanNumber(r.Count_numeric) || cleanNumber(r.Count) || 0;
        return s + count;
      }, 0);
      
      out.totalCases = totalCases;
      console.log('FCR KPIs calculated:', out);
    }

    return out;
  }

  avg(data, field){
    const nums = data.map(r => cleanNumber(r[field])).filter(n => Number.isFinite(n) && n >= 0);
    if(nums.length === 0) return 0;
    return nums.reduce((a,b)=>a+b,0)/nums.length;
  }

  chartWrap(title, id){
    const tpl = document.getElementById('chart-template');
    if (!tpl) {
      console.error('Chart template not found');
      return document.createElement('div');
    }
    
    const node = tpl.content.cloneNode(true);
    node.querySelector('.chart-title').textContent = title;
    node.querySelector('canvas').id = id;
    return node;
  }

  async renderInbound(){ return this.renderPage('inbound','inbound-content'); }
  async renderOutbound(){ return this.renderPage('outbound','outbound-content'); }
  async renderFCR(){ return this.renderPage('fcr','fcr-content'); }
}

export const pageRenderer = new PageRenderer();
export default pageRenderer;