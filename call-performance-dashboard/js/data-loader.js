// data-loader.js
import { CONFIG, getFieldMapping } from './config.js';
import {
  showError, hideError, showLoading, hideLoading, updateProgress,
  normalizeHeader, parseDate, cleanNumber
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
      const sources = Object.keys(CONFIG.dataSources);
      const totalSources = sources.length;
      let completed = 0;

      const results = await Promise.all(sources.map(async (key) => {
        try {
          const res = await this.loadDataSource(key);
          completed++;
          updateProgress((completed / totalSources) * 100, `Loaded ${CONFIG.dataSources[key].name}`);
          return { key, ...res };
        } catch (err) {
          console.error(`Failed to load ${key}:`, err);
          completed++;
          updateProgress((completed / totalSources) * 100);
          return { key, data: [], metadata: {}, error: err.message };
        }
      }));

      let hasErrors = false;
      results.forEach(({ key, data, metadata, error }) => {
        if (error) {
          hasErrors = true;
          showError(`Failed to load ${CONFIG.dataSources[key].name}: ${error}`);
        } else {
          this.data[key] = data;
          this.metadata[key] = metadata;
        }
      });

      if (!hasErrors) {
        updateProgress(100, 'Data loaded successfully!');
        setTimeout(hideLoading, 500);
      } else {
        hideLoading();
      }
      return this.data;

    } catch (e) {
      console.error('Failed to load data:', e);
      showError('Failed to load dashboard data. Please check your data files.');
      hideLoading();
      throw e;
    } finally {
      this.isLoading = false;
    }
  }

  async loadDataSource(sourceKey) {
    const source = CONFIG.dataSources[sourceKey];
    if (!source) throw new Error(`Unknown data source: ${sourceKey}`);

    const resp = await fetch(source.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

    const text = await resp.text();
    if (!text.trim()) throw new Error('Empty data file');

    const parsed = await this.parseCSV(text);
    const processed = this.processData(parsed, sourceKey);

    const metadata = {
      source: source.name,
      rowCount: processed.length,
      columns: processed.length > 0 ? Object.keys(processed[0]) : [],
      loadedAt: new Date().toISOString(),
      dateRange: this.getDateRange(processed, sourceKey)
    };

    return { data: processed, metadata };
  }

  async parseCSV(text) {
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

  processData(rawData, sourceKey) {
    if (!rawData || rawData.length === 0) return [];

    const fieldMappings = CONFIG.fieldMappings[sourceKey] || {};
    const out = [];

    rawData.forEach((row, idx) => {
      try {
        const processed = this.processRow(row, fieldMappings, sourceKey);
        if (this.isValidRow(processed, sourceKey)) out.push(processed);
      } catch (e) {
        console.warn(`Error processing row ${idx + 1}:`, e, row);
      }
    });

    return out;
  }

  processRow(row, fieldMappings, sourceKey) {
    // Copy original with cleaned keys
    const processed = {};
    Object.keys(row).forEach(k => { const ck = k.trim(); if (ck) processed[ck] = row[k]; });

    // Build date_parsed
    // 1) FCR has Year, Month, Date (day) separate
    if (sourceKey === 'fcr' && (row.Year || row.Month || row.Date)) {
      const y = cleanNumber(row.Year);
      const m = cleanNumber(row.Month);
      const d = cleanNumber(row.Date);
      if (y && m && d) {
        const dt = new Date(y, m - 1, d);
        if (!isNaN(dt.getTime())) processed.date_parsed = dt;
      }
    }

    // 2) Generic date field from mapping if not already set
    if (!processed.date_parsed) {
      const candidates = fieldMappings.date || [];
      const dateField = this.findBestMatch(Object.keys(processed), candidates);
      if (dateField && processed[dateField]) {
        const pd = parseDate(processed[dateField]);
        if (pd) processed.date_parsed = pd;
      }
    }

    // Numeric helpers for inbound (duration/waitTime)
    ['duration', 'count', 'waitTime'].forEach(ft => {
      const cands = fieldMappings[ft] || [];
      const f = this.findBestMatch(Object.keys(processed), cands);
      if (f && processed[f] !== undefined && processed[f] !== null && processed[f] !== '') {
        processed[`${ft}_numeric`] = cleanNumber(processed[f]);
      }
    });

    // Outbound totals (keep originals too)
    if (sourceKey === 'outbound') {
      processed.TotalCalls_numeric           = cleanNumber(processed['Total Calls']);
      processed.TotalCallDuration_numeric    = cleanNumber(processed['Total Call Duration']);
      processed.AnsweredCalls_numeric        = cleanNumber(processed['Answered Calls']);
      processed.MissedCalls_numeric          = cleanNumber(processed['Missed Calls']);
      processed.VoicemailCalls_numeric       = cleanNumber(processed['Voicemail Calls']);
    }

    // FCR totals
    if (sourceKey === 'fcr') {
      processed.Count_numeric = cleanNumber(processed['Count']);
    }

    return processed;
  }

  findBestMatch(headers, candidates) {
    const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeHeader(h) }));
    for (const cand of candidates) {
      const norm = normalizeHeader(cand);
      const m = normalizedHeaders.find(h => h.normalized === norm);
      if (m) return m.original;
    }
    return null;
  }

  // VERY permissive to avoid dropping valid rows
  isValidRow(row, sourceKey) {
    // Keep rows for these sources; we’ll handle blanks in KPIs safely.
    if (['inbound', 'outbound', 'fcr'].includes(sourceKey)) return true;

    const required = CONFIG.validation.requiredFields[sourceKey] || [];
    for (const f of required) {
      const v = row[f];
      if (!v || String(v).trim() === '') return false;
    }
    return Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
  }

  getDateRange(data, sourceKey) {
    if (!data || data.length === 0) return null;
    const dates = [];

    data.forEach(row => {
      if (row.date_parsed) {
        dates.push(row.date_parsed);
      } else {
        const dateFields = getFieldMapping(sourceKey, 'date');
        for (const f of dateFields) {
          if (row[f]) {
            const d = parseDate(row[f]);
            if (d) { dates.push(d); break; }
          }
        }
      }
    });

    if (dates.length === 0) return null;
    dates.sort((a, b) => a - b);
    return { start: dates[0], end: dates[dates.length - 1], count: dates.length };
  }

  filterByDateRange(sourceKey, startDate, endDate) {
    const data = this.data[sourceKey];
    if (!data || data.length === 0) return [];

    const start = parseDate(startDate);
    const end   = parseDate(endDate);
    if (!start || !end) return data;

    const endOfDay = new Date(end); endOfDay.setHours(23,59,59,999);

    return data.filter(row => {
      let rd = row.date_parsed;
      if (!rd) {
        const dateFields = getFieldMapping(sourceKey, 'date');
        for (const f of dateFields) {
          if (row[f]) { rd = parseDate(row[f]); if (rd) break; }
        }
      }
      if (!rd) return false; // exclude rows with no valid date so filtering works
      return rd >= start && rd <= endOfDay;
    });
  }

  getData(sourceKey, filters = {}) {
    if (!this.data[sourceKey]) return [];
    let data = [...this.data[sourceKey]];

    if (filters.startDate && filters.endDate) {
      data = this.filterByDateRange(sourceKey, filters.startDate, filters.endDate);
    }

    if (filters.agent) {
      const agentFields = getFieldMapping(sourceKey, 'agent');
      data = data.filter(row => {
        for (const f of agentFields) {
          if (row[f] && String(row[f]).toLowerCase().includes(filters.agent.toLowerCase())) return true;
        }
        return false;
      });
    }

    if (filters.status) {
      const statusFields = getFieldMapping(sourceKey, 'status');
      data = data.filter(row => {
        for (const f of statusFields) {
          if (row[f] && String(row[f]).toLowerCase().includes(filters.status.toLowerCase())) return true;
        }
        return false;
      });
    }

    return data;
  }

  getMetadata(sourceKey) {
    return this.metadata[sourceKey] || {};
  }

  async refresh(sourceKey) {
    if (!CONFIG.dataSources[sourceKey]) throw new Error(`Unknown data source: ${sourceKey}`);
    showLoading(`Refreshing ${CONFIG.dataSources[sourceKey].name}...`, 0);
    try {
      const res = await this.loadDataSource(sourceKey);
      this.data[sourceKey] = res.data;
      this.metadata[sourceKey] = res.metadata;
      updateProgress(100, 'Refresh complete!');
      setTimeout(hideLoading, 500);
      return res.data;
    } catch (e) {
      hideLoading();
      showError(`Failed to refresh ${CONFIG.dataSources[sourceKey].name}: ${e.message}`);
      throw e;
    }
  }

  clear() { this.data = {}; this.metadata = {}; }

  getSummary(sourceKey) {
    const data = this.data[sourceKey];
    const metadata = this.metadata[sourceKey];
    if (!data || data.length === 0) {
      return { totalRows: 0, dateRange: null, columns: [], lastUpdated: null };
    }
    return {
      totalRows: data.length,
      dateRange: metadata?.dateRange || null,
      columns: metadata?.columns || [],
      lastUpdated: metadata?.loadedAt || null
    };
  }

  validateData(sourceKey) {
    const data = this.data[sourceKey];
    if (!data) return { valid: false, errors: ['No data loaded'] };
    const errors = [], warnings = [];

    if (data.length === 0) errors.push('No data rows found');

    const requiredFields = CONFIG.validation.requiredFields[sourceKey] || [];
    const sample = data[0] || {};
    const available = Object.keys(sample);
    requiredFields.forEach(field => {
      const maps = getFieldMapping(sourceKey, field);
      const hasField = maps.some(m => this.findBestMatch(available, [m]));
      if (!hasField) errors.push(`Missing required field: ${field}`);
    });

    const dateRange = this.metadata[sourceKey]?.dateRange;
    if (dateRange) {
      const days = (dateRange.end - dateRange.start) / 86400000;
      if (days > 730) warnings.push('Data spans > 2 years - consider filtering for performance');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  findDuplicateRows(data) {
    const seen = new Set(); let dup = 0;
    data.forEach(row => {
      const key = JSON.stringify(row);
      if (seen.has(key)) dup++; else seen.add(key);
    });
    return dup;
  }

  getFieldStats(sourceKey, fieldName) {
    const data = this.data[sourceKey];
    if (!data || data.length === 0) return null;
    const vals = data.map(r => r[fieldName]).filter(v => v !== null && v !== undefined && v !== '');
    if (vals.length === 0) return null;

    const nums = vals.map(v => cleanNumber(v)).filter(n => Number.isFinite(n));
    if (nums.length > vals.length * 0.8) {
      return {
        type: 'numeric',
        count: vals.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        avg: nums.reduce((a,b)=>a+b,0)/nums.length,
        nullCount: data.length - vals.length
      };
    } else {
      const unique = [...new Set(vals)];
      const top = {};
      vals.forEach(v => { top[v] = (top[v] || 0) + 1; });
      const topValues = Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([value,count])=>({value,count}));
      return { type:'text', count: vals.length, uniqueCount: unique.length, nullCount: data.length - vals.length, topValues };
    }
  }
}

export const dataLoader = new DataLoader();
export default dataLoader;
