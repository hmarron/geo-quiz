// ─── Single-player mode object ────────────────────────────────────────────────

const SoloMode = {
    onAnswer(correct) {
        canAnswer = false;
        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
        }
        const name = getCountryName(currentTarget);
        showOverlay(name, correct);
        pool = pool.filter(c => getCountryName(c) !== name);
        document.getElementById('remaining').innerText = pool.length;
        setTimeout(nextQuestion, correct ? 700 : 800);
    },

    onDone() {
        showFinishModal();
    },

    onReset() {
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
    },

    onHome() {
        stopTimer();
        document.getElementById('finish-modal').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
    },
};
