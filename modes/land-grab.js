// ─── MP Land Grab mode object ─────────────────────────────────────────────────

const LandGrabMode = {
    name: 'Land Grab',
    isMultiplayer: true,
    pool: [],
    claimed: {},
    assignments: {},

    endGame() {
        const results = Object.entries(mpPlayers).map(([pid, p]) => ({
            peerId: pid, name: p.name, score: p.score, wrong: p.wrong,
        }));
        results.forEach(r => { if (r.peerId === mpMyPeerId) { r.score = score; r.wrong = wrongCount; } });
        results.sort((a, b) => b.score - a.score);
        broadcast({ type: 'game-over', results });
        showMpFinishModal(results);
    },

    advance() {
        if (!mpIsHost) return;
        if (!startTime) startTimer();
        Object.keys(mpPlayers).forEach(pid => this.assignNext(pid));
    },

    assignNext(peerId, wrongItemId = null) {
        if (wrongItemId) this.pool.push(wrongItemId);

        if (this.pool.length > 0) {
            const idx = Math.floor(Math.random() * this.pool.length);
            const itemId = this.pool[idx];
            this.pool.splice(idx, 1);
            this.assignments[peerId] = itemId;

            const remaining = this.pool.length;
            document.getElementById('remaining').innerText = remaining;
            broadcast({ type: 'land-grab-pool', remaining });

            this.sendAssignment(peerId, itemId, remaining);
            return;
        }

        const raceTargets = Object.entries(this.assignments)
            .filter(([pid, itemId]) => pid !== peerId && itemId !== null && !this.claimed[itemId])
            .map(([, itemId]) => itemId);

        if (raceTargets.length > 0) {
            const itemId = raceTargets[Math.floor(Math.random() * raceTargets.length)];
            this.assignments[peerId] = itemId;
            this.sendAssignment(peerId, itemId, 0);
            return;
        }

        this.assignments[peerId] = null;
    },

    sendAssignment(peerId, itemId, remaining) {
        if (peerId === mpMyPeerId) {
            currentTarget = activePlugin.getItemById(itemId) || null;
            renderQuestion();
        } else {
            const conn = mpConns[peerId];
            if (conn) try { conn.send({ type: 'land-grab-next', itemId, remaining }); } catch(e) {}
        }
    },

    claim(peerId, itemId) {
        if (this.claimed[itemId]) return false;

        this.claimed[itemId] = peerId;
        if (peerId !== mpMyPeerId && mpPlayers[peerId]) mpPlayers[peerId].score++;
        const playerScore = peerId === mpMyPeerId ? score : mpPlayers[peerId].score;
        
        const isLastClaim = Object.keys(this.claimed).length === mpQuestionPool.length;

        if (typeof activePlugin.colorItem === 'function') {
            activePlugin.clearHighlights(); // Clear the yellow highlight from the item being claimed
            activePlugin.colorItem(itemId, mpPlayerColors[peerId]);
        }

        broadcast({ type: 'land-grab-claimed', peerId, itemId, isLast: isLastClaim });
        broadcast({ type: 'player-score', peerId, score: playerScore,
            wrong: peerId === mpMyPeerId ? wrongCount : mpPlayers[peerId]?.wrong ?? 0 });

        Object.entries(this.assignments).forEach(([pid, assignedItemId]) => {
            if (pid !== peerId && assignedItemId === itemId) {
                this.assignNext(pid);
            }
        });

        if (isLastClaim) {
            mpFinalAck = {};
            mpFinalAck[mpMyPeerId] = true;
            if (Object.keys(mpPlayers).every(pid => mpFinalAck[pid])) {
                this.endGame();
            }
        }

        return true;
    },

    onAnswer(correct) {
        const targetName = activePlugin.getCorrectAnswer(currentTarget);
        const itemId = activePlugin.getItemId(currentTarget);
        canAnswer = false;

        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
            activePlugin.showOverlay(targetName, true);
            if (mpIsHost) this.claim(mpMyPeerId, itemId);
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            activePlugin.showOverlay(targetName, false);
        }

        if (mpIsHost) {
            setTimeout(() => this.assignNext(mpMyPeerId, correct ? null : itemId), correct ? 700 : 800);
        } else {
            sendToHost({ type: 'answered', correct, itemId });
        }
    },

    onDone() {},
    onReset() {},
    onHome() { mpGoHome(); },

    onMessage(msg, fromId) {
        switch (msg.type) {
            case 'answered': {
                if (!mpIsHost) return;
                if (msg.correct && msg.itemId) {
                    this.claim(fromId, msg.itemId);
                }
                setTimeout(() => this.assignNext(fromId, msg.correct ? null : msg.itemId), msg.correct ? 700 : 800);
                break;
            }

            case 'land-grab-next': {
                document.getElementById('remaining').innerText = msg.remaining;
                if (!startTime) startTimer();
                const item = msg.itemId ? activePlugin.getItemById(msg.itemId) : null;
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
                this.claimed[msg.itemId] = msg.peerId;
                if (typeof activePlugin.colorItem === 'function') {
                    activePlugin.colorItem(msg.itemId, mpPlayerColors[msg.peerId]);
                }
                if (msg.isLast && !mpIsHost) {
                    sendToHost({ type: 'final-round-processed' });
                }
                break;

            case 'final-round-processed': {
                if (!mpIsHost) return;
                mpFinalAck[fromId] = true;
                const allAcked = Object.keys(mpPlayers).every(pid => mpFinalAck[pid]);
                if (allAcked) {
                    this.endGame();
                }
                break;
            }
        }
    },

    start() {
        this.pool = mpQuestionPool.slice();
        this.claimed = {};
        this.assignments = {};
        this.advance();
    },
};

// Register with the global Registry
if (typeof Registry !== 'undefined') {
    Registry.registerMode('land-grab', LandGrabMode);
}

