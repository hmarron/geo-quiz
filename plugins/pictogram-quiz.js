// plugins/pictogram-quiz.js

class PictogramQuizPlugin {
  constructor() {
    this.id = 'pictogram-quiz';
    this.name = 'Spanish Pictogram Quiz';
    this.title = 'Vocabulario en Imágenes';
    this.subtitle = 'Identify Spanish words from pictograms';
    this.supportedModes = ['solo', 'race', 'compete', 'land-grab'];

    this.fullDataset = [];
    this.container = null;
    this.imgEl = null;
    this.overlay = null;
    this.nameDisplay = null;
    this.claims = {}; // { itemId: color }

    // Maps internal IDs to ARASAAC categories
    this.filterGroups = [
        { id: 'animals', label: 'Animales', categories: ['animal', 'bird', 'mammal', 'reptile', 'fish', 'insect'] },
        { id: 'food', label: 'Comida', categories: ['food', 'beverage', 'fruit', 'vegetable', 'sweet', 'meat'] },
        { id: 'transport', label: 'Transporte', categories: ['land transport', 'air transport', 'water transport', 'vehicle'] },
        { id: 'objects', label: 'Objetos', categories: ['object', 'tool', 'instrument', 'trousseau'] },
        { id: 'nature', label: 'Naturaleza', categories: ['nature', 'plant', 'flower', 'tree', 'weather'] }
    ];
  }

  async loadScripts() {
    return Promise.resolve();
  }

  async loadData() {
    if (this.fullDataset.length > 0) return;
    
    // Fetch Spanish pictograms from ARASAAC
    const response = await fetch('https://api.arasaac.org/api/pictograms/all/es');
    const data = await response.json();
    
    // Process and simplify the dataset
    this.fullDataset = data.map(item => ({
        id: item._id,
        name: item.keywords[0]?.keyword || '',
        categories: item.categories || [],
        tags: item.tags || [],
        imageUrl: `https://static.arasaac.org/pictograms/${item._id}/${item._id}_300.png`,
        thumbnailUrl: `https://static.arasaac.org/pictograms/${item._id}/${item._id}_300.png`
    })).filter(item => item.name && item.id);
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

  getItemId(item) {
    return item.id.toString();
  }

  getItemById(id) {
    return this.fullDataset.find(item => item.id.toString() === id.toString());
  }

  getCorrectAnswer(item) {
    return item.name;
  }

  checkTypedAnswer(item, answer) {
    const guess = this._normalizeString(answer);
    if (guess.length < 2) return false;

    const primary = this._normalizeString(this.getCorrectAnswer(item));
    
    if (guess === primary) return true;

    // Levenshtein for minor typos
    const distance = this._levenshteinDistance(guess, primary);
    const threshold = primary.length < 5 ? 1 : 2;
    return distance <= threshold;
  }

  generateChoices(correctItem, pool) {
    const correctName = this.getCorrectAnswer(correctItem);
    const options = [{ text: correctName, correct: true }];
    const incorrectOptions = new Set();

    // Use a wider selection for incorrect options if the pool is small
    const allPossible = this.fullDataset.filter(i => i.name !== correctName);

    while (incorrectOptions.size < 3 && incorrectOptions.size < allPossible.length) {
        const randomItem = allPossible[Math.floor(Math.random() * allPossible.length)];
        const randomName = this.getCorrectAnswer(randomItem);
        if (randomName !== correctName) {
            incorrectOptions.add(randomName);
        }
    }

    incorrectOptions.forEach(name => {
        options.push({ text: name, correct: false });
    });

    return options.sort(() => Math.random() - 0.5);
  }

  renderQuizView(container) {
    this.container = container;
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full w-full p-4 gap-6 bg-slate-900/50">
        <div id="pictogram-display-container" class="relative group">
            <div id="pictogram-border" class="p-4 bg-white rounded-3xl shadow-2xl transition-all duration-300">
                <img id="pictogram-img" class="max-w-full max-h-[45vh] rounded-lg" style="display:none;">
            </div>
            <div id="pictogram-overlay" class="absolute inset-0 flex items-center justify-center pointer-events-none z-10 hidden">
                <div id="pictogram-name-display" class="text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/80 backdrop-blur-sm border border-white/20 shadow-2xl text-white"></div>
            </div>
        </div>
      </div>
    `;

    this.imgEl = document.getElementById('pictogram-img');
    this.overlay = document.getElementById('pictogram-overlay');
    this.nameDisplay = document.getElementById('pictogram-name-display');
  }

  bindUIEvents() {}

  displayQuestion(item) {
    if (!item || !this.imgEl) return;
    this.imgEl.src = item.imageUrl;
    this.imgEl.style.display = 'block';
    this.overlay.classList.add('hidden');
    document.getElementById('pictogram-border').style.backgroundColor = 'white';
    document.getElementById('pictogram-border').className = 'p-4 bg-white rounded-3xl shadow-2xl transition-all duration-300';
  }

  updateViewOnAnswer(item, correct, color) {
    const border = document.getElementById('pictogram-border');
    if (border) {
        border.style.backgroundColor = color || (correct ? '#dcfce7' : '#fee2e2'); // light green/red
        border.classList.add(correct ? 'ring-8-green-500' : 'ring-8-red-500');
    }
    const name = this.getCorrectAnswer(item);
    this.showOverlay(name, correct);
  }

  showOverlay(name, isCorrect) {
    if (!this.overlay || !this.nameDisplay) return;
    this.nameDisplay.textContent = name;
    this.nameDisplay.className = `text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/80 backdrop-blur-sm border shadow-2xl ${isCorrect ? 'text-green-400 border-green-500/50' : 'text-red-400 border-red-500/50'}`;
    this.overlay.classList.remove('hidden');
  }

  colorItem(itemId, color) {
    this.claims[itemId] = color;
  }

  renderResultView(container) {
    if (!container) return;
    const claimedIds = Object.keys(this.claims);
    if (claimedIds.length === 0) return;

    container.innerHTML = `
        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">Colección</h3>
        <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
            ${claimedIds.map(id => {
                const color = this.claims[id];
                const item = this.getItemById(id);
                if (!item) return '';
                return `
                    <div class="aspect-square rounded-lg p-1 shadow-sm flex items-center justify-center bg-white border-2" 
                         style="border-color: ${color}" title="${item.name}">
                        <img src="${item.thumbnailUrl}" class="max-w-full max-h-full rounded-sm pointer-events-none object-contain">
                    </div>
                `;
            }).join('')}
        </div>
    `;
  }

  clearHighlights() {}

  resetView() {
    this.claims = {};
    if (this.imgEl) this.imgEl.style.display = 'none';
    if (this.overlay) this.overlay.classList.add('hidden');
    const border = document.getElementById('pictogram-border');
    if (border) {
        border.style.backgroundColor = 'white';
        border.className = 'p-4 bg-white rounded-3xl shadow-2xl transition-all duration-300';
    }
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

  _normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.']/g, '');
  }

  _levenshteinDistance(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
  }
}

if (typeof Registry !== 'undefined') {
    Registry.registerPlugin(new PictogramQuizPlugin());
}
