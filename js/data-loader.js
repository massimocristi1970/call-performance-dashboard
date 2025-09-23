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
  cleanNumber,
  isConnectedCall
} from './utils.js';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

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

      if (isNaN(year) || isNaN(month) || isNaN(day) || year < 1900 || month < 1 || day < 1) {
        return null;
      }
      const dt = new Date(year, month - 1, day);
      if (isNaN(dt.getTime())) {
        return null;
      }
      r.date_parsed = dt;
      r.__chartDate = dt.toISOString().split('T')[0];
      r.Count_numeric = cleanNumber(r.Count);
    }

    // ----- OUTBOUND_CONNECTRATE -----
    if (sourceKey === 'outbound_connectrate') {
      const direction = r['Initial Direction'] || r['Direction'];
      if (!direction || direction.toLowerCase() !== 'outbound') {
        return null;
      }

      const dateField = this.findBestMatch(Object.keys(r), map.date || ['Date/Time (earliest)', 'Date/Time', 'Date']);
      if (dateField && r[dateField]) {
        const pd = parseDate(r[dateField]);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
        }
      }

      const durationField = this.findBestMatch(Object.keys(r), map.duration || ['Duration', 'Call Duration']);
      if (durationField && r[durationField]) {
        r.isConnected = isConnectedCall(r[durationField]);
        r.duration_numeric = cleanNumber(r[durationField]);
      } else {
        r.isConnected = false;
      }

      console.log(`Processed outbound_connectrate row:`, {
        callId: r['Call ID'],
        date: r.__chartDate,
        direction: direction,
        duration: r[durationField],
        isConnected: r.isConnected
      });
    }

    // ----- OUTBOUND -----
    if (sourceKey === 'outbound') {
      if (r.Date) {
        const pd = this.parseDateRobust(r.Date);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
        }
      }

      r.TotalCalls_numeric = cleanNumber(r['Total Calls']);
      r.AnsweredCalls_numeric = cleanNumber(r['Answered Calls']);
      r.MissedCalls_numeric = cleanNumber(r['Missed Calls']);
      r.VoicemailCalls_numeric = cleanNumber(r['Voicemail Calls']);
      r.TotalCallDuration_numeric = cleanNumber(r['Total Call Duration']);
      r.OutboundCalls_numeric = cleanNumber(r['Outbound Calls']);
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

  parseDateRobust(dateString) {
    if (!dateString) return null;
    const formats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'MM-DD-YYYY'];
    for (const format of formats) {
      const parsedDate = dayjs(dateString, format, true);
      if (parsedDate.isValid()) {
        return parsedDate.toDate();
      }
    }
    return null;
  }

  isValidRow(row, key) {
    if (row === null) return false;

    if (Object.values(row).every(v => isBlank(v))) return false;

    if (key === 'outbound') {
      return !isBlank(row.Agent);
    }

    if (key === 'fcr') {
      return !isBlank(row.Year);
    }

    if (key === 'outbound_connectrate') {
      return !isBlank(row['Call ID']);
    }

    if (key === 'inbound') {
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
      data = filtered;
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