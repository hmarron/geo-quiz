// ─── Round loop: question rendering, answer checking, hint ───────────────────

const optionsGrid = document.getElementById('options-grid');
const inputArea = document.getElementById('input-area');
const answerInput = document.getElementById('answer-input');

let pool = [];
let currentTarget = null;
let canAnswer = false;

function showOverlay(name, isCorrect) {
    const overlay = document.getElementById('country-overlay');
    const nameDisplay = document.getElementById('country-name-display');
    nameDisplay.textContent = name;
    nameDisplay.className = `text-3xl sm:text-4xl font-bold px-6 py-3 rounded-xl bg-black/50 backdrop-blur-sm ${isCorrect ? 'text-green-400' : 'text-red-400'}`;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 600);
}

// Render the current target country (shared by solo and all MP modes).
// Sets canAnswer = true and zooms to the country.
function renderQuestion() {
    if (!currentTarget) return;
    canAnswer = true;

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

// Solo-mode question advance: picks from pool, calls renderQuestion().
// MP modes do NOT call this — they use renderQuestion() directly.
function nextQuestion() {
    if (pool.length === 0) {
        inputArea.classList.add('hidden');
        optionsGrid.classList.add('hidden');
        g.selectAll(".country").classed("country-highlight", false);
        activeMode.onDone();
        return;
    }

    if (!startTime) startTimer();

    const idx = Math.floor(Math.random() * pool.length);
    currentTarget = pool[idx];
    renderQuestion();
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

    for (const name of acceptableNames) {
        if (guess === name || (name.includes(guess) && guess.length > 3)) {
            handleCorrect();
            return;
        }
    }

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
    activeMode.onAnswer(true);
}

function handleWrong() {
    activeMode.onAnswer(false);
}
