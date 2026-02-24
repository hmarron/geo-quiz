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
    this.csvRaw = config.csvRaw; // Support for raw text input
    // Mapping: { id: 'colName', answer: 'colName', questionMedia: 'colName', categories: 'colName' }
    this.mapping = config.mapping || {
        id: 'id',
        answer: 'answer',
        questionMedia: 'questionMedia',
        categories: 'categories'
    };
  }

  async loadData() {
    if (this.fullDataset.length > 0 && !this.csvRaw) return;
    
    let text = '';
    if (this.csvRaw) {
        text = this.csvRaw;
    } else if (this.csvUrl) {
        let response;
        try {
            response = await fetch(this.csvUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (directErr) {
            // Retry via CORS proxy for servers that don't set CORS headers
            try {
                const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(this.csvUrl)}`;
                response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
            } catch (proxyErr) {
                throw new Error(
                    `Could not load CSV (CORS blocked). ` +
                    `Try hosting on GitHub Gist (raw URL) or another CORS-enabled host.`
                );
            }
        }
        text = await response.text();
    } else {
        return;
    }
    
    this._parseCsv(text);
  }

  _parseCsv(text) {
    // Simple CSV parser
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line);
    if (lines.length < 2) return;

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

    // Extract unique categories for filtering
    const allCats = new Set();
    this.fullDataset.forEach(item => {
        item.categories.forEach(cat => {
            if (cat) allCats.add(cat);
        });
    });
    this.availableCategories = Array.from(allCats).sort();
  }

  getSettingsView() {
    if (!this.availableCategories || this.availableCategories.length === 0) return '';

    const filtersHTML = this.availableCategories.map(cat => `
        <label class="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="check-${cat}" ${activeSettings.filters[cat] ? 'checked' : ''}
                   class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-sm font-medium text-slate-200">${cat}</span>
        </label>
    `).join('');

    return `
      <div class="mb-6">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Categories</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="category-toggles">
              ${filtersHTML}
          </div>
      </div>
    `;
  }

  getLobbySettingsView() {
    if (!this.availableCategories || this.availableCategories.length === 0) return '';

    const filtersHTML = this.availableCategories.map(cat => `
        <label class="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="mp-check-${cat}" ${activeSettings.filters[cat] ? 'checked' : ''}
                   class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-xs font-medium text-slate-200">${cat}</span>
        </label>
    `).join('');

    return `
      <div>
          <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Categories</h3>
          <div class="flex flex-col gap-1.5">
              ${filtersHTML}
          </div>
      </div>
    `;
  }

  updateSettings(settings) {
    if (!this.availableCategories) return;

    // Check if the current filters match the categories available in this CSV
    const existingIds = Object.keys(settings.filters || {});
    const isMismatch = existingIds.length > 0 && !existingIds.some(id => this.availableCategories.includes(id));

    if (!settings.filters || existingIds.length === 0 || isMismatch) {
        settings.filters = {};
        this.availableCategories.forEach(cat => settings.filters[cat] = true);
    }
  }

  getScoreSettingsDescription(settings) {
    if (!this.availableCategories) return '';
    const activeNames = this.availableCategories.filter(cat => settings.filters[cat]);
    if(activeNames.length > 0 && activeNames.length < this.availableCategories.length) {
        return activeNames.join(', ');
    }
    return '';
  }

  _isAllowed(item, settings) {
    if (!settings || !settings.filters || !this.availableCategories || this.availableCategories.length === 0) return true;
    
    // If the item has multiple categories, allow if ANY are checked
    // If the item has no categories, always allow it
    if (item.categories.length === 0) return true;
    
    return item.categories.some(cat => settings.filters[cat]);
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
