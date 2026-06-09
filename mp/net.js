// ─── Multiplayer networking: PeerJS, lobby UI, connections, message router ────

let mpPeer = null;
let mpConns = {};           // { peerId: DataConnection } — host has N-1, guest has 1
let mpIsHost = false;
let mpMode = null;          // 'race' | 'compete' | 'land-grab'
let mpIsActive = false;
let mpPlayers = {};         // { peerId: { name, score, wrong } }
let mpRoundAnswered = {};   // { peerId: bool }
let mpQuestionPool = [];    // Ordered question IDs (host-generated)
let mpQuestionIdx = 0;      // Used by Race mode
let mpLocalName = 'You';
let mpMyPeerId = null;
let mpPlayerColors = {};    // { peerId: '#hex' }
let mpRoundAcked = {};      // { peerId: bool } — who has acked current question
let mpFinalAck = {};        // { peerId: bool } - who has acked the final round
let mpCompeteFinished = {}; // { peerId: bool } - who has finished in compete mode
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

const MP_PREFIX = 'quizler-';

function mpNextColor() {
    const used = Object.keys(mpPlayerColors).length;
    return MP_COLOR_PALETTE[used % MP_COLOR_PALETTE.length];
}

function mpGenCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function startMultiplayer(autoJoinCode) {
    init(() => {
        mpRenderLobbySettings();
        document.getElementById('mp-lobby-modal').style.display = 'flex';
        
        // Restore player name
        const savedName = localStorage.getItem('mp_player_name') || '';
        const nameInput = document.getElementById('mp-name-input');
        if (nameInput) nameInput.value = savedName;

        // Render recent rooms list
        mpRenderRecentRooms();

        if (autoJoinCode) {
            document.getElementById('mp-join-input').classList.remove('hidden');
            document.getElementById('mp-code-input').value = autoJoinCode;

            // Clean up the URL query parameters so page refresh doesn't trigger join again
            if (window.history.replaceState) {
                const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({ path: newUrl }, '', newUrl);
            }

            if (savedName) {
                // Auto connect if player name is saved
                joinRoom();
            } else {
                if (nameInput) nameInput.focus();
            }
        }
    });
}

function showJoinInput() {
    document.getElementById('mp-join-input').classList.remove('hidden');
    document.getElementById('mp-code-input').focus();
}

function createRoom() {
    mpLocalName = document.getElementById('mp-name-input').value.trim() || 'Player';
    localStorage.setItem('mp_player_name', mpLocalName);
    document.getElementById('btn-create-room').disabled = true;
    document.getElementById('btn-join-room').disabled = true;
    document.getElementById('mp-name-input').disabled = true;
    
    // Retrieve or generate persistent room code
    let code = localStorage.getItem('mp_host_room_code');
    if (!code) {
        code = mpGenCode();
        localStorage.setItem('mp_host_room_code', code);
    }
    
    mpIsHost = true;
    console.log(`[MP] Creating room with code: ${code}`);
    mpPeer = new Peer(MP_PREFIX + code, { debug: 3 });

    mpPeer.on('error', (err) => {
        console.error('[MP] PeerJS error:', err.type, err);
        if (err.type === 'unavailable-id') {
            console.warn('[MP] ID unavailable, generating a new room code and retrying...');
            const newCode = mpGenCode();
            localStorage.setItem('mp_host_room_code', newCode);
            
            mpPeer.destroy();
            mpPeer = null;
            mpIsHost = false;
            document.getElementById('btn-create-room').disabled = false;
            document.getElementById('btn-join-room').disabled = false;
            createRoom();
        } else {
            console.error('[MP] Fatal PeerJS error:', err);
        }
    });

    mpPeer.on('open', (id) => {
        console.log('[MP] Host Peer open. ID:', id);
        mpMyPeerId = id;
        mpPlayerColors[id] = mpNextColor();
        mpPlayers[id] = { name: mpLocalName, score: 0, wrong: 0 };
        document.getElementById('mp-code-display').classList.remove('hidden');
        
        const code = id.replace(MP_PREFIX, '');
        document.getElementById('mp-room-code').textContent = code;
        
        // Generate QR code for this room
        const url = window.location.origin + window.location.pathname + '?join=' + code;
        generateRoomQR(url);

        document.getElementById('mp-status').classList.remove('hidden');
        document.getElementById('mp-host-controls').classList.remove('hidden');
        mpUpdateLobbyList();
        mpSetStatus('Waiting for players to join…');
    });

    mpPeer.on('connection', (conn) => {
        console.log('[MP] Incoming connection from:', conn.peer);
        onGuestJoined(conn);
    });
}

function onGuestJoined(conn) {
    conn.on('open', () => {
        console.log('[MP] Connection open with guest:', conn.peer);
        mpConns[conn.peer] = conn;
        conn.on('data', (msg) => handleMpMessage(msg, conn.peer));
        conn.on('close', () => {
            console.log('[MP] Guest connection closed:', conn.peer);
            mpHandleDisconnect(conn.peer);
        });
        conn.on('error', (err) => {
            console.error('[MP] Guest connection error:', conn.peer, err);
            mpHandleDisconnect(conn.peer);
        });
    });
}

function joinRoom() {
    mpLocalName = document.getElementById('mp-name-input').value.trim() || 'Player';
    localStorage.setItem('mp_player_name', mpLocalName);
    const code = document.getElementById('mp-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;

    const connectBtn = document.querySelector('#mp-join-input button');
    const errEl = document.getElementById('mp-join-error');
    connectBtn.textContent = 'Connecting…';
    connectBtn.disabled = true;
    errEl.classList.add('hidden');
    document.getElementById('mp-name-input').disabled = true;

    function showJoinError(msg) {
        console.error('[MP] Join error:', msg);
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        connectBtn.textContent = 'Connect';
        connectBtn.disabled = false;
        document.getElementById('mp-name-input').disabled = false;
        if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    }

    mpIsHost = false;
    console.log(`[MP] Attempting to join room: ${code}`);
    mpPeer = new Peer({ debug: 3 });

    const timeout = setTimeout(() => {
        console.warn('[MP] Join attempt timed out after 10s');
        showJoinError('Timed out. Check the code and try again.');
    }, 10000);

    mpPeer.on('error', (err) => {
        clearTimeout(timeout);
        showJoinError('Connection error: ' + (err.message || err.type));
    });

    mpPeer.on('open', (id) => {
        console.log('[MP] Guest Peer open. ID:', id);
        mpMyPeerId = id;
        const hostId = MP_PREFIX + code;
        console.log(`[MP] Connecting to host: ${hostId}`);
        const conn = mpPeer.connect(hostId, {
            metadata: { name: mpLocalName },
            serialization: 'json',
            reliable: false
        });

        conn.on('error', (err) => {
            console.error('[MP] Connection object error:', err);
            clearTimeout(timeout);
            showJoinError('Could not find room. Check the code and try again.');
        });

        conn.on('open', () => {
            console.log('[MP] Connected to host!');
            clearTimeout(timeout);
            onConnectedToHost(conn);
        });
    });
}

function onConnectedToHost(conn) {
    mpConns[conn.peer] = conn;
    conn.on('data', (msg) => handleMpMessage(msg, conn.peer));
    conn.on('close', () => {
        console.log('[MP] Host connection closed');
        mpGuestHandleHostDisconnect();
    });
    conn.on('error', (err) => {
        console.error('[MP] Host connection error:', err);
        mpGuestHandleHostDisconnect();
    });
    console.log('[MP] Sending ready message to host');
    sendToHost({ type: 'ready', name: mpLocalName });
    const connectBtn = document.querySelector('#mp-join-input button');
    if (connectBtn) { connectBtn.textContent = 'Connected ✓'; connectBtn.disabled = true; }
    document.getElementById('mp-status').classList.remove('hidden');
    document.getElementById('mp-guest-waiting').classList.remove('hidden');
    mpSetStatus('Connected! Waiting for host to start…');
}

function broadcast(msg) {
    console.log('[MP] Broadcasting message:', msg.type, msg);
    Object.values(mpConns).forEach(c => { try { c.send(msg); } catch(e) { console.error(`[MP] Failed to send to ${c.peer}`, e); } });
}

function sendToHost(msg) {
    console.log('[MP] Sending message to host:', msg.type, msg);
    const conn = Object.values(mpConns)[0];
    if (conn) { try { conn.send(msg); } catch(e) { console.error('[MP] Failed to send to host', e); } }
    else { console.error('[MP] Cannot send to host: No connection found'); }
}

// ─── Message router ───────────────────────────────────────────────────────────

function handleMpMessage(msg, fromId) {
    console.log(`[MP] Received message: ${msg.type} from ${fromId}`, msg);
    switch (msg.type) {
        case 'ready':
            if (!mpIsHost) return;
            mpPlayerColors[fromId] = mpNextColor();
            mpPlayers[fromId] = { name: msg.name || 'Guest', score: 0, wrong: 0 };
            
            const welcomeMsg = {
                type: 'welcome',
                pluginId: activePlugin.id,
                players: Object.fromEntries(
                    Object.entries(mpPlayers).map(([pid, p]) => [pid, { name: p.name, color: mpPlayerColors[pid] }])
                )
            };

            // If it's a dynamic custom plugin, send config
            if (activePlugin.id.startsWith('custom-csv-') && activePlugin instanceof CSVQuizPlugin) {
                welcomeMsg.config = {
                    id: activePlugin.id,
                    name: activePlugin.name,
                    title: activePlugin.title,
                    subtitle: activePlugin.subtitle,
                    csvRaw: activePlugin.csvRaw,
                    csvUrl: activePlugin.csvUrl,
                    mapping: activePlugin.mapping
                };
            }

            try {
                mpConns[fromId].send(welcomeMsg);
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

            // Save to recent rooms list
            const hostId = Object.keys(mpConns)[0];
            if (hostId) {
                const hostName = msg.players[hostId]?.name || 'Host';
                const roomCode = hostId.replace(MP_PREFIX, '');
                mpSaveRecentRoom(roomCode, hostName);
            }

            if (msg.pluginId && (!activePlugin || activePlugin.id !== msg.pluginId)) {
                changePlugin(msg.pluginId).then(() => {
                    mpUpdateLobbyList();
                });
            } else {
                mpUpdateLobbyList();
            }
            break;

        case 'plugin-change':
            if (msg.pluginId && (!activePlugin || activePlugin.id !== msg.pluginId)) {
                changePlugin(msg.pluginId).then(() => {
                    mpUpdateLobbyList();
                    showToast(`Host changed quiz to ${activePlugin.name}`);
                });
            }
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
            mpSetQuestion(msg.itemId);
            activeMode.onMessage(msg, fromId);
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
            delete mpConns[msg.peerId];
            delete mpPlayers[msg.peerId];
            delete mpRoundAnswered[msg.peerId];
            delete mpRoundAcked[msg.peerId];
            broadcast({ type: 'player-left', peerId: msg.peerId });
            showToast(`${leftName} left the game`);
            if (mpIsActive) {
                if (mpMode === 'race') {
                    mpCheckAllAcked();
                } else if (mpMode === 'compete') {
                    if (mpCompeteFinished[msg.peerId]) delete mpCompeteFinished[msg.peerId];
                    const allDone = Object.keys(mpPlayers).every(pid => mpCompeteFinished[pid]);
                    if (allDone && Object.keys(mpPlayers).length > 0) {
                        const results = Object.entries(mpPlayers).map(([pid, p]) => ({
                            peerId: pid, name: p.name, score: p.score, wrong: p.wrong,
                        }));
                        results.sort((a, b) => b.score - a.score);
                        broadcast({ type: 'game-over', results });
                        showMpFinishModal(results);
                    }
                }
            }
            break;
        }

        // Route mode-specific messages to the active mode
        case 'go':
        case 'answered':
        case 'round-over':
        case 'final-round-processed':
        case 'finished-compete':
        case 'land-grab-question':
        case 'land-grab-claimed':
        case 'land-grab-next':
        case 'land-grab-pool':
            activeMode.onMessage(msg, fromId);
            break;
    }
}

// ─── Host: advance to next question ──────────────────────────────────────────

function mpSetQuestion(itemId) {
    const item = activePlugin.getItemById(itemId);
    if (!item) return;
    currentTarget = item;
    canAnswer = false;
    mpRaceResolved = false;
    if (!startTime) startTimer();
    if (!mpIsHost && mpMode === 'race') {
        sendToHost({ type: 'ack' });
    }
}

function mpAdvance() {
    if (!mpIsHost) return;

    // This function is now only used for Race mode's lock-step progression.
    if (mpMode !== 'race') {
        return;
    }

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
    const itemId = mpQuestionPool[mpQuestionIdx];
    mpQuestionIdx++;
    mpRoundAnswered = {};
    Object.keys(mpPlayers).forEach(pid => { mpRoundAnswered[pid] = false; });
    mpRaceResolved = false;
    mpRoundAcked = {};
    Object.keys(mpPlayers).forEach(pid => { mpRoundAcked[pid] = false; });
    mpCorrectAnswers = [];
    const remaining = mpQuestionPool.length - mpQuestionIdx;
    document.getElementById('remaining').innerText = remaining;
    broadcast({ type: 'question', itemId, remaining });
    mpSetQuestion(itemId);
    
    // Race mode waits for acks before rendering question via 'go' message
    mpAckTimeout = setTimeout(() => {
        mpAckTimeout = null;
        broadcast({ type: 'go' });
        renderQuestion();
    }, MP_ACK_TIMEOUT_MS);
    mpHandleAck(mpMyPeerId);
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
    const startRestOfGame = () => {
        mpMode = msg.mpMode;
        mpQuestionPool = msg.questionPool;
        mpQuestionIdx = 0;
        activeMode = Registry.getMode(msg.mpMode);
        
        activeSettings.filters = msg.settings.filters;
        activeSettings.showBorders = msg.settings.showBorders;
        activeSettings.gameMode = msg.settings.gameMode;
        
        if (typeof activePlugin.updateSettings === 'function') {
            activePlugin.updateSettings(activeSettings);
        }
        
        pool = activePlugin.generateQuestionPool(activeSettings);
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
        
        activeMode.start();
    };

    if (msg.pluginId && (!activePlugin || activePlugin.id !== msg.pluginId)) {
        if (msg.config) {
            const customPlugin = new CSVQuizPlugin(msg.config);
            Registry.registerPlugin(customPlugin);
        }
        changePlugin(msg.pluginId).then(startRestOfGame);
    } else {
        startRestOfGame();
    }
}

function mpStartGame() {
    if (!mpIsHost) return;
    mpMode = document.getElementById('mp-mode-select').value;
    activeMode = Registry.getMode(mpMode);

    if (activeSettings.filters) {
        for (const filterId in activeSettings.filters) {
            const filterCheckbox = document.getElementById(`mp-check-${filterId}`);
            if (filterCheckbox) {
                activeSettings.filters[filterId] = filterCheckbox.checked;
            }
        }
    }
    applyActiveSettings();

    const questionPoolItems = activePlugin.generateQuestionPool(activeSettings);
    const shuffled = questionPoolItems.slice().sort(() => Math.random() - 0.5);
    mpQuestionPool = shuffled.map(item => activePlugin.getItemId(item)).filter(Boolean);
    mpQuestionIdx = 0;

    const playerData = {};
    Object.entries(mpPlayers).forEach(([pid, p]) => {
        playerData[pid] = { name: p.name, color: mpPlayerColors[pid] };
    });

    const gameStartMsg = {
        type: 'game-start',
        pluginId: activePlugin.id,
        settings: activeSettings,
        mpMode,
        questionPool: mpQuestionPool,
        players: playerData,
    };

    // If it's a dynamic custom plugin, send config
    if (activePlugin.id.startsWith('custom-csv-') && activePlugin instanceof CSVQuizPlugin) {
        gameStartMsg.config = {
            id: activePlugin.id,
            name: activePlugin.name,
            title: activePlugin.title,
            subtitle: activePlugin.subtitle,
            csvRaw: activePlugin.csvRaw,
            mapping: activePlugin.mapping
        };
    }

    broadcast(gameStartMsg);

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
    
    // Clear any remaining highlights
    if (activePlugin && typeof activePlugin.clearHighlights === 'function') {
        activePlugin.clearHighlights();
    }

    const pluginResultsContainer = document.getElementById('plugin-mp-results');
    if (pluginResultsContainer && activePlugin && typeof activePlugin.renderResultView === 'function') {
        activePlugin.renderResultView(pluginResultsContainer);
    } else if (pluginResultsContainer) {
        pluginResultsContainer.innerHTML = '';
    }

    const pluginActionsContainer = document.getElementById('plugin-mp-actions');
    if (pluginActionsContainer && activePlugin && typeof activePlugin.renderResultActions === 'function') {
        activePlugin.renderResultActions(pluginActionsContainer);
    } else if (pluginActionsContainer) {
        pluginActionsContainer.innerHTML = '';
    }

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
    mpFinalAck = {};
    mpCompeteFinished = {};
    mpQuestionPool = [];
    mpQuestionIdx = 0;
    mpMyPeerId = null;
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
    
    // Reset QR display state
    const qrContainer = document.getElementById('mp-qr-container');
    if (qrContainer) qrContainer.classList.add('hidden');
    const toggleBtn = document.getElementById('btn-toggle-qr');
    if (toggleBtn) toggleBtn.textContent = 'Show QR Code';
    const qrDiv = document.getElementById('mp-qrcode');
    if (qrDiv) qrDiv.innerHTML = '';

    document.getElementById('start-screen').style.display = 'flex';
    if (typeof activePlugin.updateSettings === 'function') {
        activePlugin.updateSettings(activeSettings);
    }
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
    showToast(`${name} left the game`);
    if (mpIsActive) {
        if (mpMode === 'race') {
            mpCheckAllAcked();
            if (Object.keys(mpFinalAck).length > 0) {
                const allAcked = Object.keys(mpPlayers).every(pid => mpFinalAck[pid]);
                if (allAcked) mpAdvance();
            }
        } else if (mpMode === 'land-grab') {
            if (Object.keys(mpFinalAck).length > 0) {
                const allAcked = Object.keys(mpPlayers).every(pid => mpFinalAck[pid]);
                if (allAcked) LandGrabMode.endGame();
            }
        } else if (mpMode === 'compete') {
            if (mpCompeteFinished[peerId]) delete mpCompeteFinished[peerId];
            const allDone = Object.keys(mpPlayers).every(pid => mpCompeteFinished[pid]);
            if (allDone && Object.keys(mpPlayers).length > 0) {
                const results = Object.entries(mpPlayers).map(([pid, p]) => ({
                    peerId: pid, name: p.name, score: p.score, wrong: p.wrong,
                }));
                results.sort((a, b) => b.score - a.score);
                broadcast({ type: 'game-over', results });
                showMpFinishModal(results);
            }
        }
    }
}

function mpGuestHandleHostDisconnect() {
    mpIsActive = false;
    canAnswer = false;
    showToast('Host disconnected. Returning home…');
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
    
    // Refresh mode selector or lobby UI
    mpUpdateLobbyModes();
}

function mpUpdateLobbyModes() {
    const select = document.getElementById('mp-mode-select');
    if (!select) return;
    
    const supportedModes = Registry.getModesForPlugin(activePlugin.id).filter(m => m.isMultiplayer);
    const currentVal = select.value;
    
    select.innerHTML = supportedModes.map(m => `
        <option value="${m.id}">${m.name}</option>
    `).join('');
    
    if (supportedModes.some(m => m.id === currentVal)) {
        select.value = currentVal;
    }
}

function mpSetStatus(text) {
    document.getElementById('mp-status-text').textContent = text;
}

function copyRoomCode() {
    const code = document.getElementById('mp-room-code').textContent;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showToast('Clipboard copy not supported in this browser/context');
        return;
    }
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-code');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }).catch(err => {
        console.error('Failed to copy room code:', err);
        showToast('Failed to copy room code');
    });
}

function shareRoomLink() {
    const code = document.getElementById('mp-room-code').textContent;
    const url = window.location.origin + window.location.pathname + '?join=' + code;
    
    if (navigator.share) {
        navigator.share({
            title: 'Geography Challenge Quiz',
            text: `Join my geography challenge quiz game! Room code: ${code}`,
            url: url
        }).catch(err => {
            console.error('Error sharing room link:', err);
            // Fallback to clipboard if share was cancelled or failed
            copyRoomLinkToClipboard(url);
        });
    } else {
        copyRoomLinkToClipboard(url);
    }
}

function copyRoomLinkToClipboard(url) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showToast('Clipboard copy not supported in this browser/context');
        return;
    }
    navigator.clipboard.writeText(url).then(() => {
        showToast('Room link copied to clipboard!');
        const btn = document.getElementById('btn-share-link');
        if (btn) {
            btn.textContent = 'Copied Link!';
            setTimeout(() => { btn.textContent = 'Share Link'; }, 1500);
        }
    }).catch(err => {
        console.error('Failed to copy room link:', err);
        showToast('Failed to copy room link');
    });
}

let mpQrCodeInstance = null;

function generateRoomQR(url) {
    const qrDiv = document.getElementById('mp-qrcode');
    if (!qrDiv) return;
    
    // Clear any previous QR code
    qrDiv.innerHTML = '';
    
    if (typeof QRCode === 'undefined') {
        console.warn('QRCode library not loaded yet');
        qrDiv.textContent = 'Failed to load QR code generator';
        return;
    }
    
    try {
        mpQrCodeInstance = new QRCode(qrDiv, {
            text: url,
            width: 140,
            height: 140,
            colorDark : "#0f172a", // Slate-900 for dark color
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });
    } catch (err) {
        console.error('Failed to generate QR Code:', err);
        qrDiv.textContent = 'Error generating QR Code';
    }
}

function toggleRoomQR() {
    const container = document.getElementById('mp-qr-container');
    const toggleBtn = document.getElementById('btn-toggle-qr');
    if (!container || !toggleBtn) return;
    
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        toggleBtn.textContent = 'Hide QR Code';
        
        // Ensure QR is generated
        const code = document.getElementById('mp-room-code').textContent;
        const url = window.location.origin + window.location.pathname + '?join=' + code;
        generateRoomQR(url);
    } else {
        container.classList.add('hidden');
        toggleBtn.textContent = 'Show QR Code';
    }
}

function mpSaveRecentRoom(code, hostName) {
    let recents = [];
    try {
        recents = JSON.parse(localStorage.getItem('mp_recent_rooms') || '[]');
    } catch(e) {}
    
    // Filter out if this room code already exists
    recents = recents.filter(r => r.code !== code);
    
    // Add to start of list
    recents.unshift({
        code: code,
        hostName: hostName,
        timestamp: Date.now()
    });
    
    // Keep top 5
    recents = recents.slice(0, 5);
    
    localStorage.setItem('mp_recent_rooms', JSON.stringify(recents));
    mpRenderRecentRooms();
}

function mpRenderRecentRooms() {
    const container = document.getElementById('mp-recent-rooms-container');
    const list = document.getElementById('mp-recent-rooms-list');
    if (!container || !list) return;
    
    let recents = [];
    try {
        recents = JSON.parse(localStorage.getItem('mp_recent_rooms') || '[]');
    } catch(e) {}
    
    if (recents.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    list.innerHTML = recents.map(room => {
        return `
            <button onclick="mpSelectRecentRoom('${room.code}')" class="flex items-center justify-between w-full bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 hover:border-blue-500/50 px-3 py-2 rounded-lg text-left transition-all group">
                <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-200 group-hover:text-blue-400 transition-colors">${escapeHtml(room.hostName)}'s Room</span>
                    <span class="text-[10px] text-slate-400 font-mono tracking-wider">${room.code}</span>
                </div>
                <div class="text-[10px] text-slate-500 group-hover:text-blue-400 transition-colors font-bold flex items-center gap-1">
                    Quick Join →
                </div>
            </button>
        `;
    }).join('');
}

function mpSelectRecentRoom(code) {
    const codeInput = document.getElementById('mp-code-input');
    if (codeInput) {
        codeInput.value = code;
        joinRoom();
    }
}

function clearRecentRooms() {
    localStorage.removeItem('mp_recent_rooms');
    mpRenderRecentRooms();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
