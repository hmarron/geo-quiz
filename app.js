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
        if (typeof showToast === 'function') showToast(err.message || 'Failed to load quiz data');
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

function toggleCustomQuizModal() {
    const modal = document.getElementById('custom-quiz-modal');
    if (!modal) return;
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function selectPlugin(id) {
    if (activePlugin && activePlugin.id === id) return;
    
    changePlugin(id).then(() => {
        togglePluginPicker();
    });
}

function triggerCsvUpload() {
    document.getElementById('csv-upload-input').click();
}

async function handleCsvUrlLoad() {
    const input = document.getElementById('csv-url-input');
    const url = input.value.trim();
    if (!url) return;

    // Create a new custom plugin instance
    const customPlugin = new CSVQuizPlugin({
        id: 'custom-csv-' + Date.now(),
        name: url.split('/').pop().replace('.csv', '') || 'URL Quiz',
        title: 'Remote Quiz',
        subtitle: 'Quiz loaded from URL',
        csvUrl: url,
        mapping: {
            id: 'id',
            answer: 'answer',
            questionMedia: 'questionMedia',
            categories: 'categories'
        }
    });

    try {
        Registry.registerPlugin(customPlugin);
        await changePlugin(customPlugin.id);
        toggleCustomQuizModal();
        togglePluginPicker();
        if (typeof showToast === 'function') showToast(`Loaded quiz from URL`);
        input.value = '';
    } catch (e) {
        console.error('Failed to load CSV from URL:', e);
        if (typeof showToast === 'function') showToast(`Failed to load CSV: ${e.message}`);
    }
}

async function handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvRaw = e.target.result;
        
        // Create a new custom plugin instance
        const customPlugin = new CSVQuizPlugin({
            id: 'custom-csv-' + Date.now(),
            name: file.name.replace('.csv', ''),
            title: file.name.replace('.csv', ''),
            subtitle: 'User uploaded quiz',
            csvRaw: csvRaw,
            mapping: {
                id: 'id',
                answer: 'answer',
                questionMedia: 'questionMedia',
                categories: 'categories'
            }
        });

        Registry.registerPlugin(customPlugin);
        await changePlugin(customPlugin.id);
        toggleCustomQuizModal();
        togglePluginPicker();
        
        if (typeof showToast === 'function') {
            showToast(`Loaded quiz: ${customPlugin.name}`);
        }
    };
    reader.readAsText(file);
    
    // Reset input so same file can be uploaded again if needed
    event.target.value = '';
}

async function handleCsvPaste() {
    let csvRaw;
    try {
        csvRaw = await navigator.clipboard.readText();
    } catch (e) {
        if (typeof showToast === 'function') showToast('Clipboard access denied');
        return;
    }

    if (!csvRaw || !csvRaw.trim()) {
        if (typeof showToast === 'function') showToast('Clipboard is empty');
        return;
    }

    // Validate: need a header row and at least one data row
    const lines = csvRaw.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (lines.length < 2) {
        if (typeof showToast === 'function') showToast('CSV must have a header row and at least one data row');
        return;
    }
    const headers = lines[0].split(',').map(h => h.trim());
    if (!headers.includes('answer') || !headers.includes('questionMedia')) {
        if (typeof showToast === 'function') showToast('CSV must have "answer" and "questionMedia" columns');
        return;
    }

    const customPlugin = new CSVQuizPlugin({
        id: 'custom-csv-' + Date.now(),
        name: 'Pasted Quiz',
        title: 'Pasted Quiz',
        subtitle: 'Quiz from clipboard',
        csvRaw: csvRaw,
        mapping: {
            id: 'id',
            answer: 'answer',
            questionMedia: 'questionMedia',
            categories: 'categories'
        }
    });

    Registry.registerPlugin(customPlugin);
    await changePlugin(customPlugin.id);
    toggleCustomQuizModal();
    togglePluginPicker();
    if (typeof showToast === 'function') showToast('Loaded quiz from clipboard');
}

function changePlugin(id) {
    Registry.setActivePlugin(id);
    activePlugin = Registry.getActivePlugin();
    dataReady = false; // Trigger reload
    
    // If we are a host in a lobby, tell others
    if (typeof mpIsHost !== 'undefined' && mpIsHost && typeof broadcast === 'function') {
        const msg = { type: 'plugin-change', pluginId: id };
        // If it's a dynamic custom plugin, we need to send the whole config
        if (id.startsWith('custom-csv-') && activePlugin instanceof CSVQuizPlugin) {
            msg.config = {
                id: activePlugin.id,
                name: activePlugin.name,
                title: activePlugin.title,
                subtitle: activePlugin.subtitle,
                csvRaw: activePlugin.csvRaw,
                csvUrl: activePlugin.csvUrl,
                mapping: activePlugin.mapping
            };
        }
        broadcast(msg);
    }
    
    // Clear the container
    const container = document.getElementById('quiz-view-container');
    if (container) container.innerHTML = '';
    
    // Re-init with new plugin
    return init();
}

const _autoJoinCode = new URLSearchParams(window.location.search).get('join');
if (_autoJoinCode) startMultiplayer(_autoJoinCode.toUpperCase());