// Configuration for the Call Performance Dashboard
export const CONFIG = {
  // Data sources configuration
  dataSources: {
    inbound: {
      url: "data/inbound_calls.csv",
      name: "Inbound Calls",
      icon: "📥",
      color: "#3b82f6"
    },
    outbound: {
      url: "data/outbound_calls.csv", 
      name: "Outbound Calls",
      icon: "📤",
      color: "#10b981"
    },
    fcr: {
      url: "data/first_contact_resolution.csv",
      name: "First Contact Resolution",
      icon: "✅",
      color: "#f59e0b"
    }
  },

  // Field mappings for different data sources
  fieldMappings: {
  inbound: {
    date: ['Date/Time', 'date', 'call_date', 'datetime', 'starttime'],
    agent: ['Agent Name', 'agent', 'agent_name', 'user', 'username'], 
    status: ['Disposition', 'status', 'call_status', 'outcome', 'disposition'],
    duration: ['Talk Time', 'duration', 'handle_time', 'talk_time'],
    waitTime: ['Wait Time', 'wait_time', 'queue_time', 'hold_time'],
    count: ['count', 'calls', 'call_count', 'total_calls']
  },
  outbound: {
    date: ['Date', 'date', 'call_date', 'datetime'],
    agent: ['Agent', 'agent', 'agent_name', 'user'],
    status: ['status', 'call_status', 'outcome', 'disposition'],
    duration: ['Total Call Duration', 'duration', 'talk_time', 'call_length'],
    count: ['Total Calls', 'count', 'calls', 'call_count']
  },
  fcr: {
    date: ['Date', 'date', 'resolution_date', 'case_date'],
    count: ['Count', 'count', 'cases', 'tickets'],
    resolved: ['resolved', 'fcr', 'first_contact_resolution', 'outcome']
  }
},

  // Chart color schemes
  colorSchemes: {
    primary: ['#3b82f6', '#1d4ed8', '#1e40af', '#1e3a8a'],
    success: ['#10b981', '#059669', '#047857', '#065f46'],
    warning: ['#f59e0b', '#d97706', '#b45309', '#92400e'],
    danger: ['#ef4444', '#dc2626', '#b91c1c', '#991b1b'],
    mixed: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  },

  // Status classification patterns
  statusPatterns: {
    abandoned: ['abandon', 'missed', 'no answer', 'noanswer', 'timeout', 'hangup'],
    connected: ['connect', 'answer', 'success', 'completed', 'resolved'],
    busy: ['busy', 'engaged'],
    failed: ['failed', 'error', 'invalid', 'reject']
  },

  // Date format configurations
  dateFormats: {
    display: 'MMM DD, YYYY',
    input: 'YYYY-MM-DD',
    chart: 'MMM YYYY',
    api: 'YYYY-MM-DD HH:mm:ss'
  },

  // Chart default configurations
  chartDefaults: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        cornerRadius: 8,
        padding: 12
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          maxTicksLimit: 10
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    animation: {
      duration: 750,
      easing: 'easeInOutQuart'
    }
  },

  // KPI configurations
  kpiConfig: {
    inbound: [
      {
        key: 'totalCalls',
        label: 'Total Calls',
        icon: '📞',
        color: '#3b82f6',
        format: 'number'
      },
      {
        key: 'abandonRate',
        label: 'Abandon Rate',
        icon: '📉',
        color: '#ef4444',
        format: 'percentage',
        threshold: { warning: 10, critical: 20 }
      },
      {
        key: 'avgHandleTime',
        label: 'Avg Handle Time',
        icon: '⏱️',
        color: '#10b981',
        format: 'duration'
      },
      {
        key: 'avgWaitTime',
        label: 'Avg Wait Time',
        icon: '⏳',
        color: '#f59e0b',
        format: 'duration',
        threshold: { warning: 120, critical: 300 }
      }
    ],
    outbound: [
      {
        key: 'totalCalls',
        label: 'Total Calls',
        icon: '📞',
        color: '#3b82f6',
        format: 'number'
      },
      {
        key: 'connectRate',
        label: 'Connect Rate',
        icon: '📈',
        color: '#10b981',
        format: 'percentage',
        threshold: { warning: 15, critical: 10 }
      },
      {
        key: 'avgTalkTime',
        label: 'Avg Talk Time',
        icon: '💬',
        color: '#8b5cf6',
        format: 'duration'
      },
      {
        key: 'campaignCount',
        label: 'Active Campaigns',
        icon: '📋',
        color: '#06b6d4',
        format: 'number'
      }
    ],
    fcr: [
      {
        key: 'totalCases',
        label: 'Total Cases',
        icon: '📝',
        color: '#3b82f6',
        format: 'number'
      },
      {
        key: 'fcrRate',
        label: 'FCR Rate',
        icon: '✅',
        color: '#10b981',
        format: 'percentage',
        threshold: { warning: 70, critical: 60 }
      },
      {
        key: 'avgResolutionTime',
        label: 'Avg Resolution Time',
        icon: '🕒',
        color: '#f59e0b',
        format: 'duration'
      },
      {
        key: 'escalationRate',
        label: 'Escalation Rate',
        icon: '⚠️',
        color: '#ef4444',
        format: 'percentage',
        threshold: { warning: 15, critical: 25 }
      }
    ]
  },

  // Export settings
  export: {
    formats: ['csv', 'xlsx', 'json'],
    filename: {
      prefix: 'call_performance_',
      dateFormat: 'YYYYMMDD_HHmm'
    }
  },

  // API settings (if integrating with external APIs)
  api: {
    baseUrl: '/api/v1',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },

  // Performance settings
  performance: {
    maxDataPoints: 10000,
    chartUpdateDebounce: 300,
    dataRefreshInterval: 300000, // 5 minutes
    enableVirtualScrolling: true
  },

  // Feature flags
  features: {
    realTimeUpdates: false,
    dataExport: true,
    chartInteractions: true,
    filterPersistence: true,
    darkMode: false,
    notifications: true
  },

  // Validation rules
  validation: {
    dateRange: {
      maxDays: 365,
      defaultDays: 30
    },
    fileSize: {
      maxSizeMB: 50
    },
    requiredFields: {
      inbound: [],
      outbound: [],
      fcr: []
    }
  }
};

// Utility function to get field mapping
export function getFieldMapping(dataSource, fieldType) {
  return CONFIG.fieldMappings[dataSource]?.[fieldType] || [];
}

// Utility function to get KPI config
export function getKPIConfig(dataSource) {
  return CONFIG.kpiConfig[dataSource] || [];
}

// Utility function to get color scheme
export function getColorScheme(scheme = 'primary') {
  return CONFIG.colorSchemes[scheme] || CONFIG.colorSchemes.primary;
}

// Utility function to check if status matches pattern
export function matchesStatusPattern(status, pattern) {
  if (!status) return false;
  const statusLower = String(status).toLowerCase();
  const patterns = CONFIG.statusPatterns[pattern] || [];
  return patterns.some(p => statusLower.includes(p));
}

export default CONFIG;