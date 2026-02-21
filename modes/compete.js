// ─── MP High Score (compete) mode object ─────────────────────────────────────

const CompeteMode = {
    onAnswer(correct) {
        if (!canAnswer) return;
        const targetName = getCountryName(currentTarget);
        canAnswer = false;
        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
            showOverlay(targetName, true);
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            showOverlay(targetName, false);
        }
        if (mpIsHost) {
            mpPlayers[mpMyPeerId].score = score;
            mpPlayers[mpMyPeerId].wrong = wrongCount;
            mpRoundAnswered[mpMyPeerId] = true;
            broadcast({ type: 'player-score', peerId: mpMyPeerId, score, wrong: wrongCount });
            const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
            if (allAnswered) setTimeout(mpAdvance, 900);
        } else {
            sendToHost({ type: 'answered', correct, score, wrong: wrongCount });
            sendToHost({ type: 'score-update', score, wrong: wrongCount });
        }
    },

    onDone() {},
    onReset() {},
    onHome() { mpGoHome(); },

    onMessage(msg, fromId) {
        switch (msg.type) {
            case 'question':
                // Compete mode renders immediately on 'question' (no ack/go needed)
                renderQuestion();
                break;

            case 'answered': {
                if (!mpIsHost) return;
                mpRoundAnswered[fromId] = true;
                if (msg.score !== undefined) {
                    mpPlayers[fromId].score = msg.score;
                    mpPlayers[fromId].wrong = msg.wrong;
                    broadcast({ type: 'player-score', peerId: fromId, score: msg.score, wrong: msg.wrong });
                }
                const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                if (allAnswered) setTimeout(mpAdvance, 900);
                break;
            }
        }
    },

    start() {
        mpAdvance();
    },
};
