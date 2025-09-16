// Utility functions for the Call Performance Dashboard
import { CONFIG } from './config.js';

/**
 * Normalize header names for field matching
 */
export function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Clean and parse numbers from various formats
 */
export function cleanNumber(value) {
  if (value == null || value === '') return 0;
  
  let str = String(value).trim();
  
  // Remove non-breaking spaces and other special chars
  str = str.replace(/[\u00A0\u202F\u2009\u2008\u2007\u2006\u2005\u2004\u2003\u2002\u2000]/g, ' ');
  str = str.replace(/[^\d\-+,.()]/g, '');
  
  if (!str) return 0;
  
  // Handle parentheses as negative
  if (/^\(.*\)$/.test(str)) {
    str = str.slice(1, -1).trim();
    return -cleanNumber(str);
  }
  
  // Handle European number format (1.234.567,89)
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    // Remove commas used as thousands separator
    str = str.replace(/,(?=\d{3}(?:\.|$))/g, '');
  }
  
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Safe date parsing from various formats
 */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  
  const str = String(value).trim();
  
  // Handle Excel serial dates
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    // Excel dates are typically between 25000-60000
    if (num > 20000 && num < 60000) {
      const baseDate = new Date(1899, 11, 30);
      baseDate.setDate(baseDate.getDate() + Math.floor(num));
      if (num % 1) {
        baseDate.setTime(baseDate.getTime() + ((num % 1) * 86400000));
      }
      return baseDate;
    }
  }
  
  // Handle ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Handle MM/DD/YYYY or DD/MM/YYYY
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const [, a, b, year] = match;
    const fullYear = +year < 100 ? 2000 + (+year) : +year;
    
    // Guess format based on values
    if (+a > 12 && +b <= 12) {
      // DD/MM/YYYY
      return new Date(fullYear, +b - 1, +a);
    } else if (+b > 12 && +a <= 12) {
      // MM/DD/YYYY  
      return new Date(fullYear, +a - 1, +b);
    } else {
      // Ambiguous, assume MM/DD/YYYY (US format)
      return new Date(fullYear, +a - 1, +b);
    }
  }
  
  // Fallback to Date constructor
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format numbers with appropriate units
 */
export function formatNumber(value, format = 'number') {
  const num = cleanNumber(value);
  
  switch (format) {
    case 'percentage':
      return `${num.toFixed(1)}%`;
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(num);
    case 'duration':
      return formatDuration(num);
    case 'compact':
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        compactDisplay: 'short'
      }).format(num);
    default:
      return new Intl.NumberFormat('en-US').format(num);
  }
}

/**
 * Format duration in seconds to human readable format
 */
export function formatDuration(seconds) {
  const sec = Math.floor(seconds);
  
  if (sec < 60) {
    return `${sec}s`;
  } else if (sec < 3600) {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

/**
 * Format dates consistently
 */
export function formatDate(date, format = 'display') {
  if (!date) return '';
  
  const d = date instanceof Date ? date : parseDate(date);
  if (!d) return '';
  
  switch (format) {
    case 'input':
      return d.toISOString().split('T')[0];
    case 'chart':
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    case 'api':
      return d.toISOString();
    case 'display':
    default:
      return d.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
  }
}

/**
 * Find best matching column from headers
 */
export function findColumn(headers, candidates) {
  const normalizedHeaders = headers.map(h => ({ 
    original: h, 
    normalized: normalizeHeader(h) 
  }));
  
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const match = normalizedHeaders.find(h => h.normalized === normalizedCandidate);
    if (match) return match.original;
  }
  
  return null;
}

/**
 * Calculate weighted average
 */
export function weightedAverage(data, valueField, weightField = null) {
  let totalValue = 0;
  let totalWeight = 0;
  
  data.forEach(row => {
    const value = cleanNumber(row[valueField]);
    const weight = weightField ? cleanNumber(row[weightField]) : 1;
    
    if (weight > 0) {
      totalValue += value * weight;
      totalWeight += weight;
    }
  });
  
  return totalWeight > 0 ? totalValue / totalWeight : 0;
}

/**
 * Group data by a field value
 */
export function groupBy(data, field) {
  return data.reduce((groups, item) => {
    const key = item[field] || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

/**
 * Aggregate data by date periods
 */
export function aggregateByPeriod(data, dateField, period = 'month') {
  const groups = {};
  
  data.forEach(row => {
    const date = parseDate(row[dateField]);
    if (!date) return;
    
    let key;
    switch (period) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'year':
        key = String(date.getFullYear());
        break;
      default:
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  
  return groups;
}

/**
 * Check if a status matches abandoned patterns
 */
export function isAbandoned(status) {
  if (!status) return false;
  const statusLower = String(status).toLowerCase();
  const patterns = CONFIG.statusPatterns.abandoned;
  return patterns.some(pattern => statusLower.includes(pattern));
}

/**
 * Check if a status matches connected patterns  
 */
export function isConnected(status) {
  if (!status) return false;
  const statusLower = String(status).toLowerCase();
  const patterns = CONFIG.statusPatterns.connected;
  return patterns.some(pattern => statusLower.includes(pattern));
}

/**
 * Debounce function calls
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Deep clone an object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
}

/**
 * Generate unique ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
}

/**
 * Show error message to user
 */
export function showError(message) {
  const container = document.getElementById('error-container');
  const textElement = document.getElementById('error-text');
  
  if (container && textElement) {
    textElement.textContent = message;
    container.classList.remove('hidden');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
      container.classList.add('hidden');
    }, 5000);
  }
}

/**
 * Hide error message
 */
export function hideError() {
  const container = document.getElementById('error-container');
  if (container) {
    container.classList.add('hidden');
  }
}

/**
 * Show loading state
 */
export function showLoading(text = 'Loading...', progress = 0) {
  const overlay = document.getElementById('loading-overlay');
  const textElement = document.querySelector('.loading-text');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  
  if (overlay) {
    overlay.classList.remove('hidden');
    if (textElement) textElement.textContent = text;
    if (progressFill) progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    if (progressText) progressText.textContent = `${Math.round(progress)}%`;
  }
}

/**
 * Hide loading state
 */
export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

/**
 * Update loading progress
 */
export function updateProgress(progress, text) {
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const loadingText = document.querySelector('.loading-text');
  
  if (progressFill) progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  if (progressText) progressText.textContent = `${Math.round(progress)}%`;
  if (text && loadingText) loadingText.textContent = text;
}

/**
 * Validate date range
 */
export function validateDateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  
  if (!start || !end) {
    return { valid: false, error: 'Invalid date format' };
  }
  
  if (start > end) {
    return { valid: false, error: 'Start date must be before end date' };
  }
  
  const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
  if (daysDiff > CONFIG.validation.dateRange.maxDays) {
    return { 
      valid: false, 
      error: `Date range cannot exceed ${CONFIG.validation.dateRange.maxDays} days` 
    };
  }
  
  return { valid: true };
}

/**
 * Get default date range
 */
export function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - CONFIG.validation.dateRange.defaultDays);
  
  return {
    start: formatDate(start, 'input'),
    end: formatDate(end, 'input')
  };
}

/**
 * Export data as CSV
 */
export function exportToCsv(data, filename) {
  if (!data || data.length === 0) {
    showError('No data to export');
    return;
  }
  
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header] || '';
        // Escape commas and quotes
        return typeof value === 'string' && (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"` 
          : value;
      }).join(',')
    )
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
