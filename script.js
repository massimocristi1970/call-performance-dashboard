/* -------------------- Data sources -------------------- */
const dataSources = {
  "inbound":"shared-data/inbound_calls.csv",
  "outbound":"shared-data/outbound_calls.csv",
  "fcr":"shared-data/fcr.csv"
};

const dateField = {
  "inbound":"date",
  "outbound":"date",
  "fcr":"date"
};

const reportData = {};
const charts = {};

/* -------------------- Helpers -------------------- */
function normalizeHeader(h){ return String(h||'').trim().toLowerCase().replace(/\s+/g,''); }
function cleanNumber(v){ const n=parseFloat(String(v).replace(/[£$,]/g,'')); return Number.isFinite(n)?n:0; }
function toDateSafe(v){ const d=new Date(v); return isNaN(d)?null:d; }
function fmt(n){ return cleanNumber(n).toLocaleString(); }
function fmtTime(n){ return (cleanNumber(n)/60).toFixed(1)+" min"; } // example for AHT

function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);
  const headers=lines[0].split(',').map(normalizeHeader);
  const data=[];
  for(let i=1;i<lines.length;i++){
    const parts=lines[i].split(',');
    const rec={};
    headers.forEach((h,idx)=> rec[h]=parts[idx]);
    data.push(rec);
  }
  return data;
}

function destroyChart(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }

/* -------------------- Inbound -------------------- */
function renderInbound(){
  const rows=reportData['inbound']||[];
  const totalCalls=rows.length;
  const avgHandle=rows.reduce((a,r)=>a+cleanNumber(r['handletime']),0)/totalCalls;
  const abandoned=rows.filter(r=>r['status']==='Abandoned').length;
  const abandonPct = totalCalls ? (abandoned/totalCalls*100) : 0;

  const kpi=`<div class="panel"><div class="kpis">
    <div class="kpi"><div class="label">Total Calls</div><div class="value">${fmt(totalCalls)}</div></div>
    <div class="kpi"><div class="label">Avg Handle Time</div><div class="value">${fmtTime(avgHandle)}</div></div>
    <div class="kpi"><div class="label">Abandoned %</div><div class="value">${abandonPct.toFixed(1)}%</div></div>
  </div></div>`;

  const lineId='in-line', barId='in-bar';
  const chartsHTML=`<div class="charts">
    <div class="chart-card"><h3>Inbound Calls Over Time</h3><canvas id="${lineId}"></canvas></div>
    <div class="chart-card"><h3>Calls by Agent</h3><canvas id="${barId}"></canvas></div>
  </div>`;

  document.getElementById('inbound-content').innerHTML=kpi+chartsHTML;

  // Line chart
  const agg={};
  rows.forEach(r=>{const d=toDateSafe(r['date']); if(!d) return; const k=d.toISOString().slice(0,10); agg[k]=(agg[k]||0)+1;});
  destroyChart(lineId);
  charts[lineId]=new Chart(document.getElementById(lineId),{
    type:'line', data:{ labels:Object.keys(agg), datasets:[{label:'Calls', data:Object.values(agg), borderColor:'#3b82f6'}] }
  });

  // Bar chart by agent
  const sums={};
  rows.forEach(r=>{const k=r['agent']||'Unknown'; sums[k]=(sums[k]||0)+1;});
  destroyChart(barId);
  charts[barId]=new Chart(document.getElementById(barId),{
    type:'bar', data:{ labels:Object.keys(sums), datasets:[{label:'Calls', data:Object.values(sums), backgroundColor:'#10b981'}] }
  });
}

/* -------------------- Outbound -------------------- */
function renderOutbound(){
  const rows=reportData['outbound']||[];
  const totalCalls=rows.length;
  const connects=rows.filter(r=>r['outcome']==='Connected').length;
  const connectRate = totalCalls ? (connects/totalCalls*100) : 0;
  const avgDur=rows.reduce((a,r)=>a+cleanNumber(r['duration']),0)/totalCalls;

  const kpi=`<div class="panel"><div class="kpis">
    <div class="kpi"><div class="label">Total Calls</div><div class="value">${fmt(totalCalls)}</div></div>
    <div class="kpi"><div class="label">Connect Rate</div><div class="value">${connectRate.toFixed(1)}%</div></div>
    <div class="kpi"><div class="label">Avg Duration</div><div class="value">${fmtTime(avgDur)}</div></div>
  </div></div>`;

  const lineId='out-line', barId='out-bar';
  const chartsHTML=`<div class="charts">
    <div class="chart-card"><h3>Outbound Calls Over Time</h3><canvas id="${lineId}"></canvas></div>
    <div class="chart-card"><h3>Outcomes</h3><canvas id="${barId}"></canvas></div>
  </div>`;

  document.getElementById('outbound-content').innerHTML=kpi+chartsHTML;

  // Line chart
  const agg={};
  rows.forEach(r=>{const d=toDateSafe(r['date']); if(!d) return; const k=d.toISOString().slice(0,10); agg[k]=(agg[k]||0)+1;});
  destroyChart(lineId);
  charts[lineId]=new Chart(document.getElementById(lineId),{
    type:'line', data:{ labels:Object.keys(agg), datasets:[{label:'Calls', data:Object.values(agg), borderColor:'#f59e0b'}] }
  });

  // Bar chart by outcome
  const sums={};
  rows.forEach(r=>{const k=r['outcome']||'Unknown'; sums[k]=(sums[k]||0)+1;});
  destroyChart(barId);
  charts[barId]=new Chart(document.getElementById(barId),{
    type:'bar', data:{ labels:Object.keys(sums), datasets:[{label:'Calls', data:Object.values(sums), backgroundColor:'#ef4444'}] }
  });
}

/* -------------------- FCR -------------------- */
function renderFCR(){
  const rows=reportData['fcr']||[];
  const total=rows.length;
  const resolved=rows.filter(r=>r['resolved']==='Yes').length;
  const fcrPct= total ? (resolved/total*100) : 0;
  const escalations=rows.filter(r=>r['resolved']==='No').length;

  const kpi=`<div class="panel"><div class="kpis">
    <div class="kpi"><div class="label">Total Cases</div><div class="value">${fmt(total)}</div></div>
    <div class="kpi"><div class="label">FCR %</div><div class="value">${fcrPct.toFixed(1)}%</div></div>
    <div class="kpi"><div class="label">Escalations</div><div class="value">${fmt(escalations)}</div></div>
  </div></div>`;

  const lineId='fcr-line', barId='fcr-bar';
  const chartsHTML=`<div class="charts">
    <div class="chart-card"><h3>FCR % Over Time</h3><canvas id="${lineId}"></canvas></div>
    <div class="chart-card"><h3>By Agent</h3><canvas id="${barId}"></canvas></div>
  </div>`;

  document.getElementById('fcr-content').innerHTML=kpi+chartsHTML;

  // Line chart (monthly FCR%)
  const agg={}, totalAgg={};
  rows.forEach(r=>{
    const d=toDateSafe(r['date']); if(!d) return;
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    totalAgg[k]=(totalAgg[k]||0)+1;
    if(r['resolved']==='Yes') agg[k]=(agg[k]||0)+1;
  });
  const labels=Object.keys(totalAgg).sort();
  const values=labels.map(k=> totalAgg[k]? (agg[k]||0)/totalAgg[k]*100 : 0);
  destroyChart(lineId);
  charts[lineId]=new Chart(document.getElementById(lineId),{
    type:'line', data:{ labels, datasets:[{label:'FCR %', data:values, borderColor:'#10b981'}] },
    options:{ scales:{y:{beginAtZero:true,max:100}} }
  });

  // Bar chart by agent
  const byAgent={}, byAgentTotal={};
  rows.forEach(r=>{
    const k=r['agent']||'Unknown';
    byAgentTotal[k]=(byAgentTotal[k]||0)+1;
    if(r['resolved']==='Yes') byAgent[k]=(byAgent[k]||0)+1;
  });
  const agents=Object.keys(byAgentTotal);
  const fcrRates=agents.map(a=> byAgentTotal[a]? (byAgent[a]||0)/byAgentTotal[a]*100 : 0);
  destroyChart(barId);
  charts[barId]=new Chart(document.getElementById(barId),{
    type:'bar', data:{ labels:agents, datasets:[{label:'FCR %', data:fcrRates, backgroundColor:'#3b82f6'}] },
    options:{ scales:{y:{beginAtZero:true,max:100}} }
  });
}

/* -------------------- Navigation -------------------- */
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

/* -------------------- Load all CSVs -------------------- */
async function loadAll(){
  for(const [rep,url] of Object.entries(dataSources)){
    try{
      const res=await fetch(url);
      const txt=await res.text();
      reportData[rep]=parseCSV(txt);
      console.log(`Loaded ${reportData[rep].length} rows for ${rep}`);
    }catch(err){
      console.error('Load error',rep,err);
      reportData[rep]=[];
    }
  }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await loadAll();
  document.querySelector('.nav-link[data-page="inbound"]').click();
});