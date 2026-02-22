// ─── MP Land Grab mode object ─────────────────────────────────────────────────

const LandGrabMode = {
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

    assignNext(peerId, wrongIso = null) {
        if (wrongIso) this.pool.push(wrongIso);

        if (this.pool.length > 0) {
            const idx = Math.floor(Math.random() * this.pool.length);
            const iso = this.pool[idx];
            this.pool.splice(idx, 1);
            this.assignments[peerId] = iso;

            const remaining = this.pool.length;
            document.getElementById('remaining').innerText = remaining;
            broadcast({ type: 'land-grab-pool', remaining });

            this.sendAssignment(peerId, iso, remaining);
            return;
        }

        const raceTargets = Object.entries(this.assignments)
            .filter(([pid, iso]) => pid !== peerId && iso !== null && !this.claimed[iso])
            .map(([, iso]) => iso);

        if (raceTargets.length > 0) {
            const iso = raceTargets[Math.floor(Math.random() * raceTargets.length)];
            this.assignments[peerId] = iso;
            this.sendAssignment(peerId, iso, 0);
            return;
        }

        this.assignments[peerId] = null;
    },

    sendAssignment(peerId, iso, remaining) {
        if (peerId === mpMyPeerId) {
            currentTarget = activePlugin.getItemById(iso) || null;
            renderQuestion();
        } else {
            const conn = mpConns[peerId];
            if (conn) try { conn.send({ type: 'land-grab-next', iso, remaining }); } catch(e) {}
        }
    },

    claim(peerId, iso) {
        if (this.claimed[iso]) return false;

        this.claimed[iso] = peerId;
        if (peerId !== mpMyPeerId && mpPlayers[peerId]) mpPlayers[peerId].score++;
        const playerScore = peerId === mpMyPeerId ? score : mpPlayers[peerId].score;
        
        const isLastClaim = Object.keys(this.claimed).length === mpQuestionPool.length;

        if (typeof activePlugin.colorItem === 'function') {
            activePlugin.colorItem(iso, mpPlayerColors[peerId]);
        }

        broadcast({ type: 'land-grab-claimed', peerId, iso, isLast: isLastClaim });
        broadcast({ type: 'player-score', peerId, score: playerScore,
            wrong: peerId === mpMyPeerId ? wrongCount : mpPlayers[peerId]?.wrong ?? 0 });

        Object.entries(this.assignments).forEach(([pid, assignedIso]) => {
            if (pid !== peerId && assignedIso === iso) {
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
        const iso = activePlugin.getItemId(currentTarget);
        canAnswer = false;

        if (correct) {
            score++;
            document.getElementById('score').innerText = score;
            activePlugin.showOverlay(targetName, true);
            if (mpIsHost) this.claim(mpMyPeerId, iso);
        } else {
            wrongCount++;
            document.getElementById('wrong-count').innerText = wrongCount;
            activePlugin.showOverlay(targetName, false);
        }

        if (mpIsHost) {
            setTimeout(() => this.assignNext(mpMyPeerId, correct ? null : iso), correct ? 700 : 800);
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
                    this.claim(fromId, msg.iso);
                }
                setTimeout(() => this.assignNext(fromId, msg.correct ? null : msg.iso), msg.correct ? 700 : 800);
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
                this.claimed[msg.iso] = msg.peerId;
                if (typeof activePlugin.colorItem === 'function') {
                    activePlugin.colorItem(msg.iso, mpPlayerColors[msg.peerId]);
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

