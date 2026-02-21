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
// If pool is empty, enter race phase — assign the player a country another player
// is currently working on. If no raceable countries exist, mark player done.
// wrongIso: pass the ISO of a wrong answer to recycle it back into the pool.
function mpLandGrabAssignNext(peerId, wrongIso = null) {
    if (wrongIso) mpLandGrabPool.push(wrongIso);

    if (mpLandGrabPool.length > 0) {
        // Normal phase: pick a random unclaimed country from the pool.
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

    // Pool is empty — race phase.
    // Find a country currently assigned to another player that hasn't been claimed.
    const raceTargets = Object.entries(mpLandGrabAssignments)
        .filter(([pid, iso]) => pid !== peerId && iso !== null && !mpLandGrabClaimed[iso])
        .map(([, iso]) => iso);

    if (raceTargets.length > 0) {
        // Pick one at random and co-assign this player to race for it.
        const iso = raceTargets[Math.floor(Math.random() * raceTargets.length)];
        mpLandGrabAssignments[peerId] = iso;
        mpLandGrabSendAssignment(peerId, iso, 0);
        return;
    }

    // No pool countries and no raceable countries — this player is done.
    mpLandGrabAssignments[peerId] = null;
    mpLandGrabCheckAllDone();
}

// Host: send an assignment to a specific player (host or guest).
function mpLandGrabSendAssignment(peerId, iso, remaining) {
    if (peerId === mpMyPeerId) {
        currentTarget = fullDataset.find(f => f.properties.ISO_A3 === iso) || null;
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
// Returns true if the claim succeeded, false if already claimed by someone else.
function mpLandGrabClaim(peerId, iso) {
    if (mpLandGrabClaimed[iso]) return false;

    mpLandGrabClaimed[iso] = peerId;
    if (peerId !== mpMyPeerId && mpPlayers[peerId]) mpPlayers[peerId].score++;
    const playerScore = peerId === mpMyPeerId ? score : mpPlayers[peerId].score;
    mpColorCountry(iso, mpPlayerColors[peerId]);
    broadcast({ type: 'land-grab-claimed', peerId, iso });
    broadcast({ type: 'player-score', peerId, score: playerScore,
        wrong: peerId === mpMyPeerId ? wrongCount : mpPlayers[peerId]?.wrong ?? 0 });

    // Any other player racing for the same country lost — reassign them immediately.
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
        const targetName = getCountryName(currentTarget);
        const iso = currentTarget?.properties?.ISO_A3;
        canAnswer = false;

        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
            showOverlay(targetName, true);
            if (mpIsHost) mpLandGrabClaim(mpMyPeerId, iso);
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            showOverlay(targetName, false);
        }

        if (mpIsHost) {
            // Small delay so the overlay is visible before next question loads.
            // Pass wrong iso back so it re-enters the pool and eventually gets claimed.
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
            // Host receives a guest's answer → claim or skip, then immediately
            // assign that guest their next question.
            case 'answered': {
                if (!mpIsHost) return;
                if (msg.correct && msg.iso) {
                    const claimed = mpLandGrabClaim(fromId, msg.iso);
                    // If the claim succeeded, mpLandGrabClaim already handles reassigning
                    // any other racers. We still need to advance this player.
                    // If the claim failed (already taken), also advance this player.
                    // Either way: schedule the next assignment for the answering player.
                    setTimeout(() => mpLandGrabAssignNext(fromId), msg.correct ? 700 : 800);
                } else {
                    const wrongIso = msg.iso || null;
                    setTimeout(() => mpLandGrabAssignNext(fromId, wrongIso), 800);
                }
                break;
            }

            // Guest receives their next individual question from the host.
            case 'land-grab-next': {
                document.getElementById('remaining').innerText = msg.remaining;
                if (!startTime) startTimer();
                const feature = msg.iso ? fullDataset.find(f => f.properties.ISO_A3 === msg.iso) : null;
                currentTarget = feature || null;
                if (currentTarget) {
                    renderQuestion();
                } else {
                    canAnswer = false;
                    inputArea.classList.add('hidden');
                    optionsGrid.classList.add('hidden');
                }
                break;
            }

            // Broadcast keeping all players' remaining counter in sync.
            case 'land-grab-pool':
                document.getElementById('remaining').innerText = msg.remaining;
                break;

            // A country was claimed — color it for everyone.
            case 'land-grab-claimed':
                mpLandGrabClaimed[msg.iso] = msg.peerId;
                mpColorCountry(msg.iso, mpPlayerColors[msg.peerId]);
                break;
        }
    },

    start() {
        mpLandGrabAdvance();
    },
};
