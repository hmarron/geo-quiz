// ─── Orchestrator: init, timer, activeMode dispatch, single-player, PWA ──────

let score = 0;
let wrongCount = 0;
let hintCount = 0;
let startTime = null;
let timerInterval = null;
let fullDataset = [];
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
    try {
        const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson');
        const data = await response.json();
        fullDataset = data.features;

        renderSettings();
        updateActiveLabel();
        pool = fullDataset.filter(isAllowed);
        document.getElementById('remaining').innerText = pool.length;

        g.selectAll("path")
            .data(fullDataset)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
            .style("stroke", showBorders ? COLOR_BORDER : "none")
            .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);

        answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkTypedAnswer();
        });

        dataReady = true;
        document.getElementById('loader').style.display = 'none';
        if (andThen) andThen();
    } catch (err) {
        console.error("Error loading map:", err);
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

function goHome() {
    activeMode.onHome();
}

function startSinglePlayer() {
    activeMode = SoloMode;
    document.getElementById('start-screen').style.display = 'none';
    init(() => resetGame());
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

setMode(gameMode);
init(); // start loading data in the background immediately
