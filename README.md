# Call Performance Dashboard - Refactored

A modern, responsive dashboard for analyzing call center performance data with advanced features and clean architecture.

## 🚀 Features

- 📊 **Interactive Charts**: Line charts, bar charts, doughnut charts with Chart.js
- 📱 **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- 🔍 **Smart Data Processing**: Automatic CSV parsing with Papa Parse
- 📈 **Real-time KPIs**: Animated performance indicators with thresholds
- 🎯 **Advanced Filtering**: Date range filters with validation
- 💾 **Data Export**: Export filtered data as CSV
- ⚡ **Performance Optimized**: Debounced updates and memory management
- 🎨 **Modern UI**: Clean, accessible design with loading states
- 🔄 **Auto-refresh**: Optional automatic data updates
- 📋 **Data Tables**: Sortable, responsive tables with pagination

## 🏗️ Architecture

**Clean Separation of Concerns**

### 📁 Project Structure

```
├── 📄 index.html          # Clean HTML structure
├── 📄 styles.css          # Modern CSS with variables
└── 📁 js/
    ├── 📄 main.js          # Application initialization
    ├── 📄 config.js        # Configuration & settings
    ├── 📄 utils.js         # Utility functions
    ├── 📄 data-loader.js   # Data loading & processing
    ├── 📄 chart-manager.js # Chart creation & management
    └── 📄 renderers.js     # Page rendering logic
```

## 📊 Data Sources

### Supported Data Types

**Inbound Calls** (`data/inbound_calls.csv`)
- Fields: Date, Agent, Status, Duration, Wait Time
- KPIs: Total Calls, Abandon Rate, Avg Handle Time, Avg Wait Time

**Outbound Calls** (`data/outbound_calls.csv`)
- Fields: Date, Agent, Status, Duration, Campaign
- KPIs: Total Calls, Connect Rate, Avg Talk Time, Campaign Count

**First Contact Resolution** (`data/first_contact_resolution.csv`)
- Fields: Date, Agent, Resolved, Category, Case ID
- KPIs: Total Cases, FCR Rate, Avg Resolution Time, Escalation Rate

### Flexible Field Mapping

The dashboard automatically detects common field name variations:

```javascript
// Date fields
['date', 'call_date', 'datetime', 'starttime', 'timestamp']

// Agent fields
['agent', 'agent_name', 'user', 'username', 'owner']

// Status fields
['status', 'call_status', 'outcome', 'disposition', 'result']
```

## 🛠️ Setup & Installation

### 1. File Structure

Create the following directory structure:

```
📁 call-performance-dashboard/
├── 📄 index.html
├── 📄 styles.css
├── 📁 js/
│   ├── 📄 main.js
│   ├── 📄 config.js
│   ├── 📄 utils.js
│   ├── 📄 data-loader.js
│   ├── 📄 chart-manager.js
│   └── 📄 renderers.js
└── 📁 data/
    ├── 📄 inbound_calls.csv
    ├── 📄 outbound_calls.csv
    └── 📄 first_contact_resolution.csv
```

### 2. Dependencies

The dashboard uses CDN-hosted libraries:

- **Chart.js 3.9.1** - Chart rendering
- **Papa Parse 5.4.1** - CSV parsing
- **Day.js 1.11.9** - Date handling

### 3. Data Files

Place your CSV files in the `data/` directory. The dashboard supports:

✅ Various date formats (ISO, MM/DD/YYYY, Excel serial)  
✅ Different delimiters (comma, tab, semicolon)  
✅ Header name variations  
✅ Aggregated data with count columns  
✅ Missing or null values  

### 4. Launch

Simply open `index.html` in a web browser or serve via HTTP server:

**Using Python:**
```bash
python -m http.server 8000
```

**Using Node.js:**
```bash
npx serve .
```

**Using PHP:**
```bash
php -S localhost:8000
```

## ⚙️ Configuration

### Data Sources

Edit `js/config.js` to modify data sources:

```javascript
dataSources: {
  inbound: {
    url: "data/inbound_calls.csv",
    name: "Inbound Calls",
    icon: "📥",
    color: "#3b82f6"
  }
}
```

### KPI Thresholds

Configure performance thresholds:

```javascript
kpiConfig: {
  inbound: [
    {
      key: 'abandonRate',
      label: 'Abandon Rate',
      threshold: {
        warning: 10,
        critical: 20
      }
    }
  ]
}
```

### Chart Colors

Customize color schemes:

```javascript
colorSchemes: {
  primary: ['#3b82f6', '#1d4ed8', '#1e40af'],
  success: ['#10b981', '#059669', '#047857']
}
```

## 🎯 Key Improvements from Original

| Aspect | ❌ Before | ✅ After |
|--------|-----------|----------|
| **Architecture** | 1000+ lines in single HTML file | Modular ES6 modules with clear separation |
| **Error Handling** | Silent failures, no user feedback | Comprehensive error handling with user notifications |
| **Data Processing** | Custom CSV parser with edge case issues | Papa Parse library with robust parsing |
| **Performance** | No memory management, chart leaks | Proper cleanup, debouncing, optimization |
| **User Experience** | Basic styling, no loading states | Modern UI, loading indicators, responsive design |
| **Maintainability** | Duplicate code, hard to modify | DRY principles, easy configuration, extensible |

## 📱 Responsive Features

- Mobile-first design with touch-friendly controls
- Flexible grid layouts that adapt to screen size
- Collapsible navigation on small screens
- Optimized chart sizes for different viewports
- Touch gestures for chart interactions

## 🔧 Advanced Features

### Smart Data Detection

```javascript
// Automatically detects and handles:
// Excel serial dates (43831 → 2020-01-01)
// Multiple date formats (MM/DD/YYYY, DD/MM/YYYY, ISO)
// European numbers (1.234,56 → 1234.56)
// Negative values in parentheses ((123) → -123)
// Currency symbols (£1,234 → 1234)
```

### Performance Optimization

- Debounced rendering prevents excessive updates
- Chart destruction prevents memory leaks
- Virtual scrolling for large datasets
- Lazy loading of chart data
- Request caching reduces server calls

### Accessibility

- ARIA labels for screen readers
- Keyboard navigation support
- High contrast color schemes
- Focus indicators for interactive elements
- Semantic HTML structure

## 🐛 Troubleshooting

### Common Issues

**No data showing:**
- Check CSV file paths in `config.js`
- Verify file permissions and CORS policy
- Check browser console for errors

**Charts not rendering:**
- Ensure Chart.js is loaded (check CDN)
- Verify canvas elements exist
- Check for JavaScript errors

**Date parsing issues:**
- Review date format in your CSV
- Check `toDateSafe` function handling
- Verify timezone considerations

### Debug Mode

Enable debugging in browser console:

```javascript
// View current state
console.log(window.dashboard.getState());

// Check data loader status
console.log(window.dataLoader.data);

// Inspect chart instances
console.log(window.chartManager.charts);
```

## 🚀 Future Enhancements

- Real-time data updates via WebSockets
- Advanced filtering (agent, campaign, status)
- Drill-down capabilities in charts
- Custom KPI builder interface
- Dashboard themes and customization
- Data source management UI
- Scheduled reports and alerts
- Multi-tenant support

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request