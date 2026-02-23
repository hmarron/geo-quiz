// plugins/flag-quiz.js

class FlagQuizPlugin {
  constructor() {
    this.id = 'flag-quiz';
    this.name = 'Flag Quiz';
    this.title = 'Flag Challenge';
    this.subtitle = 'Identify world flags';
    this.supportedModes = ['solo', 'race', 'compete'];

    this.fullDataset = [];
    this.container = null;
    this.flagImg = null;
    this.overlay = null;
    this.nameDisplay = null;
    this.claims = {}; // { itemId: color }

    // Use a subset of regions consistent with geo-quiz
    this.regions = [
        { id: 'north-america', label: 'North America' },
        { id: 'south-america', label: 'South America' },
        { id: 'europe', label: 'Europe' },
        { id: 'asia', label: 'Asia' },
        { id: 'africa', label: 'Africa' },
        { id: 'oceania', label: 'Oceania' }
    ];
  }

  async loadScripts() {
    // No external scripts needed for this plugin
    return Promise.resolve();
  }

  async loadData() {
    if (this.fullDataset.length > 0) return;
    // We can reuse the same Natural Earth data to get ISO codes and names
    const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson');
    const data = await response.json();
    
    // Filter out countries without ISO_A2 codes (needed for flagcdn)
    this.fullDataset = data.features.filter(f => f.properties.ISO_A2 && f.properties.ISO_A2 !== '-99');
  }

  getSettingsView() {
    const regionsHTML = this.regions.map(r => `
        <label class="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="check-${r.id}" ${activeSettings.regions[r.id] ? 'checked' : ''}
                   class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-sm font-medium text-slate-200">${r.label}</span>
        </label>
    `).join('');

    return `
      <div class="mb-6">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Regions</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="region-toggles">
              ${regionsHTML}
          </div>
      </div>
    `;
  }

  getLobbySettingsView() {
    const regionsHTML = this.regions.map(r => `
        <label class="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="mp-check-${r.id}" ${activeSettings.regions[r.id] ? 'checked' : ''}
                   class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-xs font-medium text-slate-200">${r.label}</span>
        </label>
    `).join('');

    return `
      <div>
          <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Regions</h3>
          <div class="flex flex-col gap-1.5">
              ${regionsHTML}
          </div>
      </div>
    `;
  }

  updateSettings(settings) {
    // Nothing special to update visually for this plugin as it re-generates the pool.
  }

  generateQuestionPool(settings) {
    return this.fullDataset.filter(f => this._isAllowed(f, settings));
  }

  getItemId(item) {
    return item.properties.ISO_A2;
  }

  getItemById(id) {
    return this.fullDataset.find(f => f.properties.ISO_A2 === id);
  }

  getCorrectAnswer(item) {
    return item.properties.NAME;
  }

  checkTypedAnswer(item, answer) {
    const guess = this._normalizeString(answer);
    if (guess.length < 2) return false;

    const acceptableNames = this._getAcceptableNames(item);

    for (const name of acceptableNames) {
        if (guess === name || (name.includes(guess) && guess.length > 3)) {
            return true;
        }
    }

    const primary = this._normalizeString(this.getCorrectAnswer(item));
    const distance = this._levenshteinDistance(guess, primary);
    const threshold = primary.length < 5 ? 1 : 2;
    return distance <= threshold;
  }

  generateChoices(correctItem, pool) {
    const correctName = this.getCorrectAnswer(correctItem);
    const options = [{ text: correctName, correct: true }];
    const incorrectOptions = new Set();

    const allPossibleAnswers = this.fullDataset.filter(item => this._isAllowed(item, activeSettings));

    while (incorrectOptions.size < 3 && incorrectOptions.size < allPossibleAnswers.length - 1) {
        const randomCountry = allPossibleAnswers[Math.floor(Math.random() * allPossibleAnswers.length)];
        const randomName = this.getCorrectAnswer(randomCountry);
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
        <div id="flag-display-container" class="relative group">
            <div id="flag-border" class="p-2 bg-slate-700 rounded-2xl shadow-2xl transition-all duration-300">
                <img id="flag-img" class="max-w-full max-h-[40vh] rounded-lg shadow-lg" style="display:none;">
            </div>
            <div id="flag-overlay" class="absolute inset-0 flex items-center justify-center pointer-events-none z-10 hidden">
                <div id="flag-name-display" class="text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/80 backdrop-blur-sm border border-white/20 shadow-2xl"></div>
            </div>
        </div>
      </div>
    `;

    this.flagImg = document.getElementById('flag-img');
    this.overlay = document.getElementById('flag-overlay');
    this.nameDisplay = document.getElementById('flag-name-display');
  }

  bindUIEvents() {
    // No specific UI events like zoom buttons for this plugin
  }

  displayQuestion(item) {
    if (!item || !this.flagImg) return;
    const iso = item.properties.ISO_A2.toLowerCase();
    this.flagImg.src = `https://flagcdn.com/w640/${iso}.png`;
    this.flagImg.style.display = 'block';
    this.overlay.classList.add('hidden');
    document.getElementById('flag-border').className = 'p-2 bg-slate-700 rounded-2xl shadow-2xl transition-all duration-300';
  }

  updateViewOnAnswer(item, correct, color) {
    const border = document.getElementById('flag-border');
    if (border) {
        border.style.backgroundColor = color || (correct ? '#16a34a' : '#dc2626');
    }
    const name = this.getCorrectAnswer(item);
    this.showOverlay(name, correct);
  }

  showOverlay(name, isCorrect) {
    if (!this.overlay || !this.nameDisplay) return;
    this.nameDisplay.textContent = name;
    this.nameDisplay.className = `text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/80 backdrop-blur-sm border shadow-2xl ${isCorrect ? 'text-green-400 border-green-500/50' : 'text-red-400 border-red-500/50'}`;
    this.overlay.classList.remove('hidden');
    // We don't hide it automatically here because the mode handles the next question delay
  }

  colorItem(itemId, color) {
    this.claims[itemId] = color;
  }

  renderResultView(container) {
    if (!container) return;
    
    // Create a grid of all flags that were asked or are in the dataset
    // For simplicity, let's show all flags that were claimed.
    const claimedIds = Object.keys(this.claims);
    if (claimedIds.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">Flag Collection</h3>
        <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
            ${claimedIds.map(id => {
                const color = this.claims[id];
                const iso = id.toLowerCase();
                const item = this.getItemById(id);
                const name = item ? item.properties.NAME : id;
                return `
                    <div class="aspect-[3/2] rounded-md p-1 shadow-sm flex items-center justify-center transition-transform hover:scale-105" 
                         style="background-color: ${color}" title="${name}">
                        <img src="https://flagcdn.com/w80/${iso}.png" class="max-w-full max-h-full rounded-sm shadow-sm pointer-events-none">
                    </div>
                `;
            }).join('')}
        </div>
    `;
  }

  clearHighlights() {
    // No highlights to clear
  }

  resetView() {
    this.claims = {};
    if (this.flagImg) this.flagImg.style.display = 'none';
    if (this.overlay) this.overlay.classList.add('hidden');
    const border = document.getElementById('flag-border');
    if (border) {
        border.style.backgroundColor = '';
        border.className = 'p-2 bg-slate-700 rounded-2xl shadow-2xl transition-all duration-300';
    }
  }

  getActiveItemsDescription(settings) {
    const regionLabels = {
        'north-america': 'North America',
        'south-america': 'South America',
        'europe': 'Europe',
        'asia': 'Asia',
        'africa': 'Africa',
        'oceania': 'Oceania'
    };
    const activeNames = Object.keys(settings.regions)
        .filter(r => settings.regions[r])
        .map(r => regionLabels[r]);
    
    if(activeNames.length > 0 && activeNames.length < Object.keys(regionLabels).length) {
        return activeNames.join(', ');
    }
    return '';
  }

  // Internal Helpers (similar to GeoQuizPlugin)
  _isAllowed(feature, settings) {
    if (!settings || !settings.regions) return true;
    const props = feature.properties;
    const cont = (props.CONTINENT || props.continent || "").toLowerCase();
    
    if (cont.includes("north america") && settings.regions['north-america']) return true;
    if (cont.includes("south america") && settings.regions['south-america']) return true;
    if (cont.includes("europe") && settings.regions['europe']) return true;
    if (cont.includes("asia") && settings.regions['asia']) return true;
    if (cont.includes("africa") && settings.regions['africa']) return true;
    if (cont.includes("oceania") && settings.regions['oceania']) return true;
    
    return false;
  }

  _getAcceptableNames(feature) {
    const props = feature.properties;
    const names = [
        props.NAME,
        props.NAME_LONG,
        props.FORMAL_EN,
        props.ADMIN,
        props.ISO_A2,
        props.ISO_A3
    ];
    return [...new Set(names.filter(n => n).map(s => this._normalizeString(s)))];
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
    Registry.registerPlugin(new FlagQuizPlugin());
}
