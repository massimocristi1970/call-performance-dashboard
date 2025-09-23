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
      // Chart 1: Existing Cases Over Time
      const idA = `${pageKey}-cases-over-time`;
      grid.appendChild(this.chartWrap('Cases Over Time', idA));
      chartManager.createCallsOverTimeChart(idA, data, {
        dateField: '__chartDate',
        valueField: 'Count_numeric',
        color: CONFIG.dataSources[pageKey].color
      });

      // Chart 2: NEW - Call Volume Comparison
      const idB = `${pageKey}-volume-comparison`;
      grid.appendChild(this.chartWrap('Call Volume Comparison: FCR vs Connected Calls', idB));
  
      // Get data from all sources with same date filters
      const fcrData = dataLoader.getData('fcr', this.currentFilters);
      const inboundData = dataLoader.getData('inbound', this.currentFilters);
      const outboundConnectData = dataLoader.getData('outbound_connectrate', this.currentFilters);

      // Calculate totals
      const totalFCR = fcrData.reduce((s, r) => s + cleanNumber(r.Count_numeric), 0);
      const totalInboundConnected = inboundData.filter(r => !isAbandoned(r.Disposition || '')).length;
      const totalOutboundConnected = outboundConnectData.filter(r => r.isConnected).length;

      chartManager.createBarChart(idB, [], {
        labels: ['FCR Cases', 'Connected Inbound', 'Connected Outbound'],
        data: [totalFCR, totalInboundConnected, totalOutboundConnected],
        label: 'Call Volume',
        multiColor: true
      });
  
      return;
    }

    if (pageKey === 'outbound') {
	   // Get data from both sources
       const outboundCallsData = dataLoader.getData('outbound', this.currentFilters);
       const connectRateData = dataLoader.getData('outbound_connectrate', this.currentFilters);

       // Chart 1: Outbound Calls Over Time (use Outbound Calls column)
       const idA = `${pageKey}-calls-over-time`;
       grid.appendChild(this.chartWrap('Outbound Calls Over Time', idA));
       chartManager.createCallsOverTimeChart(idA, outboundCallsData, {
         dateField: '__chartDate',
         valueField: 'OutboundCalls_numeric',  // Changed to use Outbound Calls
         color: CONFIG.dataSources[pageKey].color
       });

       // Chart 2: Call Outcomes (Connected vs Not Connected based on 2:30+ duration)
       const idB = `${pageKey}-outcomes`;
       grid.appendChild(this.chartWrap('Call Outcomes', idB));
       const connected = connectRateData.filter(r => r.isConnected).length;
       const notConnected = connectRateData.length - connected;
       chartManager.createDoughnutChart(idB, connectRateData, {
         labels: ['Connected (2:30+)', 'Not Connected'],
         data: [connected, notConnected]
       });

       // Chart 3: Calls per Agent (use Outbound Calls data)
       const idC = `${pageKey}-agent`;
       grid.appendChild(this.chartWrap('Calls per Agent', idC));
       const byAgent = {};
       outboundCallsData.forEach(r => {
         const a = r.Agent || r['Agent'];
         if (!a) return;
         byAgent[a] = (byAgent[a] || 0) + cleanNumber(r['Outbound Calls']); // Use Outbound Calls column
       });
       const labels = Object.keys(byAgent).sort((a, b) => byAgent[b] - byAgent[a]).slice(0, 10);
       const vals = labels.map(l => byAgent[l]);
       chartManager.createBarChart(idC, outboundCallsData, { 
         labels, 
         data: vals, 
         label: 'Outbound Calls', 
         multiColor: true 
       });
       return;
    }
	
	// Add this after the existing outbound charts (after idC agent chart)
    const idD = `${pageKey}-calls-per-hour-agent`;
    grid.appendChild(this.chartWrap('Average Outbound Calls Per Hour by Agent', idD));

    // Calculate outbound calls per hour by agent using outbound_calls data
    const outboundCallsPerHourByAgent = {};
    outboundCallsData.forEach(r => {
      const agent = r.Agent || r['Agent'] || 'Unknown';
      if (!outboundCallsPerHourByAgent[agent]) {
        outboundCallsPerHourByAgent[agent] = { calls: 0, days: new Set() };
      }
  
      // Use Outbound Calls column
      const dailyCalls = cleanNumber(r['Outbound Calls']);
      outboundCallsPerHourByAgent[agent].calls += dailyCalls;
  
      // Track unique days
      if (r.__chartDate) {
        outboundCallsPerHourByAgent[agent].days.add(r.__chartDate);
      }
    });

    // Calculate average calls per hour (assuming 8 hour work day)
    const outboundAgentAvgData = Object.entries(outboundCallsPerHourByAgent)
      .map(([agent, data]) => ({
        agent,
        avgCallsPerHour: data.days.size > 0 ? data.calls / (data.days.size * 8) : 0 // 8 hours per day
      }))
      .filter(item => item.agent !== 'Unknown' && item.avgCallsPerHour > 0)
      .sort((a, b) => b.avgCallsPerHour - a.avgCallsPerHour)
      .slice(0, 10);

    const outboundAgentLabels = outboundAgentAvgData.map(item => item.agent);
    const outboundAgentValues = outboundAgentAvgData.map(item => Math.round(item.avgCallsPerHour * 100) / 100);

    chartManager.createBarChart(idD, outboundCallsData, {
      labels: outboundAgentLabels,
      data: outboundAgentValues,
      label: 'Avg Calls/Hour',
      multiColor: true
    });

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
    
	// Add this after the existing inbound charts (after idC agent chart)
	const idD = `${pageKey}-calls-per-hour-agent`;
	grid.appendChild(this.chartWrap('Average Calls Per Hour by Agent', idD));

	// Calculate calls per hour by agent
	const callsPerHourByAgent = {};
	data.forEach(r => {
	  const agent = r['Agent Name'] || 'Unknown';
	  if (!callsPerHourByAgent[agent]) {
      callsPerHourByAgent[agent] = { calls: 0, hours: new Set() };
      }
      callsPerHourByAgent[agent].calls += 1;
  
      // Extract hour from date
      if (r.date_parsed) {
        const hour = r.date_parsed.getHours();
        const dateHour = `${r.__chartDate}-${hour}`;
        callsPerHourByAgent[agent].hours.add(dateHour);
      }
    });

    // Calculate average calls per hour and prepare chart data
    const agentAvgData = Object.entries(callsPerHourByAgent)
      .map(([agent, data]) => ({
        agent,
        avgCallsPerHour: data.hours.size > 0 ? data.calls / data.hours.size : 0
      }))
      .filter(item => item.agent !== 'Unknown' && item.avgCallsPerHour > 0)
      .sort((a, b) => b.avgCallsPerHour - a.avgCallsPerHour)
      .slice(0, 10);

    const agentLabels = agentAvgData.map(item => item.agent);
    const agentValues = agentAvgData.map(item => Math.round(item.avgCallsPerHour * 100) / 100);

    chartManager.createBarChart(idD, data, {
      labels: agentLabels,
      data: agentValues,
      label: 'Avg Calls/Hour',
      multiColor: true
    });
	
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

      // NEW: Calculate FCR percentage vs connected calls
      try {
        const inboundData = dataLoader.getData('inbound', this.currentFilters);
        const outboundConnectData = dataLoader.getData('outbound_connectrate', this.currentFilters);

        const totalInboundConnected = inboundData.filter(r => !isAbandoned(r.Disposition || '')).length;
        const totalOutboundConnected = outboundConnectData.filter(r => r.isConnected).length;
        const totalConnectedCalls = totalInboundConnected + totalOutboundConnected;

        out.fcrPercentage = totalConnectedCalls > 0 ? (totalCases / totalConnectedCalls) * 100 : 0;

        console.log('FCR KPIs:', {
          totalCases,
          totalInboundConnected,
          totalOutboundConnected,
          totalConnectedCalls,
          fcrPercentage: out.fcrPercentage.toFixed(1) + '%'
        });
      } catch (error) {
        console.warn('Error calculating FCR percentage:', error);
        out.fcrPercentage = 0;
      }
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
