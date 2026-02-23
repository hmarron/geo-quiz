// ─── Regions, settings UI, gameMode ──────────────────────────────────────────

// This object defines the shape of the settings.
// The plugin is responsible for providing the UI and handling these values.
const activeSettings = {
    gameMode: 'easy',
    showBorders: true,
    filters: {
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

    // Dynamic filter application
    if (activeSettings.filters) {
        for (const filterId in activeSettings.filters) {
            const filterCheckbox = document.getElementById(`check-${filterId}`);
            if (filterCheckbox) {
                activeSettings.filters[filterId] = filterCheckbox.checked;
            }
        }
    }

    applyActiveSettings();

    toggleSettings(); // Close the modal
    if (startNew) resetGame();
}

function updateActiveLabel() {
    let desc = '';
    if (activePlugin && typeof activePlugin.getScoreSettingsDescription === 'function') {
        desc = activePlugin.getScoreSettingsDescription(activeSettings);
    }
    
    const label = document.getElementById('active-regions-label');
    if(desc) {
        label.innerText = desc;
        label.classList.remove('hidden');
    } else {
        label.classList.add('hidden');
    }
}
    // ─── Multiplayer Lobby Settings ──────────────────────────────────────────────
    
    function mpRenderLobbySettings() {
        const container = document.getElementById('plugin-mp-settings');
        if (activePlugin && typeof activePlugin.getLobbySettingsView === 'function') {
            container.innerHTML = activePlugin.getLobbySettingsView();
        } else {
            container.innerHTML = '';
        }
        
        document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', activeSettings.gameMode === 'hard');
    
        document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', activeSettings.gameMode === 'easy');
    }
    
    function mpSetGameMode(mode) {
        setMode(mode);
        document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', mode === 'hard');
        document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', mode === 'easy');
    }
    