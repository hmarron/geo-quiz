// ─── Orchestrator: init, timer, activeMode dispatch, single-player, PWA ──────

let score = 0;
let wrongCount = 0;
let hintCount = 0;
let startTime = null;
let timerInterval = null;

const activePlugin = new GeoQuizPlugin();
let activeMode = SoloMode;  // default; set by startSinglePlayer() or mpStartGame()

let dataReady = false;
let dataLoading = false;

async function init(andThen) {
    if (dataReady) { if (andThen) andThen(); return; }
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

        renderSettings(); // Renders UI controls for settings
        updateActiveLabel(); // Updates the "Xx countries active" label

        // Generate the initial pool based on default settings
        pool = activePlugin.generateQuestionPool(activeSettings);
        document.getElementById('remaining').innerText = pool.length;

        answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkTypedAnswer();
        });

        dataReady = true;
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
    activeMode = SoloMode;
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

const _autoJoinCode = new URLSearchParams(window.location.search).get('join');
if (_autoJoinCode) startMultiplayer(_autoJoinCode.toUpperCase());