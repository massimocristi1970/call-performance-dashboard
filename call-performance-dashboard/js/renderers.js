// js/renderers.js
import { dataLoader } from './data-loader.js';
import chartManager from './chart-manager.js';

class PageRenderer {
  constructor() {
    this.currentFilters = {};
  }

  updateFilters(filters) {
    this.currentFilters = filters || {};
  }

  // ---------------- INBOUND ----------------
  async renderInbound(filters) {
    const data = dataLoader.getData('inbound', filters);
    if (!data || data.length === 0) return;

    // Inbound Calls Over Time
    chartManager.createCallsOverTimeChart('inbound-calls-over-time', data, {
      dateField: 'date_parsed'
    });

    // Status doughnut
    chartManager.createStatusChart('inbound-status', data);

    // Calls per agent
    chartManager.createAgentChart('inbound-agent', data);
  }

  // ---------------- OUTBOUND ----------------
  async renderOutbound(filters) {
    const data = dataLoader.getData('outbound', filters);
    if (!data || data.length === 0) return;

    // Outbound Calls Over Time
    chartManager.createCallsOverTimeChart('outbound-calls-over-time', data, {
      dateField: 'date_parsed'
    });

    // Outcomes doughnut
    chartManager.createDoughnutChart('outbound-outcomes', data, {
      labelField: 'Outcome',
      valueField: 'TotalCalls_numeric',
      title: 'Outbound Call Outcomes'
    });

    // Calls per agent
    chartManager.createBarChart('outbound-agent', data, {
      groupBy: 'Agent',
      valueField: 'TotalCalls_numeric',
      label: 'Calls per Agent'
    });
  }

  // ---------------- FCR ----------------
  async renderFCR(filters) {
    const data = dataLoader.getData('fcr', filters);
    if (!data || data.length === 0) return;

    // FCR cases over time
    chartManager.createCallsOverTimeChart('fcr-cases-over-time', data, {
      dateField: 'date_parsed'
    });
  }
}

const pageRenderer = new PageRenderer();
export default pageRenderer;
export { pageRenderer };
