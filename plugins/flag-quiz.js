// plugins/flag-quiz.js

class FlagQuizPlugin extends BaseQuizPlugin {
  constructor() {
    super();
    this.id = 'flag-quiz';
    this.name = 'Flag Quiz';
    this.title = 'Flag Challenge';
    this.subtitle = 'Identify world flags';
    this.supportedModes = ['solo', 'race', 'compete', 'land-grab'];

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

  async loadData() {
    if (this.fullDataset.length > 0) return;
    const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson');
    const data = await response.json();
    
    // Transform GeoJSON features into standard Quiz items
    this.fullDataset = data.features
        .filter(f => f.properties.ISO_A2 && f.properties.ISO_A2 !== '-99')
        .map(f => {
            const props = f.properties;
            const iso = props.ISO_A2.toLowerCase();
            return {
                id: props.ISO_A2,
                answer: props.NAME,
                questionMedia: `https://flagcdn.com/w640/${iso}.png`,
                thumbnailUrl: `https://flagcdn.com/w80/${iso}.png`,
                categories: [(props.CONTINENT || props.continent || "").toLowerCase()],
                acceptableAnswers: [
                    props.NAME_LONG,
                    props.FORMAL_EN,
                    props.ADMIN,
                    props.ISO_A2,
                    props.ISO_A3
                ].filter(n => n)
            };
        });
  }

  getSettingsView() {
    const regionsHTML = this.regions.map(r => `
        <label class="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="check-${r.id}" ${activeSettings.filters[r.id] ? 'checked' : ''}
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
            <input type="checkbox" id="mp-check-${r.id}" ${activeSettings.filters[r.id] ? 'checked' : ''}
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
    // Ensure at least one region is selected if no valid ones are found
    const validIds = this.regions.map(r => r.id);
    const existingIds = Object.keys(settings.filters || {});
    const isMismatch = existingIds.length > 0 && !existingIds.some(id => validIds.includes(id));

    if (!settings.filters || existingIds.length === 0 || isMismatch) {
        settings.filters = {};
        this.regions.forEach(r => settings.filters[r.id] = true);
    }
  }

  getScoreSettingsDescription(settings) {
    const activeNames = this.regions
        .filter(r => settings.filters[r.id])
        .map(r => r.label);
    
    if(activeNames.length > 0 && activeNames.length < this.regions.length) {
        return activeNames.join(', ');
    }
    return '';
  }

  _isAllowed(item, settings) {
    if (!settings || !settings.filters) return true;
    const cat = (item.categories[0] || "");
    
    if (cat.includes("north america") && settings.filters['north-america']) return true;
    if (cat.includes("south america") && settings.filters['south-america']) return true;
    if (cat.includes("europe") && settings.filters['europe']) return true;
    if (cat.includes("asia") && settings.filters['asia']) return true;
    if (cat.includes("africa") && settings.filters['africa']) return true;
    if (cat.includes("oceania") && settings.filters['oceania']) return true;
    
    return false;
  }
}

if (typeof Registry !== 'undefined') {
    Registry.registerPlugin(new FlagQuizPlugin());
}
