// ─── Round loop: question rendering, answer checking, hint ───────────────────

const optionsGrid = document.getElementById('options-grid');
const inputArea = document.getElementById('input-area');
const answerInput = document.getElementById('answer-input');

let pool = [];
let currentTarget = null;
let canAnswer = false;

// Render the current target item (shared by solo and all MP modes).
// Sets canAnswer = true and delegates to the plugin to display the question.
function renderQuestion() {
    if (!currentTarget) return;
    canAnswer = true;

    activePlugin.displayQuestion(currentTarget);

    if (activeSettings.gameMode === 'hard') {
        answerInput.value = '';
        answerInput.focus();
        optionsGrid.classList.add('hidden');
        inputArea.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'block';
    } else {
        inputArea.classList.add('hidden');
        optionsGrid.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'none';
        generateAndDisplayChoices();
    }
}

// Solo-mode question advance: picks from pool, calls renderQuestion().
// MP modes do NOT call this — they use renderQuestion() directly.
function nextQuestion() {
    if (pool.length === 0) {
        inputArea.classList.add('hidden');
        optionsGrid.classList.add('hidden');
        activePlugin.resetView();
        activeMode.onDone();
        return;
    }

    if (!startTime) startTimer();

    const idx = Math.floor(Math.random() * pool.length);
    currentTarget = pool[idx];
    renderQuestion();
}

function generateAndDisplayChoices() {
    const choices = activePlugin.generateChoices(currentTarget, pool);
    optionsGrid.innerHTML = '';
    choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = "btn-option p-3 rounded-xl font-semibold text-sm shadow-lg text-white";
        btn.innerText = choice.text;
        btn.onclick = () => {
            if (!canAnswer) return;
            if (choice.correct) handleCorrect();
            else handleWrong();
        };
        optionsGrid.appendChild(btn);
    });
}

function checkTypedAnswer() {
    if (!canAnswer) return;
    const typedAnswer = answerInput.value;
    
    if (activePlugin.checkTypedAnswer(currentTarget, typedAnswer)) {
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
    generateAndDisplayChoices();
}

function handleCorrect() {
    canAnswer = false;
    activeMode.onAnswer(true);
}

function handleWrong() {
    canAnswer = false;
    activeMode.onAnswer(false);
}
