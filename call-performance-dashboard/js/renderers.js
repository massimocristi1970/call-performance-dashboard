// Page rendering module
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { 
  formatNumber, 
  formatDate, 
  generateId,
  isAbandoned,
  isConnected,
  findColumn,
  cleanNumber,
  weightedAverage,
  groupBy
} from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor() {
    this.currentFilters = {};
  }

  createAgentFCRChart(containerId, data, agentField, resolvedField) {
    const agentStats = {};
    
    data.forEach(row => {
      const agent = row[agentField] || 'Unknown';
      if (!agentStats[agent]) agentStats[agent] = { total: 0, resolved: 0 };
      
      agentStats[agent].total++;
      const resolved = String(row[resolvedField] || '').toLowerCase();
      if (resolved.includes('yes') || resolved.includes('true') || resolved === '1') {
        agentStats[agent].resolved++;
      }
    });

    // Filter agents with at least 5 cases and sort by FCR rate
    const agents = Object.entries(agentStats)
      .filter(([, stats]) => stats.total >= 5)
      .map(([agent, stats]) => ({
        agent,
        fcrRate: stats.total > 0 ? (stats.resolved / stats.total) * 100 : 0,
        total: stats.total
      }))
      .sort((a, b) => b.fcrRate - a.fcrRate)
      .slice(0, 10);

    chartManager.createBarChart(containerId, data, {
      labels: agents.map(a => a.agent),
      data: agents.map(a => a.fcrRate),
      label: 'FCR Rate by Agent',
      valueFormat: 'percentage',
      multiColor: true,
      horizontal: true
    });
  }

  /**
   * Export table data
   */
  exportTableData(sourceKey) {
    const data = dataLoader.getData(sourceKey, this.currentFilters);
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    const filename = `${sourceKey}_data_${new Date().toISOString().split('T')[0]}.csv`;
    
    // Use utility function from utils.js
    window.exportToCsv(data, filename);
  }

  /**
   * Update current filters
   */
  updateFilters(filters) {
    this.currentFilters = { ...filters };
  }
}

// Create and export singleton instance
export const pageRenderer = new PageRenderer();
export default pageRenderer;

  /**
   * Render inbound calls page
   */
  async renderInbound(filters = {}) {
    const data = dataLoader.getData('inbound', filters);
    const container = document.getElementById('inbound-content');
    
    if (!container) return;

    if (data.length === 0) {
      this.renderNoData(container);
      return;
    }

    // Get field mappings
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    const dateField = findColumn(headers, getFieldMapping('inbound', 'date'));
    const agentField = findColumn(headers, getFieldMapping('inbound', 'agent'));
    const statusField = findColumn(headers, getFieldMapping('inbound', 'status'));
    const durationField = findColumn(headers, getFieldMapping('inbound', 'duration'));
    const countField = findColumn(headers, getFieldMapping('inbound', 'count'));
    const waitTimeField = findColumn(headers, getFieldMapping('inbound', 'waitTime'));

    // Calculate KPIs
    const kpis = this.calculateInboundKPIs(data, {
      statusField,
      durationField,
      countField,
      waitTimeField
    });

    // Render content
    container.innerHTML = `
      <div class="kpis-grid" id="inbound-kpis"></div>
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📈 Calls Over Time</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('inbound-timeline', 'inbound_calls_timeline.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="inbound-timeline" class="chart-canvas"></canvas>
          </div>
        </div>
        
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📊 Call Status Distribution</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('inbound-status', 'inbound_status.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="inbound-status" class="chart-canvas"></canvas>
          </div>
        </div>

        ${agentField ? `
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">👥 Top Agents by Call Volume</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('inbound-agents', 'inbound_agents.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="inbound-agents" class="chart-canvas"></canvas>
          </div>
        </div>` : ''}

        ${durationField ? `
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">⏱️ Handle Time Distribution</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('inbound-duration', 'handle_time.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="inbound-duration" class="chart-canvas"></canvas>
          </div>
        </div>` : ''}
      </div>

      <div class="table-container">
        <div class="table-header">
          <h3 class="table-title">📋 Recent Inbound Calls</h3>
          <button class="btn-secondary" onclick="this.exportTableData('inbound')">
            <span class="btn-icon">📊</span>
            Export Data
          </button>
        </div>
        <div class="table-wrapper">
          <table class="data-table" id="inbound-table"></table>
        </div>
      </div>
    `;

    // Render KPIs
    this.renderKPIs('inbound-kpis', kpis, 'inbound');

    // Create charts
    if (dateField) {
      chartManager.createCallsOverTimeChart('inbound-timeline', data, {
        dateField,
        label: 'Inbound Calls',
        color: CONFIG.dataSources.inbound.color
      });
    }

    if (statusField) {
      chartManager.createStatusChart('inbound-status', data, statusField, {
        label: 'Call Status'
      });
    }

    if (agentField) {
      chartManager.createAgentChart('inbound-agents', data, agentField, {
        topN: 10,
        label: 'Calls'
      });
    }

    if (durationField) {
      chartManager.createDurationChart('inbound-duration', data, durationField, {
        bins: 8,
        label: 'Handle Time Distribution'
      });
    }

    // Render data table
    this.renderDataTable('inbound-table', data.slice(0, 100)); // Show first 100 rows
  }

  /**
   * Render outbound calls page
   */
  async renderOutbound(filters = {}) {
    const data = dataLoader.getData('outbound', filters);
    const container = document.getElementById('outbound-content');
    
    if (!container) return;

    if (data.length === 0) {
      this.renderNoData(container);
      return;
    }

    // Get field mappings
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    const dateField = findColumn(headers, getFieldMapping('outbound', 'date'));
    const agentField = findColumn(headers, getFieldMapping('outbound', 'agent'));
    const statusField = findColumn(headers, getFieldMapping('outbound', 'status'));
    const durationField = findColumn(headers, getFieldMapping('outbound', 'duration'));
    const campaignField = findColumn(headers, getFieldMapping('outbound', 'campaign'));
    const countField = findColumn(headers, getFieldMapping('outbound', 'count'));

    // Calculate KPIs
    const kpis = this.calculateOutboundKPIs(data, {
      statusField,
      durationField,
      countField,
      campaignField
    });

    // Render content
    container.innerHTML = `
      <div class="kpis-grid" id="outbound-kpis"></div>
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📈 Outbound Calls Over Time</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('outbound-timeline', 'outbound_calls_timeline.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="outbound-timeline" class="chart-canvas"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📊 Connect Rate by Status</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('outbound-status', 'outbound_status.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="outbound-status" class="chart-canvas"></canvas>
          </div>
        </div>

        ${campaignField ? `
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📋 Performance by Campaign</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('outbound-campaigns', 'campaign_performance.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="outbound-campaigns" class="chart-canvas"></canvas>
          </div>
        </div>` : ''}

        ${agentField ? `
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">👥 Top Performing Agents</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('outbound-agents', 'outbound_agents.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="outbound-agents" class="chart-canvas"></canvas>
          </div>
        </div>` : ''}
      </div>

      <div class="table-container">
        <div class="table-header">
          <h3 class="table-title">📋 Recent Outbound Calls</h3>
          <button class="btn-secondary" onclick="this.exportTableData('outbound')">
            <span class="btn-icon">📊</span>
            Export Data
          </button>
        </div>
        <div class="table-wrapper">
          <table class="data-table" id="outbound-table"></table>
        </div>
      </div>
    `;

    // Render KPIs
    this.renderKPIs('outbound-kpis', kpis, 'outbound');

    // Create charts
    if (dateField) {
      chartManager.createCallsOverTimeChart('outbound-timeline', data, {
        dateField,
        label: 'Outbound Calls',
        color: CONFIG.dataSources.outbound.color
      });
    }

    if (statusField) {
      chartManager.createStatusChart('outbound-status', data, statusField);
    }

    if (campaignField) {
      chartManager.createBarChart('outbound-campaigns', data, {
        ...this.getCampaignChartData(data, campaignField),
        label: 'Calls by Campaign',
        multiColor: true
      });
    }

    if (agentField) {
      chartManager.createAgentChart('outbound-agents', data, agentField, {
        topN: 10,
        label: 'Calls'
      });
    }

    // Render data table
    this.renderDataTable('outbound-table', data.slice(0, 100));
  }

  /**
   * Render FCR page
   */
  async renderFCR(filters = {}) {
    const data = dataLoader.getData('fcr', filters);
    const container = document.getElementById('fcr-content');
    
    if (!container) return;

    if (data.length === 0) {
      this.renderNoData(container);
      return;
    }

    // Get field mappings
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    const dateField = findColumn(headers, getFieldMapping('fcr', 'date'));
    const agentField = findColumn(headers, getFieldMapping('fcr', 'agent'));
    const resolvedField = findColumn(headers, getFieldMapping('fcr', 'resolved'));
    const categoryField = findColumn(headers, getFieldMapping('fcr', 'category'));
    const countField = findColumn(headers, getFieldMapping('fcr', 'count'));

    // Calculate KPIs
    const kpis = this.calculateFCRKPIs(data, {
      resolvedField,
      countField,
      categoryField
    });

    // Render content
    container.innerHTML = `
      <div class="kpis-grid" id="fcr-kpis"></div>
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📈 FCR Trend Over Time</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('fcr-timeline', 'fcr_trend.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="fcr-timeline" class="chart-canvas"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">✅ Resolution Status</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('fcr-resolution', 'resolution_status.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="fcr-resolution" class="chart-canvas"></canvas>
          </div>
        </div>

        ${categoryField ? `
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">📂 FCR by Category</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('fcr-categories', 'fcr_by_category.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="fcr-categories" class="chart-canvas"></canvas>
          </div>
        </div>` : ''}

        ${agentField ? `
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">👥 Agent FCR Performance</h3>
            <div class="chart-actions">
              <button class="chart-action" onclick="chartManager.downloadChart('fcr-agents', 'agent_fcr.png')" title="Download">
                <span>💾</span>
              </button>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="fcr-agents" class="chart-canvas"></canvas>
          </div>
        </div>` : ''}
      </div>

      <div class="table-container">
        <div class="table-header">
          <h3 class="table-title">📋 Recent Cases</h3>
          <button class="btn-secondary" onclick="this.exportTableData('fcr')">
            <span class="btn-icon">📊</span>
            Export Data
          </button>
        </div>
        <div class="table-wrapper">
          <table class="data-table" id="fcr-table"></table>
        </div>
      </div>
    `;

    // Render KPIs
    this.renderKPIs('fcr-kpis', kpis, 'fcr');

    // Create charts
    if (dateField && resolvedField) {
      this.createFCRTrendChart('fcr-timeline', data, dateField, resolvedField);
    }

    if (resolvedField) {
      this.createResolutionChart('fcr-resolution', data, resolvedField);
    }

    if (categoryField && resolvedField) {
      this.createCategoryFCRChart('fcr-categories', data, categoryField, resolvedField);
    }

    if (agentField && resolvedField) {
      this.createAgentFCRChart('fcr-agents', data, agentField, resolvedField);
    }

    // Render data table
    this.renderDataTable('fcr-table', data.slice(0, 100));
  }

  /**
   * Calculate inbound KPIs
   */
  calculateInboundKPIs(data, fields) {
    const { statusField, durationField, countField, waitTimeField } = fields;
    
    // Total calls
    const totalCalls = countField 
      ? data.reduce((sum, row) => sum + cleanNumber(row[countField]), 0)
      : data.length;

    // Abandoned calls
    let abandonedCalls = 0;
    if (statusField) {
      data.forEach(row => {
        const weight = countField ? cleanNumber(row[countField]) : 1;
        if (isAbandoned(row[statusField])) {
          abandonedCalls += weight;
        }
      });
    }

    const abandonRate = totalCalls > 0 ? (abandonedCalls / totalCalls) * 100 : 0;

    // Average handle time
    let avgHandleTime = 0;
    if (durationField) {
      avgHandleTime = weightedAverage(data, durationField, countField);
    }

    // Average wait time
    let avgWaitTime = 0;
    if (waitTimeField) {
      avgWaitTime = weightedAverage(data, waitTimeField, countField);
    }

    return [
      { key: 'totalCalls', value: totalCalls, format: 'number' },
      { key: 'abandonRate', value: abandonRate, format: 'percentage', threshold: { warning: 10, critical: 20 } },
      { key: 'avgHandleTime', value: avgHandleTime, format: 'duration' },
      { key: 'avgWaitTime', value: avgWaitTime, format: 'duration', threshold: { warning: 120, critical: 300 } }
    ];
  }

  /**
   * Calculate outbound KPIs
   */
  calculateOutboundKPIs(data, fields) {
    const { statusField, durationField, countField, campaignField } = fields;
    
    // Total calls
    const totalCalls = countField 
      ? data.reduce((sum, row) => sum + cleanNumber(row[countField]), 0)
      : data.length;

    // Connected calls
    let connectedCalls = 0;
    if (statusField) {
      data.forEach(row => {
        const weight = countField ? cleanNumber(row[countField]) : 1;
        if (isConnected(row[statusField])) {
          connectedCalls += weight;
        }
      });
    }

    const connectRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;

    // Average talk time
    let avgTalkTime = 0;
    if (durationField) {
      avgTalkTime = weightedAverage(data, durationField, countField);
    }

    // Campaign count
    const campaignCount = campaignField 
      ? new Set(data.map(row => row[campaignField]).filter(c => c)).size 
      : 0;

    return [
      { key: 'totalCalls', value: totalCalls, format: 'number' },
      { key: 'connectRate', value: connectRate, format: 'percentage', threshold: { warning: 15, critical: 10 } },
      { key: 'avgTalkTime', value: avgTalkTime, format: 'duration' },
      { key: 'campaignCount', value: campaignCount, format: 'number' }
    ];
  }

  /**
   * Calculate FCR KPIs
   */
  calculateFCRKPIs(data, fields) {
    const { resolvedField, countField, categoryField } = fields;
    
    // Total cases
    const totalCases = countField 
      ? data.reduce((sum, row) => sum + cleanNumber(row[countField]), 0)
      : data.length;

    // Resolved cases
    let resolvedCases = 0;
    if (resolvedField) {
      data.forEach(row => {
        const weight = countField ? cleanNumber(row[countField]) : 1;
        const resolved = String(row[resolvedField] || '').toLowerCase();
        if (resolved.includes('yes') || resolved.includes('true') || resolved === '1') {
          resolvedCases += weight;
        }
      });
    }

    const fcrRate = totalCases > 0 ? (resolvedCases / totalCases) * 100 : 0;

    // Average resolution time (placeholder - would need actual resolution time field)
    const avgResolutionTime = 0; // TODO: Calculate if resolution time field is available

    // Escalation rate (inverse of FCR rate as approximation)
    const escalationRate = totalCases > 0 ? ((totalCases - resolvedCases) / totalCases) * 100 : 0;

    return [
      { key: 'totalCases', value: totalCases, format: 'number' },
      { key: 'fcrRate', value: fcrRate, format: 'percentage', threshold: { warning: 70, critical: 60 } },
      { key: 'avgResolutionTime', value: avgResolutionTime, format: 'duration' },
      { key: 'escalationRate', value: escalationRate, format: 'percentage', threshold: { warning: 15, critical: 25 } }
    ];
  }

  /**
   * Render KPI cards
   */
  renderKPIs(containerId, kpis, dataSource) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const kpiConfig = getKPIConfig(dataSource);
    
    container.innerHTML = kpis.map((kpi, index) => {
      const config = kpiConfig[index];
      if (!config) return '';

      const threshold = kpi.threshold || config.threshold;
      let statusClass = '';
      
      if (threshold && kpi.format === 'percentage') {
        if (config.key === 'abandonRate' || config.key === 'escalationRate') {
          // Higher is worse
          if (kpi.value >= threshold.critical) statusClass = 'negative';
          else if (kpi.value >= threshold.warning) statusClass = 'warning';
          else statusClass = 'positive';
        } else {
          // Higher is better
          if (kpi.value >= threshold.warning) statusClass = 'positive';
          else if (kpi.value >= threshold.critical) statusClass = 'warning';
          else statusClass = 'negative';
        }
      }

      return `
        <div class="kpi-card">
          <div class="kpi-icon" style="background: ${config.color}20; color: ${config.color};">
            ${config.icon}
          </div>
          <div class="kpi-content">
            <div class="kpi-value" id="${config.key}-value">0</div>
            <div class="kpi-label">${config.label}</div>
            ${statusClass ? `<div class="kpi-change ${statusClass}">●</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Animate KPI values
    kpis.forEach((kpi, index) => {
      const config = kpiConfig[index];
      if (config) {
        const element = document.getElementById(`${config.key}-value`);
        if (element) {
          chartManager.animateValue(element, 0, kpi.value, 1500, kpi.format);
        }
      }
    });
  }

  /**
   * Render no data state
   */
  renderNoData(container) {
    const template = document.getElementById('no-data-template');
    if (template) {
      container.innerHTML = template.innerHTML;
    } else {
      container.innerHTML = `
        <div class="no-data-state">
          <div class="no-data-icon">📊</div>
          <h3>No Data Available</h3>
          <p>There's no data to display for the selected time period.</p>
          <button class="btn-primary" onclick="location.reload()">Refresh Data</button>
        </div>
      `;
    }
  }

  /**
   * Render data table
   */
  renderDataTable(tableId, data, maxColumns = 8) {
    const table = document.getElementById(tableId);
    if (!table || !data || data.length === 0) return;

    const headers = Object.keys(data[0]).slice(0, maxColumns);
    
    const thead = `
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
    `;
    
    const tbody = `
      <tbody>
        ${data.slice(0, 50).map(row => 
          `<tr>${headers.map(h => {
            const value = row[h];
            const formatted = this.formatTableCell(value, h);
            return `<td>${formatted}</td>`;
          }).join('')}</tr>`
        ).join('')}
      </tbody>
    `;
    
    table.innerHTML = thead + tbody;
  }

  /**
   * Format table cell value
   */
  formatTableCell(value, header) {
    if (value === null || value === undefined || value === '') return '-';
    
    const str = String(value);
    const headerLower = header.toLowerCase();
    
    // Format dates
    if (headerLower.includes('date') || headerLower.includes('time')) {
      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        return formatDate(date, 'display');
      }
    }
    
    // Format durations (if looks like seconds)
    if ((headerLower.includes('duration') || headerLower.includes('time')) && !isNaN(str)) {
      const num = parseFloat(str);
      if (num > 0 && num < 86400) { // Less than 24 hours in seconds
        return formatNumber(num, 'duration');
      }
    }
    
    // Format percentages
    if (headerLower.includes('rate') || headerLower.includes('percent')) {
      const num = parseFloat(str);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        return formatNumber(num, 'percentage');
      }
    }
    
    // Truncate long text
    if (str.length > 50) {
      return str.substring(0, 47) + '...';
    }
    
    return str;
  }

  /**
   * Helper methods for specific charts
   */
  getCampaignChartData(data, campaignField) {
    const grouped = groupBy(data, campaignField);
    const entries = Object.entries(grouped)
      .map(([campaign, rows]) => ({ campaign, count: rows.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      labels: entries.map(e => e.campaign),
      data: entries.map(e => e.count)
    };
  }

  createFCRTrendChart(containerId, data, dateField, resolvedField) {
    // Group by month and calculate FCR rate for each month
    const monthly = {};
    
    data.forEach(row => {
      const date = new Date(row[dateField]);
      if (isNaN(date.getTime())) return;
      
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[key]) monthly[key] = { total: 0, resolved: 0 };
      
      monthly[key].total++;
      const resolved = String(row[resolvedField] || '').toLowerCase();
      if (resolved.includes('yes') || resolved.includes('true') || resolved === '1') {
        monthly[key].resolved++;
      }
    });

    const sortedKeys = Object.keys(monthly).sort();
    const labels = sortedKeys.map(key => {
      const date = new Date(key + '-01');
      return formatDate(date, 'chart');
    });
    const fcrRates = sortedKeys.map(key => {
      const { total, resolved } = monthly[key];
      return total > 0 ? (resolved / total) * 100 : 0;
    });

    chartManager.createLineChart(containerId, data, {
      labels,
      data: fcrRates,
      label: 'FCR Rate',
      color: CONFIG.dataSources.fcr.color,
      valueFormat: 'percentage'
    });
  }

  createResolutionChart(containerId, data, resolvedField) {
    const resolved = data.filter(row => {
      const val = String(row[resolvedField] || '').toLowerCase();
      return val.includes('yes') || val.includes('true') || val === '1';
    }).length;
    
    const notResolved = data.length - resolved;
    
    chartManager.createDoughnutChart(containerId, data, {
      labels: ['Resolved', 'Not Resolved'],
      data: [resolved, notResolved]
    });
  }

  createCategoryFCRChart(containerId, data, categoryField, resolvedField) {
    const categoryStats = {};
    
    data.forEach(row => {
      const category = row[categoryField] || 'Unknown';
      if (!categoryStats[category]) categoryStats[category] = { total: 0, resolved: 0 };
      
      categoryStats[category].total++;
      const resolved = String(row[resolvedField] || '').toLowerCase();
      if (resolved.includes('yes') || resolved.includes('true') || resolved === '1') {
        categoryStats[category].resolved++;
      }
    });

    const categories = Object.keys(categoryStats).sort();
    const fcrRates = categories.map(cat => {
      const { total, resolved } = categoryStats[cat];
      return total > 0 ? (resolved / total) * 100 : 0;
    });

    chartManager.createBarChart(containerId, data, {
      labels: categories,
      data: fcrRates,
      label: 'FCR Rate by Category',
      valueFormat: 'percentage',
      multiColor: true
    });
  }

  createAgentFCRChart(containerId, data, agentField, resolvedField) {
    const agentStats = {};
    
    data.forEach(row => {
      const agent = row[agentField] || 'Unknown';
      if (!agentStats[agent]) agentStats[agent] = { total: 0, resolved: 0 };
      
      agentStats[agent].total++;
      const resolved = String(row[resolvedField] || '').toLowerCase();
      if (resolved.includes('yes') || resolved.includes('true') || resolved === '1') {
        agentStats[agent].resolved++;
      }
    });

    // Filter agents with at least 5 cases and sort by FCR rate
    const agents = Object.entries(agentStats)
      .filter(([, stats]) => stats.total >= 5)
      .map(([agent, stats]) => ({
        agent,
        fcrRate: stats.total > 0 ? (stats.resolved / stats.total) * 100 : 0,
        total: stats.total
      }))
      .sort((a, b) => b.fcrRate - a.fcrRate)
      .slice(0, 10);

    chartManager.createBarChart(containerId, data, {
      labels: agents.map(a => a.agent),
      data: agents.map(a => a.fcrRate),
      label: 'FCR Rate by Agent',
      valueFormat: 'percentage',
      multiColor: true,
      horizontal: true
    });
  }

  /**
   * Export table data
   */
  exportTableData(sourceKey) {
    const data = dataLoader.getData(sourceKey, this.currentFilters);
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    const filename = `${sourceKey}_data_${new Date().toISOString().split('T')[0]}.csv`;
    
    // Use utility function from utils.js
    window.exportToCsv(data, filename);
  }

  /**
   * Update current filters
   */
  updateFilters(filters) {
    this.currentFilters = { ...filters };
  }
}

// Create and export singleton instance
export const pageRenderer = new PageRenderer();
export default pageRenderer;