# Refactoring Plan: Quiz Plugin Architecture (Completed)

This refactoring has been completed. The quiz logic (geography) has been decoupled from the game mechanics (solo, race, etc.) into a `QuizPlugin` architecture.

### Summary of Changes

1.  **`plugins/geo-quiz.js` Created:** A new `GeoQuizPlugin` was created to encapsulate all geography-specific logic. It implements the full `QuizPlugin` interface.
    *   **Map Rendering:** All D3.js map rendering, interaction (zoom, pan), and styling logic was moved from `map.js` and `app.js` into the plugin's `renderQuizView`, `updateSettings`, and `displayQuestion` methods. `map.js` is now empty.
    *   **Data Loading:** GeoJSON data fetching was moved from `app.js` to the plugin's `loadData` method.
    *   **Answer Logic:** Answer checking (`checkTypedAnswer`), choice generation (`generateChoices`), and acceptable name normalization were moved from `quiz.js` into the plugin.
    *   **Settings Integration:** The plugin now handles settings changes (regions, borders) via an `updateSettings` method, which re-renders the map view accordingly.

2.  **Core Engine Made Generic:**
    *   **`app.js`:** Now acts as a generic orchestrator. It initializes and calls the `activePlugin` to load data and render its view. It no longer contains any geography-specific code.
    *   **`quiz.js`:** Is now a generic "quiz conductor." It handles the question-answer flow but delegates all quiz-specific tasks (displaying questions, checking answers, generating choices) to the `activePlugin`.
    *   **`settings.js`:** Was refactored to manage a central `activeSettings` object. It no longer contains any hardcoded logic related to the map or data, instead calling the plugin to apply visual changes.

The new architecture successfully decouples the game's core logic from the quiz's content logic, allowing for new quiz types (e.g., a "Flags Quiz") to be added easily by creating a new plugin that implements the same interface.