# How to Add a New Quiz Plugin

The Geo Quiz engine is built on a plugin-based architecture. You can add a new quiz type (e.g., "Flags", "Capitals", "Space") by implementing the `QuizPlugin` interface and registering it.

## 1. Create Your Plugin File
Create a new JS file in the `plugins/` directory, e.g., `plugins/flag-quiz.js`.

## 2. Implement the Plugin Interface
A plugin is a class that must implement the following properties and methods:

### Metadata
- `id`: A unique string ID (e.g., `'flag-quiz'`).
- `name`: A human-readable name (e.g., `'Flag Quiz'`).
- `supportedModes`: An array of mode IDs that this plugin supports (e.g., `['solo', 'race', 'compete']`).

### Initialization
- `async loadScripts()`: Use this to load any external libraries (like D3 or Three.js). Should return a Promise.
- `async loadData()`: Use this to fetch your GeoJSON, images, or JSON data.

### Settings & Logic
- `getSettingsView()`: Returns an HTML string for the settings modal.
- `updateSettings(settings)`: Called when settings change. Use this to update your internal state or re-render your view.
- `generateQuestionPool(settings)`: Should return an array of items (questions) filtered by the current settings.
- `getItemId(item)`: Returns a unique string ID for a given data item (e.g., an ISO code).
- `getItemById(id)`: Returns the full data item object for a given ID.
- `getCorrectAnswer(item)`: Returns the string value of the correct answer (shown in results/overlays).
- `checkTypedAnswer(item, answer)`: Returns `true` if the typed answer is correct (for Hard Mode).
- `generateChoices(correctItem, pool)`: Returns an array of `{ text, correct }` objects for Easy Mode.

### View Rendering
- `renderQuizView(container)`: Sets up the main UI in the `#quiz-view-container`.
- `bindUIEvents()`: Use this to attach event listeners to any buttons or controls you rendered.
- `displayQuestion(item)`: Highlights or shows the current target in the view.
- `updateViewOnAnswer(item, correct, color)`: Provides visual feedback after an answer (e.g., coloring a country or showing a checkmark).
- `colorItem(itemId, color)`: (Multiplayer) Colors a specific item (e.g., in Race or Land Grab mode).
- `clearHighlights()`: Removes any temporary highlights (like the yellow "current target" highlight).
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
<script src="plugins/flag-quiz.js"></script>
```
