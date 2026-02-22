# Quiz Engine

A lightweight, serverless, and extensible engine for building interactive quiz games. While it comes with Geography and Flag modules, the core architecture is designed to support any type of quiz content and multiple game mechanics.

**[Try the live version here!](https://hmarron.github.io/geo-quiz/)**

## Features

- **Plugin-Based Content**: Easily add new quiz types (Flags, Capitals, Science, etc.) by implementing a simple Plugin interface.
- **Multiple Game Modes**: Support for both solo practice and real-time peer-to-peer multiplayer.
- **No Server Required**: Uses PeerJS for WebRTC-based multiplayer directly in the browser.
- **PWA Ready**: Works offline via Service Workers.

## Game Modes

- **Solo Play**: A classic single-player experience where you progress through a pool of questions at your own pace.
- **Race (Multiplayer)**: A real-time showdown where all players see the same question. The first player to answer correctly wins the round.
- **Compete (Multiplayer)**: A high-score mode where everyone answers the same set of questions independently. The player with the highest accuracy and best time wins.
- **Land Grab (Multiplayer)**: A territory-based mode (optimized for map quizzes) where players are assigned different targets simultaneously to claim as much "land" as possible.

## Extending the Engine

The engine is designed to be easily extended with new content and mechanics. Check out the documentation in the `docs/` folder for step-by-step guides:

- [Adding a New Quiz Plugin](docs/plugins.md) — How to add new question types and assets.
- [Adding a New Game Mode](docs/modes.md) — How to create new ways to play (e.g., timed trials, elimination).

## Tech Stack

- **Logic**: Vanilla JavaScript
- **Map Rendering**: D3.js (via GeoQuiz plugin)
- **Styling**: Tailwind CSS
- **Multiplayer**: PeerJS (WebRTC)
- **Data**: GeoJSON / JSON
