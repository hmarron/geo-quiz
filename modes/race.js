// ─── MP Race mode object ──────────────────────────────────────────────────────
// Owns: mpRaceResolved, mpCorrectAnswers, mpWinnerWindowTimer, mpResolveRound()

let mpRaceResolved = false;
let mpCorrectAnswers = [];
let mpWinnerWindowTimer = null;

// This function's only job is to determine the winner of a race round
// and broadcast the result. All state changes happen in the onMessage handler.
function mpResolveRound(winnerPeerId) {
    if (!mpIsHost) return;
    if (mpWinnerWindowTimer) { clearTimeout(mpWinnerWindowTimer); mpWinnerWindowTimer = null; }
    
    const itemId = activePlugin.getItemId(currentTarget);
    const remaining = mpQuestionPool.length - mpQuestionIdx;

    const roundOverMsg = { type: 'round-over', winner: winnerPeerId, itemId, remaining };
    
    broadcast(roundOverMsg);
    RaceMode.onMessage(roundOverMsg, mpMyPeerId); // Host processes the message for itself
}

const RaceMode = {
    name: 'Race',
    isMultiplayer: true,
    onAnswer(correct) {
        const targetName = activePlugin.getCorrectAnswer(currentTarget);
        if (correct) {
            canAnswer = false;
            score++;
            document.getElementById('score').innerText = score;
            activePlugin.showOverlay(targetName, true);
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
            activePlugin.showOverlay(targetName, false);
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

                // 1. Color the map for all players
                if (msg.winner && typeof activePlugin.colorItem === 'function') {
                    activePlugin.colorItem(msg.itemId, mpPlayerColors[msg.winner]);
                }

                // 2. Show the overlay for all players
                const winnerName = msg.winner === mpMyPeerId ? 'You' :
                                   msg.winner === null ? null :
                                   (mpPlayers[msg.winner]?.name || 'Someone');
                const isWin = msg.winner === mpMyPeerId;
                const overlayText = msg.winner === null ? activePlugin.getCorrectAnswer(currentTarget) :
                                    isWin ? activePlugin.getCorrectAnswer(currentTarget) :
                                    `${winnerName} got it!`;
                activePlugin.showOverlay(overlayText, isWin || msg.winner === null);

                // 3. Host handles scoring and next step
                if (mpIsHost) {
                    // Update score for the winner
                    if (msg.winner && msg.winner !== mpMyPeerId && mpPlayers[msg.winner]) {
                        mpPlayers[msg.winner].score++;
                        broadcast({ type: 'player-score', peerId: msg.winner, score: mpPlayers[msg.winner].score, wrong: mpPlayers[msg.winner].wrong });
                    }

                    // Decide what to do next
                    if (msg.remaining === 0) {
                        // Final round: wait for acks
                        mpFinalAck = {};
                        mpFinalAck[mpMyPeerId] = true; // Host acks itself
                        if (Object.keys(mpPlayers).every(pid => mpFinalAck[pid])) {
                            mpAdvance(); // End game if host is only player
                        }
                    } else {
                        // Not final round: schedule next question
                        setTimeout(mpAdvance, 1200);
                    }
                } 
                // 4. Client handles acking on final round
                else {
                    if (msg.remaining === 0) {
                        sendToHost({ type: 'final-round-processed' });
                    }
                }
                break;
            }

            case 'final-round-processed': {
                if (!mpIsHost) return;
                mpFinalAck[fromId] = true;
                const allAcked = Object.keys(mpPlayers).every(pid => mpFinalAck[pid]);
                if (allAcked) {
                    mpAdvance(); // All clients are done, now end the game.
                }
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
    
    // Register with the global Registry
    if (typeof Registry !== 'undefined') {
        Registry.registerMode('race', RaceMode);
    }
    