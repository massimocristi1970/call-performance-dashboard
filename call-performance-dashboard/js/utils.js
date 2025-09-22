// js/utils.js
import { CONFIG } from './config.js';

export function normalizeHeader(h){
  return String(h||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
}

export function cleanNumber(v){
  if(v==null || v==='') return 0;
  let s = String(v).trim();
  s = s.replace(/[\u00A0\u202F\u2009\u2008\u2007\u2006\u2005\u2004\u2003\u2002\u2000]/g,' ');
  s = s.replace(/[^\d\-+,.()]/g,'');
  if(!s) return 0;
  if(/^\(.*\)$/.test(s)) return -cleanNumber(s.slice(1,-1));
  if(/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g,'').replace(',', '.');
  else s = s.replace(/,(?=\d{3}(?:\.|$))/g,'');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ISO, YYYY-MM-DD, DD/MM/YYYY[ HH:mm[:ss]], d-m-y[ time], Excel serials
export function parseDate(value){
  if(!value) return null;
  if(value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();

  // Excel serial
  if(/^\d+(\.\d+)?$/.test(s)){
    const num = parseFloat(s);
    if(num>20000 && num<60000){
      const base = new Date(1899,11,30);
      base.setDate(base.getDate()+Math.floor(num));
      if(num%1) base.setTime(base.getTime()+((num%1)*86400000));
      return base;
    }
  }

  // ISO / yyyy-mm-dd
  if(/^\d{4}-\d{2}-\d{2}/.test(s)){
    const d = new Date(s.replace(' ','T'));
    return isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yyyy [time]
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const dd=+m[1], MM=+m[2], yy=+m[3] < 100 ? 2000 + (+m[3]) : +m[3];
    const hh=+(m[4] ?? 0), mi=+(m[5] ?? 0), ss=+(m[6] ?? 0);
    const d = new Date(yy, MM-1, dd, hh, mi, ss);
    return isNaN(d.getTime()) ? null : d;
  }

  // d-m-y [time] (prefer UK)
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const dd=+m[1], MM=+m[2], yy=+m[3] < 100 ? 2000 + (+m[3]) : +m[3];
    const hh=+(m[4] ?? 0), mi=+(m[5] ?? 0), ss=+(m[6] ?? 0);
    const d = new Date(yy, MM-1, dd, hh, mi, ss);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatNumber(value, format='number'){
  const num = cleanNumber(value);
  switch(format){
    case 'percentage': return `${num.toFixed(1)}%`;
    case 'currency':   return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num);
    case 'duration':   return formatDuration(num);
    case 'compact':    return new Intl.NumberFormat('en-GB',{notation:'compact',compactDisplay:'short'}).format(num);
    default:           return new Intl.NumberFormat('en-GB').format(num);
  }
}

export function formatDuration(seconds){
  const s = Math.floor(seconds);
  if(s<60) return `${s}s`;
  if(s<3600){ const m=Math.floor(s/60), r=s%60; return `${m}m ${r}s`; }
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
  return `${h}h ${m}m`;
}

export function formatDate(date, fmt='display'){
  if(!date) return '';
  const d = date instanceof Date ? date : parseDate(date);
  if(!d) return '';
  switch(fmt){
    case 'input':  return d.toISOString().split('T')[0];
    case 'chart':  return d.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
    case 'api':    return d.toISOString();
    case 'display':
    default:       return d.toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'numeric'});
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

export function isConnectedCall(durationStr) {
  // Duration format looks like "mm:ss" or "hh:mm:ss"
  if (!durationStr) return false;
  const parts = durationStr.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return seconds > 150; // 2 minutes 30 seconds
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
