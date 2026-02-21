// ─── Multiplayer ─────────────────────────────────────────────────────────────

let mpPeer = null;
let mpConns = {};           // { peerId: DataConnection } — host has N-1, guest has 1
let mpIsHost = false;
let mpMode = null;          // 'race' | 'compete'
let mpIsActive = false;
let mpPlayers = {};         // { peerId: { name, score, wrong } }
let mpRoundAnswered = {};   // { peerId: bool }
let mpQuestionPool = [];    // Ordered ISO A3 codes (host-generated)
let mpQuestionIdx = 0;
let mpLocalName = 'You';
let mpMyPeerId = null;
let mpPlayerColors = {};  // { peerId: '#hex' }

let mpLandGrabPool = [];        // ISO_A3 codes not yet claimed
let mpLandGrabClaimed = {};     // { ISO_A3: peerId }
let mpLandGrabAssignments = {}; // { peerId: ISO_A3 } — current round
let mpLandGrabRaceRound = false; // true when pool.length < playerCount

const MP_ACK_TIMEOUT_MS = 3000;   // max wait for all acks before sending go anyway
const MP_WINNER_WINDOW_MS = 300;  // collect correct answers for this long, pick min ts

let mpRoundAcked = {};            // { peerId: bool } — who has acked current question
let mpAckTimeout = null;          // timeout handle for ack wait
let mpCorrectAnswers = [];        // [{ peerId, ts }] collected during winner window
let mpWinnerWindowTimer = null;   // timeout handle for winner window

const MP_COLOR_PALETTE = [
    '#3b82f6', // blue
    '#f97316', // orange
    '#10b981', // emerald
    '#a855f7', // purple
    '#06b6d4', // cyan
    '#e879f9', // fuchsia
    '#84cc16', // lime
    '#6366f1', // indigo
];

function mpNextColor() {
    const used = Object.keys(mpPlayerColors).length;
    return MP_COLOR_PALETTE[used % MP_COLOR_PALETTE.length];
}

function mpColorCountry(featureId, color) {
    if (!featureId || !color) return;
    g.selectAll(".country")
        .filter(d => d.properties && d.properties.ISO_A3 === featureId)
        .style("fill", color);
}

const MP_PREFIX = 'geoquiz-';

function mpGenCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function startMultiplayer() {
    init(() => {
        mpRenderLobbySettings();
        document.getElementById('mp-lobby-modal').style.display = 'flex';
    });
}

function showJoinInput() {
    document.getElementById('mp-join-input').classList.remove('hidden');
    document.getElementById('mp-code-input').focus();
}

function createRoom() {
    mpLocalName = document.getElementById('mp-name-input').value.trim() || 'Player';
    document.getElementById('btn-create-room').disabled = true;
    document.getElementById('btn-join-room').disabled = true;
    document.getElementById('mp-name-input').disabled = true;
    const code = mpGenCode();
    mpIsHost = true;
    mpPeer = new Peer(MP_PREFIX + code, { debug: 0 });

    mpPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            // Retry with a new code
            mpPeer.destroy();
            mpPeer = null;
            mpIsHost = false;
            document.getElementById('btn-create-room').disabled = false;
            document.getElementById('btn-join-room').disabled = false;
            createRoom();
        } else {
            console.error('PeerJS error:', err);
        }
    });

    mpPeer.on('open', (id) => {
        mpMyPeerId = id;
        mpPlayerColors[id] = mpNextColor();
        mpPlayers[id] = { name: mpLocalName, score: 0, wrong: 0 };
        document.getElementById('mp-code-display').classList.remove('hidden');
        document.getElementById('mp-room-code').textContent = id.replace(MP_PREFIX, '');
        document.getElementById('mp-status').classList.remove('hidden');
        document.getElementById('mp-host-controls').classList.remove('hidden');
        mpUpdateLobbyList();
        mpSetStatus('Waiting for players to join…');
    });

    mpPeer.on('connection', (conn) => {
        onGuestJoined(conn);
    });
}

function onGuestJoined(conn) {
    conn.on('open', () => {
        mpConns[conn.peer] = conn;
        conn.on('data', (msg) => handleMpMessage(msg, conn.peer));
        conn.on('close', () => mpHandleDisconnect(conn.peer));
        conn.on('error', () => mpHandleDisconnect(conn.peer));
    });
}

function joinRoom() {
    mpLocalName = document.getElementById('mp-name-input').value.trim() || 'Player';
    const code = document.getElementById('mp-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;

    const connectBtn = document.querySelector('#mp-join-input button');
    const errEl = document.getElementById('mp-join-error');
    connectBtn.textContent = 'Connecting…';
    connectBtn.disabled = true;
    errEl.classList.add('hidden');
    document.getElementById('mp-name-input').disabled = true;

    function showJoinError(msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        connectBtn.textContent = 'Connect';
        connectBtn.disabled = false;
        document.getElementById('mp-name-input').disabled = false;
        if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    }

    mpIsHost = false;
    mpPeer = new Peer({ debug: 0 });

    const timeout = setTimeout(() => showJoinError('Timed out. Check the code and try again.'), 10000);

    mpPeer.on('error', (err) => {
        clearTimeout(timeout);
        showJoinError('Connection error: ' + (err.message || err.type));
    });

    mpPeer.on('open', (id) => {
        mpMyPeerId = id;
        const conn = mpPeer.connect(MP_PREFIX + code, { reliable: true });

        conn.on('error', () => {
            clearTimeout(timeout);
            showJoinError('Could not find room. Check the code and try again.');
        });

        conn.on('open', () => {
            clearTimeout(timeout);
            onConnectedToHost(conn);
        });
    });
}

function onConnectedToHost(conn) {
    mpConns[conn.peer] = conn;
    conn.on('data', (msg) => handleMpMessage(msg, conn.peer));
    conn.on('close', () => mpGuestHandleHostDisconnect());
    conn.on('error', () => mpGuestHandleHostDisconnect());
    sendToHost({ type: 'ready', name: mpLocalName });
    const connectBtn = document.querySelector('#mp-join-input button');
    if (connectBtn) { connectBtn.textContent = 'Connected ✓'; connectBtn.disabled = true; }
    document.getElementById('mp-status').classList.remove('hidden');
    document.getElementById('mp-guest-waiting').classList.remove('hidden');
    mpSetStatus('Connected! Waiting for host to start…');
}

function broadcast(msg) {
    Object.values(mpConns).forEach(c => { try { c.send(msg); } catch(e) {} });
}

function sendToHost(msg) {
    const conn = Object.values(mpConns)[0];
    if (conn) { try { conn.send(msg); } catch(e) {} }
}

function handleMpMessage(msg, fromId) {
    switch (msg.type) {
        case 'ready':
            if (!mpIsHost) return;
            mpPlayerColors[fromId] = mpNextColor();
            mpPlayers[fromId] = { name: msg.name || 'Guest', score: 0, wrong: 0 };
            // Send new guest the full current player list so they see everyone already in lobby
            try {
                mpConns[fromId].send({
                    type: 'welcome',
                    players: Object.fromEntries(
                        Object.entries(mpPlayers).map(([pid, p]) => [pid, { name: p.name, color: mpPlayerColors[pid] }])
                    )
                });
            } catch(e) {}
            mpUpdateLobbyList();
            broadcast({ type: 'player-joined', peerId: fromId, name: mpPlayers[fromId].name, color: mpPlayerColors[fromId], playerCount: Object.keys(mpPlayers).length });
            mpSetStatus(`${Object.keys(mpPlayers).length} player(s) in lobby`);
            break;

        case 'welcome':
            Object.entries(msg.players).forEach(([pid, p]) => {
                mpPlayers[pid] = { name: p.name, score: 0, wrong: 0 };
                if (p.color) mpPlayerColors[pid] = p.color;
            });
            mpUpdateLobbyList();
            break;

        case 'player-joined':
            if (!mpPlayers[msg.peerId]) mpPlayers[msg.peerId] = { name: msg.name, score: 0, wrong: 0 };
            if (msg.color) mpPlayerColors[msg.peerId] = msg.color;
            mpUpdateLobbyList();
            break;

        case 'game-start':
            mpApplySettings(msg);
            break;

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
                mpGo();
            }
            break;
        }

        case 'land-grab-claimed': {
            mpLandGrabPool = mpLandGrabPool.filter(c => c !== msg.iso);
            mpLandGrabClaimed[msg.iso] = msg.peerId;
            mpColorCountry(msg.iso, mpPlayerColors[msg.peerId]);
            break;
        }

        case 'question':
            if (msg.remaining !== undefined) document.getElementById('remaining').innerText = msg.remaining;
            mpSetQuestion(msg.featureId);
            if (mpMode === 'compete') mpGo();  // compete: render immediately, no ack needed
            break;

        case 'ack':
            mpHandleAck(fromId);
            break;

        case 'go':
            mpGo();
            break;

        case 'answered':
            if (!mpIsHost) return;
            mpRoundAnswered[fromId] = true;
            if (mpMode === 'race') {
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
            } else if (mpMode === 'land-grab') {
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
            } else {
                // compete: update score relay, check if all done
                if (msg.score !== undefined) {
                    mpPlayers[fromId].score = msg.score;
                    mpPlayers[fromId].wrong = msg.wrong;
                    broadcast({ type: 'player-score', peerId: fromId, score: msg.score, wrong: msg.wrong });
                }
                const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                if (allAnswered) setTimeout(mpAdvance, 900);
            }
            break;

        case 'score-update':
            if (!mpIsHost) return;
            mpPlayers[fromId].score = msg.score;
            mpPlayers[fromId].wrong = msg.wrong;
            broadcast({ type: 'player-score', peerId: fromId, score: msg.score, wrong: msg.wrong });
            break;

        case 'player-score':
            if (mpPlayers[msg.peerId]) {
                mpPlayers[msg.peerId].score = msg.score;
                mpPlayers[msg.peerId].wrong = msg.wrong;
            }
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

        case 'game-over':
            showMpFinishModal(msg.results);
            break;

        case 'player-left': {
            const leftName = mpPlayers[msg.peerId]?.name || 'A player';
            delete mpPlayers[msg.peerId];
            delete mpRoundAnswered[msg.peerId];
            mpShowToast(leftName + ' left the game');
            if (mpIsHost && mpMode === 'compete') {
                const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
                if (allAnswered && Object.keys(mpPlayers).length > 0) setTimeout(mpAdvance, 900);
            }
            break;
        }
    }
}

let mpRaceResolved = false;

function mpApplySettings(msg) {
    // Apply game settings from host
    mpMode = msg.mpMode;
    mpQuestionPool = msg.questionPool;
    mpQuestionIdx = 0;
    if (msg.mpMode === 'land-grab') {
        mpLandGrabPool = msg.questionPool.slice();
        mpLandGrabClaimed = {};
        mpLandGrabAssignments = {};
    }
    // Apply regions and re-render map
    regions.forEach(r => { r.active = msg.regions.includes(r.id); });
    g.selectAll(".country")
        .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
        .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);
    gameMode = msg.gameMode;
    setMode(gameMode);
    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;
    // Apply player list
    if (msg.players) {
        Object.entries(msg.players).forEach(([pid, p]) => {
            const name = typeof p === 'object' ? p.name : p;
            const color = typeof p === 'object' ? p.color : null;
            mpPlayers[pid] = { name, score: 0, wrong: 0 };
            if (color) mpPlayerColors[pid] = color;
        });
        // Guest gets their own color from the players dict
        if (msg.players[mpMyPeerId]?.color) mpPlayerColors[mpMyPeerId] = msg.players[mpMyPeerId].color;
    }
    // Close any open screens and start game
    document.getElementById('mp-lobby-modal').style.display = 'none';
    document.getElementById('mp-finish-modal').style.display = 'none';
    document.getElementById('mp-results-pill').classList.add('hidden');
    document.getElementById('start-screen').style.display = 'none';
    mpIsActive = true;
    score = 0; wrongCount = 0; hintCount = 0;
    startTime = null;
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';
    // Guests wait for first 'question' message
}

function mpSetGameMode(mode) {
    gameMode = mode;
    setMode(mode); // update single-player mode buttons too
    document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', mode === 'hard');
    document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', mode === 'easy');
}

function mpRenderLobbySettings() {
    // Render region toggles into the lobby
    const container = document.getElementById('mp-region-toggles');
    container.innerHTML = regions.map(r => `
        <label class="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="checkbox" id="mp-check-${r.id}" ${r.active ? 'checked' : ''}
                   class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500">
            <span class="text-xs font-medium text-slate-200">${r.label}</span>
        </label>
    `).join('');
    // Sync game mode buttons
    document.getElementById('mp-btn-hard').classList.toggle('mode-btn-active', gameMode === 'hard');
    document.getElementById('mp-btn-easy').classList.toggle('mode-btn-active', gameMode === 'easy');
}

function mpStartGame() {
    if (!mpIsHost) return;
    mpMode = document.getElementById('mp-mode-select').value;

    // Read region settings from lobby checkboxes
    regions.forEach(r => {
        const cb = document.getElementById(`mp-check-${r.id}`);
        if (cb) r.active = cb.checked;
    });
    // Update map display to match
    g.selectAll(".country")
        .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
        .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);
    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;

    // Build question pool
    const activePool = fullDataset.filter(isAllowed);
    const shuffled = activePool.slice().sort(() => Math.random() - 0.5);
    mpQuestionPool = shuffled.map(f => f.properties.ISO_A3).filter(Boolean);
    mpQuestionIdx = 0;

    if (mpMode === 'land-grab') {
        mpLandGrabPool = mpQuestionPool.slice();
        mpLandGrabClaimed = {};
        mpLandGrabAssignments = {};
    }

    const playerData = {};
    Object.entries(mpPlayers).forEach(([pid, p]) => {
        playerData[pid] = { name: p.name, color: mpPlayerColors[pid] };
    });

    const startMsg = {
        type: 'game-start',
        gameMode,
        regions: regions.filter(r => r.active).map(r => r.id),
        mpMode,
        questionPool: mpQuestionPool,
        players: playerData,
    };
    broadcast(startMsg);

    // Apply locally
    document.getElementById('mp-lobby-modal').style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
    mpIsActive = true;
    score = 0; wrongCount = 0; hintCount = 0;
    startTime = null;
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';

    if (mpMode === 'land-grab') mpLandGrabAdvance();
    else mpAdvance();
}

function mpAdvance() {
    if (!mpIsHost) return;
    if (mpQuestionIdx >= mpQuestionPool.length) {
        // Game over
        const results = Object.entries(mpPlayers).map(([pid, p]) => ({
            peerId: pid,
            name: p.name,
            score: p.score,
            wrong: p.wrong,
        }));
        // Use local counters for the host's own entry
        results.forEach(r => {
            if (r.peerId === mpMyPeerId) {
                r.score = score;
                r.wrong = wrongCount;
            }
        });
        results.sort((a, b) => b.score - a.score);
        broadcast({ type: 'game-over', results });
        showMpFinishModal(results);
        return;
    }
    const featureId = mpQuestionPool[mpQuestionIdx];
    mpQuestionIdx++;
    mpRoundAnswered = {};
    Object.keys(mpPlayers).forEach(pid => { mpRoundAnswered[pid] = false; });
    mpRaceResolved = false;
    mpRoundAcked = {};
    Object.keys(mpPlayers).forEach(pid => { mpRoundAcked[pid] = false; });
    mpCorrectAnswers = [];
    const remaining = mpQuestionPool.length - mpQuestionIdx;
    document.getElementById('remaining').innerText = remaining;
    broadcast({ type: 'question', featureId, remaining });
    mpSetQuestion(featureId);  // stores target, no rendering yet
    if (mpMode === 'compete') {
        mpGo();  // compete: render immediately, no ack needed
    } else {
        // race: wait for all guests to ack, with timeout fallback
        mpAckTimeout = setTimeout(() => {
            mpAckTimeout = null;
            broadcast({ type: 'go' });
            mpGo();
        }, MP_ACK_TIMEOUT_MS);
        mpHandleAck(mpMyPeerId);  // host counts itself as acked immediately
    }
}

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
            mpGo();
        }, MP_ACK_TIMEOUT_MS);
        mpHandleAck(mpMyPeerId);
    } else {
        mpGo();
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

function mpSetQuestion(featureId) {
    const feature = fullDataset.find(f => f.properties.ISO_A3 === featureId);
    if (!feature) return;
    currentTarget = feature;
    canAnswer = false;
    mpRaceResolved = false;

    if (!startTime) startTimer();

    // No rendering yet — wait for 'go' (race) or immediate mpGo() call (compete)
    if (!mpIsHost && mpMode === 'race') {
        sendToHost({ type: 'ack' });
    }
}

function mpGo() {
    if (!currentTarget) return;
    canAnswer = true;

    if (gameMode === 'hard') {
        answerInput.value = '';
        answerInput.focus();
        optionsGrid.classList.add('hidden');
        inputArea.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'block';
    } else {
        inputArea.classList.add('hidden');
        optionsGrid.classList.remove('hidden');
        document.getElementById('hint-btn').style.display = 'none';
        generateChoices();
    }

    g.selectAll(".country").classed("country-highlight", d => d === currentTarget);

    try {
        const bounds = path.bounds(currentTarget);
        if (bounds && !isNaN(bounds[0][0])) {
            const dx = bounds[1][0] - bounds[0][0];
            const dy = bounds[1][1] - bounds[0][1];
            const x = (bounds[0][0] + bounds[1][0]) / 2;
            const y = (bounds[0][1] + bounds[1][1]) / 2;
            const maxDim = Math.max(dx / width, dy / height, 0.001);
            const scale = Math.max(1.8, Math.min(35, 0.42 / maxDim));
            const translate = [width / 2 - scale * x, height / 2 - scale * y];
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
        }
    } catch(e) {}
}

function mpHandleAck(peerId) {
    if (!mpIsHost) return;
    mpRoundAcked[peerId] = true;
    mpCheckAllAcked();
}

function mpCheckAllAcked() {
    if (!mpAckTimeout) return;  // not currently waiting for acks — ignore stray calls
    const allAcked = Object.keys(mpRoundAcked).every(pid => mpRoundAcked[pid]);
    if (allAcked) {
        clearTimeout(mpAckTimeout);
        mpAckTimeout = null;
        broadcast({ type: 'go' });
        mpGo();  // host applies go locally
    }
}

function mpHandleAnswer(correct) {
    if (!canAnswer) return;
    const targetName = getCountryName(currentTarget);

    if (mpMode === 'race') {
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
    } else if (mpMode === 'land-grab') {
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
    } else {
        // compete mode
        if (correct) {
            canAnswer = false;
            score++;
            document.getElementById('score').innerText = score;
            showOverlay(targetName, true);
        } else {
            canAnswer = false;
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
    }
}

function mpResolveRound(winnerPeerId) {
    if (!mpIsHost) return;
    if (mpWinnerWindowTimer) { clearTimeout(mpWinnerWindowTimer); mpWinnerWindowTimer = null; }
    mpRaceResolved = true;
    canAnswer = false;
    const featureId = currentTarget?.properties?.ISO_A3;
    broadcast({ type: 'round-over', winner: winnerPeerId, featureId });
    // Color the won country
    if (winnerPeerId) mpColorCountry(featureId, mpPlayerColors[winnerPeerId]);
    // Show overlay on host for guest wins (host already shows it for their own correct answer)
    if (winnerPeerId !== mpMyPeerId) {
        const targetName = getCountryName(currentTarget);
        const winnerName = winnerPeerId === null ? null : (mpPlayers[winnerPeerId]?.name || 'Someone');
        const text = winnerPeerId === null ? targetName : `${winnerName} got it!`;
        showOverlay(text, false);
    }
    // Update winner score
    if (winnerPeerId && winnerPeerId !== mpMyPeerId && mpPlayers[winnerPeerId]) {
        mpPlayers[winnerPeerId].score++;
        broadcast({ type: 'player-score', peerId: winnerPeerId, score: mpPlayers[winnerPeerId].score, wrong: mpPlayers[winnerPeerId].wrong });
    }
    setTimeout(mpAdvance, 1200);
}

function showMpFinishModal(results) {
    mpIsActive = false;
    canAnswer = false;
    stopTimer();
    inputArea.classList.add('hidden');
    optionsGrid.classList.add('hidden');
    g.selectAll(".country").classed("country-highlight", false);

    const winner = results[0];
    const titleEl = document.getElementById('mp-finish-title');
    titleEl.textContent = winner.peerId === mpMyPeerId ? 'You Win! 🎉' : `${winner.name} Wins!`;

    const list = document.getElementById('mp-results-list');
    list.innerHTML = results.map((r, i) => {
        const isMe = r.peerId === mpMyPeerId;
        const color = mpPlayerColors[r.peerId] || '#64748b';
        return `<div class="flex items-center gap-3 p-2.5 rounded-xl ${isMe ? 'bg-slate-700/60 border border-slate-500/50' : 'bg-slate-700/30'}">
            <span class="text-slate-500 font-mono text-sm w-4 text-right">${i + 1}</span>
            <span class="w-3 h-3 rounded-full shrink-0" style="background:${color}"></span>
            <span class="flex-1 text-sm font-semibold" style="color:${color}">${r.name}${isMe ? ' (you)' : ''}</span>
            <span class="text-green-400 font-mono text-sm">${r.score}✓</span>
            <span class="text-red-400 font-mono text-sm">${r.wrong}✗</span>
        </div>`;
    }).join('');

    if (mpIsHost) document.getElementById('btn-mp-play-again').classList.remove('hidden');
    document.getElementById('mp-finish-modal').style.display = 'flex';
}

function mpPlayAgain() {
    if (!mpIsHost) return;
    document.getElementById('mp-finish-modal').style.display = 'none';
    document.getElementById('mp-results-pill').classList.add('hidden');
    score = 0; wrongCount = 0; hintCount = 0;
    startTime = null;
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';
    Object.keys(mpPlayers).forEach(pid => {
        mpPlayers[pid].score = 0;
        mpPlayers[pid].wrong = 0;
    });
    mpIsActive = true;
    mpLandGrabPool = [];
    mpLandGrabClaimed = {};
    mpStartGame();
}

function mpViewMap() {
    document.getElementById('mp-finish-modal').style.display = 'none';
    document.getElementById('mp-results-pill').classList.remove('hidden');
}

function mpShowResults() {
    document.getElementById('mp-results-pill').classList.add('hidden');
    document.getElementById('mp-finish-modal').style.display = 'flex';
}

function mpGoHome() {
    document.getElementById('mp-finish-modal').style.display = 'none';
    document.getElementById('mp-results-pill').classList.add('hidden');
    closeLobby();
}

function closeLobby() {
    if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    clearTimeout(mpAckTimeout); mpAckTimeout = null;
    clearTimeout(mpWinnerWindowTimer); mpWinnerWindowTimer = null;
    mpConns = {};
    mpIsHost = false;
    mpIsActive = false;
    mpPlayers = {};
    mpPlayerColors = {};
    mpRoundAnswered = {};
    mpRoundAcked = {};
    mpCorrectAnswers = [];
    mpQuestionPool = [];
    mpQuestionIdx = 0;
    mpMyPeerId = null;
    mpLandGrabPool = [];
    mpLandGrabClaimed = {};
    mpLandGrabAssignments = {};
    mpLandGrabRaceRound = false;
    // Reset lobby UI
    document.getElementById('mp-lobby-modal').style.display = 'none';
    document.getElementById('mp-code-display').classList.add('hidden');
    document.getElementById('mp-join-input').classList.add('hidden');
    document.getElementById('mp-status').classList.add('hidden');
    document.getElementById('mp-host-controls').classList.add('hidden');
    document.getElementById('mp-guest-waiting').classList.add('hidden');
    document.getElementById('mp-join-error').classList.add('hidden');
    document.getElementById('btn-create-room').disabled = false;
    document.getElementById('btn-join-room').disabled = false;
    document.getElementById('mp-name-input').disabled = false;
    const connectBtn = document.querySelector('#mp-join-input button');
    if (connectBtn) { connectBtn.textContent = 'Connect'; connectBtn.disabled = false; }
    document.getElementById('mp-code-input').value = '';
    document.getElementById('start-screen').style.display = 'flex';
    stopTimer();
}

function mpHandleDisconnect(peerId) {
    if (!mpIsHost) return;
    const name = mpPlayers[peerId]?.name || 'A player';
    delete mpConns[peerId];
    delete mpPlayers[peerId];
    delete mpRoundAnswered[peerId];
    delete mpRoundAcked[peerId];
    broadcast({ type: 'player-left', peerId });
    mpShowToast(`${name} left the game`);
    if (mpIsActive) {
        if (mpMode === 'race') {
            mpCheckAllAcked();  // unblock ack wait if disconnected guest was last to ack
        } else if (mpMode === 'compete' && Object.keys(mpPlayers).length > 0) {
            const allAnswered = Object.keys(mpPlayers).every(pid => mpRoundAnswered[pid]);
            if (allAnswered) setTimeout(mpAdvance, 900);
        }
    }
}

function mpGuestHandleHostDisconnect() {
    mpIsActive = false;
    canAnswer = false;
    mpShowToast('Host disconnected. Returning home…');
    setTimeout(closeLobby, 2000);
}

function mpUpdateLobbyList() {
    const list = document.getElementById('mp-player-list');
    list.innerHTML = Object.entries(mpPlayers).map(([pid, p]) => {
        const isMe = pid === mpMyPeerId;
        const color = mpPlayerColors[pid] || '#64748b';
        return `<li class="text-sm text-slate-300 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full inline-block" style="background:${color}"></span>
            ${p.name}${isMe ? ' (you)' : ''}
        </li>`;
    }).join('');
}

function mpSetStatus(text) {
    document.getElementById('mp-status-text').textContent = text;
}

function copyRoomCode() {
    const code = document.getElementById('mp-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-code');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
}

function mpShowToast(text) {
    let toast = document.getElementById('mp-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mp-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid #475569;color:#f8fafc;padding:8px 18px;border-radius:999px;font-size:0.8rem;z-index:500;opacity:0;transition:opacity 0.3s';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}