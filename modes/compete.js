// ─── MP High Score (compete) mode object ─────────────────────────────────────
// Each player progresses through the same question list at their own pace.

let competeQuestionIdx = 0;

const CompeteMode = {
    onAnswer(correct) {
        canAnswer = false;
        const targetName = activePlugin.getCorrectAnswer(currentTarget);
        
        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
            activePlugin.showOverlay(targetName, true);
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            activePlugin.showOverlay(targetName, false);
        }

        // In Compete mode, the host just acts as a scoreboard relay.
        // The client is responsible for its own progress.
        sendToHost({ type: 'score-update', score, wrong: wrongCount });

        // Advance to the next question locally
        setTimeout(() => this.next(), 700);
    },

    next() {
        competeQuestionIdx++;
        if (competeQuestionIdx >= mpQuestionPool.length) {
            this.onDone();
            return;
        }
        
        const itemId = mpQuestionPool[competeQuestionIdx];
        mpSetQuestion(itemId);
        renderQuestion();
        document.getElementById('remaining').innerText = mpQuestionPool.length - competeQuestionIdx;
    },

    onDone() {
        canAnswer = false;
        inputArea.classList.add('hidden');
        optionsGrid.classList.add('hidden');
        activePlugin.resetView();
        sendToHost({ type: 'finished-compete' });
        mpShowToast('You finished! Waiting for other players...');
    },

    onReset() {
        // This mode is not used in a context where reset is meaningful
    },

    onHome() { 
        mpGoHome(); 
    },

    onMessage(msg, fromId) {
        switch (msg.type) {
            case 'finished-compete': {
                if (!mpIsHost) return;
                mpCompeteFinished[fromId] = true;
                
                // Check if all players are done
                const allDone = Object.keys(mpPlayers).every(pid => mpCompeteFinished[pid]);
                if (allDone) {
                    const results = Object.entries(mpPlayers).map(([pid, p]) => ({
                        peerId: pid, name: p.name, score: p.score, wrong: p.wrong,
                    }));
                    results.sort((a, b) => b.score - a.score);
                    broadcast({ type: 'game-over', results });
                    showMpFinishModal(results);
                }
                break;
            }
        }
    },

    start() {
        competeQuestionIdx = 0;
        mpCompeteFinished = {};
        Object.keys(mpPlayers).forEach(pid => {
            mpCompeteFinished[pid] = false;
        });
        
        if (mpQuestionPool.length > 0) {
            const itemId = mpQuestionPool[competeQuestionIdx];
            mpSetQuestion(itemId);
            renderQuestion();
            document.getElementById('remaining').innerText = mpQuestionPool.length;
        } else {
            this.onDone();
        }
    },
};