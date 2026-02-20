const container = document.getElementById('map-container');
const optionsGrid = document.getElementById('options-grid');
const inputArea = document.getElementById('input-area');
const answerInput = document.getElementById('answer-input');
const settingsModal = document.getElementById('settings-modal');

let width = container.clientWidth;
let height = container.clientHeight;

let score = 0;
let wrongCount = 0;
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

async function init() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson');
        const data = await response.json();
        fullDataset = data.features;

        renderSettings();
        updateActiveLabel();
        applySettings(false);

        g.selectAll("path")
            .data(fullDataset)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
            .style("stroke", showBorders ? COLOR_BORDER : "none")
            .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);

        document.getElementById('loader').style.display = 'none';
        nextQuestion();

        answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkTypedAnswer();
        });
    } catch (err) {
        console.error("Error loading map:", err);
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

function showFinishModal() {
    stopTimer();
    const elapsed = startTime ? Date.now() - startTime : 0;
    const total = score + wrongCount;
    const accuracy = total > 0 ? Math.round(score / total * 100) : 0;
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-wrong').textContent = wrongCount;
    document.getElementById('final-time').textContent = formatTime(elapsed);
    document.getElementById('final-accuracy').textContent = `${accuracy}% accuracy`;
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
    if (pool.length === 0) {
        inputArea.classList.add('hidden');
        optionsGrid.classList.add('hidden');
        g.selectAll(".country").classed("country-highlight", false);
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
    inputArea.classList.add('hidden');
    optionsGrid.classList.remove('hidden');
    generateChoices();
}

function handleCorrect() {
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
    score = 0;
    wrongCount = 0;
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
    document.getElementById('install-btn').classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    document.getElementById('install-btn').classList.add('hidden');
});

function installApp() {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    installPromptEvent.userChoice.then(() => {
        installPromptEvent = null;
        document.getElementById('install-btn').classList.add('hidden');
    });
}

setMode(gameMode);
init();