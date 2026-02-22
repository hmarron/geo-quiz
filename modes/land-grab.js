// ─── MP Land Grab mode object ─────────────────────────────────────────────────
// Continuous model: each player gets questions independently at their own pace.
// Countries are colored only when claimed (correct answer), never when assigned.
// Race phase: when pool empties, multiple players may be assigned the same country.
// First correct claim wins; losers are immediately reassigned another race country.

let mpLandGrabPool = [];
let mpLandGrabClaimed = {};
let mpLandGrabAssignments = {}; // { peerId: iso | null }  null = no more questions

// Host: kick off the game by assigning each player their first country.
function mpLandGrabAdvance() {
    if (!mpIsHost) return;
    if (!startTime) startTimer();
    Object.keys(mpPlayers).forEach(pid => mpLandGrabAssignNext(pid));
}

// Host: assign the next country from the pool to a specific player.
function mpLandGrabAssignNext(peerId, wrongIso = null) {
    if (wrongIso) mpLandGrabPool.push(wrongIso);

    if (mpLandGrabPool.length > 0) {
        const idx = Math.floor(Math.random() * mpLandGrabPool.length);
        const iso = mpLandGrabPool[idx];
        mpLandGrabPool.splice(idx, 1);
        mpLandGrabAssignments[peerId] = iso;

        const remaining = mpLandGrabPool.length;
        document.getElementById('remaining').innerText = remaining;
        broadcast({ type: 'land-grab-pool', remaining });

        mpLandGrabSendAssignment(peerId, iso, remaining);
        return;
    }

    const raceTargets = Object.entries(mpLandGrabAssignments)
        .filter(([pid, iso]) => pid !== peerId && iso !== null && !mpLandGrabClaimed[iso])
        .map(([, iso]) => iso);

    if (raceTargets.length > 0) {
        const iso = raceTargets[Math.floor(Math.random() * raceTargets.length)];
        mpLandGrabAssignments[peerId] = iso;
        mpLandGrabSendAssignment(peerId, iso, 0);
        return;
    }

    mpLandGrabAssignments[peerId] = null;
    mpLandGrabCheckAllDone();
}

// Host: send an assignment to a specific player (host or guest).
function mpLandGrabSendAssignment(peerId, iso, remaining) {
    if (peerId === mpMyPeerId) {
        currentTarget = activePlugin.getItemById(iso) || null;
        renderQuestion();
    } else {
        const conn = mpConns[peerId];
        if (conn) try { conn.send({ type: 'land-grab-next', iso, remaining }); } catch(e) {}
    }
}

// Host: end the game when every active player has no remaining assignment.
function mpLandGrabCheckAllDone() {
    const active = Object.keys(mpPlayers);
    if (active.length === 0) return;
    if (!active.every(pid => mpLandGrabAssignments[pid] === null)) return;

    const results = Object.entries(mpPlayers).map(([pid, p]) => ({
        peerId: pid, name: p.name, score: p.score, wrong: p.wrong,
    }));
    results.forEach(r => { if (r.peerId === mpMyPeerId) { r.score = score; r.wrong = wrongCount; } });
    results.sort((a, b) => b.score - a.score);
    broadcast({ type: 'game-over', results });
    showMpFinishModal(results);
}

// Host: record a correct claim and broadcast the coloring to all players.
function mpLandGrabClaim(peerId, iso) {
    if (mpLandGrabClaimed[iso]) return false;

    mpLandGrabClaimed[iso] = peerId;
    if (peerId !== mpMyPeerId && mpPlayers[peerId]) mpPlayers[peerId].score++;
    const playerScore = peerId === mpMyPeerId ? score : mpPlayers[peerId].score;
    
    if (typeof activePlugin.colorItem === 'function') {
        activePlugin.colorItem(iso, mpPlayerColors[peerId]);
    }

    broadcast({ type: 'land-grab-claimed', peerId, iso });
    broadcast({ type: 'player-score', peerId, score: playerScore,
        wrong: peerId === mpMyPeerId ? wrongCount : mpPlayers[peerId]?.wrong ?? 0 });

    Object.entries(mpLandGrabAssignments).forEach(([pid, assignedIso]) => {
        if (pid !== peerId && assignedIso === iso) {
            mpLandGrabAssignNext(pid);
        }
    });

    return true;
}

const LandGrabMode = {
    onAnswer(correct) {
        if (!canAnswer) return;
        const targetName = activePlugin.getCorrectAnswer(currentTarget);
        const iso = activePlugin.getItemId(currentTarget);
        canAnswer = false;

        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
            activePlugin.showOverlay(targetName, true);
            if (mpIsHost) mpLandGrabClaim(mpMyPeerId, iso);
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            activePlugin.showOverlay(targetName, false);
        }

        if (mpIsHost) {
            setTimeout(() => mpLandGrabAssignNext(mpMyPeerId, correct ? null : iso), correct ? 700 : 800);
        } else {
            sendToHost({ type: 'answered', correct, iso });
        }
    },

    onDone() {},
    onReset() {},
    onHome() { mpGoHome(); },

    onMessage(msg, fromId) {
        switch (msg.type) {
            case 'answered': {
                if (!mpIsHost) return;
                if (msg.correct && msg.iso) {
                    mpLandGrabClaim(fromId, msg.iso);
                    setTimeout(() => mpLandGrabAssignNext(fromId), msg.correct ? 700 : 800);
                } else {
                    const wrongIso = msg.iso || null;
                    setTimeout(() => mpLandGrabAssignNext(fromId, wrongIso), 800);
                }
                break;
            }

            case 'land-grab-next': {
                document.getElementById('remaining').innerText = msg.remaining;
                if (!startTime) startTimer();
                const item = msg.iso ? activePlugin.getItemById(msg.iso) : null;
                currentTarget = item || null;
                if (currentTarget) {
                    renderQuestion();
                } else {
                    canAnswer = false;
                    inputArea.classList.add('hidden');
                    optionsGrid.classList.add('hidden');
                }
                break;
            }

            case 'land-grab-pool':
                document.getElementById('remaining').innerText = msg.remaining;
                break;

            case 'land-grab-claimed':
                mpLandGrabClaimed[msg.iso] = msg.peerId;
                if (typeof activePlugin.colorItem === 'function') {
                    activePlugin.colorItem(msg.iso, mpPlayerColors[msg.peerId]);
                }
                break;
        }
    },

    start() {
        mpLandGrabAdvance();
    },
};