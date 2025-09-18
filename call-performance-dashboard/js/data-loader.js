// js/data-loader.js - Full Diagnostic Version
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

    console.log('=== STARTING DATA LOAD ===');

    try {
      const keys = Object.keys(CONFIG.dataSources);
      console.log('Data sources to load:', keys);
      let done = 0;

      const results = await Promise.all(
        keys.map(async (key) => {
          try {
            console.log(`Loading ${key}...`);
            const res = await this.loadDataSource(key);
            done += 1;
            updateProgress((done / keys.length) * 100, `Loaded ${CONFIG.dataSources[key].name}`);
            console.log(`✓ Successfully loaded ${key}:`, res.data.length, 'rows');
            return { key, ...res };
          } catch (e) {
            console.error(`✗ Failed to load ${key}:`, e);
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
        
        console.log(`Final data for ${key}:`, {
          totalRows: data.length,
          firstRow: data[0],
          lastRow: data[data.length - 1],
          columns: data.length ? Object.keys(data[0]) : [],
          sampleDates: data.slice(0, 3).map(r => ({ __chartDate: r.__chartDate, date_parsed: r.date_parsed }))
        });
      });

      if (!hasErr) {
        updateProgress(100, 'Data loaded successfully!');
        setTimeout(hideLoading, 500);
      } else {
        hideLoading();
      }

      console.log('=== FINAL DATA SUMMARY ===');
      Object.keys(this.data).forEach(key => {
        console.log(`${key}: ${this.data[key].length} rows loaded`);
      });

      return this.data;
    } finally {
      this.isLoading = false;
    }
  }

  async loadDataSource(key) {
    const src = CONFIG.dataSources[key];
    console.log(`Fetching ${key} from:`, src.url);
    
    const resp = await fetch(src.url);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    if (!text.trim()) throw new Error('Empty data file');

    console.log(`Raw CSV text length for ${key}:`, text.length);
    console.log(`First 200 chars:`, text.substring(0, 200));

    const parsed = await this.parseCSV(text);
    console.log(`Parsed CSV for ${key}:`, {
      totalRows: parsed.length,
      headers: parsed.length ? Object.keys(parsed[0]) : [],
      firstThreeRows: parsed.slice(0, 3)
    });

    const data = this.processData(parsed, key);
    console.log(`Processed data for ${key}:`, {
      originalRows: parsed.length,
      validRows: data.length,
      rejectedRows: parsed.length - data.length,
      firstProcessedRow: data[0]
    });

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
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        delimitersToGuess: [',', '\t', ';', '|'],
        transformHeader: (h) => h.trim().replace(/^\uFEFF/, ''),
        complete: (res) => {
          console.log('Papa Parse result:', {
            data: res.data?.length || 0,
            errors: res.errors,
            meta: res.meta
          });
          resolve(res.data);
        },
        error: (err) => reject(new Error(`CSV parsing failed: ${err.message}`))
      });
    });
  }

  processData(rows, key) {
    console.log(`\n=== PROCESSING ${key.toUpperCase()} DATA ===`);
    if (!rows || rows.length === 0) return [];
    const map = CONFIG.fieldMappings[key] || {};
    const out = [];

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      try {
        console.log(`Processing row ${i} for ${key}:`, rows[i]);
        const r = this.processRow(rows[i], map, key);
        console.log(`After processing:`, r);
        
        const isValid = this.isValidRow(r, key);
        console.log(`Row ${i} valid?`, isValid);
        
        if (isValid) {
          out.push(r);
        } else {
          console.log(`Row ${i} rejected`);
        }
      } catch (e) {
        console.error(`Row ${i + 1} error:`, e, rows[i]);
      }
    }

    // Process remaining rows without logging
    for (let i = 10; i < rows.length; i++) {
      try {
        const r = this.processRow(rows[i], map, key);
        if (this.isValidRow(r, key)) out.push(r);
      } catch (e) {
        console.warn(`Row ${i + 1} skipped:`, e);
      }
    }

    console.log(`${key} processing complete: ${out.length}/${rows.length} rows kept`);
    return out;
  }

  processRow(row, map, sourceKey) {
    const r = {};
    Object.keys(row).forEach(k => {
      const ck = k.trim();
      if (ck) r[ck] = row[k];
    });

    console.log(`Processing ${sourceKey} row with columns:`, Object.keys(r));

    if (sourceKey === 'fcr') {
      console.log('FCR date components:', { Year: r.Year, Month: r.Month, Date: r.Date });
      const year = cleanNumber(r.Year);
      const month = cleanNumber(r.Month);
      const day = cleanNumber(r.Date);
      
      if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(year, month - 1, day);
        if (!isNaN(dt)) {
          r.date_parsed = dt;
          r.__chartDate = dt.toISOString().split('T')[0];
          console.log('FCR date parsed:', r.__chartDate);
        }
      }
      
      r.Count_numeric = cleanNumber(r.Count);
      console.log('FCR Count_numeric:', r.Count_numeric);
    }

    if (sourceKey === 'outbound') {
      console.log('Outbound date field:', r.Date);
      if (r.Date) {
        const pd = parseDate(r.Date);
        console.log('Parsed date result:', pd);
        if (pd) {
          r.date_parsed = pd;
          r.__chartDate = pd.toISOString().split('T')[0];
          console.log('Outbound date set:', r.__chartDate);
        }
      }
      
      r.TotalCalls_numeric = cleanNumber(r['Total Calls']);
      r.AnsweredCalls_numeric = cleanNumber(r['Answered Calls']);
      r.MissedCalls_numeric = cleanNumber(r['Missed Calls']);
      r.VoicemailCalls_numeric = cleanNumber(r['Voicemail Calls']);
      
      console.log('Outbound metrics:', {
        totalCalls: r.TotalCalls_numeric,
        answered: r.AnsweredCalls_numeric,
        missed: r.MissedCalls_numeric
      });
    }

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
	if (Object.values(row).every(v => isBlank(v))) {
	  console.log('Row rejected: completely blank');
      return false;
	}

	if (key === 'outbound') {
      const hasAgent = !isBlank(row.Agent);
      console.log('Outbound validation:', { hasAgent, agent: row.Agent });
      return hasAgent;
    }

	if (key === 'fcr') {
      const hasYear = !isBlank(row.Year);
      console.log('FCR validation:', { hasYear, year: row.Year });
      return hasYear;
    }

	if (key === 'inbound') {
      return !isBlank(row['Call ID']);
    }

	return true;
  }


  filterByDateRange(key, startDate, endDate) {
    const data = this.data[key] || [];
    console.log(`Filtering ${key} by date range ${startDate} to ${endDate}. Original count:`, data.length);
    
    if (!startDate || !endDate) return data;

    const s = parseDate(startDate);
    const e = parseDate(endDate);
    if (!s || !e) return data;

    const hasAnyDate = data.some(r => r.date_parsed instanceof Date && !isNaN(r.date_parsed));
    console.log(`${key} has parseable dates:`, hasAnyDate);
    
    if (!hasAnyDate) return data;

    const eod = new Date(e);
    eod.setHours(23, 59, 59, 999);

    const filtered = data.filter(r => r.date_parsed && r.date_parsed >= s && r.date_parsed <= eod);
    console.log(`${key} after date filtering:`, filtered.length);
    
    return filtered;
  }

  getData(key, filters = {}) {
    console.log(`\n=== GETTING DATA FOR ${key.toUpperCase()} ===`);
    console.log('Filters:', filters);
    console.log('Raw data count:', this.data[key]?.length || 0);
    
    const original = this.data[key] || [];
    let data = original;

    if (filters.startDate && filters.endDate) {
      const filtered = this.filterByDateRange(key, filters.startDate, filters.endDate);
      if (filtered.length > 0 || key === 'inbound') {
        data = filtered;
      }
      console.log('After date filtering:', data.length);
    }

    console.log(`Final data count for ${key}:`, data.length);
    if (data.length > 0) {
      console.log('Sample data:', data[0]);
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