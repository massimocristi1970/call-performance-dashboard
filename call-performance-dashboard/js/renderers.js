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
            <h3 class="chart