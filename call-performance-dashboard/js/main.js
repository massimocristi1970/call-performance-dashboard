// Main application module
// js/main.js
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


class Dashboard {
  constructor() {
    this.currentPage = 'inbound';
    this.currentFilters = {};
    this.isInitialized = false;
    
    // Debounced render function to avoid excessive updates
    this.debouncedRender = debounce(() => {
      this.renderCurrentPage();
    }, CONFIG.performance.chartUpdateDebounce);
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Set up event listeners
      this.setupEventListeners();
      
      // Set default date range
      this.setDefaultDateRange();
      
      // Load all data
      await dataLoader.loadAll();
      
      // Render initial page
      await this.renderCurrentPage();
      
      // Set up auto-refresh if enabled
      if (CONFIG.performance.dataRefreshInterval > 0) {
        this.setupAutoRefresh();
      }
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      showError('Failed to initialize dashboard. Please refresh the page.');
    }
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners() {
    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) {
          this.navigateToPage(page);
        }
      });
    });

    // Filter controls
    const applyFiltersBtn = document.getElementById('apply-filters');
    const resetFiltersBtn = document.getElementById('reset-filters');
    
    if (applyFiltersBtn) {
      applyFiltersBtn.addEventListener('click', () => {
        this.applyFilters();
      });
    }

    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }

    // Date inputs - apply filters on change with debounce
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    
    if (dateFromInput && dateToInput) {
      const debouncedFilterUpdate = debounce(() => {
        this.applyFilters();
      }, 1000);

      dateFromInput.addEventListener('change', debouncedFilterUpdate);
      dateToInput.addEventListener('change', debouncedFilterUpdate);
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshData();
      });
    }

    // Export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportCurrentData();
      });
    }

    // Error close button
    const errorCloseBtn = document.getElementById('error-close');
    if (errorCloseBtn) {
      errorCloseBtn.addEventListener('click', hideError);
    }

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      const page = e.state?.page || 'inbound';
      this.navigateToPage(page, false);
    });

    // Handle window resize for charts
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        chartManager.resizeAllCharts();
      }, 250);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + R for refresh
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        this.refreshData();
      }
      
      // Ctrl/Cmd + E for export
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

    // Update browser history
    if (updateHistory) {
      const title = `Call Performance Dashboard - ${CONFIG.dataSources[page]?.name || page}`;
      history.pushState({ page }, title, `#${page}`);
      document.title = title;
    }

    // Render the page
    await this.renderCurrentPage();
  }

  /**
   * Render the current page with current filters
   */
  async renderCurrentPage() {
    if (!this.isInitialized && !dataLoader.data[this.currentPage]) return;

    try {
      // Update filters in renderer
      pageRenderer.updateFilters(this.currentFilters);

      // Render based on current page
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
    } catch (error) {
      console.error(`Error rendering ${this.currentPage} page:`, error);
      showError(`Failed to render ${this.currentPage} page`);
    }
  }

  /**
   * Apply current filter values
   */
  applyFilters() {
    const dateFrom = document.getElementById('date-from')?.value;
    const dateTo = document.getElementById('date-to')?.value;

    // Validate date range
    if (dateFrom && dateTo) {
      const validation = validateDateRange(dateFrom, dateTo);
      if (!validation.valid) {
        showError(validation.error);
        return;
      }
    }

    // Update current filters
    this.currentFilters = {
      startDate: dateFrom || null,
      endDate: dateTo || null
    };

    // Store filters in localStorage if feature is enabled
    if (CONFIG.features.filterPersistence) {
      try {
        localStorage.setItem('dashboard_filters', JSON.stringify(this.currentFilters));
      } catch (error) {
        console.warn('Failed to persist filters:', error);
      }
    }

    // Re-render current page
    this.debouncedRender();
  }

  /**
   * Reset filters to defaults
   */
  resetFilters() {
    const defaultRange = getDefaultDateRange();
    
    // Reset form inputs
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    
    if (dateFromInput) dateFromInput.value = defaultRange.start;
    if (dateToInput) dateToInput.value = defaultRange.end;

    // Reset filters object
    this.currentFilters = {
      startDate: defaultRange.start,
      endDate: defaultRange.end
    };

    // Clear persisted filters
    if (CONFIG.features.filterPersistence) {
      try {
        localStorage.removeItem('dashboard_filters');
      } catch (error) {
        console.warn('Failed to clear persisted filters:', error);
      }
    }

    // Re-render
    this.debouncedRender();
  }

  /**
   * Set default date range in inputs
   */
  setDefaultDateRange() {
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    
    if (!dateFromInput || !dateToInput) return;

    // Try to load persisted filters first
    let defaultRange = getDefaultDateRange();
    
    if (CONFIG.features.filterPersistence) {
      try {
        const stored = localStorage.getItem('dashboard_filters');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.startDate && parsed.endDate) {
            defaultRange = {
              start: parsed.startDate,
              end: parsed.endDate
            };
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

  /**
   * Refresh all data
   */
  async refreshData() {
    try {
      // Clear existing data
      dataLoader.clear();
      
      // Destroy all charts to free memory
      chartManager.destroyAllCharts();
      
      // Reload all data
      await dataLoader.loadAll();
      
      // Re-render current page
      await this.renderCurrentPage();
      
    } catch (error) {
      console.error('Failed to refresh data:', error);
      showError('Failed to refresh data. Please try again.');
    }
  }

  /**
   * Export current page data
   */
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

  /**
   * Setup auto-refresh functionality
   */
  setupAutoRefresh() {
    setInterval(async () => {
      if (document.hidden) return; // Don't refresh when tab is not visible
      
      try {
        console.log('Auto-refreshing data...');
        await this.refreshData();
      } catch (error) {
        console.error('Auto-refresh failed:', error);
        // Don't show error for auto-refresh failures to avoid spam
      }
    }, CONFIG.performance.dataRefreshInterval);
  }

  /**
   * Handle page visibility changes
   */
  setupVisibilityHandling() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isInitialized) {
        // Page became visible, refresh charts in case they got corrupted
        setTimeout(() => {
          chartManager.resizeAllCharts();
        }, 100);
      }
    });
  }

  /**
   * Get current dashboard state
   */
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

  /**
   * Handle errors globally
   */
  handleError(error, context = 'Unknown') {
    console.error(`Dashboard error in ${context}:`, error);
    
    // Show user-friendly error message
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

// Create dashboard instance
const dashboard = new Dashboard();

// Make dashboard available globally for debugging
window.dashboard = dashboard;

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    dashboard.init();
  });
} else {
  dashboard.init();
}

// Make utility functions available globally for onclick handlers
window.exportToCsv = exportToCsv;
window.chartManager = chartManager;

// Handle initial page from URL hash
window.addEventListener('load', () => {
  const hash = window.location.hash.slice(1);
  if (hash && CONFIG.dataSources[hash]) {
    dashboard.navigateToPage(hash, false);
  }
});

export default dashboard;
