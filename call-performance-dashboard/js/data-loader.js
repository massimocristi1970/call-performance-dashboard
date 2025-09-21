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
            console.error(`✗ Failed to load ${key}:`, e);
            done += 1;
            updateProgress((done / keys.length) * 100);
            return { key, data: [], metadata: {}, error: e.message };
          }
        })
      );

      results.forEach(({ key, data, metadata, error }) => {
        if (error) {
          showError(`Failed to load ${CONFIG.dataSources[key].name}: ${error}`);
        }
        this.data[key] = data;
        this.metadata[key] = metadata;
      });

      updateProgress(100, 'Data loaded successfully!');
      setTimeout(hideLoading, 500);

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

    const dates = data.map(r => r.date_parsed).filter(Boolean).sort((a, b) => a - b);
    const meta = {
      source: src.name,
      rowCount: data.length,
      columns: data.length ? Object.keys(data[0]) : [],
      loadedAt: new Date().toISOString(),
      dateRange: dates.length ? { start: dates[0], end: dates[dates.length - 1], count: dates.length } : null
    };
    return { data, metadata: meta };
  }

  parseCSV(text) {
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
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

    for (const row of rows) {
      try {
        const r = this.processRow(row, map, key);
        if (this.isValidRow(r, key)) out.push(r);
      } catch (e) {
        console.warn(`Row skipped:`, e);
      }
    }
    return out;
  }

  processRow(row, map, sourceKey) {
    const r = {};
    Object.keys(row).forEach(k => {
      const ck = k.trim();
      if (ck) r[ck] = row[k];
    });

    // ----- FCR -----
    if (sourceKey === 'fcr') {
      const year = cleanNumber(r.Year);
      const month = cleanNumber(r.Month);
      const day = cleanNumber(r.Date);

      if (year > 1900) {
        let dt;
        if (!isNaN(month) && month >= 1 && month <= 12 && !isNaN(day) && day >= 1 && day <= 31) {
          dt = new Date(year, month - 1, day);
        } else {
          // fallback for "Total" or missing values — bucket to 1 Jan of the year
          dt = new Date(year, 0, 1);
        }
        if (!isNaN(dt)) {
          r.date_parsed = dt;
          r.__chartDate = dt.toISOString().split('T')[0];
        }
      }

      r.Count_numeric = cleanNumber(r.Count);
    }

    // ----- OUTBOUND -----
    if (sourceKey === 'outbound') {
      // Date (keep existing behavior)
      if (r.Date) {
        const pd = parseDate(r.Date);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
        }
      }

      // Parse numeric fields (existing)
      r.TotalCalls_numeric        = cleanNumber(r['Total Calls']);
      r.AnsweredCalls_numeric     = cleanNumber(r['Answered Calls']);
      r.MissedCalls_numeric       = cleanNumber(r['Missed Calls']);
      r.VoicemailCalls_numeric    = cleanNumber(r['Voicemail Calls']);
      r.TotalCallDuration_numeric = cleanNumber(r['Total Call Duration']);

      // NEW: Outbound Calls — and redirect TotalCalls_numeric to it
      r.OutboundCalls_numeric = cleanNumber(r['Outbound Calls']);
      if (!isNaN(r.OutboundCalls_numeric)) {
        // Safety switch: all existing charts/tiles that sum TotalCalls_numeric
        // will now reflect outbound-only counts as required.
        r.TotalCalls_numeric = r.OutboundCalls_numeric;
      }
    }

    // ----- OUTBOUND CONNECT RATE -----
    if (sourceKey === 'outbound_connectrate') {
      // Resolve field names using best-match so header variations don't break us
      const headers = Object.keys(r);
      const dateF = this.findBestMatch(headers, map.date || ['Date/Time (earliest)', 'Date/Time', 'Date']);
      const dirF  = this.findBestMatch(headers, map.direction || ['Initial Direction', 'Direction']);
      const durF  = this.findBestMatch(headers, map.duration || ['Duration', 'Call Duration']);
      const agF   = this.findBestMatch(headers, map.agent || ['Agent', 'Agent Name']);

      // Date
      if (dateF && r[dateF]) {
        const pd = parseDate(r[dateF]);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
        }
      }

      // Direction & Agent
      r.InitialDirection = (dirF && r[dirF]) ? String(r[dirF]).trim().toLowerCase() : '';
      r.Agent = agF ? r[agF] : (r.Agent || r['Agent Name'] || '');

      // Duration -> seconds (supports HH:MM:SS or MM:SS)
      let durationSeconds = 0;
      if (durF && r[durF]) {
        const parts = String(r[durF]).trim().split(':').map(n => parseInt(n, 10) || 0);
        if (parts.length === 3) {
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          durationSeconds = parts[0] * 60 + parts[1];
        } else {
          // Fallback: if a numeric is present (unlikely), use it directly
          durationSeconds = cleanNumber(r[durF]) || 0;
        }
      }
      r.duration_seconds = durationSeconds;

      // Connected if strictly > 02:30 (150s)
      r.isConnected = (r.duration_seconds > 150);

      // Only outbound for this dataset
      r.isOutbound = r.InitialDirection.startsWith('out');
    }

    // ----- INBOUND -----
    if (sourceKey === 'inbound') {
      const dateField = this.findBestMatch(Object.keys(r), map.date || ['Date/Time']);
      if (dateField && r[dateField]) {
        const pd = parseDate(r[dateField]);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
        }
      }

      const durF = this.findBestMatch(Object.keys(r), map.duration || ['Talk Time']);
      const waitF = this.findBestMatch(Object.keys(r), map.waitTime || ['Wait Time']);
      if (durF) r.duration_numeric = cleanNumber(r[durF]);
      if (waitF) r.waitTime_numeric = cleanNumber(r[waitF]);
    }

    console.log(`Processed ${sourceKey} row:`, r);
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

  isValidRow(row, key) {
    // Reject rows that are entirely blank
    if (Object.values(row).every(v => isBlank(v))) return false;

    if (key === 'outbound') {
      // Only require Agent; TotalCalls_numeric has been redirected to OutboundCalls_numeric.
      return !isBlank(row.Agent);
    }

    if (key === 'outbound_connectrate') {
      // Must have a valid date and be outbound direction (Initial Direction)
      const hasDate = row.date_parsed instanceof Date && !isNaN(row.date_parsed);
      return hasDate && row.isOutbound === true;
    }

    if (key === 'fcr') {
      // Only require Year (date fallback to Jan 1 handled in processRow)
      return !isBlank(row.Year);
    }

    if (key === 'inbound') {
      // Unchanged: require Call ID
      return !isBlank(row['Call ID']);
    }

    return true;
  }

  filterByDateRange(key, startDate, endDate) {
    const data = this.data[key] || [];
    if (!startDate || !endDate) return data;
    const s = parseDate(startDate);
    const e = parseDate(endDate);
    if (!s || !e) return data;

    const eod = new Date(e);
    eod.setHours(23, 59, 59, 999);

    return data.filter(r => r.date_parsed && r.date_parsed >= s && r.date_parsed <= eod);
  }

  getData(key, filters = {}) {
    let data = this.data[key] || [];
    if (filters.startDate && filters.endDate) {
      const filtered = this.filterByDateRange(key, filters.startDate, filters.endDate);
      if (filtered.length > 0 || key === 'inbound') data = filtered;
    }
    return data;
  }

  getMetadata(key) {
    return this.metadata[key] || {};
  }

  clear() {
    this.data = {};
    this.metadata = {};
  }
}

export const dataLoader = new DataLoader();
export default dataLoader;
