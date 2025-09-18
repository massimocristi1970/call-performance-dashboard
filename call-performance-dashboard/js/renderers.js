// js/renderers.js
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, isAbandoned, cleanNumber } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor(){ this.currentFilters = {}; }
  updateFilters(filters) { this.currentFilters = { ...filters }; }

  async renderPage(pageKey, containerId){
    // Try with filters first
    // Use filters for inbound; drop date filters for outbound/fcr so they don't go blank
	let filters = this.currentFilters || {};
	if (pageKey === 'outbound' || pageKey === 'fcr') {
	const { startDate, endDate, ...rest } = filters;
	filters = rest; // remove date range for these tabs
	}

	let data = dataLoader.getData(pageKey, filters);

	// Safety fallback: if something still zeroes it out, show unfiltered data
	if ((!data || data.length === 0) && (pageKey === 'outbound' || pageKey === 'fcr')) {
		data = dataLoader.getData(pageKey, {});
	}

    // If Outbound/FCR got wiped by a tight date range, retry unfiltered so the page isn’t blank
    if ((!data || data.length === 0) && (pageKey === 'outbound' || pageKey === 'fcr')) {
      data = dataLoader.getData(pageKey, {});
    }

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
      const id = `${pageKey}-cases-over-time`;
      grid.appendChild(this.chartWrap('Cases Over Time', id));
      const valueField = ('Count_numeric' in data[0]) ? 'Count_numeric' : 'Count';
      chartManager.createCallsOverTimeChart(id, data, {
        dateField: '__chartDate',
        valueField,
        color: CONFIG.dataSources[pageKey].color
      });
      return;
    }

    if (pageKey === 'outbound') {
      const id1 = `${pageKey}-calls-over-time`;
      grid.appendChild(this.chartWrap('Outbound Calls Over Time', id1));
      chartManager.createCallsOverTimeChart(id1, data, {
        dateField: '__chartDate',
        valueField: 'TotalCalls_numeric',
        color: CONFIG.dataSources[pageKey].color
      });

      const id2 = `${pageKey}-outcomes`;
      grid.appendChild(this.chartWrap('Call Outcomes', id2));
      const answered = data.reduce((s, r) => s + cleanNumber(r.AnsweredCalls_numeric), 0);
      const missed   = data.reduce((s, r) => s + cleanNumber(r.MissedCalls_numeric), 0);
      const vm       = data.reduce((s, r) => s + cleanNumber(r.VoicemailCalls_numeric), 0);
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
      const vals   = labels.map(l => byAgent[l]);
      const id3 = `${pageKey}-agent`;
      grid.appendChild(this.chartWrap('Calls per Agent', id3));
      chartManager.createBarChart(id3, data, { labels, data: vals, label: 'Total Calls', multiColor: true });
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
      const total    = data.reduce((s, r) =>
        s + (Number.isFinite(r.TotalCalls_numeric) ? r.TotalCalls_numeric : cleanNumber(r['Total Calls'])), 0);
      const answered = data.reduce((s, r) =>
        s + (Number.isFinite(r.AnsweredCalls_numeric) ? r.AnsweredCalls_numeric : cleanNumber(r['Answered Calls'])), 0);
      const duration = data.reduce((s, r) =>
        s + (Number.isFinite(r.TotalCallDuration_numeric) ? r.TotalCallDuration_numeric : cleanNumber(r['Total Call Duration'])), 0);

      out.totalCalls  = total;
      out.connectRate = total > 0 ? (answered / total) * 100 : 0;
      out.avgTalkTime = total > 0 ? (duration / total) : 0;
    }

    if (pageKey === 'fcr') {
      const totalCases = data.reduce((s, r) =>
        s + (Number.isFinite(r.Count_numeric) ? r.Count_numeric : cleanNumber(r['Count'])), 0);
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
