# Refactoring Plan: Toward a Truly Generic Quiz Engine

This plan outlines the steps required to remove the remaining "Geography" domain assumptions from the core engine, enabling seamless support for any quiz type (e.g., "Spanish Animals", "Flag Quiz", "Music Trivia").

## Phase 1: Terminology & Network Messaging
Currently, many variables and network packets use names like `iso`, `featureId`, or `country`. These should be standardized to `itemId`.

- **Action**: Search and replace `iso` and `featureId` with `itemId` in `net.js`, `quiz.js`, and all `modes/*.js` files.
- **Action**: Update network message schemas. Instead of `{ type: 'answered', iso: 'FRA' }`, use `{ type: 'answered', itemId: 'FRA' }`.
- **Action**: Rename internal helper functions. `mpColorCountry` becomes `mpColorItem`.

## Phase 2: Generic Styling (CSS & HTML)
The UI currently assumes it is displaying countries.

- **Action**: Rename CSS classes in `style.css`:
    - `.country` → `.quiz-item`
    - `.country-highlight` → `.quiz-item-highlight`
    - `.country-excluded` → `.quiz-item-excluded`
- **Action**: Update HTML IDs in `index.html`:
    - `#country-overlay` → `#item-overlay`
    - `#country-name-display` → `#item-name-display`
- **Action**: Update Plugins to use these new classes when rendering their views (especially `GeoQuizPlugin`).

## Phase 3: Flexible Settings Structure
The `activeSettings` object is currently hardcoded with a `regions` key.

- **Action**: Refactor `activeSettings.regions` to `activeSettings.filters`.
- **Action**: Update `settings.js` to handle this change dynamically.
- **Action**: Update the `Registry` and `net.js` sync logic to use the `filters` key.
- **Action**: Update `GeoQuizPlugin` and `FlagQuizPlugin` to map their internal region logic to the `filters` key.

## Phase 4: Plugin-Driven Metadata (Scores & Labels)
`scores.js` currently has a hardcoded `regionLabels` object for the high score list.

- **Action**: Add a new method to the Plugin interface: `getScoreSettingsDescription(settings)`.
- **Action**: In `scores.js`, instead of using the hardcoded list, call `activePlugin.getScoreSettingsDescription(s.settings)`.
- **Action**: Move the `regionLabels` constants entirely out of `scores.js` and into the respective plugins.

## Phase 5: Decoupling "Land Grab" from "Territory"
Land Grab mode is the most "geo-centric" mode.

- **Action**: Refactor `LandGrabMode` comments and internal logs to refer to "claiming items" rather than "territories".
- **Action**: Ensure the mode doesn't crash if a plugin's `colorItem` doesn't result in a traditional "map fill" (e.g. for animals it might just highlight a card).

## Expected Outcome
After these changes, implementing a **Spanish Animals** quiz would only require:
1. Creating `plugins/spanish-animals.js`.
2. Defining `filters` (Habitats, Difficulty).
3. Implementing `renderQuizView` to show animal images.
4. Implementing `colorItem` to highlight the correct animal card.
No changes to the core `app.js`, `net.js`, or `style.css` would be necessary.
