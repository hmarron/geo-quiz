# Future Features & Improvements

This document tracks potential features, game modes, and architectural improvements for the Quizler engine.

---

## 1. New Game Modes (Mechanics)

-   **Timed Mode (Sprint):** Answer as many questions as possible within a fixed time limit (e.g., 60 seconds).
-   **Sudden Death (Survival):** The game ends immediately on the first wrong answer. See how long you can last.
-   **Daily Challenge:** A synchronized daily set of questions that is the same for everyone, with a local or global leaderboard.
-   **Streak Master (Multiplier Mode):** Points are multiplied based on your current consecutive correct answers. A single wrong answer resets the multiplier to 1, adding high-risk/high-reward tension.
-   **Elimination (Multiplayer):** Every 30 seconds, the player with the lowest score is "knocked out" until only one remains.
-   **Zen Mode:** No timer, no score, just an endless loop of questions for relaxed learning.

## 2. User Experience (UX) & Polish

-   **Visual Feedback:**
    -   Screen shakes for wrong answers.
    -   **Visual Evolution:** Dynamic UI elements that evolve as a player's streak grows (e.g., the score glowing, catching fire, or sparking).
    -   "Streak" animations (e.g., fire effects) for getting 5+ correct in a row.
    -   Haptic feedback (vibration) on mobile for correct/wrong answers.
-   **Sound Effects:** Subtle audio cues for correct/wrong answers and a "ticking" sound for the final seconds of a timer.
-   **Learning/Review Phase:** After a quiz, allow users to click on items they got wrong to see the correct answer and "Fast Facts" (e.g., population, capital, or bird habitat).
-   **Progress Bar:** A visual indicator at the top showing progress through the current question pool.
-   **Themes:** Allow users to switch between "Classic", "Dark Mode", "Satellite" (for maps), or "High Contrast" (for accessibility).

## 3. Multiplayer Enhancements

-   **Player Avatars:** Let users pick an emoji or simple icon to represent them in the lobby and on leaderboards.
-   **Emoji Reactions:** Allow players to send quick emoji reactions (👏, 😂, 😮, 😢) during or after a game.
-   **Team Play:** Group players into teams (e.g., Red vs Blue) for "Land Grab" or "Compete" modes.
-   **Spectator Mode:** Allow people to join a room via a link just to watch the game without participating.

## 4. Content & Plugin Features

-   **Spaced Repetition:** If a user gets an item wrong, the engine prioritizes showing that item again in the next round to aid memorization.
-   **Multimedia CSVs:** Update `CSVQuizPlugin` to support audio (e.g., bird songs) or multiple images per question.
-   **Difficulty Levels:** Tag quiz items with "Easy", "Medium", or "Hard" and allow filtering in the settings.

## 5. Architectural Improvements

-   **ES Modules Migration:** Refactor from global scripts/variables to ES Modules (`import`/`export`) for better maintainability.
-   **Global Leaderboards:** Integrate a lightweight backend (e.g., Supabase or Firebase) for global high scores.
-   **Automated Testing:** 
    -   **Unit Tests:** Verify pure logic in `utils.js` (formatting), `registry.js` (registration), and `quiz.js` (scoring/pool).
    -   **Plugin Validation:** Automated checks to ensure all plugins adhere to the required interface (methods like `loadData`, `renderQuizView`, etc.).
    -   **Multiplayer Simulation:** Use mocks for PeerJS to test message routing and state sync in `net.js` without network overhead.
    -   **Regression Testing:** Catch recurring bugs, especially in complex multiplayer modes.
-   **Type Safety:** Consider migrating to TypeScript for better developer experience and catching bugs early.

## 6. Modern Tooling & Frameworks

-   **Vite Integration:** Move from a folder of static scripts to a modern build pipeline. This enables:
    -   Fast development with Hot Module Replacement (HMR).
    -   Optimized production builds for GitHub Pages.
    -   Easier management of dependencies (PeerJS, D3, etc.) via npm.
-   **Component Framework (Svelte or React):** Transition from manual DOM manipulation to a declarative framework.
    -   **Svelte:** Ideal for its "vanishing" runtime and low overhead, keeping the app fast and lightweight.
    -   **React:** A robust ecosystem for building complex, interactive UIs.
-   **Centralized State Management:** Use a "Store" pattern (e.g., Svelte Stores, Zustand) to manage game state, making it easier to sync scores and settings across multiplayer sessions.
-   **Tailwind Post-Processing:** Move away from the Tailwind CDN to a build-time integration, significantly reducing initial load times and improving performance on mobile devices.

## 7. Categorized High Scores

-   **Context-Aware Leaderboards:** Instead of one global list, separate high scores by **Plugin** (e.g., Geography vs. Flags) and **Game Mode** (e.g., Solo vs. Timed).
-   **Granular Filtering:** Allow users to filter the high score table by difficulty (Easy/Hard) and specific settings (e.g., "Europe only" or "Africa only").
-   **"Personal Best" Tracking:** Display the player's best-ever performance for the *specific* combination of settings they just played on the finish screen.
-   **Local Profiles:** Support multiple local "profiles" on the same device, allowing friends or family to track their progress separately without a server.
-   **Visual History:** Add a simple line graph showing a player's accuracy or speed over time for a particular category to visualize improvement.
