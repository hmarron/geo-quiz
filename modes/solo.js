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
        const name = activePlugin.getCorrectAnswer(currentTarget);
        activePlugin.showOverlay(name, correct);
        // Remove the answered item from the pool
        pool = pool.filter(item => activePlugin.getItemId(item) !== activePlugin.getItemId(currentTarget));
        document.getElementById('remaining').innerText = pool.length;
        
        activePlugin.updateViewOnAnswer(currentTarget, correct);

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
        
        pool = activePlugin.generateQuestionPool(activeSettings);
        document.getElementById('remaining').innerText = pool.length;
        
        activePlugin.resetView();
        nextQuestion();
    },

    onHome() {
        stopTimer();
        document.getElementById('finish-modal').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
    },
};
