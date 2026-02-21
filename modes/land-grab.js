// ─── MP Land Grab mode object ─────────────────────────────────────────────────
// Owns: mpLandGrabPool, mpLandGrabClaimed, mpLandGrabAssignments,
//       mpLandGrabRaceRound, and all land-grab helper functions.

let mpLandGrabPool = [];
let mpLandGrabClaimed = {};
let mpLandGrabAssignments = {};
let mpLandGrabRaceRound = false;

function mpLandGrabAdvance() {
    if (!mpIsHost) return;
    if (mpLandGrabPool.length === 0) {
        const results = Object.entries(mpPlayers).map(([pid, p]) => ({
            peerId: pid, name: p.name, score: p.score, wrong: p.wrong,
        }));
        results.forEach(r => { if (r.peerId === mpMyPeerId) { r.score = score; r.wrong = wrongCount; } });
        results.sort((a, b) => b.score - a.score);
        broadcast({ type: 'game-over', results });
        showMpFinishModal(results);
        return;
    }

    const playerIds = Object.keys(mpPlayers);
    mpLandGrabRaceRound = mpLandGrabPool.length < playerIds.length;

    mpRoundAnswered = {};
    playerIds.forEach(pid => mpRoundAnswered[pid] = false);
    mpRaceResolved = false;
    mpRoundAcked = {};
    playerIds.forEach(pid => mpRoundAcked[pid] = false);
    mpCorrectAnswers = [];

    if (mpLandGrabRaceRound) {
        const iso = mpLandGrabPool[0];
        playerIds.forEach(pid => mpLandGrabAssignments[pid] = iso);
    } else {
        const shuffled = [...mpLandGrabPool].sort(() => Math.random() - 0.5);
        playerIds.forEach((pid, i) => mpLandGrabAssignments[pid] = shuffled[i]);
    }

    document.getElementById('remaining').innerText = mpLandGrabPool.length;

    broadcast({
        type: 'land-grab-question',
        assignments: mpLandGrabAssignments,
        claimed: mpLandGrabClaimed,
        poolRemaining: mpLandGrabPool.length,
        raceRound: mpLandGrabRaceRound,
    });

    const myIso = mpLandGrabAssignments[mpMyPeerId];
    const feature = fullDataset.find(f => f.properties.ISO_A3 === myIso);
    currentTarget = feature || null;
    mpRenderLandGrabMap(mpLandGrabAssignments, mpLandGrabClaimed);

    if (!startTime) startTimer();

    if (mpLandGrabRaceRound) {
        mpAckTimeout = setTimeout(() => {
            mpAckTimeout = null;
            broadcast({ type: 'go' });
            renderQuestion();
        }, MP_ACK_TIMEOUT_MS);
        mpHandleAck(mpMyPeerId);
    } else {
        renderQuestion();
    }
}

function mpRenderLandGrabMap(assignments, claimed) {
    Object.entries(claimed || {}).forEach(([iso, peerId]) => {
        mpColorCountry(iso, mpPlayerColors[peerId]);
    });
    Object.entries(assignments || {}).forEach(([peerId, iso]) => {
        if (peerId !== mpMyPeerId && !(claimed || {})[iso]) {
            mpColorCountry(iso, mpPlayerColors[peerId]);
        }
    });
}

function mpLandGrabClaim(peerId, iso) {
    mpLandGrabPool = mpLandGrabPool.filter(c => c !== iso);
    mpLandGrabClaimed[iso] = peerId;
    if (peerId !== mpMyPeerId && mpPlayers[peerId]) mpPlayers[peerId].score++;
    const playerScore = peerId === mpMyPeerId ? score : mpPlayers[peerId].score;
    mpColorCountry(iso, mpPlayerColors[peerId]);
    broadcast({ type: 'land-grab-claimed', peerId, iso, score: playerScore });
    broadcast({ type: 'player-score', peerId, score: playerScore,
        wrong: peerId === mpMyPeerId ? wrongCount : mpPlayers[peerId]?.wrong ?? 0 });
}

function mpLandGrabResolveRace() {
    mpWinnerWindowTimer = null;
    if (mpRaceResolved || mpCorrectAnswers.length === 0) return;
    mpRaceResolved = true;
    canAnswer = false;
    mpCorrectAnswers.sort((a, b) => a.ts - b.ts);
    const winner = mpCorrectAnswers[0].peerId;
    const iso = mpLandGrabAssignments[winner];
    mpLandGrabClaim(winner, iso);
    broadcast({ type: 'round-over', winner, featureId: iso });
    if (winner !== mpMyPeerId) {
        showOverlay(`${mpPlayers[winner]?.name || 'Someone'} got it!`, false);
    }
    setTimeout(mpLandGrabAdvance, 1200);
}

function mpLandGrabCheckRoundEnd() {
    const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
    if (allAnswered) setTimeout(mpLandGrabAdvance, 900);
}

const LandGrabMode = {
    onAnswer(correct) {
        if (!canAnswer) return;
        const targetName = getCountryName(currentTarget);
        const iso = currentTarget?.properties?.ISO_A3;
        canAnswer = false;

        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
            showOverlay(targetName, true);
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            showOverlay(targetName, false);
            g.selectAll(".country").filter(d => d === currentTarget).style("fill", null);
        }

        mpRoundAnswered[mpMyPeerId] = true;

        if (mpIsHost) {
            if (mpLandGrabRaceRound) {
                if (correct) {
                    mpCorrectAnswers.push({ peerId: mpMyPeerId, ts: Date.now() });
                    if (!mpWinnerWindowTimer) {
                        mpWinnerWindowTimer = setTimeout(mpLandGrabResolveRace, MP_WINNER_WINDOW_MS);
                    }
                } else {
                    const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                    if (allAnswered && !mpRaceResolved) setTimeout(mpLandGrabAdvance, 1200);
                }
            } else {
                if (correct) mpLandGrabClaim(mpMyPeerId, iso);
                mpLandGrabCheckRoundEnd();
            }
        } else {
            sendToHost({ type: 'answered', correct, iso, ts: Date.now() });
        }
    },

    onDone() {},
    onReset() {},
    onHome() { mpGoHome(); },

    onMessage(msg, fromId) {
        switch (msg.type) {
            case 'land-grab-question': {
                document.getElementById('remaining').innerText = msg.poolRemaining;
                mpLandGrabPool = mpLandGrabPool.filter(c => !msg.claimed[c]);
                mpLandGrabClaimed = msg.claimed || {};
                mpLandGrabAssignments = msg.assignments;
                mpLandGrabRaceRound = msg.raceRound;
                const myIso = msg.assignments[mpMyPeerId];
                const feature = myIso ? fullDataset.find(f => f.properties.ISO_A3 === myIso) : null;
                currentTarget = feature || null;
                canAnswer = false;
                mpRaceResolved = false;
                if (!startTime) startTimer();
                mpRenderLandGrabMap(msg.assignments, msg.claimed);
                if (msg.raceRound) {
                    sendToHost({ type: 'ack' });
                } else {
                    renderQuestion();
                }
                break;
            }

            case 'land-grab-claimed':
                mpLandGrabPool = mpLandGrabPool.filter(c => c !== msg.iso);
                mpLandGrabClaimed[msg.iso] = msg.peerId;
                mpColorCountry(msg.iso, mpPlayerColors[msg.peerId]);
                break;

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
                if (mpLandGrabRaceRound) {
                    if (msg.correct && !mpRaceResolved) {
                        mpCorrectAnswers.push({ peerId: fromId, ts: msg.ts || Date.now() });
                        if (!mpWinnerWindowTimer) {
                            mpWinnerWindowTimer = setTimeout(mpLandGrabResolveRace, MP_WINNER_WINDOW_MS);
                        }
                    } else if (!msg.correct && !mpRaceResolved) {
                        const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                        if (allAnswered) setTimeout(mpLandGrabAdvance, 1200);
                    }
                } else {
                    if (msg.correct && msg.iso) mpLandGrabClaim(fromId, msg.iso);
                    mpLandGrabCheckRoundEnd();
                }
                break;
            }
        }
    },

    start() {
        mpLandGrabAdvance();
    },
};
