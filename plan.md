# Refactoring Plan: Quiz Plugin Architecture

The goal is to decouple the quiz logic (geography) from the game mechanics (solo, race, compete, land-grab modes) to allow for new quiz types to be added easily.

### Proposed "Quiz Plugin" Architecture

The core idea is to introduce a new abstraction, the **`QuizPlugin`**. Each quiz type (the current geography quiz, a future flags quiz, etc.) would be a self-contained plugin that the main game engine uses.

The main engine (composed of `app.js`, `quiz.js`, `modes/*.js`, and `mp/net.js`) would be responsible for the game flow, mode logic, and multiplayer synchronization. It would be completely agnostic about what is being asked.

A `QuizPlugin` would be an object that provides all the quiz-specific information and behavior.

### The `QuizPlugin` Interface

A plugin would implement a standard interface, much like the existing `activeMode`. This ensures the game engine can interact with any quiz type.

```js
// Proposed interface for a Quiz Plugin
{
  // A unique ID for the plugin (e.g., 'geo-quiz', 'flags-quiz')
  id: string,

  // Display name for the UI
  name: string,

  // Load all necessary data (e.g., fetch GeoJSON, fetch flag data)
  // Returns a Promise that resolves when data is ready.
  loadData(): Promise<void>,

  // Create the pool of questions for a new game based on settings.
  generateQuestionPool(settings: object): any[],

  // Get a unique, serializable ID for a question item.
  // Used for multiplayer communication.
  getItemId(item: any): string,

  // Get a question item from the full dataset by its ID.
  getItemById(id: string): any,

  // Get the string for the correct answer (for display).
  getCorrectAnswer(item: any): string,

  // Check if a user's typed answer is correct.
  checkTypedAnswer(item: any, answer: string): boolean,

  // Generate choices for "easy" mode.
  generateChoices(correctItem: any, pool: any[]): { text: string, correct: boolean }[],

  // Render the main view for the quiz (e.g., the D3 map).
  renderQuizView(container: HTMLElement): void,

  // Display a single question to the user (e.g., highlight a country, show a flag).
  displayQuestion(item: any): void,

  // Update the main view after an answer (e.g., color a country).
  updateViewOnAnswer(item: any, correct: boolean, mpPlayerColor?: string): void,

  // Reset the main view to its initial state.
  resetView(): void,
}
```

### Refactoring Steps

1.  **Create a `GeoQuizPlugin`:**
    *   A new file, e.g., `plugins/geo-quiz.js`, would be created.
    *   This file would implement the `QuizPlugin` interface.
    *   **All geography-specific logic would move here.** This includes:
        *   The D3 map rendering and interaction logic from `map.js`.
        *   The answer-checking logic (`checkTypedAnswer`, `getAcceptableNames`) from `quiz.js`.
        *   The GeoJSON data fetching from `app.js`.
        *   Region filtering (`isAllowed`) and settings.

2.  **Make the Core Engine Generic:**
    *   `app.js`: Would manage an `activePlugin` global variable, selected by the user. It would call `activePlugin.loadData()` and `activePlugin.renderQuizView()` during initialization.
    *   `quiz.js`: Would become a generic "quiz conductor." It would orchestrate the question-answer flow but delegate all specifics to the `activePlugin`. For example, `checkTypedAnswer()` would simply become `return activePlugin.checkTypedAnswer(currentTarget, typedAnswer);`.
    *   `mp/net.js`: Would be updated to send the `plugin.id` when a game starts. Question messages would use the generic IDs provided by `activePlugin.getItemId(item)`.
    *   Game modes (`race.js`, `land-grab.js`): Instead of calling geography-specific functions like `mpColorCountry()`, they would call the generic `activePlugin.updateViewOnAnswer()`.

### Example: A New "Flags of the World" Plugin

With this architecture, adding a new quiz is straightforward:

1.  Create `plugins/flags-quiz.js`.
2.  Implement the `QuizPlugin` interface:
    *   `loadData`: Fetch a JSON file of country names and flag image URLs.
    *   `renderQuizView`: Could display a simple grid or nothing at all, clearing the map container.
    *   `displayQuestion`: Create an `<img>` element and set its `src` to the flag URL.
    *   `checkTypedAnswer`: Check the user's guess against the country name.
    *   `updateViewOnAnswer`: Could, for example, reveal the correctly guessed flag in a grid of otherwise silhouetted flags.

Because the game modes (`solo`, `race`, etc.) only interact with the generic engine, they would **automatically work** with the new flags quiz without any changes.
