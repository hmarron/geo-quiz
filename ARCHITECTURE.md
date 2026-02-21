# Geo Quiz — Architecture

A browser-based geography quiz with solo and peer-to-peer multiplayer. No server, no build step — plain JS files loaded via `<script>` tags in dependency order.

---

## Tech stack

| Layer | Library |
|---|---|
| Map rendering | D3 v7 (SVG, geoMercator, zoom) |
| Styling | Tailwind CSS (CDN) |
| Multiplayer | PeerJS v1 (WebRTC, no signalling server needed) |
| Data | Natural Earth 50m GeoJSON fetched from GitHub at runtime |
| Offline | Service worker (`sw.js`) |

---

## File structure and script load order

Scripts are loaded in dependency order — later files can call functions defined in earlier ones.

```
utils.js          pure functions, no DOM
map.js            D3 setup, color constants
settings.js       regions[], gameMode, settings UI
scores.js         localStorage, finish/scores modals
quiz.js           renderQuestion(), nextQuestion(), handleCorrect/Wrong()
modes/solo.js     SoloMode object
modes/race.js     RaceMode object + mpResolveRound()
modes/compete.js  CompeteMode object
modes/land-grab.js LandGrabMode object + mpLandGrabAdvance() etc.
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
score, wrongCount, hintCount   — current game counters
startTime, timerInterval       — wall-clock timer
fullDataset                    — all GeoJSON features (loaded once)
activeMode                     — the current mode object (SoloMode | RaceMode | CompeteMode | LandGrabMode)
dataReady, dataLoading         — init() guard flags
```

### quiz.js
```
pool           — array of GeoJSON features still to be answered (solo only)
currentTarget  — the GeoJSON feature currently being asked about
canAnswer      — bool; gates handleCorrect/Wrong to prevent double-submission
```

### settings.js
```
regions[]   — array of { id, label, active } objects; mutated by applySettings
showBorders — bool
gameMode    — 'easy' | 'hard'
```

### map.js
```
svg, g, projection, path, zoom  — D3 primitives, used everywhere
width, height                   — container dimensions, updated on resize
COLOR_ACTIVE_FILL, COLOR_BORDER, COLOR_EXCLUDED_FILL  — fill constants
```

### race.js
```
mpRaceResolved       — bool; prevents double-resolving a round
mpCorrectAnswers     — [{ peerId, ts }] collected during winner window
mpWinnerWindowTimer  — timeout handle
```

### land-grab.js
```
mpLandGrabPool        — ISO_A3 strings not yet assigned
mpLandGrabClaimed     — { iso: peerId } claimed territories
mpLandGrabAssignments — { peerId: iso | null } current assignment per player
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
mpRoundAnswered       — { peerId: bool } (race/compete: answered this round)
mpRoundAcked          — { peerId: bool } (race: received 'question' ack)
mpAckTimeout          — timeout handle for ack wait
mpQuestionPool        — ordered ISO_A3 array for race/compete
mpQuestionIdx         — next index into mpQuestionPool
MP_ACK_TIMEOUT_MS (3000), MP_WINNER_WINDOW_MS (300)  — timing constants
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
  → init(cb)             fetches GeoJSON, renders map, sets up Enter-key listener
  → resetGame()          → SoloMode.onReset()
      resets counters, refills pool from fullDataset.filter(isAllowed)
      calls nextQuestion()

nextQuestion()
  pool empty? → activeMode.onDone() → SoloMode.onDone() → showFinishModal()
  else: picks random feature from pool, sets currentTarget, calls renderQuestion()

renderQuestion()
  sets canAnswer = true
  hard mode: shows text input, hides options
  easy mode: hides input, generates 4 choices via generateChoices()
  highlights current country on map (.country-highlight → yellow fill)
  zooms map to fit the country

user answers →
  handleCorrect() / handleWrong()
  → activeMode.onAnswer(correct) → SoloMode.onAnswer()
      updates score/wrongCount, shows overlay for 600ms
      removes country from pool
      setTimeout(nextQuestion, 700|800)
```

**Answer checking (hard mode)**:
`checkTypedAnswer()` runs on Enter. It:
1. Normalises the guess (lowercase, strip accents/punctuation, strip leading "the")
2. Checks exact match or substring match against all acceptable names (NAME, ADMIN, NAME_LONG, ABBREV, ISO_A3, ISO_A2)
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
   - Shuffles `fullDataset.filter(isAllowed)` → `mpQuestionPool` (ISO_A3 strings)
   - Sets `activeMode = RaceMode | CompeteMode | LandGrabMode`
   - Broadcasts `game-start` with settings + question pool + player list
   - Calls `activeMode.start()`

2. Guests receive `game-start` → `mpApplySettings()`:
   - Sets mpMode, activeMode, mpQuestionPool
   - Applies region/gameMode settings locally (re-renders map)
   - Hides lobby, sets mpIsActive = true
   - Waits for first question message

### Message routing (`handleMpMessage` in net.js)

Lobby/infrastructure messages handled directly in net.js:
- `ready`, `welcome`, `player-joined` — lobby player list
- `game-start` → `mpApplySettings()`
- `question` → `mpSetQuestion(featureId)` then `activeMode.onMessage(msg)`
- `ack` → `mpHandleAck(fromId)` (ack-based synchronisation for race)
- `score-update`, `player-score` — score relay
- `game-over` → `showMpFinishModal()`
- `player-left` — disconnect cleanup

Mode-specific messages are fall-through cases routed to `activeMode.onMessage(msg, fromId)`:
```
'go', 'answered', 'round-over',
'land-grab-claimed', 'land-grab-next', 'land-grab-pool'
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

The GeoJSON source is `ne_50m_admin_0_countries.geojson` from Natural Earth (fetched once, cached by service worker).

Each feature has a `<path>` element with class `country` or `country country-excluded`.

| CSS class | fill | meaning |
|---|---|---|
| `.country` | `COLOR_ACTIVE_FILL` (#374151) | in active regions |
| `.country-excluded` | `COLOR_EXCLUDED_FILL` (#1a2a3a) | not in active regions |
| `.country-highlight` | #fbbf24 (yellow, `!important`) | current question target |

MP country coloring uses `mpColorCountry(iso, color)` which sets inline `fill` style by ISO_A3 code. This overrides the class-based fill.

**Zoom:** D3 zoom with `scaleExtent([1, 100])`. Each question auto-zooms to fit the target country. User controls: `zoomIn()`, `zoomOut()`, `resetZoom()`.

**Region mapping:** `getCountryRegionId(feature)` uses the CONTINENT property and latitude of centroid to assign one of 7 region ids. Africa is split at the equator into africa-north / africa-south.

---

## Settings

`regions[]` in settings.js is the canonical list. It's mutated in-place by `applySettings()` and `mpApplySettings()`. `isAllowed(feature)` checks it.

`gameMode` ('easy' | 'hard') controls input type in `renderQuestion()`:
- **easy**: 4 multiple-choice buttons (1 correct + 3 random from allowed pool)
- **hard**: text input; answer checked via `checkTypedAnswer()` on Enter

Settings are not persisted between sessions (regions reset to defaults on reload).

---

## Scores (solo only)

Stored in `localStorage` under key `geo-quiz-scores`. Array of up to 20 entries, sorted by accuracy desc then time asc. Each entry:
```js
{ score, wrong, hints, time, date, settings: { mode, regions: [id, ...] } }
```

The finish modal shows your best previous score for the same `mode + regions` combination.

---

## PWA / service worker

`sw.js` uses three caching strategies:
- **GeoJSON** (large, ~1MB): cache-first — download once, never re-fetch
- **CDN libs** (D3, Tailwind, PeerJS): cache-first — versioned URLs
- **App shell** (HTML/CSS/JS): network-first with offline fallback

Cache name `geo-quiz-v1` — bump to invalidate all caches.

---

## Key DOM elements

| ID | Purpose |
|---|---|
| `start-screen` | Full-screen overlay; hidden when game starts |
| `loader` | Shown while GeoJSON loads |
| `map-container` | D3 SVG parent |
| `country-overlay` | "France" / red flash overlay on answer |
| `answer-input` | Hard mode text input |
| `options-grid` | Easy mode choice buttons |
| `input-area` | Wraps answer-input + hint button |
| `score`, `wrong-count`, `timer`, `remaining` | Header stats |
| `finish-modal` | Solo game-over screen |
| `scores-modal` | High scores list |
| `settings-modal` | Region/mode settings |
| `mp-lobby-modal` | Multiplayer lobby |
| `mp-finish-modal` | MP game-over screen |
| `mp-results-pill` | Floating "Results →" button when viewing map after MP game |

---

## How to extend

### Add a new multiplayer mode

1. Create `modes/my-mode.js` implementing the `activeMode` interface: `onAnswer`, `onDone`, `onReset`, `onHome`, `onMessage`, `start`
2. Add `<script src="modes/my-mode.js"></script>` to `index.html` before `mp/net.js`
3. In `mp/net.js`: add `else if (mpMode === 'my-mode') activeMode = MyMode` in both `mpStartGame()` and `mpApplySettings()`
4. Add the option to the `<select id="mp-mode-select">` in `index.html`
5. Add any new message types to the routing fall-through in `handleMpMessage()`

### Add a new region

Add an entry to the `regions[]` array in `settings.js`. The `getCountryRegionId()` function in `map.js` maps GeoJSON features to region ids using the CONTINENT property and latitude — you may need to extend it for unusual regions.

### Change answer matching

Edit `checkTypedAnswer()` in `quiz.js`. It calls `getAcceptableNames()` (from utils.js) for the set of valid strings, then falls through to Levenshtein distance against the primary name.
