// js/config.js
export const CONFIG = {
  dataSources: {
    inbound:  { url: "./data/inbound_calls.csv",            name: "Inbound Calls",  icon: "📥", color: "#3b82f6" },
    outbound: { url: "./data/outbound_calls.csv",           name: "Outbound Calls", icon: "📤", color: "#10b981" },
	outbound_connectrate: { url: "./data/outbound_connectrate.csv",           name: "Outbound Connect Rate", icon: "📤", color: "#10b981" },
    fcr:      { url: "./data/first_contact_resolution.csv", name: "First Contact Resolution", icon: "✅", color: "#f59e0b" }
	
  },

  fieldMappings: {
    inbound: {
      date:     ["Date/Time"],
      agent:    ["Agent Name"],
      status:   ["Disposition"],
      duration: ["Talk Time"],
      waitTime: ["Wait Time"],
      count:    ["Call ID"]
    },
    outbound: {
      date:     ["Date"],
      agent:    ["Agent"],
      status:   ["Answered Calls","Missed Calls","Voicemail Calls"], // used in charts
      duration: ["Total Call Duration"],
      count:    ["Total Calls"]
    },
	outbound_connectrate: {
	   date: ['Date/Time (earliest)', 'Date/Time', 'Date'],
       direction: ['Initial Direction', 'Direction'],
       duration: ['Duration', 'Call Duration'],
       agent: ['Agent', 'Agent Name']
    },

    fcr: {
      date:     ["Date"],   // we compose full date from Year/Month/Date in the loader
      count:    ["Count"]
    }
  },

  kpiConfig: {
    inbound: [
      { key: "totalCalls",    label: "Total Calls",      icon: "📞", color: "#3b82f6", format: "number" },
      { key: "abandonRate",   label: "Abandon Rate",     icon: "📉", color: "#ef4444", format: "percentage", threshold: { warning: 10, critical: 20 } },
      { key: "avgHandleTime", label: "Avg Handle Time",  icon: "⏱️", color: "#10b981", format: "duration" },
      { key: "avgWaitTime",   label: "Avg Wait Time",    icon: "⏳", color: "#f59e0b", format: "duration", threshold: { warning: 120, critical: 300 } }
    ],
    outbound: [
      { key: "totalCalls",    label: "Total Calls",      icon: "📞", color: "#3b82f6", format: "number" },
      { key: "connectRate",   label: "Connect Rate",     icon: "📈", color: "#10b981", format: "percentage", threshold: { warning: 15, critical: 10 } },
      { key: "avgTalkTime",   label: "Avg Talk Time",    icon: "💬", color: "#8b5cf6", format: "duration" }
    ],
    fcr: [
      { key: "totalCases",    label: "Total Cases",      icon: "📝", color: "#3b82f6", format: "number" }
    ]
  },

  colorSchemes: {
    primary: ["#3b82f6","#1d4ed8","#1e40af","#1e3a8a"],
    success: ["#10b981","#059669","#047857","#065f46"],
    warning: ["#f59e0b","#d97706","#b45309","#92400e"],
    danger:  ["#ef4444","#dc2626","#b91c1c","#991b1b"],
    mixed:   ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"]
  },

  statusPatterns: {
    abandoned: ["abandon","missed","no answer","noanswer","timeout","hangup"],
    connected: ["connect","answer","success","completed","resolved"],
    busy:      ["busy","engaged"],
    failed:    ["failed","error","invalid","reject"]
  },

  dateFormats: {
    display: "MMM DD, YYYY",
    input:   "YYYY-MM-DD",
    chart:   "MMM YYYY",
    api:     "YYYY-MM-DD HH:mm:ss"
  },

  chartDefaults: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend:  { position: "bottom", labels: { usePointStyle: true, padding: 20 } },
      tooltip: { backgroundColor: "rgba(0, 0, 0, 0.8)", titleColor: "#fff", bodyColor: "#fff", cornerRadius: 8, padding: 12 }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: { beginAtZero: true, grid: { color: "rgba(0, 0, 0, 0.1)" } }
    },
    animation: { duration: 750, easing: "easeInOutQuart" }
  },

  export: {
    formats: ["csv","xlsx","json"],
    filename: { prefix: "call_performance_", dateFormat: "YYYYMMDD_HHmm" }
  },

  api: { baseUrl: "/api/v1", timeout: 30000, retryAttempts: 3, retryDelay: 1000 },

  performance: { maxDataPoints: 10000, chartUpdateDebounce: 300, dataRefreshInterval: 300000, enableVirtualScrolling: true },

  features: { realTimeUpdates: false, dataExport: true, chartInteractions: true, filterPersistence: true, darkMode: false, notifications: true },

  validation: {
    // 🔸 broaden default range so Outbound/FCR appear on first load
    dateRange: { maxDays: 3650, defaultDays: 3650 },
    fileSize:  { maxSizeMB: 50 },
    requiredFields: { inbound: [], outbound: [], fcr: [] }
  }
};

export function getFieldMapping(ds, fieldType){ return CONFIG.fieldMappings[ds]?.[fieldType] || []; }
export function getKPIConfig(ds){ return CONFIG.kpiConfig[ds] || []; }
export function getColorScheme(scheme='primary'){ return CONFIG.colorSchemes[scheme] || CONFIG.colorSchemes.primary; }
export function matchesStatusPattern(status, pattern){
  if(!status) return false;
  const s = String(status).toLowerCase();
  const patterns = CONFIG.statusPatterns[pattern] || [];
  return patterns.some(p => s.includes(p));
}
export default CONFIG;