// plugins/geo-quiz.js

class GeoQuizPlugin {
  constructor() {
    this.id = 'geo-quiz';
    this.name = 'Geography Quiz';
    this.title = 'Geography Challenge';
    this.subtitle = 'Test your world geography knowledge';
    this.supportedModes = ['solo', 'race', 'compete', 'land-grab'];

    this.fullDataset = [];

    this.initialRegions = [
        { id: 'north-america', label: 'North America' },
        { id: 'south-america', label: 'South America' },
        { id: 'europe', label: 'Europe' },
        { id: 'asia', label: 'Asia' },
        { id: 'africa-north', label: 'Africa: Above Equator' },
        { id: 'africa-south', label: 'Africa: Below Equator' },
        { id: 'oceania', label: 'Oceania' }
    ];

    // D3 and map-related properties
    this.svg = null;
    this.g = null;
    this.projection = null;
    this.path = null;
    this.zoom = null;
    this.width = 0;
    this.height = 0;

    // Constants
    this.COLOR_ACTIVE_FILL = "#374151";
    this.COLOR_BORDER = "#6b7280";
    this.COLOR_EXCLUDED_FILL = "#1a2a3a";
  }

  loadScripts() {
    return new Promise((resolve, reject) => {
        if (window.d3) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://d3js.org/d3.v7.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load D3.js'));
        document.head.appendChild(script);
    });
  }

  async loadData() {
    if (this.fullDataset.length > 0) return;
    const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson');
    const data = await response.json();
    this.fullDataset = data.features;
  }

  getSettingsView() {
    const regionsHTML = this.initialRegions.map(r => `
        <label class="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="check-${r.id}" ${activeSettings.regions[r.id] ? 'checked' : ''}
                   class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-sm font-medium text-slate-200">${r.label}</span>
        </label>
    `).join('');

    return `
      <div class="mb-6">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Map Display</h3>
          <label class="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
              <input type="checkbox" id="check-borders" ${activeSettings.showBorders ? 'checked' : ''}
                     class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
              <span class="text-sm font-medium text-slate-200">Show Country Borders</span>
          </label>
      </div>
      <div class="mb-6">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Continents & Regions</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="region-toggles">
              ${regionsHTML}
          </div>
      </div>
    `;
  }

  getLobbySettingsView() {
    const regionsHTML = this.initialRegions.map(r => `
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

  generateQuestionPool(settings) {
    return this.fullDataset.filter(f => this._isAllowed(f, settings));
  }

  getItemId(item) {
    return item.properties.ISO_A3;
  }

  getItemById(id) {
    return this.fullDataset.find(f => f.properties.ISO_A3 === id);
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

    while (incorrectOptions.size < 3 && incorrectOptions.size < allPossibleAnswers.length -1) {
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
    container.innerHTML = `
        <div id="country-overlay" class="absolute inset-0 flex items-center justify-center pointer-events-none z-10 hidden">
            <div id="country-name-display" class="text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/50 backdrop-blur-sm"></div>
        </div>
        <div class="zoom-controls">
            <button id="btn-zoom-in" class="btn-zoom">+</button>
            <button id="btn-zoom-out" class="btn-zoom">-</button>
            <button id="btn-zoom-reset" class="btn-zoom">⟲</button>
        </div>
    `;

    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.svg = d3.select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("position", "absolute")
      .style("top", 0)
      .style("left", 0)
      .attr("viewBox", `0 0 ${this.width} ${this.height}`);

    this.g = this.svg.append("g");

    this.projection = d3.geoMercator()
      .scale(this.width / 6.5)
      .translate([this.width / 2, this.height / 1.5]);

    this.path = d3.geoPath().projection(this.projection);

    this.zoom = d3.zoom()
      .scaleExtent([1, 100])
      .on("zoom", (event) => {
        this.g.attr("transform", event.transform);
        this.g.selectAll("path").style("stroke-width", 0.5 / event.transform.k + "px");
      });

    this.svg.call(this.zoom);

    this.g.selectAll("path")
      .data(this.fullDataset)
      .enter()
      .append("path")
      .attr("d", this.path);

    this.updateSettings(activeSettings);

    window.addEventListener('resize', () => {
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.svg.attr("viewBox", `0 0 ${this.width} ${this.height}`);
    });
  }

  bindUIEvents() {
      document.getElementById('btn-zoom-in').onclick = () => this.zoomIn();
      document.getElementById('btn-zoom-out').onclick = () => this.zoomOut();
      document.getElementById('btn-zoom-reset').onclick = () => this.resetZoom();
  }

  showOverlay(name, isCorrect) {
    const overlay = document.getElementById('country-overlay');
    const nameDisplay = document.getElementById('country-name-display');
    if (!overlay || !nameDisplay) return;
    nameDisplay.textContent = name;
    nameDisplay.className = `text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/50 backdrop-blur-sm ${isCorrect ? 'text-green-400' : 'text-red-400'}`;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 600);
  }

  updateSettings(settings) {
    this.g.selectAll("path")
      .attr("class", d => this._isAllowed(d, settings) ? "country" : "country country-excluded")
      .style("stroke", settings.showBorders ? this.COLOR_BORDER : "none")
      .style("fill", d => this._isAllowed(d, settings) ? this.COLOR_ACTIVE_FILL : this.COLOR_EXCLUDED_FILL);
  }

  displayQuestion(item) {
    if (!item) return;
    this.g.selectAll(".country").classed("country-highlight", d => d === item);

    try {
        const bounds = this.path.bounds(item);
        if (bounds && !isNaN(bounds[0][0])) {
            const dx = bounds[1][0] - bounds[0][0];
            const dy = bounds[1][1] - bounds[0][1];
            const x = (bounds[0][0] + bounds[1][0]) / 2;
            const y = (bounds[0][1] + bounds[1][1]) / 2;
            const maxDim = Math.max(dx / this.width, dy / this.height, 0.001);
            const scale = Math.max(1.8, Math.min(35, 0.42 / maxDim));
            const translate = [this.width / 2 - scale * x, this.height / 2 - scale * y];
            this.svg.transition().duration(500).call(this.zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
        }
    } catch (e) {}
  }

  updateViewOnAnswer(item, correct, mpPlayerColor) {
    const selection = this.g.selectAll(".country").filter(d => d === item);
    if (mpPlayerColor) {
        selection.style("fill", mpPlayerColor);
    } else {
        selection.style("fill", correct ? '#16a34a' : '#dc2626'); // green-600, red-600
    }
  }

  colorItem(itemId, color) {
    if (!itemId || !color) return;
    // Filter the d3 selection directly by the item's ID property.
    // This is more robust than comparing object references.
    this.g.selectAll("path")
        .filter(d => d && d.properties && this.getItemId(d) === itemId)
        .style("fill", color);
  }

  resetView() {
    this.clearHighlights();
    this.updateSettings(activeSettings); // Re-apply styles
    this.resetZoom();
  }

  renderResultActions(container) {
    if (!container) return;
    container.innerHTML = `
        <button onclick="mpViewMap()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl font-bold transition-colors">View Map</button>
    `;
  }

  getActiveItemsDescription(settings) {
    const regionLabels = {
        'north-america': 'North America',
        'south-america': 'South America',
        'europe': 'Europe',
        'asia': 'Asia',
        'africa-north': 'Africa: Above Equator',
        'africa-south': 'Africa: Below Equator',
        'oceania': 'Oceania',
    };
    const activeNames = Object.keys(settings.regions)
        .filter(r => settings.regions[r])
        .map(r => regionLabels[r]);
    
    if(activeNames.length > 0 && activeNames.length < Object.keys(regionLabels).length) {
        return activeNames.join(', ');
    }
    return '';
  }

  clearHighlights() {
    this.g.selectAll(".country")
        .classed("country-highlight", false);
  }

  // Map specific helpers
  zoomIn() { this.svg.transition().duration(400).call(this.zoom.scaleBy, 2); }
  zoomOut() { this.svg.transition().duration(400).call(this.zoom.scaleBy, 0.5); }
  resetZoom() { this.svg.transition().duration(400).call(this.zoom.transform, d3.zoomIdentity); }

  // Internal helpers
  _getCountryRegionId(feature) {
    const props = feature.properties;
    const cont = (props.CONTINENT || props.continent || "").toLowerCase();
    const centroid = d3.geoCentroid(feature);
    const lat = centroid[1];

    if (cont.includes("north america")) return 'north-america';
    if (cont.includes("south america")) return 'south-america';
    if (cont.includes("europe")) return 'europe';
    if (cont.includes("asia")) return 'asia';
    if (cont.includes("oceania")) return 'oceania';
    if (cont.includes("africa")) return lat >= 0 ? 'africa-north' : 'africa-south';
    return null;
  }

  _isAllowed(feature, settings) {
    if (!settings || !settings.regions) return true; // Default to allowed if settings are missing
    const regionId = this._getCountryRegionId(feature);
    return regionId && settings.regions[regionId];
  }

  _getAcceptableNames(feature) {
    const props = feature.properties;
    const names = [
        props.NAME,
        props.NAME_LONG,
        props.FORMAL_EN,
        props.SOVEREIGNT,
        props.ADMIN,
        props.BRK_A3,
        props.ISO_A3,
        props.ABBREV,
        props.POSTAL,
        ...Object.values(props.NAME_SORT || {}),
        ...Object.values(props.NAME_ALT || {}),
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
    
    // Register with the global Registry
    if (typeof Registry !== 'undefined') {
        Registry.registerPlugin(new GeoQuizPlugin());
    }
    