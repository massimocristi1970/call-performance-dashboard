// js/data-loader.js
import { CONFIG, getFieldMapping } from './config.js';
import {
  showError,
  hideError,
  showLoading,
  hideLoading,
  updateProgress,
  normalizeHeader,
  parseDate,
  cleanNumber
} from './utils.js';

// Helpers to detect non-data rows
function isTotalLike(val) {
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s === 'total' || s === 'grand total' || s === 'subtotal' || s === 'summary';
}
function isBlank(val) {
  return val == null || String(val).trim() === '';
}

class DataLoader {
  constructor() {
    this.data = {};
    this.metadata = {};
    this.isLoading = false;
  }

  async loadAll() {
    if (this.isLoading) return;
    this.isLoading = true;
    hideError();
    showLoading('Initializing data load...', 0);

    try {
      const keys = Object.keys(CONFIG.dataSources);
      let done = 0;

      const results = await Promise.all(
        keys.map(async (key) => {
          try {
            const res = await this.loadDataSource(key);
            done += 1;
            updateProgress((done / keys.length) * 100, `Loaded ${CONFIG.dataSources[key].name}`);
            return { key, ...res };
          } catch (e) {
            console.error(`Failed to load ${key}:`, e);
            done += 1;
            updateProgress((done / keys.length) * 100);
            return { key, data: [], metadata: {}, error: e.message };
          }
        })
      );

      let hasErr = false;
      results.forEach(({ key, data, metadata, error }) => {
        if (error) {
          hasErr = true;
          showError(`Failed to load ${CONFIG.dataSources[key].name}: ${error}`);
        }
        this.data[key] = data;
        this.metadata[key] = metadata;
      });

      if (!hasErr) {
        updateProgress(100, 'Data loaded successfully!');
        setTimeout(hideLoading, 500);
      } else {
        hideLoading();
      }

      return this.data;
    } finally {
      this.isLoading = false;
    }
  }

  async loadDataSource(key) {
    const src = CONFIG.dataSources[key];
    const resp = await fetch(src.url);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    if (!text.trim()) throw new Error('Empty data file');

    const parsed = await this.parseCSV(text);
    const data = this.processData(parsed, key);

    // compute dateRange inline (avoid calling a method)
    const dateRange = (() => {
      const dates = data
        .map(r => r.date_parsed)
        .filter(Boolean)
        .sort((a, b) => a - b);
      return dates.length
        ? { start: dates[0], end: dates[dates.length - 1], count: dates.length }
        : null;
    })();

    const meta = {
      source: src.name,
      rowCount: data.length,
      columns: data.length ? Object.keys(data[0]) : [],
      loadedAt: new Date().toISOString(),
      dateRange
    };
    return { data, metadata: meta };
  }

  parseCSV(text) {
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy', // ignore whitespace-only lines
        dynamicTyping: false,
        delimitersToGuess: [',', '\t', ';', '|'],
        transformHeader: (h) => h.trim().replace(/^\uFEFF/, ''),
        complete: (res) => resolve(res.data),
        error: (err) => reject(new Error(`CSV parsing failed: ${err.message}`))
      });
    });
  }

  processData(rows, key) {
    if (!rows || rows.length === 0) return [];
    const map = CONFIG.fieldMappings[key] || {};
    const out = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const r = this.processRow(rows[i], map, key);
        if (this.isValidRow(r, key)) out.push(r);
      } catch (e) {
        console.warn(`Row ${i + 1} skipped:`, e, rows[i]);
      }
    }
    return out;
  }

  // sourceKey distinguishes inbound/outbound/fcr logic
  processRow(row, map, sourceKey) {
    const r = {};
    Object.keys(row).forEach(k => {
      const ck = k.trim();
      if (ck) r[ck] = row[k];
    });

    // --- Build date_parsed ---
    if (sourceKey === 'fcr') {
      // FCR: Year + Month + Date (day-of-month)
      let year = null;
      let month = null;
      let day = null;

      // Try different possible column names for date components
      if (r.Year || r.year) year = Number(r.Year || r.year);
      if (r.Month || r.month) month = Number(r.Month || r.month);
      if (r.Date || r.date || r.Day || r.day) day = Number(r.Date || r.date || r.Day || r.day);

      if (year && month && day && year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(year, month - 1, day);
        if (!isNaN(dt)) {
          r.date_parsed = dt;
          r.__chartDate = dt.toISOString().split('T')[0];
        }
      }

      // Fallback if columns are different or if we need to parse a full date string
      if (!r.date_parsed) {
        const dateField = this.findBestMatch(Object.keys(r), ['Date', 'date', 'Date/Time', 'datetime']);
        if (dateField && r[dateField] && !isTotalLike(r[dateField])) {
          const pd = parseDate(r[dateField]);
          if (pd) {
            r.date_parsed = pd;
            r.__chartDate = pd.toISOString().split('T')[0];
          }
        }
      }
    }

    // Generic mapped date (Inbound/Outbound etc.)
    if (!r.date_parsed) {
      const dateField = this.findBestMatch(Object.keys(r), map.date || []);
      if (dateField && r[dateField]) {
        const pd = parseDate(r[dateField]);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
        }
      }
    }

    // --- Fallback for chart date if parsing failed ---
    if (!r.__chartDate) {
      const dateFields = ['Date/Time', 'Date', 'date', 'datetime', ...((map.date || []))];
      const df = this.findBestMatch(Object.keys(r), dateFields);
      if (df && r[df] && !isTotalLike(r[df])) {
        r.__chartDate = String(r[df]).trim();
      }
    }

    // --- Numeric helpers ---
    if (sourceKey === 'inbound') {
      const durF  = this.findBestMatch(Object.keys(r), map.duration || ['Talk Time', 'Duration']);
      const waitF = this.findBestMatch(Object.keys(r), map.waitTime || ['Wait Time', 'Queue Time']);
      if (durF)  r.duration_numeric = cleanNumber(r[durF]);
      if (waitF) r.waitTime_numeric = cleanNumber(r[waitF]);
    }

    if (sourceKey === 'outbound') {
      r.TotalCalls_numeric        = cleanNumber(r['Total Calls']);
      r.TotalCallDuration_numeric = cleanNumber(r['Total Call Duration']);
      r.AnsweredCalls_numeric     = cleanNumber(r['Answered Calls']);
      r.MissedCalls_numeric       = cleanNumber(r['Missed Calls']);
      r.VoicemailCalls_numeric    = cleanNumber(r['Voicemail Calls']);
    }

    if (sourceKey === 'fcr') {
      r.Count_numeric = cleanNumber(r['Count']) || cleanNumber(r['count']);
    }

    return r;
  }

  findBestMatch(headers, candidates) {
    const norm = headers.map((h) => ({ orig: h, norm: normalizeHeader(h) }));
    for (const c of candidates) {
      const nc = normalizeHeader(c);
      const hit = norm.find((h) => h.norm === nc);
      if (hit) return hit.orig;
    }
    return null;
  }

  // Keep only meaningful rows per dataset
  isValidRow(row, key) {
    // Drop completely blank rows
    if (Object.values(row).every(v => isBlank(v))) return false;

    if (key === 'outbound') {
      // Drop totals/footer lines
      if (isTotalLike(row.Date) || isTotalLike(row.Agent)) return false;

      const hasSomeMetric =
        (Number.isFinite(row.TotalCalls_numeric) && row.TotalCalls_numeric > 0) ||
        (Number.isFinite(row.AnsweredCalls_numeric) && row.AnsweredCalls_numeric > 0) ||
        (Number.isFinite(row.MissedCalls_numeric) && row.MissedCalls_numeric > 0) ||
        (Number.isFinite(row.VoicemailCalls_numeric) && row.VoicemailCalls_numeric > 0);

      return hasSomeMetric;
    }

    if (key === 'fcr') {
      // Skip total rows
      if (isTotalLike(row.Date) || isTotalLike(row.Year) || isTotalLike(row.Month)) return false;

      // Must have a count and some kind of date info
      const hasCount = Number.isFinite(row.Count_numeric) && row.Count_numeric > 0;
      const hasDate = !!row.date_parsed || !!row.__chartDate;

      return hasCount && hasDate;
    }

    if (key === 'inbound') {
      // Require a Call ID-like row (prevents headers/footers)
      const hasId = !isBlank(row['Call ID']);
      return hasId;
    }

    return true;
  }

  filterByDateRange(key, startDate, endDate) {
    const data = this.data[key] || [];
    if (!startDate || !endDate) return data;

    const s = parseDate(startDate);
    const e = parseDate(endDate);
    if (!s || !e) return data;

    // For outbound and FCR, be very permissive with date filtering
    // to prevent blank pages
    if (key === 'outbound' || key === 'fcr') {
      return data; // Don't filter by date for these datasets
    }

    // Apply date filtering only to inbound data
    const hasAnyDate = data.some(r => r.date_parsed instanceof Date && !isNaN(r.date_parsed));
    if (!hasAnyDate) return data;

    const eod = new Date(e);
    eod.setHours(23, 59, 59, 999);

    return data.filter(r => r.date_parsed && r.date_parsed >= s && r.date_parsed <= eod);
  }

  getData(key, filters = {}) {
    const original = this.data[key] || [];
    let data = original;

    // Only apply date filtering to inbound data
    if (filters.startDate && filters.endDate && key === 'inbound') {
      data = this.filterByDateRange(key, filters.startDate, filters.endDate);
    }

    // Agent filter
    if (filters.agent) {
      const fields = getFieldMapping(key, 'agent');
      const q = String(filters.agent).toLowerCase();
      data = data.filter((r) => fields.some((f) => r[f] && String(r[f]).toLowerCase().includes(q)));
    }

    // Status filter
    if (filters.status) {
      const fields = getFieldMapping(key, 'status');
      const q = String(filters.status).toLowerCase();
      data = data.filter((r) => fields.some((f) => r[f] && String(r[f]).toLowerCase().includes(q)));
    }

    return data;
  }

  getMetadata(key) {
    return this.metadata[key] || {};
  }

  getSummary(sourceKey) {
    const data = this.data[sourceKey] || [];
    const dates = data.map((r) => r.date_parsed).filter(Boolean).sort((a, b) => a - b);
    const dateRange = dates.length ? { start: dates[0], end: dates[dates.length - 1], count: dates.length } : null;
    const columns = data.length ? Object.keys(data[0]) : [];
    return {
      source: CONFIG.dataSources[sourceKey]?.name || sourceKey,
      rowCount: data.length,
      columns,
      dateRange,
      loadedAt: this.metadata[sourceKey]?.loadedAt || null
    };
  }

  async refresh(key) {
    const src = CONFIG.dataSources[key];
    if (!src) throw new Error(`Unknown data source: ${key}`);
    showLoading(`Refreshing ${src.name}...`, 0);
    try {
      const res = await this.loadDataSource(key);
      this.data[key] = res.data;
      this.metadata[key] = res.metadata;
      updateProgress(100, 'Refresh complete!');
      setTimeout(hideLoading, 500);
      return res.data;
    } catch (e) {
      hideLoading();
      showError(`Failed to refresh ${src.name}: ${e.message}`);
      throw e;
    }
  }

  clear() {
    this.data = {};
    this.metadata = {};
  }
}

export const dataLoader = new DataLoader();
export default dataLoader;