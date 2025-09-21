// Main application module

import { CONFIG } from './config.js';
import {
  showError,
  hideError,
  validateDateRange,
  getDefaultDateRange,
  exportToCsv,
  debounce
} from './utils.js';
import dataLoader from './data-loader.js';
import chartManager from './chart-manager.js';
import pageRenderer from './renderers.js';

// Expose for DevTools debugging
window.CONFIG = CONFIG;
window.dataLoader = dataLoader;
window.pageRenderer = pageRenderer;
window.chartManager = chartManager;

class Dashboard {
  constructor() {
    this.currentPage = 'inbound';
    this.currentFilters = {};
    this.isInitialized = false;

    this.debouncedRender = debounce(async () => {
      await this.renderCurrentPage();
    }, CONFIG.performance.chartUpdateDebounce);
  }

  async init() {
    if (this.isInitialized) return;

    try {
      this.setupEventListeners();
      this.setDefaultDateRange();
      await dataLoader.loadAll();
      await this.renderCurrentPage();
      chartManager.resizeAllCharts(); // ensure initial charts fit

      if (CONFIG.performance.dataRefreshInterval > 0) {
        this.setupAutoRefresh();
      }

      this.setupVisibilityHandling();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      showError('Failed to initialize dashboard. Please refresh the page.');
    }
  }

  setupEventListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) {
          this.navigateToPage(page);
        }
      });
    });

    const applyFiltersBtn = document.getElementById('apply-filters');
    const resetFiltersBtn = document.getElementById('reset-filters');

    if (applyFiltersBtn) {
      applyFiltersBtn.addEventListener('click', () => this.applyFilters());
    }
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => this.resetFilters());
    }

    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');

    if (dateFromInput && dateToInput) {
      const debouncedFilterUpdate = debounce(() => this.applyFilters(), 1000);
      dateFromInput.addEventListener('change', debouncedFilterUpdate);
      dateToInput.addEventListener('change', debouncedFilterUpdate);
    }

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportCurrentData());

    const errorCloseBtn = document.getElementById('error-close');
    if (errorCloseBtn) errorCloseBtn.addEventListener('click', hideError);

    window.addEventListener('popstate', (e) => {
      const page = e.state?.page || 'inbound';
      this.navigateToPage(page, false);
    });

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        chartManager.resizeAllCharts();
      }, 250);
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        this.refreshData();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        this.exportCurrentData();
      }
    });
  }

  /**
 * Navigate to a specific page
 */
async navigateToPage(page, updateHistory = true) {
  if (page === this.currentPage) return;

  // Update navigation state
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  // Show/hide pages
  document.querySelectorAll('.page').forEach(pageEl => {
    pageEl.classList.toggle('active', pageEl.id === `${page}-page`);
  });

  this.currentPage = page;

  // Update browser history + title
  if (updateHistory) {
    const title = `Call Performance Dashboard - ${CONFIG.dataSources[page]?.name || page}`;
    history.pushState({ page }, title, `#${page}`);
    document.title = title;
  }

  // IMPORTANT: Wait one animation frame so the page becomes visible
  await new Promise(resolve => requestAnimationFrame(resolve));

  // Now render and resize
  await this.renderCurrentPage();
  chartManager.resizeAllCharts();
}

/**
 * Render the current page with current filters
 */
async renderCurrentPage() {
  if (!dataLoader.data[this.currentPage]) return;

  try {
    pageRenderer.updateFilters(this.currentFilters);

    switch (this.currentPage) {
      case 'inbound':
        await pageRenderer.renderInbound(this.currentFilters);
        break;
      case 'outbound':
        await pageRenderer.renderOutbound(this.currentFilters);
        break;
      case 'fcr':
        await pageRenderer.renderFCR(this.currentFilters);
        break;
      default:
        console.warn(`Unknown page: ${this.currentPage}`);
    }

    // Ensure charts snap to correct size after render
    chartManager.resizeAllCharts();
  } catch (error) {
    console.error(`Error rendering ${this.currentPage} page:`, error);
    showError(`Failed to render ${this.currentPage} page`);
  }
}


  applyFilters() {
    const dateFrom = document.getElementById('date-from')?.value;
    const dateTo = document.getElementById('date-to')?.value;

    if (dateFrom && dateTo) {
      const validation = validateDateRange(dateFrom, dateTo);
      if (!validation.valid) {
        showError(validation.error);
        return;
      }
    }

    this.currentFilters = {
      startDate: dateFrom || null,
      endDate: dateTo || null
    };

    if (CONFIG.features.filterPersistence) {
      try {
        localStorage.setItem('dashboard_filters', JSON.stringify(this.currentFilters));
      } catch (error) {
        console.warn('Failed to persist filters:', error);
      }
    }

    this.debouncedRender();
  }

  resetFilters() {
    const defaultRange = getDefaultDateRange();
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');

    if (dateFromInput) dateFromInput.value = defaultRange.start;
    if (dateToInput) dateToInput.value = defaultRange.end;

    this.currentFilters = {
      startDate: defaultRange.start,
      endDate: defaultRange.end
    };

    if (CONFIG.features.filterPersistence) {
      try {
        localStorage.removeItem('dashboard_filters');
      } catch (error) {
        console.warn('Failed to clear persisted filters:', error);
      }
    }

    this.debouncedRender();
  }

  setDefaultDateRange() {
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    if (!dateFromInput || !dateToInput) return;

    let defaultRange = getDefaultDateRange();

    if (CONFIG.features.filterPersistence) {
      try {
        const stored = localStorage.getItem('dashboard_filters');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.startDate && parsed.endDate) {
            defaultRange = { start: parsed.startDate, end: parsed.endDate };
          }
        }
      } catch (error) {
        console.warn('Failed to load persisted filters:', error);
      }
    }

    dateFromInput.value = defaultRange.start;
    dateToInput.value = defaultRange.end;

    this.currentFilters = {
      startDate: defaultRange.start,
      endDate: defaultRange.end
    };
  }

  async refreshData() {
    try {
      dataLoader.clear();
      chartManager.destroyAllCharts();
      await dataLoader.loadAll();
      await this.renderCurrentPage();
      chartManager.resizeAllCharts();
    } catch (error) {
      console.error('Failed to refresh data:', error);
      showError('Failed to refresh data. Please try again.');
    }
  }

  exportCurrentData() {
    const data = dataLoader.getData(this.currentPage, this.currentFilters);

    if (!data || data.length === 0) {
      showError('No data to export');
      return;
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${this.currentPage}_data_${timestamp}.csv`;

    exportToCsv(data, filename);
  }

  setupAutoRefresh() {
    setInterval(async () => {
      if (document.hidden) return;
      try {
        console.log('Auto-refreshing data...');
        await this.refreshData();
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, CONFIG.performance.dataRefreshInterval);
  }

  setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isInitialized) {
        setTimeout(() => {
          chartManager.resizeAllCharts();
        }, 100);
      }
    });
  }

  getState() {
    return {
      currentPage: this.currentPage,
      currentFilters: { ...this.currentFilters },
      isInitialized: this.isInitialized,
      dataStatus: Object.keys(CONFIG.dataSources).reduce((status, key) => {
        status[key] = {
          loaded: !!dataLoader.data[key],
          rowCount: dataLoader.data[key]?.length || 0,
          metadata: dataLoader.getMetadata(key)
        };
        return status;
      }, {})
    };
  }

  handleError(error, context = 'Unknown') {
    console.error(`Dashboard error in ${context}:`, error);

    let message = 'An unexpected error occurred.';
    if (error.name === 'NetworkError' || error.message.includes('fetch')) {
      message = 'Network error. Please check your connection and try again.';
    } else if (error.message.includes('CSV') || error.message.includes('parse')) {
      message = 'Data format error. Please check your data files.';
    } else if (error.message.includes('Chart')) {
      message = 'Chart rendering error. Please refresh the page.';
    }

    showError(message);
  }
}

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  dashboard.handleError(event.error, 'Global');
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  dashboard.handleError(event.reason, 'Promise');
});

const dashboard = new Dashboard();
window.dashboard = dashboard;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => dashboard.init());
} else {
  dashboard.init();
}

window.exportToCsv = exportToCsv;
window.chartManager = chartManager;

window.addEventListener('load', () => {
  const hash = window.location.hash.slice(1);
  if (hash && CONFIG.dataSources[hash]) {
    dashboard.navigateToPage(hash, false);
  }
});

export default dashboard;
