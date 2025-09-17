// utils.js
import { CONFIG } from './config.js';

/** Normalize header names for field matching */
export function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Clean and parse numbers from various formats */
export function cleanNumber(value) {
  if (value == null || value === '') return 0;
  let str = String(value).trim();

  // Remove weird spaces & keep digits, signs, separators and parentheses
  str = str.replace(/[\u00A0\u202F\u2009\u2008\u2007\u2006\u2005\u2004\u2003\u2002\u2000]/g, ' ');
  str = str.replace(/[^\d\-+,.()]/g, '');

  if (!str) return 0;

  // Parentheses as negative
  if (/^\(.*\)$/.test(str)) {
    return -cleanNumber(str.slice(1, -1));
  }

  // European format 1.234.567,89
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    // Thousands commas
    str = str.replace(/,(?=\d{3}(?:\.|$))/g, '');
  }

  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

/** Safe date parsing (handles ISO, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, and Excel serials) */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const str = String(value).trim();

  // Excel serial dates (rough heuristic)
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (num > 20000 && num < 60000) {
      const baseDate = new Date(1899, 11, 30);
      baseDate.setDate(baseDate.getDate() + Math.floor(num));
      if (num % 1) baseDate.setTime(baseDate.getTime() + ((num % 1) * 86400000));
      return baseDate;
    }
  }

  // ISO / YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // Explicit DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split('/').map(n => parseInt(n, 10));
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // 1-2 digit day/month variants with slashes or dashes → try DD/MM/YYYY then MM/DD/YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10) < 100 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);

    // Prefer DD/MM if unambiguous (first part > 12)
    let d;
    if (a > 12 && b <= 31) {
      d = new Date(yyyy, b - 1, a);
    } else if (b > 12 && a <= 12) {
      d = new Date(yyyy, a - 1, b);
    } else {
      // Ambiguous → default to DD/MM (UK-centric)
      d = new Date(yyyy, b - 1, a);
    }
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback
  const dflt = new Date(str);
  return isNaN(dflt.getTime()) ? null : dflt;
}

/** Format numbers */
export function formatNumber(value, format = 'number') {
  const num = cleanNumber(value);
  switch (format) {
    case 'percentage': return `${num.toFixed(1)}%`;
    case 'currency':   return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(num);
    case 'duration':   return formatDuration(num);
    case 'compact':    return new Intl.NumberFormat('en-GB', { notation: 'compact', compactDisplay: 'short' }).format(num);
    default:           return new Intl.NumberFormat('en-GB').format(num);
  }
}

/** Format seconds to h/m/s */
export function formatDuration(seconds) {
  const sec = Math.floor(seconds);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Format dates */
export function formatDate(date, format = 'display') {
  if (!date) return '';
  const d = date instanceof Date ? date : parseDate(date);
  if (!d) return '';

  switch (format) {
    case 'input':  return d.toISOString().split('T')[0];
    case 'chart':  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    case 'api':    return d.toISOString();
    case 'display':
    default:       return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}

/** Simple helpers used elsewhere */
export function findColumn(headers, candidates) {
  const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeHeader(h) }));
  for (const candidate of candidates) {
    const norm = normalizeHeader(candidate);
    const match = normalizedHeaders.find(h => h.normalized === norm);
    if (match) return match.original;
  }
  return null;
}
export function weightedAverage(data, valueField, weightField = null) {
  let tv = 0, tw = 0;
  data.forEach(row => {
    const v = cleanNumber(row[valueField]);
    const w = weightField ? cleanNumber(row[weightField]) : 1;
    if (w > 0) { tv += v * w; tw += w; }
  });
  return tw > 0 ? tv / tw : 0;
}
export function groupBy(data, field) {
  return data.reduce((acc, item) => {
    const key = item[field] ?? 'Unknown';
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}
export function aggregateByPeriod(data, dateField, period = 'month') {
  const groups = {};
  data.forEach(row => {
    const d = row.date_parsed || parseDate(row[dateField]);
    if (!d) return;
    let key;
    switch (period) {
      case 'day':   key = d.toISOString().split('T')[0]; break;
      case 'week':  { const ws = new Date(d); ws.setDate(d.getDate() - d.getDay()); key = ws.toISOString().split('T')[0]; } break;
      case 'year':  key = String(d.getFullYear()); break;
      case 'month':
      default:      key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }
    (groups[key] = groups[key] || []).push(row);
  });
  return groups;
}
export function isAbandoned(status) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return CONFIG.statusPatterns.abandoned.some(p => s.includes(p));
}
export function isConnected(status) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return CONFIG.statusPatterns.connected.some(p => s.includes(p));
}
export function debounce(func, wait) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => func(...args), wait); };
}
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {}; Object.keys(obj).forEach(k => out[k] = deepClone(obj[k])); return out;
}
export function generateId(prefix='id') {
  return `${prefix}_${Math.random().toString(36).slice(2,11)}_${Date.now()}`;
}

/** UI helpers */
export function showError(message) {
  const c = document.getElementById('error-container');
  const t = document.getElementById('error-text');
  if (c && t) {
    t.textContent = message;
    c.classList.remove('hidden');
    setTimeout(() => c.classList.add('hidden'), 5000);
  }
}
export function hideError() {
  const c = document.getElementById('error-container');
  if (c) c.classList.add('hidden');
}
export function showLoading(text='Loading...', progress=0) {
  const o = document.getElementById('loading-overlay');
  const te = document.querySelector('.loading-text');
  const pf = document.getElementById('progress-fill');
  const pt = document.getElementById('progress-text');
  if (o) {
    o.classList.remove('hidden');
    if (te) te.textContent = text;
    if (pf) pf.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    if (pt) pt.textContent = `${Math.round(progress)}%`;
  }
}
export function hideLoading() {
  const o = document.getElementById('loading-overlay');
  if (o) o.classList.add('hidden');
}
export function updateProgress(progress, text) {
  const pf = document.getElementById('progress-fill');
  const pt = document.getElementById('progress-text');
  const lt = document.querySelector('.loading-text');
  if (pf) pf.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  if (pt) pt.textContent = `${Math.round(progress)}%`;
  if (text && lt) lt.textContent = text;
}

/** Date range helpers */
export function validateDateRange(startDate, endDate) {
  const s = parseDate(startDate), e = parseDate(endDate);
  if (!s || !e) return { valid: false, error: 'Invalid date format' };
  if (s > e)     return { valid: false, error: 'Start date must be before end date' };
  const days = (e - s) / 86400000;
  if (days > CONFIG.validation.dateRange.maxDays) {
    return { valid: false, error: `Date range cannot exceed ${CONFIG.validation.dateRange.maxDays} days` };
  }
  return { valid: true };
}
export function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - CONFIG.validation.dateRange.defaultDays);
  return { start: formatDate(start, 'input'), end: formatDate(end, 'input') };
}

/** CSV export */
export function exportToCsv(data, filename) {
  if (!data || data.length === 0) { showError('No data to export'); return; }
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const v = row[h] ?? '';
      return (typeof v === 'string' && (v.includes(',') || v.includes('"'))) ? `"${v.replace(/"/g,'""')}"` : v;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
