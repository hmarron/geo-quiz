// ─── Multiplayer networking: PeerJS, lobby UI, connections, message router ────

let mpPeer = null;
let mpConns = {};           // { peerId: DataConnection } — host has N-1, guest has 1
let mpIsHost = false;
let mpMode = null;          // 'race' | 'compete' | 'land-grab'
let mpIsActive = false;
let mpPlayers = {};         // { peerId: { name, score, wrong } }
let mpRoundAnswered = {};   // { peerId: bool }
let mpQuestionPool = [];    // Ordered ISO A3 codes (host-generated)
let mpQuestionIdx = 0;
let mpLocalName = 'You';
let mpMyPeerId = null;
let mpPlayerColors = {};    // { peerId: '#hex' }
let mpRoundAcked = {};      // { peerId: bool } — who has acked current question
let mpAckTimeout = null;    // timeout handle for ack wait

const MP_ACK_TIMEOUT_MS = 3000;
const MP_WINNER_WINDOW_MS = 300;

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

const MP_PREFIX = 'geoquiz-';

function mpNextColor() {
    const used = Object.keys(mpPlayerColors).length;
    return MP_COLOR_PALETTE[used % MP_COLOR_PALETTE.length];
}

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

// ─── Message router ───────────────────────────────────────────────────────────

function handleMpMessage(msg, fromId) {
    switch (msg.type) {
        case 'ready':
            if (!mpIsHost) return;
            mpPlayerColors[fromId] = mpNextColor();
            mpPlayers[fromId] = { name: msg.name || 'Guest', score: 0, wrong: 0 };
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

        case 'question':
            if (msg.remaining !== undefined) document.getElementById('remaining').innerText = msg.remaining;
            mpSetQuestion(msg.featureId);
            activeMode.onMessage(msg, fromId);  // CompeteMode renders immediately; RaceMode waits for 'go'
            break;

        case 'ack':
            mpHandleAck(fromId);
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

        // Route mode-specific messages to the active mode
        case 'go':
        case 'answered':
        case 'round-over':
        case 'land-grab-question':
        case 'land-grab-claimed':
        case 'land-grab-next':
        case 'land-grab-pool':
            activeMode.onMessage(msg, fromId);
            break;
    }
}

// ─── Host: advance to next question ──────────────────────────────────────────

function mpSetQuestion(featureId) {
    const feature = fullDataset.find(f => f.properties.ISO_A3 === featureId);
    if (!feature) return;
    currentTarget = feature;
    canAnswer = false;
    mpRaceResolved = false;
    if (!startTime) startTimer();
    if (!mpIsHost && mpMode === 'race') {
        sendToHost({ type: 'ack' });
    }
}

function mpAdvance() {
    if (!mpIsHost) return;
    if (mpQuestionIdx >= mpQuestionPool.length) {
        const results = Object.entries(mpPlayers).map(([pid, p]) => ({
            peerId: pid,
            name: p.name,
            score: p.score,
            wrong: p.wrong,
        }));
        results.forEach(r => {
            if (r.peerId === mpMyPeerId) { r.score = score; r.wrong = wrongCount; }
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
    mpSetQuestion(featureId);
    if (mpMode === 'compete') {
        renderQuestion();
    } else {
        mpAckTimeout = setTimeout(() => {
            mpAckTimeout = null;
            broadcast({ type: 'go' });
            renderQuestion();
        }, MP_ACK_TIMEOUT_MS);
        mpHandleAck(mpMyPeerId);
    }
}

function mpHandleAck(peerId) {
    if (!mpIsHost) return;
    mpRoundAcked[peerId] = true;
    mpCheckAllAcked();
}

function mpCheckAllAcked() {
    if (!mpAckTimeout) return;
    const allAcked = Object.keys(mpRoundAcked).every(pid => mpRoundAcked[pid]);
    if (allAcked) {
        clearTimeout(mpAckTimeout);
        mpAckTimeout = null;
        broadcast({ type: 'go' });
        renderQuestion();
    }
}

// ─── Game start / settings apply ─────────────────────────────────────────────

function mpApplySettings(msg) {
    mpMode = msg.mpMode;
    mpQuestionPool = msg.questionPool;
    mpQuestionIdx = 0;
    if (msg.mpMode === 'race') activeMode = RaceMode;
    else if (msg.mpMode === 'compete') activeMode = CompeteMode;
    else if (msg.mpMode === 'land-grab') activeMode = LandGrabMode;
    if (msg.mpMode === 'land-grab') {
        mpLandGrabPool = msg.questionPool.slice();
        mpLandGrabClaimed = {};
        mpLandGrabAssignments = {};
    }
    regions.forEach(r => { r.active = msg.regions.includes(r.id); });
    g.selectAll(".country")
        .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
        .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);
    gameMode = msg.gameMode;
    setMode(gameMode);
    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;
    if (msg.players) {
        Object.entries(msg.players).forEach(([pid, p]) => {
            const name = typeof p === 'object' ? p.name : p;
            const color = typeof p === 'object' ? p.color : null;
            mpPlayers[pid] = { name, score: 0, wrong: 0 };
            if (color) mpPlayerColors[pid] = color;
        });
        if (msg.players[mpMyPeerId]?.color) mpPlayerColors[mpMyPeerId] = msg.players[mpMyPeerId].color;
    }
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
    // Guests wait for first 'question' (or 'land-grab-question') message
}

function mpStartGame() {
    if (!mpIsHost) return;
    mpMode = document.getElementById('mp-mode-select').value;
    if (mpMode === 'race') activeMode = RaceMode;
    else if (mpMode === 'compete') activeMode = CompeteMode;
    else if (mpMode === 'land-grab') activeMode = LandGrabMode;

    regions.forEach(r => {
        const cb = document.getElementById(`mp-check-${r.id}`);
        if (cb) r.active = cb.checked;
    });
    g.selectAll(".country")
        .attr("class", d => isAllowed(d) ? "country" : "country country-excluded")
        .style("fill", d => isAllowed(d) ? COLOR_ACTIVE_FILL : COLOR_EXCLUDED_FILL);
    pool = fullDataset.filter(isAllowed);
    document.getElementById('remaining').innerText = pool.length;

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

    broadcast({
        type: 'game-start',
        gameMode,
        regions: regions.filter(r => r.active).map(r => r.id),
        mpMode,
        questionPool: mpQuestionPool,
        players: playerData,
    });

    document.getElementById('mp-lobby-modal').style.display = 'none';
    document.getElementById('start-screen').style.display = 'none';
    mpIsActive = true;
    score = 0; wrongCount = 0; hintCount = 0;
    startTime = null;
    document.getElementById('score').innerText = 0;
    document.getElementById('wrong-count').innerText = 0;
    document.getElementById('timer').textContent = '0:00';

    activeMode.start();
}

// ─── Finish modal, play again, view map ──────────────────────────────────────

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

// ─── Lobby / disconnect ───────────────────────────────────────────────────────

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
    activeMode = SoloMode;
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
            mpCheckAllAcked();
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

// ─── Lobby UI helpers ─────────────────────────────────────────────────────────

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
