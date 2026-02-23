// ─── Orchestrator: init, timer, activeMode dispatch, single-player, PWA ──────

let score = 0;
let wrongCount = 0;
let hintCount = 0;
let startTime = null;
let timerInterval = null;

let activePlugin = null;
let activeMode = null;

let dataReady = false;
let dataLoading = false;

async function init(andThen) {
    if (!activePlugin) activePlugin = Registry.getActivePlugin();
    if (!activeMode) activeMode = Registry.getMode('solo');

    renderPluginPicker();

    // Update global UI with plugin metadata
    const titleEl = document.getElementById('app-title');
    const subtitleEl = document.getElementById('app-subtitle');
    if (titleEl) titleEl.textContent = activePlugin.title || activePlugin.name;
    if (subtitleEl) subtitleEl.textContent = activePlugin.subtitle || '';

    if (dataReady) { 
        if (andThen) andThen(); 
        return; 
    }
    if (dataLoading) {
        const wait = setInterval(() => { if (dataReady) { clearInterval(wait); if (andThen) andThen(); } }, 100);
        return;
    }
    dataLoading = true;
    document.getElementById('loader-text').innerText = `Loading ${activePlugin.name}...`;

    try {
        await activePlugin.loadScripts();
        await activePlugin.loadData();
        
        const quizViewContainer = document.getElementById('quiz-view-container');
        activePlugin.renderQuizView(quizViewContainer);
        activePlugin.bindUIEvents();

        applyActiveSettings();

        answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkTypedAnswer();
        });

        dataReady = true;
        dataLoading = false;
        document.getElementById('loader').style.display = 'none';
        if (andThen) andThen();
    } catch (err) {
        console.error("Error loading plugin or data:", err);
        dataLoading = false;
    }
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        document.getElementById('timer').textContent = formatTime(Date.now() - startTime);
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function resetGame() {
    activeMode.onReset();
}

function playAgain() {
    document.getElementById('finish-modal').style.display = 'none';
    toggleSettings();
}

function goHome() {
    activeMode.onHome();
}

function startSinglePlayer() {
    activeMode = Registry.getMode('solo');
    document.getElementById('start-screen').style.display = 'none';
    // Initialize the app and plugin, then show settings before starting the first game.
    init(() => toggleSettings());
}

// ─── Viewport height sync ─────────────────────────────────────────────────────

function syncViewportHeight() {
    document.body.style.height = (window.visualViewport?.height ?? window.innerHeight) + 'px';
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportHeight);
    syncViewportHeight();
}

// ─── PWA install prompt ───────────────────────────────────────────────────────

let installPromptEvent = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
    document.getElementById('start-install-btn').classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    document.getElementById('start-install-btn').classList.add('hidden');
});

function installApp() {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    installPromptEvent.userChoice.then(() => {
        installPromptEvent = null;
        document.getElementById('start-install-btn').classList.add('hidden');
    });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

setMode(activeSettings.gameMode); // From settings.js, sets 'easy' or 'hard'
init(); // Start loading data in the background immediately

function renderPluginPicker() {
    const picker = document.getElementById('plugin-picker');
    if (!picker) return;

    const label = document.getElementById('current-plugin-label');
    if (label && activePlugin) {
        label.textContent = activePlugin.name;
    }
    
    const plugins = Registry.getAllPlugins();
    picker.innerHTML = plugins.map(p => `
        <button onclick="selectPlugin('${p.id}')" 
                class="flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${p.id === activePlugin?.id ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'}">
            <span class="text-xs font-bold leading-tight flex-1 text-left">${p.name}</span>
            ${p.id === activePlugin?.id ? '<span class="text-blue-400 text-[10px]">●</span>' : ''}
        </button>
    `).join('');
}

function togglePluginPicker() {
    const modal = document.getElementById('plugin-picker-modal');
    if (!modal) return;
    if (modal.style.display !== 'flex') {
        renderPluginPicker();
    }
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function selectPlugin(id) {
    if (activePlugin && activePlugin.id === id) return;
    
    changePlugin(id).then(() => {
        togglePluginPicker();
    });
}

function changePlugin(id) {
    Registry.setActivePlugin(id);
    activePlugin = Registry.getActivePlugin();
    dataReady = false; // Trigger reload
    
    // If we are a host in a lobby, tell others
    if (typeof mpIsHost !== 'undefined' && mpIsHost && typeof broadcast === 'function') {
        broadcast({ type: 'plugin-change', pluginId: id });
    }
    
    // Clear the container
    const container = document.getElementById('quiz-view-container');
    if (container) container.innerHTML = '';
    
    // Re-init with new plugin
    return init();
}

const _autoJoinCode = new URLSearchParams(window.location.search).get('join');
if (_autoJoinCode) startMultiplayer(_autoJoinCode.toUpperCase());