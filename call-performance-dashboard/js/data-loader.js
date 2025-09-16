// Data loading and processing module
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

class DataLoader {
  constructor() {
    this.data = {};
    this.metadata = {};
    this.isLoading = false;
  }

  /**
   * Load all data sources
   */
  async loadAll() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    hideError();
    showLoading('Initializing data load...', 0);
    
    try {
      const sources = Object.keys(CONFIG.dataSources);
      const totalSources = sources.length;
      let completed = 0;
      
      // Load all data sources in parallel
      const promises = sources.map(async (sourceKey) => {
        try {
          const result = await this.loadDataSource(sourceKey);
          completed++;
          updateProgress(
            (completed / totalSources) * 100,
            `Loaded ${CONFIG.dataSources[sourceKey].name}`
          );
          return { sourceKey, data: result.data, metadata: result.metadata };
        } catch (error) {
          console.error(`Failed to load ${sourceKey}:`, error);
          completed++;
          updateProgress((completed / totalSources) * 100);
          return { sourceKey, data: [], metadata: {}, error: error.message };
        }
      });

      const results = await Promise.all(promises);
      
      // Process results
      let hasErrors = false;
      results.forEach(({ sourceKey, data, metadata, error }) => {
        if (error) {
          hasErrors = true;
          showError(`Failed to load ${CONFIG.dataSources[sourceKey].name}: ${error}`);
        } else {
          this.data[sourceKey] = data;
          this.metadata[sourceKey] = metadata;
        }
      });

      if (!hasErrors) {
        updateProgress(100, 'Data loaded successfully!');
        setTimeout(hideLoading, 500);
      } else {
        hideLoading();
      }

      return this.data;
      
    } catch (error) {
      console.error('Failed to load data:', error);
      showError('Failed to load dashboard data. Please check your data files.');
      hideLoading();
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load a single data source
   */
  async loadDataSource(sourceKey) {
    const source = CONFIG.dataSources[sourceKey];
    if (!source) {
      throw new Error(`Unknown data source: ${sourceKey}`);
    }

    try {
      const response = await fetch(source.url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      
      if (!text.trim()) {
        throw new Error('Empty data file');
      }

      const parsed = await this.parseCSV(text);
      const processed = this.processData(parsed, sourceKey);
      
      const metadata = {
        source: source.name,
        rowCount: processed.length,
        columns: processed.length > 0 ? Object.keys(processed[0]) : [],
        loadedAt: new Date().toISOString(),
        dateRange: this.getDateRange(processed, sourceKey)
      };

      return {
        data: processed,
        metadata
      };
      
    } catch (error) {
      console.error(`Error loading ${sourceKey}:`, error);
      throw error;
    }
  }

  /**
   * Parse CSV using Papa Parse
   */
  async parseCSV(text) {
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // We'll handle typing ourselves
        delimitersToGuess: [',', '\t', ';', '|'],
        transformHeader: (header) => {
          // Clean header names
          return header.trim().replace(/^\uFEFF/, '');
        },
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }
          resolve(results.data);
        },
        error: (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  }

  /**
   * Process and clean the parsed data
   */
  processData(rawData, sourceKey) {
    if (!rawData || rawData.length === 0) {
      return [];
    }

    const fieldMappings = CONFIG.fieldMappings[sourceKey] || {};
    const processedData = [];

    rawData.forEach((row, index) => {
      try {
        const processedRow = this.processRow(row, fieldMappings);
        
        // Only include rows that have some meaningful data
        if (this.isValidRow(processedRow, sourceKey)) {
          processedData.push(processedRow);
        }
      } catch (error) {
        console.warn(`Error processing row ${index + 1}:`, error, row);
      }
    });

    return processedData;
  }

  /**
   * Process a single row of data
   */
  processRow(row, fieldMappings) {
    const processed = {};
    
    // Copy original data
    Object.keys(row).forEach(key => {
      const cleanKey = key.trim();
      if (cleanKey) {
        processed[cleanKey] = row[key];
      }
    });

    // Process dates
    Object.keys(fieldMappings).forEach(fieldType => {
      if (fieldType.includes('date') || fieldType === 'date') {
        const candidates = fieldMappings[fieldType];
        const dateField = this.findBestMatch(Object.keys(processed), candidates);
        
        if (dateField && processed[dateField]) {
          const parsedDate = parseDate(processed[dateField]);
          if (parsedDate) {
            processed[`${fieldType}_parsed`] = parsedDate;
          }
        }
      }
    });

    // Process numeric fields
    ['duration', 'count', 'waitTime'].forEach(fieldType => {
      const candidates = fieldMappings[fieldType] || [];
      const numericField = this.findBestMatch(Object.keys(processed), candidates);
      
      if (numericField && processed[numericField]) {
        processed[`${fieldType}_numeric`] = cleanNumber(processed[numericField]);
      }
    });

    return processed;
  }

  /**
   * Find the best matching field from candidates
   */
  findBestMatch(headers, candidates) {
    const normalizedHeaders = headers.map(h => ({
      original: h,
      normalized: normalizeHeader(h)
    }));

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeHeader(candidate);
      const match = normalizedHeaders.find(h => h.normalized === normalizedCandidate);
      if (match) return match.original;
    }

    return null;
  }

  /**
   * Check if a row has valid data
   */
  isValidRow(row, sourceKey) {
    const requiredFields = CONFIG.validation.requiredFields[sourceKey] || [];
    
    // Check required fields
    for (const field of requiredFields) {
      const value = row[field];
      if (!value || String(value).trim() === '') {
        return false;
      }
    }

    // Check if row has any non-empty values
    const hasData = Object.values(row).some(value => 
      value !== null && value !== undefined && String(value).trim() !== ''
    );

    return hasData;
  }

  /**
   * Get date range from processed data
   */
  getDateRange(data, sourceKey) {
    if (!data || data.length === 0) return null;

    const dateFields = getFieldMapping(sourceKey, 'date');
    let dates = [];

    // Try to find date fields in the data
    data.forEach(row => {
      // Look for parsed dates first
      if (row.date_parsed) {
        dates.push(row.date_parsed);
      } else {
        // Try to find and parse date from original fields
        for (const field of dateFields) {
          const matchingField = this.findBestMatch(Object.keys(row), [field]);
          if (matchingField && row[matchingField]) {
            const date = parseDate(row[matchingField]);
            if (date) {
              dates.push(date);
              break;
            }
          }
        }
      }
    });

    if (dates.length === 0) return null;

    dates.sort((a, b) => a - b);
    
    return {
      start: dates[0],
      end: dates[dates.length - 1],
      count: dates.length
    };
  }

  /**
   * Filter data by date range
   */
  filterByDateRange(sourceKey, startDate, endDate) {
    const data = this.data[sourceKey];
    if (!data || data.length === 0) return [];

    const start = parseDate(startDate);
    const end = parseDate(endDate);
    
    if (!start || !end) return data;

    // Set end date to end of day
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

    return data.filter(row => {
      let rowDate = null;
      
      // Try parsed date first
      if (row.date_parsed) {
        rowDate = row.date_parsed;
      } else {
        // Try to find date in original fields
        const dateFields = getFieldMapping(sourceKey, 'date');
        for (const field of dateFields) {
          const matchingField = this.findBestMatch(Object.keys(row), [field]);
          if (matchingField && row[matchingField]) {
            rowDate = parseDate(row[matchingField]);
            if (rowDate) break;
          }
        }
      }

      if (!rowDate) return true; // Include rows without dates
      
      return rowDate >= start && rowDate <= endOfDay;
    });
  }

  /**
   * Get data for a specific source
   */
  getData(sourceKey, filters = {}) {
    if (!this.data[sourceKey]) {
      console.warn(`No data available for source: ${sourceKey}`);
      return [];
    }

    let data = [...this.data[sourceKey]];

    // Apply date range filter
    if (filters.startDate && filters.endDate) {
      data = this.filterByDateRange(sourceKey, filters.startDate, filters.endDate);
    }

    // Apply other filters
    if (filters.agent) {
      const agentFields = getFieldMapping(sourceKey, 'agent');
      data = data.filter(row => {
        for (const field of agentFields) {
          const matchingField = this.findBestMatch(Object.keys(row), [field]);
          if (matchingField && row[matchingField]) {
            return String(row[matchingField]).toLowerCase().includes(filters.agent.toLowerCase());
          }
        }
        return false;
      });
    }

    if (filters.status) {
      const statusFields = getFieldMapping(sourceKey, 'status');
      data = data.filter(row => {
        for (const field of statusFields) {
          const matchingField = this.findBestMatch(Object.keys(row), [field]);
          if (matchingField && row[matchingField]) {
            return String(row[matchingField]).toLowerCase().includes(filters.status.toLowerCase());
          }
        }
        return false;
      });
    }

    return data;
  }

  /**
   * Get metadata for a source
   */
  getMetadata(sourceKey) {
    return this.metadata[sourceKey] || {};
  }

  /**
   * Refresh a single data source
   */
  async refresh(sourceKey) {
    if (!CONFIG.dataSources[sourceKey]) {
      throw new Error(`Unknown data source: ${sourceKey}`);
    }

    showLoading(`Refreshing ${CONFIG.dataSources[sourceKey].name}...`, 0);

    try {
      const result = await this.loadDataSource(sourceKey);
      this.data[sourceKey] = result.data;
      this.metadata[sourceKey] = result.metadata;
      
      updateProgress(100, 'Refresh complete!');
      setTimeout(hideLoading, 500);
      
      return result.data;
    } catch (error) {
      hideLoading();
      showError(`Failed to refresh ${CONFIG.dataSources[sourceKey].name}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.data = {};
    this.metadata = {};
  }

  /**
   * Get summary statistics for a data source
   */
  getSummary(sourceKey) {
    const data = this.data[sourceKey];
    const metadata = this.metadata[sourceKey];
    
    if (!data || data.length === 0) {
      return {
        totalRows: 0,
        dateRange: null,
        columns: [],
        lastUpdated: null
      };
    }

    return {
      totalRows: data.length,
      dateRange: metadata.dateRange,
      columns: metadata.columns,
      lastUpdated: metadata.loadedAt
    };
  }

  /**
   * Validate data integrity
   */
  validateData(sourceKey) {
    const data = this.data[sourceKey];
    if (!data) return { valid: false, errors: ['No data loaded'] };

    const errors = [];
    const warnings = [];

    // Check for empty data
    if (data.length === 0) {
      errors.push('No data rows found');
    }

    // Check required fields
    const requiredFields = CONFIG.validation.requiredFields[sourceKey] || [];
    const sampleRow = data[0] || {};
    const availableFields = Object.keys(sampleRow);

    requiredFields.forEach(field => {
      const fieldMappings = getFieldMapping(sourceKey, field);
      const hasField = fieldMappings.some(mapping => 
        this.findBestMatch(availableFields, [mapping])
      );
      
      if (!hasField) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Check data quality
    const duplicateRows = this.findDuplicateRows(data);
    if (duplicateRows > 0) {
      warnings.push(`Found ${duplicateRows} potentially duplicate rows`);
    }

    // Check date consistency
    const dateRange = this.metadata[sourceKey]?.dateRange;
    if (dateRange) {
      const daysDiff = (dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24);
      if (daysDiff > 730) { // 2 years
        warnings.push('Data spans more than 2 years - consider filtering for better performance');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Find duplicate rows (basic implementation)
   */
  findDuplicateRows(data) {
    const seen = new Set();
    let duplicates = 0;

    data.forEach(row => {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        duplicates++;
      } else {
        seen.add(key);
      }
    });

    return duplicates;
  }

  /**
   * Get field statistics
   */
  getFieldStats(sourceKey, fieldName) {
    const data = this.data[sourceKey];
    if (!data || data.length === 0) return null;

    const values = data
      .map(row => row[fieldName])
      .filter(val => val !== null && val !== undefined && val !== '');

    if (values.length === 0) return null;

    // Try to detect if field is numeric
    const numericValues = values.map(v => cleanNumber(v)).filter(n => !isNaN(n) && isFinite(n));
    
    if (numericValues.length > values.length * 0.8) {
      // Mostly numeric field
      return {
        type: 'numeric',
        count: values.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
        nullCount: data.length - values.length
      };
    } else {
      // Text field
      const uniqueValues = [...new Set(values)];
      return {
        type: 'text',
        count: values.length,
        uniqueCount: uniqueValues.length,
        nullCount: data.length - values.length,
        topValues: this.getTopValues(values, 5)
      };
    }
  }

  /**
   * Get top N most common values
   */
  getTopValues(values, n = 5) {
    const counts = {};
    values.forEach(val => {
      counts[val] = (counts[val] || 0) + 1;
    });

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([value, count]) => ({ value, count }));
  }
}

// Create and export singleton instance
export const dataLoader = new DataLoader();
export default dataLoader;