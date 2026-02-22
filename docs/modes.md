# How to Add a New Game Mode

Game modes are high-level logic handlers that manage the quiz state (scoring, pool management, timers). They are decoupled from the quiz content (e.g., geography or flags).

## 1. Create Your Mode File
Create a new JS file in the `modes/` directory, e.g., `modes/my-mode.js`.

## 2. Implement the Mode Interface
A game mode is a JavaScript object that should implement the following properties and methods:

### Metadata
- `name`: A human-readable name for the mode (e.g., `'Solo Play'`).
- `isMultiplayer`: A boolean flag (`true` or `false`).

### Lifecycle Methods
- `onAnswer(correct)`: Called by the quiz engine after a user's answer is processed. Use this to update the score and pool, and call `activePlugin.updateViewOnAnswer()`.
- `onDone()`: Called when the question pool is empty (in solo mode) or when the game ends. Typically shows the finish modal.
- `onReset()`: Called when the user clicks the reset button (↺) in the header. Use this to reset counters and timers.
- `onHome()`: Called when the user clicks the home button (⌂). Use this to stop timers and return to the start screen.

### Multiplayer Methods (Required if `isMultiplayer: true`)
- `onMessage(msg, fromId)`: Handles incoming messages from the network (via `net.js`). You'll need to handle custom message types like `'go'`, `'round-over'`, or `'land-grab-next'`.
- `start()`: Called by `net.js` after the host starts the game. Use this to kick off the first round or question.

## 3. Register the Mode
At the end of your file, register the mode object with the global `Registry`:

```javascript
const MyNewMode = {
    name: 'My New Mode',
    isMultiplayer: false,
    onAnswer(correct) { ... },
    onDone() { ... },
    onReset() { ... },
    onHome() { ... }
};

if (typeof Registry !== 'undefined') {
    Registry.registerMode('my-mode-id', MyNewMode);
}
```

## 4. Handle Multiplayer Integration (Optional)
If your mode is multiplayer, you'll need to update the `handleMpMessage` router in `mp/net.js` to route any custom message types to your mode's `onMessage` handler.

### `mp/net.js` example:
```javascript
case 'my-custom-message':
    activeMode.onMessage(msg, fromId);
    break;
```

## 5. Include in `index.html`
Add your script tag to `index.html` before `mp/net.js` and `app.js`:

```html
<script src="modes/my-mode.js"></script>
```
