# Geo Quiz — Architecture

A browser-based geography quiz with solo and peer-to-peer multiplayer. No server, no build step — plain JS files loaded via `<script>` tags in dependency order.

---

## Tech stack

| Layer | Library |
|---|---|
| Architecture | Plugin-based (e.g. `GeoQuizPlugin`) |
| Map rendering | D3 v7 (SVG, geoMercator, zoom) — managed by plugin |
| Styling | Tailwind CSS (CDN) |
| Multiplayer | PeerJS v1 (WebRTC, no signalling server needed) |
| Data | Natural Earth 50m GeoJSON fetched from GitHub at runtime |
| Offline | Service worker (`sw.js`) |

---

## File structure and script load order

Scripts are loaded in dependency order — later files can call functions defined in earlier ones.

```
utils.js          pure functions (formatTime)
plugins/geo-quiz.js GeoQuizPlugin class (D3 setup, map rendering, quiz logic)
settings.js       activeSettings object, UI for settings
scores.js         localStorage, finish/scores modals
quiz.js           renderQuestion(), nextQuestion(), thin layer over plugin
modes/solo.js     SoloMode object
modes/race.js     RaceMode object
modes/compete.js  CompeteMode object
modes/land-grab.js LandGrabMode object
mp/net.js         PeerJS, lobby, message router, mpAdvance()
app.js            init(), timer, activeMode, startSinglePlayer(), PWA
```

`index.html` contains all the markup. No templates, no framework.
`style.css` provides base styles and key classes (`.country`, `.country-highlight`, `.country-excluded`, `.mode-btn-active`, modals).
`sw.js` is registered from an inline `<script>` tag after all app scripts.

---

## Global state — what lives where

Everything is `var`/`let` at module scope (i.e. global in the browser).

### app.js
```
activePlugin                   — instance of GeoQuizPlugin
activeMode                     — current mode object (SoloMode | RaceMode | CompeteMode | LandGrabMode)
score, wrongCount, hintCount   — current game counters
startTime, timerInterval       — wall-clock timer
dataReady, dataLoading         — init() guard flags
```

### quiz.js
```
pool           — array of items still to be answered (solo only)
currentTarget  — the item currently being asked about
canAnswer      — bool; gates handleCorrect/Wrong to prevent double-submission
```

### settings.js
```
activeSettings — { gameMode, showBorders, regions: { id: bool } }
```

### plugins/geo-quiz.js
```
fullDataset — all GeoJSON features (loaded once)
svg, g, projection, path, zoom — D3 primitives
COLOR_ACTIVE_FILL, COLOR_BORDER, COLOR_EXCLUDED_FILL — fill constants
```

### race.js
```
mpRaceResolved       — bool; prevents double-resolving a round
mpCorrectAnswers     — [{ peerId, ts }] collected during winner window
mpWinnerWindowTimer  — timeout handle
```

### land-grab.js
```
LandGrabMode.pool         — ID strings not yet assigned
LandGrabMode.claimed      — { id: peerId } claimed territories
LandGrabMode.assignments  — { peerId: id | null } current assignment per player
```

### mp/net.js
```
mpPeer, mpConns       — PeerJS peer and connection map { peerId: DataConnection }
mpIsHost              — bool
mpMode                — 'race' | 'compete' | 'land-grab'
mpIsActive            — bool; true while a multiplayer game is running
mpPlayers             — { peerId: { name, score, wrong } }
mpPlayerColors        — { peerId: '#hex' }
mpMyPeerId            — local peer id
mpLocalName           — local player name
mpRoundAnswered       — { peerId: bool }
mpRoundAcked          — { peerId: bool }
mpAckTimeout          — timeout handle for ack wait
mpQuestionPool        — ordered ID array for game session
mpQuestionIdx         — next index into mpQuestionPool
```

---

## The `activeMode` interface

`activeMode` (declared in app.js, defaulting to `SoloMode`) is the central dispatch point. The quiz engine calls into it; it never checks which mode is active itself.

```js
{
  onAnswer(correct)   // called by handleCorrect() / handleWrong() in quiz.js
  onDone()            // called by nextQuestion() when pool is empty (solo only)
  onReset()           // called by resetGame() — button ↺ in header
  onHome()            // called by goHome() — button ⌂ in header
  onMessage(msg, fromId)  // MP only; called by net.js for mode-specific messages
  start()             // MP only; called by mpStartGame() to kick off first round
}
```

`startSinglePlayer()` → sets `activeMode = SoloMode`
`mpStartGame()` / `mpApplySettings()` → sets `activeMode = RaceMode | CompeteMode | LandGrabMode`
`closeLobby()` → resets `activeMode = SoloMode`

---

## Data flow — single player

```
startSinglePlayer()
  → activeMode = SoloMode
  → init(cb)
      activePlugin.loadScripts()  (e.g. D3)
      activePlugin.loadData()     (e.g. GeoJSON)
      activePlugin.renderQuizView() (D3 setup)
      activePlugin.bindUIEvents() (Zoom controls)
      toggleSettings()

nextQuestion()
  pool empty? → activeMode.onDone() → SoloMode.onDone() → showFinishModal()
  else: picks random item from pool, sets currentTarget, calls renderQuestion()

renderQuestion()
  sets canAnswer = true
  activePlugin.displayQuestion(currentTarget) (highlights and zooms map)
  hard mode: shows text input, hides options
  easy mode: hides input, generates choices via activePlugin.generateChoices()

user answers →
  handleCorrect() / handleWrong()
  → activeMode.onAnswer(correct) → SoloMode.onAnswer()
      updates score/wrongCount, shows overlay for 600ms via activePlugin.showOverlay()
      removes item from pool
      setTimeout(nextQuestion, 700|800)
```

**Answer checking (hard mode)**:
`checkTypedAnswer()` runs on Enter. It delegates to `activePlugin.checkTypedAnswer()`, which:
1. Normalises the guess (lowercase, strip accents/punctuation)
2. Checks exact match or substring match against acceptable names
3. Falls back to Levenshtein distance ≤ 2 (≤ 1 for short names) against the primary name

---

## Multiplayer architecture

### Host/guest model

One player is the **host** (`mpIsHost = true`). All game logic runs on the host. Guests send their answers to the host; the host processes them and broadcasts state updates. There is no server — PeerJS uses WebRTC with a free public TURN/STUN setup.

```
Guest A ──answered──▶ Host ──round-over──▶ Guest A
Guest B ──answered──▶ Host ──round-over──▶ Guest B
                        └──player-score──▶ all
```

### Connection setup

1. Host: `createRoom()` → `new Peer(MP_PREFIX + code)` → displays 6-char room code
2. Guest: `joinRoom()` → `new Peer()` (random id) → `peer.connect(MP_PREFIX + code)`
3. On connection: guest sends `{ type: 'ready', name }` → host sends `welcome` with full player list
4. Host broadcasts `player-joined` to other guests

### Starting a game

1. Host clicks Start → `mpStartGame()`:
   - Reads mode from dropdown, reads region checkboxes
   - Shuffles `activePlugin.generateQuestionPool()` → `mpQuestionPool` (ordered ID strings)
   - Sets `activeMode = RaceMode | CompeteMode | LandGrabMode`
   - Broadcasts `game-start` with settings + question pool + player list
   - Calls `activeMode.start()`

2. Guests receive `game-start` → `mpApplySettings()`:
   - Sets mpMode, activeMode, mpQuestionPool
   - Applies settings via `activePlugin.updateSettings()`
   - Hides lobby, sets mpIsActive = true
   - Waits for first question message

### Message routing (`handleMpMessage` in net.js)

Lobby/infrastructure messages handled directly in net.js:
- `ready`, `welcome`, `player-joined` — lobby player list
- `game-start` → `mpApplySettings()`
- `question` → `mpSetQuestion(itemId)` then `activeMode.onMessage(msg)`
- `ack` → `mpHandleAck(fromId)`
- `score-update`, `player-score` — score relay
- `game-over` → `showMpFinishModal()`
- `player-left` — disconnect cleanup

Mode-specific messages are routed to `activeMode.onMessage(msg, fromId)`:
```
'go', 'answered', 'round-over', 'land-grab-question', 'land-grab-claimed', 'land-grab-next', 'land-grab-pool'
```

---

## Multiplayer modes in detail

### Race mode

All players see the same question simultaneously. First correct answer wins the round and their color is painted on that country.

**Round flow (host):**
```
mpAdvance()
  pick next from mpQuestionPool
  reset mpRoundAnswered, mpRaceResolved, mpCorrectAnswers
  broadcast { type:'question', featureId }   → guests send 'ack' back
  mpHandleAck(mpMyPeerId)                    → host counts itself
  when all acked (or timeout 3s): broadcast 'go', call renderQuestion()

player answers correctly:
  host: push to mpCorrectAnswers, start MP_WINNER_WINDOW_MS (300ms) timer
  guest: send { type:'answered', correct:true, ts }

after winner window:
  mpResolveRound(winner)
    broadcast { type:'round-over', winner, featureId }
    paint winner's color on country
    setTimeout(mpAdvance, 1200)

all wrong: mpResolveRound(null) — round ends with no winner, country uncolored
```

**Ack protocol:** The host waits for all guests to acknowledge receiving each question before showing it. This prevents fast hosts from rendering before slow-loading guests. Timeout at 3s as fallback.

**Winner window (300ms):** Collects simultaneous correct answers and picks the one with the earliest timestamp, mitigating host advantage from local processing.

### Compete (High Score) mode

All players see the same question. Each player answers in their own time. Round ends when everyone has answered. Score is cumulative — no country coloring.

**Round flow (host):**
```
mpAdvance()
  broadcast { type:'question', featureId }   → CompeteMode.onMessage → renderQuestion() immediately (no ack)
  host renders immediately too

player answers:
  host: mark mpRoundAnswered[pid], broadcast player-score
  guest: send { type:'answered', correct, score, wrong }
  when all answered: setTimeout(mpAdvance, 900)
```

### Land Grab mode

Players are assigned different countries simultaneously and answer at their own pace. Correctly answered country is painted in the player's color. **Continuous model** — no round synchronisation.

**Game flow:**
```
mpLandGrabAdvance()  [called once at game start]
  assigns each player their first question via mpLandGrabAssignNext(pid)

mpLandGrabAssignNext(peerId)
  pick random country from mpLandGrabPool, remove it
  if host's turn: set currentTarget, call renderQuestion()
  if guest's turn: send { type:'land-grab-next', iso, remaining } directly to that connection
  broadcast { type:'land-grab-pool', remaining } to update everyone's counter

player answers correctly:
  host: mpLandGrabClaim(pid, iso) — records claim, colors country, broadcasts land-grab-claimed
  guest: send { type:'answered', correct:true, iso }
  after 700ms delay: mpLandGrabAssignNext(pid) → next question immediately

player answers wrong:
  country is abandoned (already removed from pool at assignment time)
  after 800ms delay: mpLandGrabAssignNext(pid) → next question immediately

pool empty when assigning:
  mpLandGrabAssignments[pid] = null
  mpLandGrabCheckAllDone() — ends game if all active players are null

game over:
  broadcast game-over with results sorted by score
  showMpFinishModal()
```

**Key design:** countries are removed from pool when *assigned*, not when claimed. Wrong answers lose the country permanently. The "remaining" counter decreases monotonically.

---

## Map rendering

Map rendering is encapsulated within the plugin (e.g., `GeoQuizPlugin.renderQuizView()`).

The Geography Quiz uses `ne_50m_admin_0_countries.geojson` from Natural Earth (fetched once, cached by service worker).

| CSS class | fill | meaning |
|---|---|---|
| `.country` | `COLOR_ACTIVE_FILL` | in active regions |
| `.country-excluded` | `COLOR_EXCLUDED_FILL` | not in active regions |
| `.country-highlight` | yellow | current target |

MP country coloring uses `activePlugin.colorItem(id, color)` which sets inline `fill` style.

**Zoom:** D3 zoom with `scaleExtent([1, 100])`. Each question auto-zooms to fit the target country. User controls: `zoomIn()`, `zoomOut()`, `resetZoom()`.

---

## Settings

`activeSettings` in settings.js is the canonical object. It's mutated by `applySettings()`.

The plugin provides the settings UI via `getSettingsView()` and reacts to changes via `updateSettings()`.

---

## Scores (solo only)

Stored in `localStorage` under key `geo-quiz-scores`. Array of up to 20 entries.

The finish modal shows your best previous score for the same `mode + regions` combination.

---

## PWA / service worker

`sw.js` uses three caching strategies:
- **Large Data** (e.g., GeoJSON): cache-first
- **CDN libs** (D3, Tailwind, PeerJS): cache-first
- **App shell** (HTML/CSS/JS): network-first with offline fallback

---

## Key DOM elements

| ID | Purpose |
|---|---|
| `start-screen` | Full-screen overlay; hidden when game starts |
| `loader` | Shown while data loads |
| `quiz-view-container` | Parent container for plugin rendering |
| `plugin-settings-container` | Where the plugin injects its setting toggles |
| `answer-input` | Hard mode text input |
| `options-grid` | Easy mode choice buttons |
| `score`, `wrong-count`, `timer`, `remaining` | Header stats |

---

## How to extend

### Add a new multiplayer mode

1. Create `modes/my-mode.js` implementing the `activeMode` interface: `onAnswer`, `onDone`, `onReset`, `onHome`, `onMessage`, `start`
2. Add `<script src="modes/my-mode.js"></script>` to `index.html` before `mp/net.js`
3. In `mp/net.js`: add `else if (mpMode === 'my-mode') activeMode = MyMode` in both `mpStartGame()` and `mpApplySettings()`
4. Add the option to the `<select id="mp-mode-select">` in `index.html`

### Add a new quiz type (Plugin)

1. Create `plugins/my-plugin.js` implementing the plugin interface: `loadData`, `getSettingsView`, `generateQuestionPool`, `getItemId`, `getCorrectAnswer`, `checkTypedAnswer`, `renderQuizView`, `updateSettings`, `displayQuestion`, etc.
2. In `app.js`, instantiate your plugin as `activePlugin`.

