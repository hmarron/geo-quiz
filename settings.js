// ─── Regions, settings UI, gameMode ──────────────────────────────────────────

// This object defines the shape of the settings.
// The plugin is responsible for providing the UI and handling these values.
const activeSettings = {
    gameMode: 'easy',
    showBorders: true,
    regions: {
        'north-america': true,
        'south-america': true,
        'europe': true,
        'asia': true,
        'africa-north': true,
        'africa-south': false,
        'oceania': false,
    }
};

const settingsModal = document.getElementById('settings-modal');

function renderSettings() {
    const container = document.getElementById('plugin-settings-container');
    if (typeof activePlugin.getSettingsView === 'function') {
        container.innerHTML = activePlugin.getSettingsView();
    } else {
        container.innerHTML = '';
    }
}

function setMode(mode) {
    activeSettings.gameMode = mode;
    document.getElementById('mode-hard').classList.toggle('mode-btn-active', mode === 'hard');
    document.getElementById('mode-easy').classList.toggle('mode-btn-active', mode === 'easy');
}

function toggleSettings() {
    // Re-render settings each time the modal is opened to ensure they are fresh
    if (settingsModal.style.display !== 'flex') {
        renderSettings();
    }
    settingsModal.style.display = settingsModal.style.display === 'flex' ? 'none' : 'flex';
}

// Applies the current state of activeSettings to the game engine and plugin.
function applyActiveSettings() {
    if (typeof activePlugin.updateSettings === 'function') {
        activePlugin.updateSettings(activeSettings);
    }
    pool = activePlugin.generateQuestionPool(activeSettings);
    document.getElementById('remaining').innerText = pool.length;
    updateActiveLabel();
}

// Reads settings from the main settings modal, applies them, and starts/restarts the game.
function applySettings(startNew = true) {
    // Update activeSettings from the UI elements provided by the plugin
    const bordersCheckbox = document.getElementById('check-borders');
    if (bordersCheckbox) {
        activeSettings.showBorders = bordersCheckbox.checked;
    }

    for (const regionId in activeSettings.regions) {
        const regionCheckbox = document.getElementById(`check-${regionId}`);
        if (regionCheckbox) {
            activeSettings.regions[regionId] = regionCheckbox.checked;
        }
    }

    applyActiveSettings();

    toggleSettings(); // Close the modal
    if (startNew) resetGame();
}

function updateActiveLabel() {
    // This is still somewhat geo-specific. A future refactor could move this
    // into the plugin as well, e.g. `plugin.getActiveItemsDescription()`.
    const regionLabels = {
        'north-america': 'North America',
        'south-america': 'South America',
        'europe': 'Europe',
        'asia': 'Asia',
        'africa-north': 'Africa: Above Equator',
        'africa-south': 'Africa: Below Equator',
        'oceania': 'Oceania',
    };
    const activeNames = Object.keys(activeSettings.regions)
        .filter(r => activeSettings.regions[r])
        .map(r => regionLabels[r]);
    
    const label = document.getElementById('active-regions-label');
    if(activeNames.length > 0 && activeNames.length < Object.keys(regionLabels).length) {
        label.innerText = activeNames.join(', ');
        label.classList.remove('hidden');
    } else {
        label.classList.add('hidden');
    }
}