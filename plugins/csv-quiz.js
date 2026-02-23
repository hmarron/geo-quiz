// plugins/csv-quiz.js

/**
 * CSVQuizPlugin
 * A generic plugin that loads quiz data from a CSV file.
 */
class CSVQuizPlugin extends BaseQuizPlugin {
  constructor(config = {}) {
    super();
    this.id = config.id || 'csv-quiz';
    this.name = config.name || 'CSV Quiz';
    this.title = config.title || 'CSV Challenge';
    this.subtitle = config.subtitle || 'Custom quiz from CSV';
    
    this.csvUrl = config.csvUrl;
    // Mapping: { id: 'colName', answer: 'colName', questionMedia: 'colName', categories: 'colName' }
    this.mapping = config.mapping || {
        id: 'id',
        answer: 'answer',
        questionMedia: 'questionMedia',
        categories: 'categories'
    };
  }

  async loadData() {
    if (this.fullDataset.length > 0) return;
    if (!this.csvUrl) return;

    const response = await fetch(this.csvUrl);
    const text = await response.text();
    
    // Simple CSV parser (can be replaced with a library like PapaParse)
    const lines = text.split('
').map(line => line.trim()).filter(line => line);
    const headers = lines[0].split(',').map(h => h.trim());
    
    this.fullDataset = lines.slice(1).map(line => {
        const values = this._splitCsvLine(line);
        const item = {};
        headers.forEach((header, i) => {
            item[header] = values[i];
        });

        // Map to standard format
        return {
            id: item[this.mapping.id] || Math.random().toString(36).substr(2, 9),
            answer: item[this.mapping.answer],
            questionMedia: item[this.mapping.questionMedia],
            thumbnailUrl: item[this.mapping.thumbnailUrl || this.mapping.questionMedia],
            categories: item[this.mapping.categories] ? item[this.mapping.categories].split(';').map(c => c.trim()) : [],
            acceptableAnswers: item[this.mapping.acceptableAnswers] ? item[this.mapping.acceptableAnswers].split(';').map(a => a.trim()) : []
        };
    }).filter(item => item.answer && item.questionMedia);
  }

  // Helper to handle commas inside quotes
  _splitCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else cur += char;
    }
    result.push(cur.trim());
    return result;
  }
}

// Note: This plugin might be instantiated dynamically in the future.
// For now, we can register a sample one if a generic-quiz.csv exists.
if (typeof Registry !== 'undefined' && typeof window !== 'undefined') {
    // Check if there's a generic config or just register the class
    window.CSVQuizPlugin = CSVQuizPlugin;
}
