// js/data-loader.js
import { CONFIG, getFieldMapping } from './config.js';
import { showError, hideError, showLoading, hideLoading, updateProgress, normalizeHeader, parseDate, cleanNumber } from './utils.js';

class DataLoader {
  constructor(){ this.data = {}; this.metadata = {}; this.isLoading = false; }

  async loadAll(){
    if(this.isLoading) return;
    this.isLoading = true;
    hideError(); showLoading('Initializing data load...', 0);

    try {
      const keys = Object.keys(CONFIG.dataSources);
      let done = 0;

      const results = await Promise.all(keys.map(async key => {
        try {
          const res = await this.loadDataSource(key);
          done++; updateProgress((done/keys.length)*100, `Loaded ${CONFIG.dataSources[key].name}`);
          return { key, ...res };
        } catch(e){
          console.error(`Failed to load ${key}:`, e);
          done++; updateProgress((done/keys.length)*100);
          return { key, data: [], metadata: {}, error: e.message };
        }
      }));

      let hasErr = false;
      results.forEach(({key, data, metadata, error}) => {
        if(error){ hasErr = true; showError(`Failed to load ${CONFIG.dataSources[key].name}: ${error}`); }
        this.data[key] = data;
        this.metadata[key] = metadata;
      });

      if(!hasErr){ updateProgress(100,'Data loaded successfully!'); setTimeout(hideLoading, 500); }
      else hideLoading();

      return this.data;
    } finally { this.isLoading = false; }
  }

  async loadDataSource(key){
    const src = CONFIG.dataSources[key];
    const resp = await fetch(src.url);
    if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    if(!text.trim()) throw new Error('Empty data file');

    const parsed = await new Promise((resolve,reject)=>{
      Papa.parse(text,{
        header:true, skipEmptyLines:true, dynamicTyping:false, delimitersToGuess:[',','\t',';','|'],
        transformHeader:(h)=>h.trim().replace(/^\uFEFF/,''),
        complete:(res)=>resolve(res.data),
        error:(err)=>reject(new Error(`CSV parsing failed: ${err.message}`))
      });
    });

    const data = this.processData(parsed, key);
    const meta = {
      source: src.name,
      rowCount: data.length,
      columns: data.length? Object.keys(data[0]) : [],
      loadedAt: new Date().toISOString(),
      dateRange: this.getDateRange(data)
    };
    return { data, metadata: meta };
  }

  processData(rows, key){
    if(!rows || rows.length===0) return [];
    const map = CONFIG.fieldMappings[key] || {};
    const out = [];

    rows.forEach((row, i) => {
      try {
        const r = this.processRow(row, map, key);
        if(this.isValidRow(r, key)) out.push(r);
      } catch(e){ console.warn(`Row ${i+1} skipped:`, e, row); }
    });
    return out;
  }

  processRow(row, map, key){
    const r = {};
    Object.keys(row).forEach(k => { const ck = k.trim(); if(ck) r[ck] = row[k]; });

    // FCR: compose date from Year/Month/Date (day)
    if(key==='fcr' && (row.Year || row.Month || row.Date)){
      const y = cleanNumber(row.Year), m = cleanNumber(row.Month), d = cleanNumber(row.Date);
      if(y && m && d){
        const dt = new Date(y, m-1, d);
        if(!isNaN(dt.getTime())) r.date_parsed = dt;
      }
    }

    // Generic date field
    if(!r.date_parsed){
      const dateField = this.findBestMatch(Object.keys(r), map.date || []);
      if(dateField && r[dateField]){
        const pd = parseDate(r[dateField]);
        if(pd) r.date_parsed = pd;
      }
    }

    // Inbound numeric helpers
    if(key==='inbound'){
      const durF = this.findBestMatch(Object.keys(r), map.duration||[]);
      const waitF= this.findBestMatch(Object.keys(r), map.waitTime||[]);
      if(durF)  r.duration_numeric = cleanNumber(r[durF]);
      if(waitF) r.waitTime_numeric = cleanNumber(r[waitF]);
    }

    // Outbound numeric totals
    if(key==='outbound'){
      r.TotalCalls_numeric        = cleanNumber(r['Total Calls']);
      r.TotalCallDuration_numeric = cleanNumber(r['Total Call Duration']);
      r.AnsweredCalls_numeric     = cleanNumber(r['Answered Calls']);
      r.MissedCalls_numeric       = cleanNumber(r['Missed Calls']);
      r.VoicemailCalls_numeric    = cleanNumber(r['Voicemail Calls']);
    }

    // FCR count
    if(key==='fcr'){
      r.Count_numeric = cleanNumber(r['Count']);
    }

    return r;
  }

  findBestMatch(headers, candidates){
    const norm = headers.map(h => ({orig:h, norm: normalizeHeader(h)}));
    for(const c of candidates){
      const nc = normalizeHeader(c);
      const hit = norm.find(h => h.norm === nc);
      if(hit) return hit.orig;
    }
    return null;
  }

  // Keep rows; filtering happens later
  isValidRow(){ return true; }

  getDateRange(data){
    const dates = data.map(r => r.date_parsed).filter(Boolean);
    if(dates.length===0) return null;
    dates.sort((a,b)=>a-b);
    return { start: dates[0], end: dates[dates.length-1], count: dates.length };
  }

  filterByDateRange(key, startDate, endDate){
    const data = this.data[key] || [];
    if(!startDate || !endDate) return data;
    const s = parseDate(startDate), e = parseDate(endDate);
    if(!s || !e) return data;
    const eod = new Date(e); eod.setHours(23,59,59,999);
    return data.filter(r => r.date_parsed && r.date_parsed >= s && r.date_parsed <= eod);
  }

  getData(key, filters = {}){
    let data = [...(this.data[key] || [])];

    if(filters.startDate && filters.endDate){
      data = this.filterByDateRange(key, filters.startDate, filters.endDate);
    }
    if(filters.agent){
      const fields = getFieldMapping(key, 'agent');
      const q = filters.agent.toLowerCase();
      data = data.filter(r => fields.some(f => r[f] && String(r[f]).toLowerCase().includes(q)));
    }
    if(filters.status){
      const fields = getFieldMapping(key, 'status');
      const q = filters.status.toLowerCase();
      data = data.filter(r => fields.some(f => r[f] && String(r[f]).toLowerCase().includes(q)));
    }
    return data;
  }

  getMetadata(key){ return this.metadata[key] || {}; }
  clear(){ this.data = {}; this.metadata = {}; }
}

getSummary(sourceKey) {
  const data = this.data[sourceKey] || [];
  const dateRange = (() => {
    const dates = data.map(r => r.date_parsed).filter(Boolean).sort((a,b)=>a-b);
    if (!dates.length) return null;
    return { start: dates[0], end: dates[dates.length-1], count: dates.length };
  })();
  const columns = data.length ? Object.keys(data[0]) : [];
  return {
    source: CONFIG.dataSources[sourceKey]?.name || sourceKey,
    rowCount: data.length,
    columns,
    dateRange,
    loadedAt: this.metadata[sourceKey]?.loadedAt || null,
  };
}

export const dataLoader = new DataLoader();
export default dataLoader;
