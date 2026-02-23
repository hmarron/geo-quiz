// plugins/pictogram-quiz.js

class PictogramQuizPlugin extends BaseQuizPlugin {
  constructor() {
    super();
    this.id = 'pictogram-quiz';
    this.name = 'Spanish Pictogram Quiz';
    this.title = 'Vocabulario en Imágenes';
    this.subtitle = 'Identify Spanish words from pictograms';
    this.supportedModes = ['solo', 'race', 'compete', 'land-grab'];

    this.uiConfig.imageBg = 'bg-white';
    this.uiConfig.aspectRatio = 'aspect-square';

    // Maps internal IDs to ARASAAC categories
    this.filterGroups = [
        { id: 'animals', label: 'Animales', categories: ['animal', 'bird', 'mammal', 'reptile', 'fish', 'insect'] },
        { id: 'food', label: 'Comida', categories: ['food', 'beverage', 'fruit', 'vegetable', 'sweet', 'meat'] },
        { id: 'transport', label: 'Transporte', categories: ['land transport', 'air transport', 'water transport', 'vehicle'] },
        { id: 'objects', label: 'Objetos', categories: ['object', 'tool', 'instrument', 'trousseau'] },
        { id: 'nature', label: 'Naturaleza', categories: ['nature', 'plant', 'flower', 'tree', 'weather'] }
    ];
  }

  async loadData() {
    if (this.fullDataset.length > 0) return;
    
    // Fetch Spanish pictograms from ARASAAC
    const response = await fetch('https://api.arasaac.org/api/pictograms/all/es');
    const data = await response.json();
    
    // Process and simplify the dataset into standard format
    this.fullDataset = data.map(item => ({
        id: item._id.toString(),
        answer: item.keywords[0]?.keyword || '',
        questionMedia: `https://static.arasaac.org/pictograms/${item._id}/${item._id}_300.png`,
        thumbnailUrl: `https://static.arasaac.org/pictograms/${item._id}/${item._id}_300.png`,
        categories: item.categories || [],
        tags: item.tags || []
    })).filter(item => item.answer && item.id);
  }

  getSettingsView() {
    const filtersHTML = this.filterGroups.map(f => `
        <label class="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="check-${f.id}" ${activeSettings.filters[f.id] ? 'checked' : ''}
                   class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-sm font-medium text-slate-200">${f.label}</span>
        </label>
    `).join('');

    return `
      <div class="mb-6">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Categorías</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="category-toggles">
              ${filtersHTML}
          </div>
      </div>
    `;
  }

  getLobbySettingsView() {
    const filtersHTML = this.filterGroups.map(f => `
        <label class="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="mp-check-${f.id}" ${activeSettings.filters[f.id] ? 'checked' : ''}
                   class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-xs font-medium text-slate-200">${f.label}</span>
        </label>
    `).join('');

    return `
      <div>
          <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Categorías</h3>
          <div class="flex flex-col gap-1.5">
              ${filtersHTML}
          </div>
      </div>
    `;
  }

  updateSettings(settings) {
    // If the filters are from another plugin (like 'north-america'), reset them.
    const validIds = this.filterGroups.map(f => f.id);
    const existingIds = Object.keys(settings.filters || {});
    const isMismatch = existingIds.length > 0 && !existingIds.some(id => validIds.includes(id));

    if (!settings.filters || existingIds.length === 0 || isMismatch) {
        settings.filters = {};
        this.filterGroups.forEach(f => settings.filters[f.id] = (f.id === 'animals'));
    }
  }

  generateQuestionPool(settings) {
    let pool = this.fullDataset.filter(item => this._isAllowed(item, settings));
    
    // If the pool is too large, let's limit it to a manageable size of interesting words
    if (pool.length > 500) {
        pool = pool.sort(() => Math.random() - 0.5).slice(0, 300);
    }
    
    return pool;
  }

  getScoreSettingsDescription(settings) {
    const activeNames = this.filterGroups
        .filter(f => settings.filters[f.id])
        .map(f => f.label);
    if(activeNames.length > 0 && activeNames.length < this.filterGroups.length) return activeNames.join(', ');
    return '';
  }

  _isAllowed(item, settings) {
    if (!settings || !settings.filters) return true;
    const activeFilterIds = Object.keys(settings.filters).filter(id => settings.filters[id]);
    if (activeFilterIds.length === 0) return true;

    for (const filterId of activeFilterIds) {
        const group = this.filterGroups.find(g => g.id === filterId);
        if (group && group.categories.some(cat => item.categories.includes(cat))) {
            return true;
        }
    }
    return false;
  }
}

if (typeof Registry !== 'undefined') {
    Registry.registerPlugin(new PictogramQuizPlugin());
}
