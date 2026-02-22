// ─── localStorage, finish modal, scores UI ───────────────────────────────────

const SCORES_KEY = 'geo-quiz-scores';

// This is duplicated in settings.js. A future refactor could move this to a shared constants file.
const regionLabels = {
    'north-america': 'North America',
    'south-america': 'South America',
    'europe': 'Europe',
    'asia': 'Asia',
    'africa-north': 'Africa: Above Equator',
    'africa-south': 'Africa: Below Equator',
    'oceania': 'Oceania',
};

function saveScore(elapsed) {
    const entry = {
        score,
        wrong: wrongCount,
        hints: hintCount,
        time: elapsed,
        date: new Date().toISOString(),
        settings: {
            mode: activeSettings.gameMode,
            regions: Object.keys(activeSettings.regions).filter(r => activeSettings.regions[r])
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
            const regionDisplay = s.settings.regions.map(id => regionLabels[id] ?? id).join(', ');
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
                        <div class="text-xs text-slate-500 mt-0.5 truncate">${s.settings.mode === 'hard' ? 'Hard' : 'Easy'} · ${regionDisplay} · ${date}</div>
                    </div>
                </div>`;
        }).join('');
    }
    modal.style.display = 'flex';
}

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

    const activeRegions = Object.keys(activeSettings.regions).filter(r => activeSettings.regions[r]).sort().join(',');
    const allScores = loadScores();
    const sameSettings = allScores.filter(s => {
        return s.settings.mode === activeSettings.gameMode &&
               s.settings.regions.slice().sort().join(',') === activeRegions;
    });
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