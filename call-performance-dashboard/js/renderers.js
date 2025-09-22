// js/renderers.js - Fix outbound + fcr chart calls
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, isAbandoned, cleanNumber } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor(){ this.currentFilters = {}; }
  updateFilters(filters) { this.currentFilters = { ...filters }; }

  async renderPage(pageKey, containerId){
    let data = dataLoader.getData(pageKey, this.currentFilters || {});
    const container = document.getElementById(containerId);
    if(!container) return;

    if(!data || data.length===0){
      container.innerHTML = document.getElementById('no-data-template').innerHTML;
      return;
    }

    container.innerHTML = `<div class="kpis-grid"></div><div class="charts-grid"></div>`;

    // KPIs
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

    // Charts
    const grid = container.querySelector('.charts-grid');

    if (pageKey === 'fcr') {
      const idA = `${pageKey}-cases-over-time`;
      grid.appendChild(this.chartWrap('Cases Over Time', idA));
      chartManager.createCallsOverTimeChart(idA, data, {
        dateField: '__chartDate',
        valueField: 'Count_numeric',
        color: CONFIG.dataSources[pageKey].color
      });
      return;
    }

    if (pageKey === 'outbound') {
      const idA = `${pageKey}-calls-over-time`;
      grid.appendChild(this.chartWrap('Outbound Calls Over Time', idA));
      chartManager.createCallsOverTimeChart(idA, data, {
        dateField: '__chartDate',
        valueField: 'TotalCalls_numeric',
        color: CONFIG.dataSources[pageKey].color
      });

      const idB = `${pageKey}-outcomes`;
      grid.appendChild(this.chartWrap('Call Outcomes', idB));
      const answered = data.reduce((s, r) => s + cleanNumber(r.AnsweredCalls_numeric), 0);
      const missed   = data.reduce((s, r) => s + cleanNumber(r.MissedCalls_numeric), 0);
      const vm       = data.reduce((s, r) => s + cleanNumber(r.VoicemailCalls_numeric), 0);
      chartManager.createDoughnutChart(idB, data, {
		labels: ['Answered', 'Missed', 'Voicemail'],
		data: [answered, missed, vm]
		});

      const idC = `${pageKey}-agent`;
      grid.appendChild(this.chartWrap('Calls per Agent', idC));
      const byAgent = {};
      data.forEach(r => {
        const a = r.Agent || r['Agent'];
        if (!a) return;
        byAgent[a] = (byAgent[a] || 0) + cleanNumber(r.TotalCalls_numeric);
      });
      const labels = Object.keys(byAgent).sort((a, b) => byAgent[b] - byAgent[a]).slice(0, 10);
      const vals   = labels.map(l => byAgent[l]);
      chartManager.createBarChart(idC, data, { labels, data: vals, label: 'Total Calls', multiColor: true });
      return;
    }

    // Inbound
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
	   // Get data from both sources
	   const outboundCallsData = dataLoader.getData('outbound', this.currentFilters);
	   const connectRateData = dataLoader.getData('outbound_connectrate', this.currentFilters);

	   // NEW: Use "Outbound Calls" column instead of "Total Calls"
	   const totalOutboundCalls = outboundCallsData.reduce((s, r) => s + cleanNumber(r['Outbound Calls']), 0);
  
	   // NEW: Calculate connect rate using duration > 2:30 rule
	   const totalAttempts = connectRateData.length;
	   const connectedCalls = connectRateData.filter(r => r.isConnected).length;
	   const actualConnectRate = totalAttempts > 0 ? (connectedCalls / totalAttempts) * 100 : 0;

	   // Keep existing duration calculation for now
	   const duration = outboundCallsData.reduce((s, r) => s + cleanNumber(r.TotalCallDuration_numeric), 0);

	   out.totalCalls = totalOutboundCalls;  // Now using Outbound Calls only
	   out.connectRate = actualConnectRate;  // Now using 2:30+ duration rule
	   out.avgTalkTime = totalOutboundCalls > 0 ? (duration / totalOutboundCalls) : 0;

	   console.log('Outbound KPIs:', {
		 totalOutboundCalls,
		 totalAttempts,
		 connectedCalls,
		 actualConnectRate: actualConnectRate.toFixed(1) + '%'
	   });
	   }

    if (pageKey === 'fcr') {
      const totalCases = data.reduce((s, r) => s + cleanNumber(r.Count_numeric), 0);
      out.totalCases = totalCases;
    }

    return out;
  }

  avg(data, field){
    const nums = data.map(r => cleanNumber(r[field])).filter(n => n >= 0);
    if(nums.length === 0) return 0;
    return nums.reduce((a,b)=>a+b,0)/nums.length;
  }

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
