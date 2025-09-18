// js/renderers.js - Simple fix copying inbound pattern
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, isAbandoned, cleanNumber } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor(){ this.currentFilters = {}; }
  updateFilters(filters) { this.currentFilters = { ...filters }; }

  async renderPage(pageKey, containerId){
    // Get data - use same logic for all pages
    let data = dataLoader.getData(pageKey, this.currentFilters || {});

    const container = document.getElementById(containerId);
    if(!container) return;

    if(!data || data.length===0){
      container.innerHTML = document.getElementById('no-data-template').innerHTML;
      return;
    }

    container.innerHTML = `<div class="kpis-grid"></div><div class="charts-grid"></div>`;

    // KPIs - same for all pages
    const kpiGrid = container.querySelector('.kpis-grid');
    const defs = getKPIConfig(pageKey);
    const kpis = this.calculateKPIs(pageKey, data);

    defs.forEach(def => {
      if(!(def.key in kpis)) return;
      const tpl = document.getElementById('kpi-template');
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

    // Charts - use same template method as inbound for ALL pages
    const grid = container.querySelector('.charts-grid');

    if (pageKey === 'fcr') {
      // Use same template pattern as inbound
      const id = `${pageKey}-cases-over-time`;
      grid.appendChild(this.chartWrap('Cases Over Time', id));
      
      setTimeout(() => {
        const valueField = data[0] && 'Count_numeric' in data[0] ? 'Count_numeric' : 'Count';
        chartManager.createCallsOverTimeChart(id, data, {
          dateField: '__chartDate',
          valueField,
          color: CONFIG.dataSources[pageKey].color
        });
      }, 100);
      return;
    }

    if (pageKey === 'outbound') {
      // Use same template pattern as inbound
      const id1 = `${pageKey}-calls-over-time`;
      grid.appendChild(this.chartWrap('Outbound Calls Over Time', id1));
      
      const id2 = `${pageKey}-outcomes`;
      grid.appendChild(this.chartWrap('Call Outcomes', id2));

      const id3 = `${pageKey}-agent`;
      grid.appendChild(this.chartWrap('Calls per Agent', id3));
      
      setTimeout(() => {
        chartManager.createCallsOverTimeChart(id1, data, {
          dateField: '__chartDate',
          valueField: 'TotalCalls_numeric',
          color: CONFIG.dataSources[pageKey].color
        });

        const answered = data.reduce((s, r) => s + cleanNumber(r.AnsweredCalls_numeric), 0);
        const missed = data.reduce((s, r) => s + cleanNumber(r.MissedCalls_numeric), 0);
        const vm = data.reduce((s, r) => s + cleanNumber(r.VoicemailCalls_numeric), 0);
        
        chartManager.createDoughnutChart(id2, data, {
          labels: ['Answered', 'Missed', 'Voicemail'],
          data: [answered, missed, vm]
        });

        const byAgent = {};
        data.forEach(r => {
          const a = r.Agent || r['Agent'];
          if (!a) return;
          byAgent[a] = (byAgent[a] || 0) + cleanNumber(r.TotalCalls_numeric);
        });
        const labels = Object.keys(byAgent).sort((a, b) => byAgent[b] - byAgent[a]).slice(0, 10);
        const vals = labels.map(l => byAgent[l]);
        
        chartManager.createBarChart(id3, data, { 
          labels, 
          data: vals, 
          label: 'Total Calls', 
          multiColor: true 
        });
      }, 100);
      return;
    }

    // Inbound - keep exactly as is since it works
    const idA = `${pageKey}-calls-over-time`;
    grid.appendChild(this.chartWrap('Inbound Calls Over Time', idA));
    
    const idB = `${pageKey}-status`;
    grid.appendChild(this.chartWrap('Status Distribution', idB));
    
    const idC = `${pageKey}-agent`;
    grid.appendChild(this.chartWrap('Top Agents', idC));

    setTimeout(() => {
      chartManager.createCallsOverTimeChart(idA, data, {
        dateField: '__chartDate',
        color: CONFIG.dataSources[pageKey].color
      });

      chartManager.createStatusChart(idB, data, getFieldMapping(pageKey,'status')[0] || 'Disposition');

      chartManager.createAgentChart(idC, data, getFieldMapping(pageKey,'agent')[0] || 'Agent Name');
    }, 100);
  }

  calculateKPIs(pageKey, data) {
    const out = {};

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
    }

    if (pageKey === 'fcr') {
      const totalCases = data.reduce((s, r) => {
        const count = cleanNumber(r.Count_numeric) || cleanNumber(r.Count) || 0;
        return s + count;
      }, 0);
      
      out.totalCases = totalCases;
    }

    return out;
  }

  avg(data, field){
    const nums = data.map(r => cleanNumber(r[field])).filter(n => Number.isFinite(n) && n >= 0);
    if(nums.length === 0) return 0;
    return nums.reduce((a,b)=>a+b,0)/nums.length;
  }

  // Use the SAME chartWrap method for all pages (copy from working inbound)
  chartWrap(title, id){
    const t = document.getElementById('chart-template');
    const node = t.content.cloneNode(true);
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