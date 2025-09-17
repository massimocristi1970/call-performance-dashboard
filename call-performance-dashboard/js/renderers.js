// Page rendering module
import { CONFIG, getKPIConfig, getFieldMapping } from './config.js';
import { formatNumber, findColumn, cleanNumber, isAbandoned, isConnected } from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor() {
    this.currentFilters = {};
  }

  async renderInbound(filters = {}) {
    const data = dataLoader.getData('inbound', filters);
    const container = document.getElementById('inbound-content');
    
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = '<div class="no-data-state"><h3>No Data Available</h3></div>';
      return;
    }

    // Basic KPI calculation
    const totalCalls = data.length;
    
    container.innerHTML = `
      <div class="kpis-grid">
        <div class="kpi-card">
          <div class="kpi-icon" style="background: #3b82f620; color: #3b82f6;">📞</div>
          <div class="kpi-content">
            <div class="kpi-value">${totalCalls}</div>
            <div class="kpi-label">Total Calls</div>
          </div>
        </div>
      </div>
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">Inbound Calls Data</h3>
          </div>
          <div class="chart-container">
            <p>Dashboard loaded successfully with ${totalCalls} records.</p>
          </div>
        </div>
      </div>
    `;
  }

  async renderOutbound(filters = {}) {
    const data = dataLoader.getData('outbound', filters);
    const container = document.getElementById('outbound-content');
    
    if (!container) return;

    const totalCalls = data.length;
    
    container.innerHTML = `
      <div class="kpis-grid">
        <div class="kpi-card">
          <div class="kpi-icon" style="background: #10b98120; color: #10b981;">📞</div>
          <div class="kpi-content">
            <div class="kpi-value">${totalCalls}</div>
            <div class="kpi-label">Total Outbound Calls</div>
          </div>
        </div>
      </div>
      <p>Outbound dashboard loaded with ${totalCalls} records.</p>
    `;
  }

  async renderFCR(filters = {}) {
    const data = dataLoader.getData('fcr', filters);
    const container = document.getElementById('fcr-content');
    
    if (!container) return;

    const totalCases = data.length;
    
    container.innerHTML = `
      <div class="kpis-grid">
        <div class="kpi-card">
          <div class="kpi-icon" style="background: #f59e0b20; color: #f59e0b;">📝</div>
          <div class="kpi-content">
            <div class="kpi-value">${totalCases}</div>
            <div class="kpi-label">Total Cases</div>
          </div>
        </div>
      </div>
      <p>FCR dashboard loaded with ${totalCases} records.</p>
    `;
  }

  updateFilters(filters) {
    this.currentFilters = { ...filters };
  }
}

export const pageRenderer = new PageRenderer();
export default pageRenderer;