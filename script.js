/* -------------------- Data sources (keep your paths) -------------------- */
const dataSources = {
  "inbound": "shared-data/inbound_calls.csv",
  "outbound": "shared-data/outbound_calls.csv",
  "fcr": "shared-data/fcr.csv"
};

/* if you already have dateField in your page, keep it;
   otherwise this is fine for most exports */
const dateField = {
  "inbound": "date",
  "outbound": "date",
  "fcr": "date"
};

const reportData = {};
const charts = {};

/* -------------------- Helpers -------------------- */
function normalizeHeader(h){
  return String(h||'')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,''); // letters+digits only
}
function cleanNumber(v){
  if (v == null) return 0;
  let s = String(v).trim().replace(/\u00A0/g,'').replace(/Â/g,'');
  if (!s) return 0;
  let neg=false;
  if (/^\(.*\)$/.test(s)){ neg=true; s=s.slice(1,-1).trim(); }
  // 1.234.567,89 -> 1234567.89
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)){
    s = s.replace(/\./g,'').replace(',', '.');
  } else {
    s = s.replace(/[£€$,]/g,'');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}
function toDateSafe(v){
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();

  // Excel serial date
  if (/^\d+(\.\d+)?$/.test(s)){
    const n = parseFloat(s);
    if (n > 20000 && n < 60000){
      const base = new Date(1899,11,30);
      base.setDate(base.getDate() + Math.floor(n));
      if (n%1) base.setTime(base.getTime() + ((n%1)*86400000));
      return base;
    }
  }
  // ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(s)){
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  // D/M/Y or M/D/Y
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m){
    const a = +m[1], b = +m[2], y = +m[3] < 100 ? 2000 + (+m[3]) : +m[3];
    if (a>12 && b<=12) return new Date(y, b-1, a);
    if (b>12 && a<=12) return new Date(y, a-1, b);
    return new Date(y, b-1, a);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function fmtInt(n){ return Math.round(n).toLocaleString(); }
function fmtTimeSecondsToMin(n){ return (n/60).toFixed(1)+" min"; }
function fmtPct(n){ return (n).toFixed(1)+"%"; }
function fmtMoney(n){ return "£"+cleanNumber(n).toLocaleString(undefined,{maximumFractionDigits:2}); }
function destroyChart(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }

/* Robust CSV parser (quotes + delimiter detection) */
function parseCSV(text){
  const raw = String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);
  const lines = raw.filter((l,i)=> i===0 || l.trim()!=='');
  if(!lines.length) return [];
  const head = lines[0];
  const countDelims = (ch)=>{let c=0,inQ=false;for(let i=0;i<head.length;i++){const x=head[i];if(x==='"'){inQ=!inQ;}else if(!inQ && x===ch){c++;}}return c;};
  const delim = (countDelims('\t')>countDelims(',') && countDelims('\t')>countDelims(';'))?'\t'
              : (countDelims(';')>countDelims(',')?';':',');

  const splitRow=(row)=>{
    const out=[]; let cur='',inQ=false;
    for(let i=0;i<row.length;i++){
      const ch=row[i];
      if(ch==='"'){
        if(inQ && row[i+1]==='"'){cur+='"'; i++;}
        else inQ=!inQ;
      }else if(ch===delim && !inQ){
        out.push(cur); cur='';
      }else{
        cur+=ch;
      }
    }
    out.push(cur);
    return out;
  };

  const headers = splitRow(lines[0]).map(normalizeHeader);
  const data=[];
  for(let i=1;i<lines.length;i++){
    const parts = splitRow(lines[i]);
    if(!parts.length) continue;
    const rec={};
    headers.forEach((h,idx)=> rec[h]=(parts[idx]??'').trim());
    if(Object.values(rec).some(v=>String(v).trim()!=='')) data.push(rec);
  }
  return data;
}

/* --------- Column detection (works with many header variants) --------- */
function getHeaders(rows){ return rows.length ? Object.keys(rows[0]) : []; }
function findCol(headers, candidates){
  const set = new Set(headers.map(normalizeHeader));
  for(const c of candidates){
    const key = normalizeHeader(c);
    if(set.has(key)) return headers.find(h=>normalizeHeader(h)===key);
  }
  return null;
}
function boolFromText(v){
  const s = String(v||'').trim().toLowerCase();
  return ['y','yes','true','1','resolved','success','completed'].includes(s);
}
function statusIsAbandoned(s){
  const v = String(s||'').trim().toLowerCase();
  return v.includes('abandon') || v.includes('missed') || v.includes('noanswer') || v.includes('no answer');
}
function statusIsConnected(s){
  const v = String(s||'').trim().toLowerCase();
  return v.includes('connect') || v.includes('answer') || v==='success';
}
function addTo(agg, key, amount){ agg[key]=(agg[key]||0)+amount; }

/* Weighted average helper */
function weightedAverage(rows, valueCol, weightCol){
  let num=0, den=0;
  rows.forEach(r=>{
    const v=cleanNumber(r[valueCol]);
    const w=weightCol ? cleanNumber(r[weightCol]) : 1;
    if(w>0){ num += v*w; den += w; }
  });
  return den? num/den : 0;
}

/* -------------------- INBOUND -------------------- */
function renderInbound(){
  const rows = reportData['inbound']||[];
  const headers = getHeaders(rows);

  const dateCol   = findCol(headers, [dateField['inbound'],'calldate','datetime','starttime','starttimeutc','timestamp','date']);
  const agentCol  = findCol(headers, ['agent','agentname','user','username','owner','handler']);
  const statusCol = findCol(headers, ['status','callstatus','outcome','disposition','result']);
  const handleCol = findCol(headers, ['handletime','aht','talktime','duration','durationsec','durationseconds','calllength','calltime','avghandletime']);
  const countCol  = findCol(headers, ['count','calls','callcount','totalcalls']); // aggregated rows support

  // Totals (support aggregated tables)
  const totalCalls = countCol ? rows.reduce((a,r)=>a+cleanNumber(r[countCol]),0) : rows.length;

  // Abandoned %
  let abandonedCount = 0;
  rows.forEach(r=>{
    const w = countCol ? cleanNumber(r[countCol]) : 1;
    if(statusIsAbandoned(r[statusCol])) abandonedCount += w;
  });
  const abandonPct = totalCalls ? (abandonedCount/totalCalls*100) : 0;

  // Avg handle time (weighted if aggregated)
  const avgHandleSec = handleCol ? weightedAverage(rows, handleCol, countCol) : 0;

  // KPIs (no layout change: same container)
  const kpiHTML = `
    <div class="panel"><div class="kpis">
      <div class="kpi"><div class="label">Total Calls</div><div class="value">${fmtInt(totalCalls)}</div></div>
      <div class="kpi"><div class="label">Avg Handle Time</div><div class="value">${fmtTimeSecondsToMin(avgHandleSec)}</div></div>
      <div class="kpi"><div class="label">Abandoned %</div><div class="value">${fmtPct(abandonPct)}</div></div>
    </div></div>`;

  const lineId='in-line', barId='in-bar';
  const chartsHTML=`<div class="charts">
    <div class="chart-card"><h3>Inbound Calls Over Time</h3><canvas id="${lineId}"></canvas></div>
    <div class="chart-card"><h3>Calls by Agent</h3><canvas id="${barId}"></canvas></div>
  </div>`;

  document.getElementById('inbound-content').innerHTML = kpiHTML + chartsHTML + `<div class="panel">${renderTable(rows)}</div>`;

  // Line: calls over time (by day) — counts weighted
  const overTime = {};
  rows.forEach(r=>{
    if(!dateCol) return;
    const d = toDateSafe(r[dateCol]); if(!d) return;
    const key = d.toISOString().slice(0,10);
    addTo(overTime, key, countCol ? cleanNumber(r[countCol]) : 1);
  });
  destroyChart(lineId);
  charts[lineId]=new Chart(document.getElementById(lineId),{
    type:'line',
    data:{ labels:Object.keys(overTime), datasets:[{label:'Calls', data:Object.values(overTime), borderColor:'#3b82f6', backgroundColor:'#3b82f6', tension:.2}] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });

  // Bar: by agent (weighted)
  const byAgent = {};
  rows.forEach(r=>{
    const k = agentCol ? (r[agentCol]||'Unknown') : 'Unknown';
    addTo(byAgent, k, countCol ? cleanNumber(r[countCol]) : 1);
  });
  destroyChart(barId);
  charts[barId]=new Chart(document.getElementById(barId),{
    type:'bar',
    data:{ labels:Object.keys(byAgent), datasets:[{label:'Calls', data:Object.values(byAgent), backgroundColor:'#10b981'}]},
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

/* -------------------- OUTBOUND -------------------- */
function renderOutbound(){
  const rows = reportData['outbound']||[];
  const headers = getHeaders(rows);

  const dateCol   = findCol(headers, [dateField['outbound'],'calldate','datetime','starttime','timestamp','date']);
  const outcomeCol= findCol(headers, ['outcome','disposition','result','status','callstatus']);
  const agentCol  = findCol(headers, ['agent','agentname','user','username','owner','handler']);
  const durCol    = findCol(headers, ['duration','talktime','durationsec','durationseconds','calllength','handletime']);
  const countCol  = findCol(headers, ['count','calls','callcount','totalcalls']);

  const totalCalls = countCol ? rows.reduce((a,r)=>a+cleanNumber(r[countCol]),0) : rows.length;

  // Connect rate
  let connects = 0;
  rows.forEach(r=>{
    const w = countCol ? cleanNumber(r[countCol]) : 1;
    if(statusIsConnected(r[outcomeCol])) connects += w;
  });
  const connectRate = totalCalls ? (connects/totalCalls*100) : 0;

  // Avg duration (weighted)
  const avgDurSec = durCol ? weightedAverage(rows, durCol, countCol) : 0;

  const kpiHTML = `
    <div class="panel"><div class="kpis">
      <div class="kpi"><div class="label">Total Calls</div><div class="value">${fmtInt(totalCalls)}</div></div>
      <div class="kpi"><div class="label">Connect Rate</div><div class="value">${fmtPct(connectRate)}</div></div>
      <div class="kpi"><div class="label">Avg Duration</div><div class="value">${fmtTimeSecondsToMin(avgDurSec)}</div></div>
    </div></div>`;

  const lineId='out-line', barId='out-bar';
  const chartsHTML=`<div class="charts">
    <div class="chart-card"><h3>Outbound Calls Over Time</h3><canvas id="${lineId}"></canvas></div>
    <div class="chart-card"><h3>Outcomes</h3><canvas id="${barId}"></canvas></div>
  </div>`;

  document.getElementById('outbound-content').innerHTML = kpiHTML + chartsHTML + `<div class="panel">${renderTable(rows)}</div>`;

  // Line: calls over time (weighted)
  const overTime = {};
  rows.forEach(r=>{
    if(!dateCol) return;
    const d = toDateSafe(r[dateCol]); if(!d) return;
    const key = d.toISOString().slice(0,10);
    addTo(overTime, key, countCol ? cleanNumber(r[countCol]) : 1);
  });
  destroyChart(lineId);
  charts[lineId]=new Chart(document.getElementById(lineId),{
    type:'line',
    data:{ labels:Object.keys(overTime), datasets:[{label:'Calls', data:Object.values(overTime), borderColor:'#f59e0b', backgroundColor:'#f59e0b', tension:.2}] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });

  // Bar: outcomes (weighted)
  const byOutcome = {};
  rows.forEach(r=>{
    const k = outcomeCol ? (r[outcomeCol]||'Unknown') : 'Unknown';
    addTo(byOutcome, k, countCol ? cleanNumber(r[countCol]) : 1);
  });
  destroyChart(barId);
  charts[barId]=new Chart(document.getElementById(barId),{
    type:'bar',
    data:{ labels:Object.keys(byOutcome), datasets:[{label:'Calls', data:Object.values(byOutcome), backgroundColor:'#ef4444'}]},
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}

/* -------------------- FCR -------------------- */
function renderFCR(){
  const rows = reportData['fcr']||[];
  const headers = getHeaders(rows);

  const dateCol   = findCol(headers, [dateField['fcr'],'date','calldate','createdon','opened','datetime']);
  const agentCol  = findCol(headers, ['agent','agentname','user','username','owner','handler']);
  const resCol    = findCol(headers, ['resolved','fcr','firstcontactresolution','resolution','resolvedonfirstcall','isresolved']);
  const countCol  = findCol(headers, ['count','calls','cases','tickets','total','totalcalls','callcount']);

  const total = countCol ? rows.reduce((a,r)=>a+cleanNumber(r[countCol]),0) : rows.length;

  let resolved = 0;
  rows.forEach(r=>{
    const w = countCol ? cleanNumber(r[countCol]) : 1;
    if (boolFromText(r[resCol])) resolved += w;
  });
  const fcrPct = total ? (resolved/total*100) : 0;
  const escalations = total - resolved;

  const kpiHTML = `
    <div class="panel"><div class="kpis">
      <div class="kpi"><div class="label">Total Cases</div><div class="value">${fmtInt(total)}</div></div>
      <div class="kpi"><div class="label">FCR %</div><div class="value">${fmtPct(fcrPct)}</div></div>
      <div class="kpi"><div class="label">Escalations</div><div class="value">${fmtInt(escalations)}</div></div>
    </div></div>`;

  const lineId='fcr-line', barId='fcr-bar';
  const chartsHTML=`<div class="charts">
    <div class="chart-card"><h3>FCR % Over Time</h3><canvas id="${lineId}"></canvas></div>
    <div class="chart-card"><h3>By Agent</h3><canvas id="${barId}"></canvas></div>
  </div>`;

  document.getElementById('fcr-content').innerHTML = kpiHTML + chartsHTML + `<div class="panel">${renderTable(rows)}</div>`;

  // Line: monthly FCR% (weighted by count when present)
  const totalAgg={}, resAgg={};
  rows.forEach(r=>{
    if(!dateCol) return;
    const d = toDateSafe(r[dateCol]); if(!d) return;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const w = countCol ? cleanNumber(r[countCol]) : 1;
    addTo(totalAgg, k, w);
    if (boolFromText(r[resCol])) addTo(resAgg, k, w);
  });
  const labels = Object.keys(totalAgg).sort();
  const values = labels.map(k => totalAgg[k] ? (resAgg[k]||0)/totalAgg[k]*100 : 0);
  destroyChart(lineId);
  charts[lineId]=new Chart(document.getElementById(lineId),{
    type:'line',
    data:{ labels, datasets:[{label:'FCR %', data:values, borderColor:'#10b981', backgroundColor:'#10b981', tension:.2}] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true, max:100 } } }
  });

  // Bar: FCR% by agent (weighted)
  const agentTotal={}, agentRes={};
  rows.forEach(r=>{
    const a = agentCol ? (r[agentCol]||'Unknown') : 'Unknown';
    const w = countCol ? cleanNumber(r[countCol]) : 1;
    addTo(agentTotal, a, w);
    if (boolFromText(r[resCol])) addTo(agentRes, a, w);
  });
  const agents = Object.keys(agentTotal);
  const fcrByAgent = agents.map(a => agentTotal[a] ? (agentRes[a]||0)/agentTotal[a]*100 : 0);
  destroyChart(barId);
  charts[barId]=new Chart(document.getElementById(barId),{
    type:'bar',
    data:{ labels:agents, datasets:[{label:'FCR %', data:fcrByAgent, backgroundColor:'#3b82f6'}] },
    options:{ responsive:true, scales:{ y:{ beginAtZero:true, max:100 } } }
  });
}

/* -------------------- Table helper (keeps your look) -------------------- */
function renderTable(rows, maxRows=100){
  if(!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.slice(0,maxRows).map(r=>`<tr>${headers.map(h=>`<td>${r[h]??''}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

/* -------------------- Nav wiring (no layout changes) -------------------- */
document.querySelectorAll('.nav-link').forEach(link=>{
  link.addEventListener('click',e=>{
    e.preventDefault();
    const page=link.dataset.page;
    document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('main .page').forEach(p=>p.classList.add('hidden'));
    document.getElementById(`${page}-page`).classList.remove('hidden');

    if(page==='inbound') renderInbound();
    else if(page==='outbound') renderOutbound();
    else if(page==='fcr') renderFCR();
  });
});

/* -------------------- Load CSVs -------------------- */
async function loadAll(){
  for(const [rep,url] of Object.entries(dataSources)){
    try{
      const res = await fetch(url);
      const txt = await res.text();
      reportData[rep] = parseCSV(txt);
      // console.log(`Loaded ${reportData[rep].length} rows for ${rep}`);
    }catch(err){
      console.error('Load error', rep, err);
      reportData[rep] = [];
    }
  }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await loadAll();
  const first = document.querySelector('.nav-link[data-page="inbound"]');
  if(first) first.click();
});
