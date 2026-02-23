# Quizler — Architecture

A serverless, plugin-based engine for building interactive quiz games with peer-to-peer multiplayer.

---

## Tech Stack

| Layer | Library |
|---|---|
| Core Architecture | Registry-based (Plugins & Modes) |
| Map Rendering | D3 v7 (via `GeoQuizPlugin`) |
| Styling | Tailwind CSS (CDN) + Generic `style.css` classes |
| Multiplayer | PeerJS v1 (WebRTC, serverless handshake) |
| Offline | Service worker (`sw.js`) |

---

## File Structure & Load Order

Scripts are loaded in dependency order in `index.html`:

```
utils.js          Pure helper functions
registry.js       Central Registry for Plugins and Modes
plugins/*.js      Content plugins (e.g., GeoQuiz, FlagQuiz)
settings.js       Active settings management, UI generation
scores.js         localStorage, high score UI
quiz.js           Core quiz conductor (delegates to active plugin)
modes/*.js        Game mechanics (e.g., Solo, Race, Compete, Land Grab)
mp/net.js         PeerJS networking, lobby, message routing
app.js            Orchestrator: init, timer, bootstrapper
```

---

## The Registry System (`registry.js`)

The engine is decoupled from specific content. Everything must register itself:

- **Plugins**: `Registry.registerPlugin(instance)`
- **Modes**: `Registry.registerMode(id, object)`

`app.js` and `net.js` use `Registry.getActivePlugin()` and `Registry.getMode(id)` instead of hardcoded references.

---

## Generic Terminology

To support any quiz type, the engine uses domain-agnostic terms:

| Category | Old (Geo) | New (Generic) |
|---|---|---|
| **Data ID** | `iso` / `featureId` | `itemId` |
| **Settings** | `regions` | `filters` |
| **CSS Class** | `.country` | `.quiz-item` |
| **CSS Class** | `.country-highlight` | `.quiz-item-highlight` |
| **HTML ID** | `#country-overlay` | `#item-overlay` |

---

## Multiplayer Architecture

### Host/Guest Model
One player acts as the **host** (`mpIsHost = true`). All game state processing happens on the host. Guests send answers; the host validates and broadcasts updates.

### Connection Handshake
1. Host creates room with `quizler-XXXXXX` ID.
2. Guest connects using PeerJS.
3. Once open, Guest sends `ready`.
4. Host sends `welcome` (player list) and `game-start` (syncs plugin and settings).

### Message Routing
`handleMpMessage` in `net.js` routes infrastructure messages (joining, scores) and delegates mode-specific messages to `activeMode.onMessage()`.

---

## Plugin Interface

Every plugin must implement methods for:
- **Initialization**: `loadScripts`, `loadData`
- **Settings UI**: `getSettingsView`, `getLobbySettingsView`
- **Logic**: `checkTypedAnswer`, `generateChoices`, `getItemId`
- **Rendering**: `renderQuizView`, `displayQuestion`, `updateViewOnAnswer`, `renderResultView`

---

## Mode Interface

Modes manage the *rules* of the game:
- `onAnswer(correct)`: Updates score/pool.
- `onMessage(msg, fromId)`: Handles MP sync.
- `start()`: Kicks off the game.

---

## Data Flow (Multiplayer Example)

1. **Host** clicks Start → `mpStartGame()`:
   - Broadcasts `{ type: 'game-start', pluginId, settings, questionPool }`.
2. **Guest** receives `game-start` → `mpApplySettings()`:
   - Switches to host's plugin via `changePlugin(pluginId)`.
   - Initializes local pool and UI.
3. **Host** calls `activeMode.start()` → `mpAdvance()`:
   - Broadcasts `{ type: 'question', itemId }`.
4. **Guest** receives `question` → `renderQuestion()`:
   - Displays target via `activePlugin.displayQuestion(itemId)`.
