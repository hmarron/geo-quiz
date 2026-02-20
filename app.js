const container = document.getElementById('map-container');
const optionsGrid = document.getElementById('options-grid');
const inputArea = document.getElementById('input-area');
const answerInput = document.getElementById('answer-input');
const settingsModal = document.getElementById('settings-modal');

let width = container.clientWidth;
let height = container.clientHeight;

let score = 0;
let wrongCount = 0;
let hintCount = 0;
let pool = [];
let startTime = null;
let timerInterval = null;
let fullDataset = [];
let currentTarget = null;
let canAnswer = false;
let showBorders = true;
let gameMode = 'easy';

const COLOR_ACTIVE_FILL = "#374151";
const COLOR_BORDER = "#6b7280";
const COLOR_EXCLUDED_FILL = "#1a2a3a";

const regions = [
    { id: 'north-america', label: 'North America', active: true },
    { id: 'south-america', label: 'South America', active: true },
    { id: 'europe', label: 'Europe', active: true },
    { id: 'asia', label: 'Asia', active: true },
    { id: 'africa-north', label: 'Africa: Above Equator', active: true },
    { id: 'africa-south', label: 'Africa: Below Equator', active: false },
    { id: 'oceania', label: 'Oceania', active: false }
];

const svg = d3.select("#map-container")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);

const g = svg.append("g");

const projection = d3.geoMercator()
    .scale(width / 6.5)
    .translate([width / 2, height / 1.5]);

const path = d3.geoPath().projection(projection);

const zoom = d3.zoom()
    .scaleExtent([1, 100])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
        g.selectAll(".country").style("stroke-width", 0.5 / event.transform.k + "px");
    });

svg.call(zoom);

function getCountryName(feature) {
    if (!feature) return "Unknown";
    const p = feature.properties;
    return p.NAME || p.ADMIN || p.name || "Unnamed Territory";
}

function getAcceptableNames(feature) {
    if (!feature) return [];
    const p = feature.properties;
    const candidates = [p.NAME, p.ADMIN, p.NAME_LONG, p.ABBREV, p.ISO_A3, p.ISO_A2];
    return [...new Set(candidates.filter(Boolean).map(normalizeString).filter(n => n.length > 0))];
}

function levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= m; i++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    }
    return d[m][n];
}

function normalizeString(str) {
    return str.toLowerCase()
        .replace(/^the\s+/i, '')
        .replace(/[^a-z0-9\s]/gi, '')
        .trim();
}

function getCountryRegionId(feature) {
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

function isAllowed(feature) {
    const rId = getCountryRegionId(feature);
    const r = regions.find(x => x.id === rId);
    return r ? r.active : false;
}

let dataReady = false;
let dataLoading = false;

async function init(andThen) {
    if (dataReady) { if (andThen) andThen(); return; }
    if (dataLoading) {
        // Already in flight — poll until done then run callback
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

function formatTime(ms) {
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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

// ─── High Scores ────────────────────────────────────────────────────────────

const SCORES_KEY = 'geo-quiz-scores';

function saveScore(elapsed) {
    const entry = {
        score,
        wrong: wrongCount,
        hints: hintCount,
        time: elapsed,
        date: new Date().toISOString(),
        settings: {
            mode: gameMode,
            regions: regions.filter(r => r.active).map(r => r.id)
        }
    };
    const scores = loadScores();
    scores.push(entry);
    scores.sort((a, b) => {
        const accA = (a.score + a.wrong) > 0 ? a.score / (a.score + a.wrong) : 0;
        const accB = (b.score + b.wrong) > 0 ? b.score / (b.score + b.wrong) : 0;
        if (accB !== accA) return accB - accA;
        return a.time - b.time;
    });
    try { localStorage.setItem(SCORES_KEY, JSON.stringify(scores.slice(0, 20))); } catch (e) {}
}

function loadScores() {
    try { return JSON.parse(localStorage.getItem(SCORES_KEY)) || []; } catch { return []; }
}

function showFinishThenScores() {
    document.getElementById('finish-modal').style.display = 'none';
    toggleScores();
}

function toggleScores() {
    const modal = document.getElementById('scores-modal');
    if (modal.style.display === 'flex') {
        modal.style.display = 'none';
        return;
    }
    const scores = loadScores();
    const list = document.getElementById('scores-list');
    if (scores.length === 0) {
        list.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">No scores yet — play a game!</p>';
    } else {
        list.innerHTML = scores.map((s, i) => {
            const accuracy = (s.score + s.wrong) > 0 ? Math.round(s.score / (s.score + s.wrong) * 100) : 0;
            const regionLabels = s.settings.regions.map(id => regions.find(r => r.id === id)?.label ?? id).join(', ');
            const date = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return `
                <div class="flex items-start gap-3 p-3 bg-slate-700/30 rounded-xl">
                    <span class="text-slate-600 font-mono text-sm pt-0.5 w-5 shrink-0 text-right">${i + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap gap-x-3 text-sm font-mono">
                            <span class="text-green-400 font-bold">${s.score}✓</span>
                            <span class="text-red-400 font-bold">${s.wrong}✗</span>
                            <span class="text-blue-400">${formatTime(s.time)}</span>
                            <span class="text-slate-400">${accuracy}%</span>
                            ${s.hints > 0 ? `<span class="text-amber-500">${s.hints} hint${s.hints !== 1 ? 's' : ''}</span>` : ''}
                        </div>
                        <div class="text-xs text-slate-500 mt-0.5 truncate">${s.settings.mode === 'hard' ? 'Hard' : 'Easy'} · ${regionLabels} · ${date}</div>
                    </div>
                </div>`;
        }).join('');
    }
    modal.style.display = 'flex';
}

// ─── Finish Modal ────────────────────────────────────────────────────────────

function showFinishModal() {
    stopTimer();
    const elapsed = startTime ? Date.now() - startTime : 0;
    saveScore(elapsed);
    const total = score + wrongCount;
    const accuracy = total > 0 ? Math.round(score / total * 100) : 0;
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-wrong').textContent = wrongCount;
    document.getElementById('final-time').textContent = formatTime(elapsed);
    document.getElementById('final-accuracy').textContent = `${accuracy}% accuracy · ${hintCount} hint${hintCount !== 1 ? 's' : ''}`;

    // Find best previous score with the same settings
    const activeRegions = regions.filter(r => r.active).map(r => r.id).sort().join(',');
    const allScores = loadScores();
    const sameSettings = allScores.filter(s => {
        return s.settings.mode === gameMode &&
               s.settings.regions.slice().sort().join(',') === activeRegions;
    });
    // sameSettings includes the score we just saved; best is index 0 (sorted by accuracy desc, time asc)
    const best = sameSettings[0];
    const bestEl = document.getElementById('final-best');
    if (best && (best.score + best.wrong) > 0) {
        const bestAcc = Math.round(best.score / (best.score + best.wrong) * 100);
        bestEl.textContent = `Best: ${bestAcc}% · ${formatTime(best.time)}`;
        bestEl.classList.remove('hidden');
    } else {
        bestEl.classList.add('hidden');
    }

    document.getElementById('finish-modal').style.display = 'flex';
}

function showOverlay(name, isCorrect) {
    const overlay = document.getElementById('country-overlay');
    const nameDisplay = document.getElementById('country-name-display');
    nameDisplay.textContent = name;
    nameDisplay.className = `text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/50 backdrop-blur-sm ${isCorrect ? 'text-green-400' : 'text-red-400'}`;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 600);
}

function nextQuestion() {
    if (mpIsActive && !mpIsHost) return; // guests wait for 'question' message

    if (pool.length === 0) {
        inputArea.classList.add('hidden');
        optionsGrid.classList.add('hidden');
        g.selectAll(".country").classed("country-highlight", false);
        if (mpIsActive) { mpAdvance(); return; }
        showFinishModal();
        return;
    }

    if (!startTime) startTimer();

    canAnswer = true;

    const idx = Math.floor(Math.random() * pool.length);
    currentTarget = pool[idx];

    if (gameMode === 'hard') {
        answerInput.value = '';
        answerInput.focus();
        optionsGrid.classList.add('hidden');
        inputArea.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'block';
    } else {
        inputArea.classList.add('hidden');
        optionsGrid.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'none';
        generateChoices();
    }

    g.selectAll(".country").classed("country-highlight", d => d === currentTarget);

    try {
        const bounds = path.bounds(currentTarget);
        if (bounds && !isNaN(bounds[0][0])) {
            const dx = bounds[1][0] - bounds[0][0];
            const dy = bounds[1][1] - bounds[0][1];
            const x = (bounds[0][0] + bounds[1][0]) / 2;
            const y = (bounds[0][1] + bounds[1][1]) / 2;
            const maxDim = Math.max(dx / width, dy / height, 0.001);
            const scale = Math.max(1.8, Math.min(35, 0.42 / maxDim));
            const translate = [width / 2 - scale * x, height / 2 - scale * y];
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
        }
    } catch (e) {}
}

function generateChoices() {
    const targetName = getCountryName(currentTarget);
    const options = [targetName];
    const allowedForHints = fullDataset.filter(isAllowed);
    while (options.length < 4) {
        const randomCountry = allowedForHints[Math.floor(Math.random() * allowedForHints.length)];
        const randomName = getCountryName(randomCountry);
        if (!options.includes(randomName)) options.push(randomName);
    }
    options.sort(() => Math.random() - 0.5);
    optionsGrid.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = "btn-option p-3 rounded-xl font-semibold text-sm shadow-lg text-white";
        btn.innerText = opt;
        btn.onclick = () => {
            if (!canAnswer) return;
            if (opt === targetName) handleCorrect();
            else handleWrong();
        };
        optionsGrid.appendChild(btn);
    });
}

function checkTypedAnswer() {
    if (!canAnswer) return;
    const guess = normalizeString(answerInput.value);
    if (guess.length < 2) return;

    const acceptableNames = getAcceptableNames(currentTarget);

    // Exact match or substring match against any acceptable name
    for (const name of acceptableNames) {
        if (guess === name || (name.includes(guess) && guess.length > 3)) {
            handleCorrect();
            return;
        }
    }

    // Fuzzy match against the primary display name
    const primary = normalizeString(getCountryName(currentTarget));
    const distance = levenshteinDistance(guess, primary);
    const threshold = primary.length < 5 ? 1 : 2;
    if (distance <= threshold) {
        handleCorrect();
    } else {
        handleWrong();
    }
}

function showHint() {
    if (!canAnswer) return;
    hintCount++;
    inputArea.classList.add('hidden');
    optionsGrid.classList.remove('hidden');
    generateChoices();
}

function handleCorrect() {
    if (mpIsActive) { mpHandleAnswer(true); return; }
    canAnswer = false;
    score++;
    document.getElementById('score').innerText = score;
    const targetName = getCountryName(currentTarget);
    showOverlay(targetName, true);
    pool = pool.filter(c => getCountryName(c) !== targetName);
    document.getElementById('remaining').innerText = pool.length;
    setTimeout(nextQuestion, 700);
}

function handleWrong() {
    if (mpIsActive) { mpHandleAnswer(false); return; }
    canAnswer = false;
    wrongCount++;
    document.getElementById('wrong-count').innerText = wrongCount;
    const targetName = getCountryName(currentTarget);
    showOverlay(targetName, false);
    pool = pool.filter(c => getCountryName(c) !== targetName);
    document.getElementById('remaining').innerText = pool.length;
    setTimeout(nextQuestion, 800);
}

function resetGame() {
    if (mpIsActive) return; // multiplayer has its own reset path
    score = 0;
    wrongCount = 0;
    hintCount = 0;
    startTime = null;
    stopTimer();
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';
    document.getElementById('finish-modal').style.display = 'none';
    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;
    nextQuestion();
}

function zoomIn() { svg.transition().duration(400).call(zoom.scaleBy, 2); }
function zoomOut() { svg.transition().duration(400).call(zoom.scaleBy, 0.5); }
function resetZoom() { svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity); }

window.addEventListener('resize', () => {
    width = container.clientWidth;
    height = container.clientHeight;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
});

function syncViewportHeight() {
    document.body.style.height = (window.visualViewport?.height ?? window.innerHeight) + 'px';
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportHeight);
    syncViewportHeight();
}

// PWA install prompt
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

function startSinglePlayer() {
    document.getElementById('start-screen').style.display = 'none';
    init(() => resetGame());
}

function goHome() {
    stopTimer();
    document.getElementById('finish-modal').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
}

// ─── Multiplayer ─────────────────────────────────────────────────────────────

let mpPeer = null;
let mpConns = {};           // { peerId: DataConnection } — host has N-1, guest has 1
let mpIsHost = false;
let mpMode = null;          // 'race' | 'compete'
let mpIsActive = false;
let mpPlayers = {};         // { peerId: { name, score, wrong } }
let mpRoundAnswered = {};   // { peerId: bool }
let mpQuestionPool = [];    // Ordered ISO A3 codes (host-generated)
let mpQuestionIdx = 0;
let mpLocalName = 'You';
let mpMyPeerId = null;

const MP_PREFIX = 'geoquiz-';

function mpGenCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function startMultiplayer() {
    init(() => {
        mpRenderLobbySettings();
        document.getElementById('mp-lobby-modal').style.display = 'flex';
    });
}

function showJoinInput() {
    document.getElementById('mp-join-input').classList.remove('hidden');
    document.getElementById('mp-code-input').focus();
}

function createRoom() {
    mpLocalName = document.getElementById('mp-name-input').value.trim() || 'Player';
    document.getElementById('btn-create-room').disabled = true;
    document.getElementById('btn-join-room').disabled = true;
    document.getElementById('mp-name-input').disabled = true;
    const code = mpGenCode();
    mpIsHost = true;
    mpPeer = new Peer(MP_PREFIX + code, { debug: 0 });

    mpPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            // Retry with a new code
            mpPeer.destroy();
            mpPeer = null;
            mpIsHost = false;
            document.getElementById('btn-create-room').disabled = false;
            document.getElementById('btn-join-room').disabled = false;
            createRoom();
        } else {
            console.error('PeerJS error:', err);
        }
    });

    mpPeer.on('open', (id) => {
        mpMyPeerId = id;
        mpPlayers[id] = { name: mpLocalName, score: 0, wrong: 0 };
        document.getElementById('mp-code-display').classList.remove('hidden');
        document.getElementById('mp-room-code').textContent = id.replace(MP_PREFIX, '');
        document.getElementById('mp-status').classList.remove('hidden');
        document.getElementById('mp-host-controls').classList.remove('hidden');
        mpUpdateLobbyList();
        mpSetStatus('Waiting for players to join…');
    });

    mpPeer.on('connection', (conn) => {
        onGuestJoined(conn);
    });
}

function onGuestJoined(conn) {
    conn.on('open', () => {
        mpConns[conn.peer] = conn;
        conn.on('data', (msg) => handleMpMessage(msg, conn.peer));
        conn.on('close', () => mpHandleDisconnect(conn.peer));
        conn.on('error', () => mpHandleDisconnect(conn.peer));
    });
}

function joinRoom() {
    mpLocalName = document.getElementById('mp-name-input').value.trim() || 'Player';
    const code = document.getElementById('mp-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;

    const connectBtn = document.querySelector('#mp-join-input button');
    const errEl = document.getElementById('mp-join-error');
    connectBtn.textContent = 'Connecting…';
    connectBtn.disabled = true;
    errEl.classList.add('hidden');
    document.getElementById('mp-name-input').disabled = true;

    function showJoinError(msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        connectBtn.textContent = 'Connect';
        connectBtn.disabled = false;
        document.getElementById('mp-name-input').disabled = false;
        if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    }

    mpIsHost = false;
    mpPeer = new Peer({ debug: 0 });

    const timeout = setTimeout(() => showJoinError('Timed out. Check the code and try again.'), 10000);

    mpPeer.on('error', (err) => {
        clearTimeout(timeout);
        showJoinError('Connection error: ' + (err.message || err.type));
    });

    mpPeer.on('open', (id) => {
        mpMyPeerId = id;
        const conn = mpPeer.connect(MP_PREFIX + code, { reliable: true });

        conn.on('error', () => {
            clearTimeout(timeout);
            showJoinError('Could not find room. Check the code and try again.');
        });

        conn.on('open', () => {
            clearTimeout(timeout);
            onConnectedToHost(conn);
        });
    });
}

function onConnectedToHost(conn) {
    mpConns[conn.peer] = conn;
    conn.on('data', (msg) => handleMpMessage(msg, conn.peer));
    conn.on('close', () => mpGuestHandleHostDisconnect());
    conn.on('error', () => mpGuestHandleHostDisconnect());
    sendToHost({ type: 'ready', name: mpLocalName });
    document.getElementById('mp-status').classList.remove('hidden');
    document.getElementById('mp-guest-waiting').classList.remove('hidden');
    mpSetStatus('Connected! Waiting for host to start…');
}

function broadcast(msg) {
    Object.values(mpConns).forEach(c => { try { c.send(msg); } catch(e) {} });
}

function sendToHost(msg) {
    const conn = Object.values(mpConns)[0];
    if (conn) { try { conn.send(msg); } catch(e) {} }
}

function handleMpMessage(msg, fromId) {
    switch (msg.type) {
        case 'ready':
            if (!mpIsHost) return;
            mpPlayers[fromId] = { name: msg.name || 'Guest', score: 0, wrong: 0 };
            mpUpdateLobbyList();
            broadcast({ type: 'player-joined', peerId: fromId, name: mpPlayers[fromId].name, playerCount: Object.keys(mpPlayers).length });
            mpSetStatus(`${Object.keys(mpPlayers).length} player(s) in lobby`);
            break;

        case 'player-joined':
            if (!mpPlayers[msg.peerId]) mpPlayers[msg.peerId] = { name: msg.name, score: 0, wrong: 0 };
            mpUpdateLobbyList();
            break;

        case 'game-start':
            mpApplySettings(msg);
            break;

        case 'question':
            mpSetQuestion(msg.featureId);
            break;

        case 'answered':
            if (!mpIsHost) return;
            mpRoundAnswered[fromId] = true;
            if (mpMode === 'race') {
                if (msg.correct && !mpRaceResolved) {
                    mpResolveRound(fromId);
                } else {
                    const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                    if (allAnswered) mpResolveRound(null);
                }
            } else {
                // compete: update score relay, check if all done
                if (msg.score !== undefined) {
                    mpPlayers[fromId].score = msg.score;
                    mpPlayers[fromId].wrong = msg.wrong;
                    broadcast({ type: 'player-score', peerId: fromId, score: msg.score, wrong: msg.wrong });
                }
                const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                if (allAnswered) setTimeout(mpAdvance, 900);
            }
            break;

        case 'score-update':
            if (!mpIsHost) return;
            mpPlayers[fromId].score = msg.score;
            mpPlayers[fromId].wrong = msg.wrong;
            broadcast({ type: 'player-score', peerId: fromId, score: msg.score, wrong: msg.wrong });
            break;

        case 'player-score':
            if (mpPlayers[msg.peerId]) {
                mpPlayers[msg.peerId].score = msg.score;
                mpPlayers[msg.peerId].wrong = msg.wrong;
            }
            updateMpScoreboard();
            break;

        case 'round-over':
            mpRaceResolved = true;
            canAnswer = false;
            const winnerName = msg.winner === mpMyPeerId ? 'You' :
                               msg.winner === null ? null :
                               (mpPlayers[msg.winner]?.name || 'Someone');
            const isWin = msg.winner === mpMyPeerId;
            const overlayText = msg.winner === null ? getCountryName(currentTarget) :
                                isWin ? getCountryName(currentTarget) :
                                `${winnerName} got it!`;
            showOverlay(overlayText, isWin || msg.winner === null);
            break;

        case 'game-over':
            showMpFinishModal(msg.results);
            break;

        case 'player-left': {
            const leftName = mpPlayers[msg.peerId]?.name || 'A player';
            delete mpPlayers[msg.peerId];
            delete mpRoundAnswered[msg.peerId];
            updateMpScoreboard();
            mpShowToast(leftName + ' left the game');
            if (mpIsHost && mpMode === 'compete') {
                const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                if (allAnswered && Object.keys(mpPlayers).length > 0) setTimeout(mpAdvance, 900);
            }
            break;
        }
    }
}

let mpRaceResolved = false;

function mpApplySettings(msg) {
    // Apply game settings from host
    mpMode = msg.mpMode;
    mpQuestionPool = msg.questionPool;
    mpQuestionIdx = 0;
    // Apply regions and re-render map
    regions.forEach(r => { r.active = msg.regions.includes(r.id); });
    g.selectAll(".country")
        .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
        .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);
    gameMode = msg.gameMode;
    setMode(gameMode);
    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;
    // Apply player list
    if (msg.players) {
        Object.entries(msg.players).forEach(([pid, name]) => {
            if (pid !== mpMyPeerId) mpPlayers[pid] = { name, score: 0, wrong: 0 };
        });
    }
    // Close lobby, start game
    document.getElementById('mp-lobby-modal').style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
    mpIsActive = true;
    score = 0; wrongCount = 0; hintCount = 0;
    startTime = null;
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';
    document.getElementById('mp-scoreboard').classList.remove('hidden');
    updateMpScoreboard();
    // Guests wait for first 'question' message
}

function mpSetGameMode(mode) {
    gameMode = mode;
    setMode(mode); // update single-player mode buttons too
    document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', mode === 'hard');
    document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', mode === 'easy');
}

function mpRenderLobbySettings() {
    // Render region toggles into the lobby
    const container = document.getElementById('mp-region-toggles');
    container.innerHTML = regions.map(r => `
        <label class="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="mp-check-${r.id}" ${r.active ? 'checked' : ''}
                   class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-xs font-medium text-slate-200">${r.label}</span>
        </label>
    `).join('');
    // Sync game mode buttons
    document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', gameMode === 'hard');
    document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', gameMode === 'easy');
}

function mpStartGame() {
    if (!mpIsHost) return;
    mpMode = document.getElementById('mp-mode-select').value;

    // Read region settings from lobby checkboxes
    regions.forEach(r => {
        const cb = document.getElementById(`mp-check-${r.id}`);
        if (cb) r.active = cb.checked;
    });
    // Update map display to match
    g.selectAll(".country")
        .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
        .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);
    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;

    // Build question pool
    const activePool = fullDataset.filter(isAllowed);
    const shuffled = activePool.slice().sort(() => Math.random() - 0.5);
    mpQuestionPool = shuffled.map(f => f.properties.ISO_A3).filter(Boolean);
    mpQuestionIdx = 0;

    const playerNames = {};
    Object.entries(mpPlayers).forEach(([pid, p]) => { playerNames[pid] = p.name; });

    const startMsg = {
        type: 'game-start',
        gameMode,
        regions: regions.filter(r => r.active).map(r => r.id),
        mpMode,
        questionPool: mpQuestionPool,
        players: playerNames,
    };
    broadcast(startMsg);

    // Apply locally
    document.getElementById('mp-lobby-modal').style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
    mpIsActive = true;
    score = 0; wrongCount = 0; hintCount = 0;
    startTime = null;
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';
    document.getElementById('mp-scoreboard').classList.remove('hidden');
    updateMpScoreboard();

    mpAdvance();
}

function mpAdvance() {
    if (!mpIsHost) return;
    if (mpQuestionIdx >= mpQuestionPool.length) {
        // Game over
        const results = Object.entries(mpPlayers).map(([pid, p]) => ({
            peerId: pid,
            name: p.name,
            score: p.score,
            wrong: p.wrong,
        }));
        // Add host's own score
        results.forEach(r => {
            if (r.peerId === mpMyPeerId) {
                r.score = score;
                r.wrong = wrongCount;
            }
        });
        results.sort((a, b) => b.score - a.score);
        broadcast({ type: 'game-over', results });
        showMpFinishModal(results);
        return;
    }
    const featureId = mpQuestionPool[mpQuestionIdx];
    mpQuestionIdx++;
    mpRoundAnswered = {};
    Object.keys(mpPlayers).forEach(pid => { mpRoundAnswered[pid] = false; });
    mpRaceResolved = false;
    broadcast({ type: 'question', featureId });
    mpSetQuestion(featureId);
}

function mpSetQuestion(featureId) {
    const feature = fullDataset.find(f => f.properties.ISO_A3 === featureId);
    if (!feature) return;
    currentTarget = feature;
    canAnswer = true;
    mpRaceResolved = false;

    if (!startTime) startTimer();

    if (gameMode === 'hard') {
        answerInput.value = '';
        answerInput.focus();
        optionsGrid.classList.add('hidden');
        inputArea.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'block';
    } else {
        inputArea.classList.add('hidden');
        optionsGrid.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'none';
        generateChoices();
    }

    g.selectAll(".country").classed("country-highlight", d => d === currentTarget);

    try {
        const bounds = path.bounds(currentTarget);
        if (bounds && !isNaN(bounds[0][0])) {
            const dx = bounds[1][0] - bounds[0][0];
            const dy = bounds[1][1] - bounds[0][1];
            const x = (bounds[0][0] + bounds[1][0]) / 2;
            const y = (bounds[0][1] + bounds[1][1]) / 2;
            const maxDim = Math.max(dx / width, dy / height, 0.001);
            const scale = Math.max(1.8, Math.min(35, 0.42 / maxDim));
            const translate = [width / 2 - scale * x, height / 2 - scale * y];
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
        }
    } catch(e) {}
}

function mpHandleAnswer(correct) {
    if (!canAnswer) return;
    const targetName = getCountryName(currentTarget);

    if (mpMode === 'race') {
        if (correct) {
            canAnswer = false;
            score++;
            document.getElementById('score').innerText = score;
            showOverlay(targetName, true);
            if (mpIsHost) {
                mpResolveRound(mpMyPeerId);
            } else {
                sendToHost({ type: 'answered', correct: true });
            }
        } else {
            canAnswer = false;
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            showOverlay(targetName, false);
            if (mpIsHost) {
                mpRoundAnswered[mpMyPeerId] = true;
                const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                if (allAnswered) mpResolveRound(null);
            } else {
                sendToHost({ type: 'answered', correct: false });
            }
        }
    } else {
        // compete mode
        if (correct) {
            canAnswer = false;
            score++;
            document.getElementById('score').innerText = score;
            showOverlay(targetName, true);
        } else {
            canAnswer = false;
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            showOverlay(targetName, false);
        }
        if (mpIsHost) {
            mpPlayers[mpMyPeerId].score = score;
            mpPlayers[mpMyPeerId].wrong = wrongCount;
            mpRoundAnswered[mpMyPeerId] = true;
            broadcast({ type: 'player-score', peerId: mpMyPeerId, score, wrong: wrongCount });
            updateMpScoreboard();
            const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
            if (allAnswered) setTimeout(mpAdvance, 900);
        } else {
            sendToHost({ type: 'answered', correct, score, wrong: wrongCount });
            sendToHost({ type: 'score-update', score, wrong: wrongCount });
            updateMpScoreboard();
        }
    }
}

function mpResolveRound(winnerPeerId) {
    if (!mpIsHost) return;
    mpRaceResolved = true;
    broadcast({ type: 'round-over', winner: winnerPeerId, featureId: currentTarget?.properties?.ISO_A3 });
    // Update winner score
    if (winnerPeerId && winnerPeerId !== mpMyPeerId && mpPlayers[winnerPeerId]) {
        mpPlayers[winnerPeerId].score++;
        broadcast({ type: 'player-score', peerId: winnerPeerId, score: mpPlayers[winnerPeerId].score, wrong: mpPlayers[winnerPeerId].wrong });
    }
    updateMpScoreboard();
    setTimeout(mpAdvance, 1200);
}

function updateMpScoreboard() {
    const el = document.getElementById('mp-scoreboard');
    if (!el) return;
    const parts = [];
    // Local player first
    parts.push(`You ${score}✓${wrongCount}✗`);
    Object.entries(mpPlayers).forEach(([pid, p]) => {
        if (pid !== mpMyPeerId) parts.push(`${p.name} ${p.score}✓${p.wrong}✗`);
    });
    el.textContent = parts.join(' | ');
}

function showMpFinishModal(results) {
    mpIsActive = false;
    canAnswer = false;
    stopTimer();
    inputArea.classList.add('hidden');
    optionsGrid.classList.add('hidden');
    g.selectAll(".country").classed("country-highlight", false);
    document.getElementById('mp-scoreboard').classList.add('hidden');

    const winner = results[0];
    const titleEl = document.getElementById('mp-finish-title');
    if (winner.peerId === mpMyPeerId) {
        titleEl.textContent = 'You Win! 🎉';
    } else {
        titleEl.textContent = `${winner.name} Wins!`;
    }

    const list = document.getElementById('mp-results-list');
    list.innerHTML = results.map((r, i) => {
        const total = r.score + r.wrong;
        const acc = total > 0 ? Math.round(r.score / total * 100) : 0;
        const isMe = r.peerId === mpMyPeerId;
        return `<div class="flex items-center gap-3 p-2.5 rounded-xl ${isMe ? 'bg-blue-900/40 border border-blue-700/50' : 'bg-slate-700/30'}">
            <span class="text-slate-500 font-mono text-sm w-4 text-right">${i + 1}</span>
            <span class="flex-1 text-sm font-semibold text-white">${r.name}${isMe ? ' (you)' : ''}</span>
            <span class="text-green-400 font-mono text-sm">${r.score}✓</span>
            <span class="text-red-400 font-mono text-sm">${r.wrong}✗</span>
            <span class="text-slate-400 font-mono text-xs">${acc}%</span>
        </div>`;
    }).join('');

    if (mpIsHost) document.getElementById('btn-mp-play-again').classList.remove('hidden');
    document.getElementById('mp-finish-modal').style.display = 'flex';
}

function mpPlayAgain() {
    if (!mpIsHost) return;
    document.getElementById('mp-finish-modal').style.display = 'none';
    // Reset local scores
    score = 0; wrongCount = 0; hintCount = 0;
    startTime = null;
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';
    Object.keys(mpPlayers).forEach(pid => {
        mpPlayers[pid].score = 0;
        mpPlayers[pid].wrong = 0;
    });
    document.getElementById('mp-scoreboard').classList.remove('hidden');
    updateMpScoreboard();
    mpIsActive = true;
    // Rebuild pool and start
    mpStartGame();
}

function mpGoHome() {
    document.getElementById('mp-finish-modal').style.display = 'none';
    closeLobby();
}

function closeLobby() {
    if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    mpConns = {};
    mpIsHost = false;
    mpIsActive = false;
    mpPlayers = {};
    mpRoundAnswered = {};
    mpQuestionPool = [];
    mpQuestionIdx = 0;
    mpMyPeerId = null;
    // Reset lobby UI
    document.getElementById('mp-lobby-modal').style.display = 'none';
    document.getElementById('mp-code-display').classList.add('hidden');
    document.getElementById('mp-join-input').classList.add('hidden');
    document.getElementById('mp-status').classList.add('hidden');
    document.getElementById('mp-host-controls').classList.add('hidden');
    document.getElementById('mp-guest-waiting').classList.add('hidden');
    document.getElementById('mp-join-error').classList.add('hidden');
    document.getElementById('btn-create-room').disabled = false;
    document.getElementById('btn-join-room').disabled = false;
    document.getElementById('mp-name-input').disabled = false;
    document.getElementById('mp-scoreboard').classList.add('hidden');
    document.getElementById('start-screen').style.display = 'flex';
    stopTimer();
}

function mpHandleDisconnect(peerId) {
    if (!mpIsHost) return;
    const name = mpPlayers[peerId]?.name || 'A player';
    delete mpConns[peerId];
    delete mpPlayers[peerId];
    delete mpRoundAnswered[peerId];
    broadcast({ type: 'player-left', peerId });
    mpShowToast(`${name} left the game`);
    updateMpScoreboard();
    // If compete mode and all remaining have answered, advance
    if (mpIsActive && mpMode === 'compete' && Object.keys(mpPlayers).length > 0) {
        const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
        if (allAnswered) setTimeout(mpAdvance, 900);
    }
}

function mpGuestHandleHostDisconnect() {
    mpIsActive = false;
    canAnswer = false;
    mpShowToast('Host disconnected. Returning home…');
    setTimeout(closeLobby, 2000);
}

function mpUpdateLobbyList() {
    const list = document.getElementById('mp-player-list');
    list.innerHTML = Object.entries(mpPlayers).map(([pid, p]) => {
        const isMe = pid === mpMyPeerId;
        return `<li class="text-sm text-slate-300 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${isMe ? 'bg-green-400' : 'bg-blue-400'} inline-block"></span>
            ${p.name}${isMe ? ' (you)' : ''}
        </li>`;
    }).join('');
}

function mpSetStatus(text) {
    document.getElementById('mp-status-text').textContent = text;
}

function copyRoomCode() {
    const code = document.getElementById('mp-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-code');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
}

function mpShowToast(text) {
    let toast = document.getElementById('mp-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mp-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid #475569;color:#f8fafc;padding:8px 18px;border-radius:999px;font-size:0.8rem;z-index:500;opacity:0;transition:opacity 0.3s';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

setMode(gameMode);
init(); // start loading data in the background immediately