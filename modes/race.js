// ─── MP Race mode object ──────────────────────────────────────────────────────
// Owns: mpRaceResolved, mpCorrectAnswers, mpWinnerWindowTimer, mpResolveRound()

let mpRaceResolved = false;
let mpCorrectAnswers = [];
let mpWinnerWindowTimer = null;

function mpResolveRound(winnerPeerId) {
    if (!mpIsHost) return;
    if (mpWinnerWindowTimer) { clearTimeout(mpWinnerWindowTimer); mpWinnerWindowTimer = null; }
    mpRaceResolved = true;
    canAnswer = false;
    const featureId = currentTarget?.properties?.ISO_A3;
    broadcast({ type: 'round-over', winner: winnerPeerId, featureId });
    if (winnerPeerId) mpColorCountry(featureId, mpPlayerColors[winnerPeerId]);
    if (winnerPeerId !== mpMyPeerId) {
        const targetName = getCountryName(currentTarget);
        const winnerName = winnerPeerId === null ? null : (mpPlayers[winnerPeerId]?.name || 'Someone');
        const text = winnerPeerId === null ? targetName : `${winnerName} got it!`;
        showOverlay(text, false);
    }
    if (winnerPeerId && winnerPeerId !== mpMyPeerId && mpPlayers[winnerPeerId]) {
        mpPlayers[winnerPeerId].score++;
        broadcast({ type: 'player-score', peerId: winnerPeerId, score: mpPlayers[winnerPeerId].score, wrong: mpPlayers[winnerPeerId].wrong });
    }
    setTimeout(mpAdvance, 1200);
}

const RaceMode = {
    onAnswer(correct) {
        if (!canAnswer) return;
        const targetName = getCountryName(currentTarget);
        if (correct) {
            canAnswer = false;
            score++;
            document.getElementById('score').innerText = score;
            showOverlay(targetName, true);
            if (mpIsHost) {
                mpCorrectAnswers.push({ peerId: mpMyPeerId, ts: Date.now() });
                mpRoundAnswered[mpMyPeerId] = true;
                if (!mpWinnerWindowTimer) {
                    mpWinnerWindowTimer = setTimeout(() => {
                        mpWinnerWindowTimer = null;
                        if (!mpRaceResolved && mpCorrectAnswers.length > 0) {
                            mpCorrectAnswers.sort((a, b) => a.ts - b.ts);
                            mpResolveRound(mpCorrectAnswers[0].peerId);
                        }
                    }, MP_WINNER_WINDOW_MS);
                }
            } else {
                sendToHost({ type: 'answered', correct: true, ts: Date.now() });
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
    },

    onDone() {},
    onReset() {},
    onHome() { mpGoHome(); },

    onMessage(msg, fromId) {
        switch (msg.type) {
            case 'go':
                renderQuestion();
                break;

            case 'round-over': {
                mpRaceResolved = true;
                canAnswer = false;
                if (msg.winner) mpColorCountry(msg.featureId, mpPlayerColors[msg.winner]);
                const winnerName = msg.winner === mpMyPeerId ? 'You' :
                                   msg.winner === null ? null :
                                   (mpPlayers[msg.winner]?.name || 'Someone');
                const isWin = msg.winner === mpMyPeerId;
                const overlayText = msg.winner === null ? getCountryName(currentTarget) :
                                    isWin ? getCountryName(currentTarget) :
                                    `${winnerName} got it!`;
                showOverlay(overlayText, isWin || msg.winner === null);
                break;
            }

            case 'answered': {
                if (!mpIsHost) return;
                mpRoundAnswered[fromId] = true;
                if (msg.correct && !mpRaceResolved) {
                    mpCorrectAnswers.push({ peerId: fromId, ts: msg.ts || Date.now() });
                    if (!mpWinnerWindowTimer) {
                        mpWinnerWindowTimer = setTimeout(() => {
                            mpWinnerWindowTimer = null;
                            if (!mpRaceResolved && mpCorrectAnswers.length > 0) {
                                mpCorrectAnswers.sort((a, b) => a.ts - b.ts);
                                mpResolveRound(mpCorrectAnswers[0].peerId);
                            }
                        }, MP_WINNER_WINDOW_MS);
                    }
                } else if (!msg.correct && !mpRaceResolved) {
                    const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                    if (allAnswered) mpResolveRound(null);
                }
                break;
            }
        }
    },

    start() {
        mpAdvance();
    },
};
