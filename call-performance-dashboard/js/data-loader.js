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
      const yearField = this.findBestMatch(Object.keys(r), ['Year']);
      const monthField = this.findBestMatch(Object.keys(r), ['Month']);
      const dayField = this.findBestMatch(Object.keys(r), ['Date','Day']);
      const countField = this.findBestMatch(Object.keys(r), getFieldMapping('fcr','count') || ['Count','Cases']);

      const year = yearField ? cleanNumber(r[yearField]) : 0;
      const month = monthField ? cleanNumber(r[monthField]) : 0;
      const day = dayField ? cleanNumber(r[dayField]) : 0;

      if (year > 1900) {
        let dt = null;
        if (month >= 1 && day >= 1) {
          dt = new Date(year, month - 1, day);
        } else {
          dt = new Date(year, 0, 1); // fallback to Jan 1
        }
        if (!isNaN(dt)) {
          r.date_parsed = dt;
          r.__chartDate = dt.toISOString().split('T')[0];
        }
      }
      r.Count_numeric = countField ? cleanNumber(r[countField]) : 0;
    }

    // ----- OUTBOUND -----
    if (sourceKey === 'outbound') {
      const dateField = this.findBestMatch(Object.keys(r), map.date || ['Date']);
      if (dateField && r[dateField]) {
        const pd = parseDate(r[dateField]);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
        }
      }

      const agentField = this.findBestMatch(Object.keys(r), map.agent || ['Agent','Agent Name','User']);
      if (agentField && !r.Agent) r.Agent = r[agentField];

      const totalField   = this.findBestMatch(Object.keys(r), map.count || ['Total Calls','Calls']);
      const answeredField= this.findBestMatch(Object.keys(r), ['Answered Calls','Answered']);
      const missedField  = this.findBestMatch(Object.keys(r), ['Missed Calls','Missed']);
      const vmField      = this.findBestMatch(Object.keys(r), ['Voicemail Calls','Voicemail']);
      const durField     = this.findBestMatch(Object.keys(r), map.duration || ['Total Call Duration','Duration']);

      r.TotalCalls_numeric     = totalField    ? cleanNumber(r[totalField])    : 0;
      r.AnsweredCalls_numeric  = answeredField ? cleanNumber(r[answeredField]) : 0;
      r.MissedCalls_numeric    = missedField   ? cleanNumber(r[missedField])   : 0;
      r.VoicemailCalls_numeric = vmField       ? cleanNumber(r[vmField])       : 0;
      r.TotalCallDuration_numeric = durField   ? cleanNumber(r[durField])      : 0;
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
    if (Object.values(row).every(v => isBlank(v))) return false;

    if (key === 'outbound') {
      const agentField = this.findBestMatch(Object.keys(row), getFieldMapping('outbound','agent') || ['Agent','Agent Name','User']);
      const hasAgent = agentField && !isBlank(row[agentField]);
      return !!hasAgent;
    }

    if (key === 'fcr') {
      const yearField = this.findBestMatch(Object.keys(row), ['Year']);
      const hasYear = yearField && !isBlank(row[yearField]);
      return !!hasYear;
    }

    if (key === 'inbound') {
      const callIdField = this.findBestMatch(Object.keys(row), getFieldMapping('inbound','count') || ['Call ID']);
      return !!(callIdField && !isBlank(row[callIdField]));
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
