# How to Add a New Quiz Plugin

The Quizler engine is built on a plugin-based architecture. You can add a new quiz type (e.g., "Flags", "Spanish Animals", "Music Trivia") by implementing the `QuizPlugin` interface and registering it.

## 1. Create Your Plugin File
Create a new JS file in the `plugins/` directory, e.g., `plugins/my-quiz.js`.

## 2. Implement the Plugin Interface
A plugin is a class that must implement the following properties and methods:

### Metadata
- `id`: A unique string ID (e.g., `'flag-quiz'`).
- `name`: A human-readable name for the registry (e.g., `'Flag Quiz'`).
- `title`: The big title shown on the start screen (e.g., `'Flag Challenge'`).
- `subtitle`: The subtitle shown on the start screen (e.g., `'Identify world flags'`).
- `supportedModes`: An array of mode IDs that this plugin supports (e.g., `['solo', 'race', 'compete', 'land-grab']`).

### Initialization
- `async loadScripts()`: Load external libraries (like D3). Should return a Promise.
- `async loadData()`: Fetch your dataset (GeoJSON, JSON, etc.).

### Settings & Logic
- `getSettingsView()`: Returns HTML for the main settings modal. Use `id="check-X"` for filter checkboxes.
- `getLobbySettingsView()`: Returns HTML for the multiplayer lobby. Use `id="mp-check-X"` for filter checkboxes.
- `updateSettings(settings)`: Called when settings change. `settings.filters` contains your active toggles.
- `getScoreSettingsDescription(settings)`: Returns a short string (e.g., "Europe, Asia") describing the active filters for the high score list.
- `generateQuestionPool(settings)`: Returns an array of items filtered by the current settings.
- `getItemId(item)`: Returns a unique string ID for a given data item (e.g., an ISO code).
- `getItemById(id)`: Returns the full data item object for a given ID.
- `getCorrectAnswer(item)`: Returns the string value of the correct answer (shown in results/overlays).
- `checkTypedAnswer(item, answer)`: Returns `true` if the typed answer is correct (Hard Mode).
- `generateChoices(correctItem, pool)`: Returns an array of `{ text, correct }` objects (Easy Mode).

### View Rendering
- `renderQuizView(container)`: Sets up the main UI in the `#quiz-view-container`.
- `bindUIEvents()`: Attach event listeners to your UI (e.g., zoom buttons).
- `displayQuestion(item)`: Highlights or shows the current target in the view. Use CSS classes `.quiz-item` and `.quiz-item-highlight`.
- `updateViewOnAnswer(item, correct, color)`: Visual feedback after an answer.
- `colorItem(itemId, color)`: (Multiplayer) Colors a specific item (Race/Land Grab).
- `renderResultView(container)`: (Optional) Renders a custom results summary (e.g., a flag grid) in the finish modal.
- `renderResultActions(container)`: (Optional) Renders custom buttons (e.g., "View Map") in the finish modal.
- `clearHighlights()`: Removes temporary highlights (like the yellow target highlight).
- `resetView()`: Resets the entire view to its initial state.

## 3. Register the Plugin
At the end of your file, register an instance with the global `Registry`:

```javascript
if (typeof Registry !== 'undefined') {
    Registry.registerPlugin(new MyNewPlugin());
}
```

## 4. Include in `index.html`
Add your script tag to `index.html` before `app.js`:

```html
<script src="plugins/my-quiz.js"></script>
```
