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
    const meta = {
      source: src.name,
      rowCount: data.length,
      columns: data.length ? Object.keys(data[0]) : [],
      loadedAt: new Date().toISOString(),
      dateRange: this.getDateRange(data)
    };
    return { data, metadata: meta };
  }

  parseCSV(text) {
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
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

    rows.forEach((row, i) => {
      try {
        const r = this.processRow(row, map, key);
        if (this.isValidRow(r, key)) out.push(r);
      } catch (e) {
        console.warn(`Row ${i + 1} skipped:`, e, row);
      }
    });

    return out;
  }

  // NOTE: accepts sourceKey so we can do FCR-specific date building
  processRow(row, fieldMappings, sourceKey) {
    const processed = {};

    // 1) copy original row with trimmed keys
    Object.keys(row).forEach(key => {
      const cleanKey = key.trim();
      if (cleanKey) processed[cleanKey] = row[key];
    });

    // 2) build date_parsed
    if (sourceKey === 'fcr') {
      // FCR has Year, Month, Date (day of month)
      const y = Number.isFinite(+processed.Year) ? +processed.Year : null;
      const m = Number.isFinite(+processed.Month) ? +processed.Month : null;
      const d = Number.isFinite(+processed.Date) ? +processed.Date : null;
      if (y && m && d) {
        const dt = new Date(y, m - 1, d);
        if (!isNaN(dt)) processed.date_parsed = dt;
      }
      // fallback if "Date" is actually a full date string
      if (!processed.date_parsed && processed.Date) {
        const tryFull = parseDate(processed.Date);
        if (tryFull) processed.date_parsed = tryFull;
      }
    }

    // Generic (Inbound/Outbound): use mapped 'date' field
    if (!processed.date_parsed) {
      const candidates = fieldMappings.date || [];
      const dateField = this.findBestMatch(Object.keys(processed), candidates);
      if (dateField && processed[dateField]) {
        const pd = parseDate(processed[dateField]);
        if (pd) processed.date_parsed = pd;
      }
    }

    // 3) stable chart date used by renderers.js
    if (processed.date_parsed instanceof Date && !isNaN(processed.date_parsed)) {
      processed.__chartDate = processed.date_parsed.toISOString();
    } else {
      const df = this.findBestMatch(Object.keys(processed), fieldMappings.date || []);
      if (df && processed[df]) processed.__chartDate = String(processed[df]);
    }

    // 4) generic numeric helpers
    ['duration', 'count', 'waitTime'].forEach(fieldType => {
      const candidates = fieldMappings[fieldType] || [];
      const numericField = this.findBestMatch(Object.keys(processed), candidates);
      if (numericField && processed[numericField] !== undefined) {
        processed[`${fieldType}_numeric`] = cleanNumber(processed[numericField]);
      }
    });

    // 5) outbound-specific numeric columns (by exact headers)
    if ('Total Calls' in processed)            processed.TotalCalls_numeric        = cleanNumber(processed['Total Calls']);
    if ('Total Call Duration' in processed)    processed.TotalCallDuration_numeric = cleanNumber(processed['Total Call Duration']);
    if ('Answered Calls' in processed)         processed.AnsweredCalls_numeric     = cleanNumber(processed['Answered Calls']);
    if ('Missed Calls' in processed)           processed.MissedCalls_numeric       = cleanNumber(processed['Missed Calls']);
    if ('Voicemail Calls' in processed)        processed.VoicemailCalls_numeric    = cleanNumber(processed['Voicemail Calls']);

    // 6) fcr numeric
    if ('Count' in processed)                  processed.Count_numeric             = cleanNumber(processed['Count']);

    return processed;
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

  // Keep rows; filtering happens later
  isValidRow() { return true; }

  getDateRange(data) {
    const dates = data.map((r) => r.date_parsed).filter(Boolean);
    if (dates.length === 0) return null;
    dates.sort((a, b) => a - b);
    return { start: dates[0], end: dates[dates.length - 1], count: dates.length };
  }

  filterByDateRange(sourceKey, startDate, endDate) {
    const data = this.data[sourceKey] || [];
    if (!startDate || !endDate) return data;

    const s = parseDate(startDate);
    const e = parseDate(endDate);
    if (!s || !e) return data;

    // If this dataset has no parseable dates at all, don't nuke it
    const hasAnyDate = data.some(r => r.date_parsed instanceof Date && !isNaN(r.date_parsed));
    if (!hasAnyDate) return data;

    const eod = new Date(e);
    eod.setHours(23, 59, 59, 999);

    return data.filter(r => r.date_parsed && r.date_parsed >= s && r.date_parsed <= eod);
  }

  getData(key, filters = {}) {
    const original = this.data[key] || [];
    let data = original;

    // Date filtering
    if (filters.startDate && filters.endDate) {
      const filtered = this.filterByDateRange(key, filters.startDate, filters.endDate);
      // Important: for outbound/fcr, if filter wipes all rows, fall back to unfiltered so the page isn't blank
      data = (filtered.length === 0 && (key === 'outbound' || key === 'fcr')) ? original : filtered;
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
