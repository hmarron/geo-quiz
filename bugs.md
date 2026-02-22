# Bug Tracker

This file tracks bugs found during testing and their resolution.

---

### 1. Last country not colored in Race Mode at game end

-   **Status:** Fixed
-   **File(s) Affected:** `modes/race.js`, `mp/net.js`
-   **Problem:** In multiplayer Race Mode, when a player correctly answered the final question, the game would immediately end and show the results screen. When the user then clicked "View Map", the final country was not colored with the winner's color.
-   **Root Cause:** This was a race condition. The host would resolve the final round, broadcast a `round-over` message (to trigger coloring), and then almost immediately broadcast a `game-over` message. Clients did not have enough time to process the `round-over` message and render the color change before the results modal was displayed.
-   **Solution:** An acknowledgement (`ack`) system was implemented for the final round.
    1.  The host resolves the final round and broadcasts `round-over`, but then waits instead of immediately ending the game.
    2.  Each client, upon receiving the final `round-over` message, colors its map and sends a `final-round-processed` acknowledgement back to the host.
    3.  The host waits until it has received an ack from every client.
    4.  Once all clients have confirmed they've processed the final round's visual state, the host then broadcasts the `game-over` message to conclude the game. This ensures the visual update is always completed before the final results are shown.

---

### 2. High Score (Compete) mode forces players to wait

-   **Status:** Fixed / Feature Change
-   **File(s) Affected:** `modes/compete.js`, `mp/net.js`
-   **Problem:** In multiplayer High Score (Compete) mode, all players were forced to wait for every other player to answer before the game would advance to the next question.
-   **Root Cause:** The game flow was designed as a "lock-step" system. The host would only advance the game state (`mpAdvance`) after receiving an `answered` message from all connected players.
-   **Solution:** The mode was re-architected to allow players to advance independently.
    1.  The central `mpAdvance` function is no longer used by Compete mode.
    2.  Each client (including the host) now manages its own progress through the shared question list using a local index (`competeQuestionIdx`).
    3.  When a player answers, their `onAnswer` handler immediately calls a `next()` method to advance them to the next question locally.
    4.  Instead of waiting, the host's role is now simply to act as a relay for `score-update` messages to keep scoreboards in sync.
    5.  When a player completes their list of questions, they send a `finished-compete` message to the host.
    6.  The host waits until it has received a `finished-compete` message from all players, at which point it ends the game and broadcasts the final results. This makes the gameplay much faster and more like a parallel single-player experience with a shared leaderboard.