// ─── Regions, settings UI, gameMode ──────────────────────────────────────────

const regions = [
    { id: 'north-america', label: 'North America', active: true },
    { id: 'south-america', label: 'South America', active: true },
    { id: 'europe', label: 'Europe', active: true },
    { id: 'asia', label: 'Asia', active: true },
    { id: 'africa-north', label: 'Africa: Above Equator', active: true },
    { id: 'africa-south', label: 'Africa: Below Equator', active: false },
    { id: 'oceania', label: 'Oceania', active: false }
];

let showBorders = true;
let gameMode = 'easy';

const settingsModal = document.getElementById('settings-modal');

function isAllowed(feature) {
    const rId = getCountryRegionId(feature);
    const r = regions.find(x => x.id === rId);
    return r ? r.active : false;
}

function renderSettings() {
    const container = document.getElementById('region-toggles');
    container.innerHTML = regions.map(r => `
        <label class="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="check-${r.id}" ${r.active ? 'checked' : ''}
                   class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-sm font-medium text-slate-200">${r.label}</span>
        </label>
    `).join('');
}

function setMode(mode) {
    gameMode = mode;
    document.getElementById('mode-hard').classList.toggle('mode-btn-active', mode === 'hard');
    document.getElementById('mode-easy').classList.toggle('mode-btn-active', mode === 'easy');
}

function toggleSettings() {
    settingsModal.style.display = settingsModal.style.display === 'flex' ? 'none' : 'flex';
}

function applySettings(startNew = true) {
    showBorders = document.getElementById('check-borders').checked;
    regions.forEach(r => {
        const cb = document.getElementById(`check-${r.id}`);
        if (cb) r.active = cb.checked;
    });

    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;

    g.selectAll(".country")
        .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
        .style("stroke", showBorders ? COLOR_BORDER : "none")
        .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);

    updateActiveLabel();
    toggleSettings();
    if (startNew) resetGame();
}

function updateActiveLabel() {
    const activeNames = regions.filter(r => r.active).map(r => r.label);
    document.getElementById('active-regions-label').innerText = activeNames.length > 0 ? activeNames.join(', ') : 'None selected';
}

// ─── MP lobby settings (from mp.js) ──────────────────────────────────────────

function mpRenderLobbySettings() {
    const container = document.getElementById('mp-region-toggles');
    container.innerHTML = regions.map(r => `
        <label class="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="mp-check-${r.id}" ${r.active ? 'checked' : ''}
                   class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-xs font-medium text-slate-200">${r.label}</span>
        </label>
    `).join('');
    document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', gameMode === 'hard');
    document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', gameMode === 'easy');
}

function mpSetGameMode(mode) {
    gameMode = mode;
    setMode(mode);
    document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', mode === 'hard');
    document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', mode === 'easy');
}
