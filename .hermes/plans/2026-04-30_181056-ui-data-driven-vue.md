# Plan: make the UI data-driven with a Vue state management store

## Goal
Move the flight-ludo UI toward a **data-driven** architecture so the visual layer renders from shared state instead of being tightly coupled to local composable internals.

For the Vue ecosystem state management choice, use **Pinia**.

## Current context / assumptions
- The app is Vue 3 + TypeScript + PixiJS.
- Current UI state is split across:
  - `src/composables/useFlightLudoPlayScene.ts`
  - `src/composables/flight-ludo-play-scene/diceController.ts`
  - `src/composables/flight-ludo-play-scene/turnController.ts`
  - `src/composables/flight-ludo-play-scene/moveController.ts`
  - `src/App.vue` and the screen components
- The user wants the UI to be data driven, not logic-heavy in the view layer.
- The project currently has no dedicated Vue store package installed.
- This change should keep the game rules intact and mainly reorganize state ownership, rendering inputs, and UI bindings.

## Proposed approach
Adopt Pinia as the centralized state layer for the game UI and play-scene state.

Recommended split:
1. **Store = source of truth** for UI-facing game state.
2. **Composables/controllers = side-effect handlers** for Pixi, timers, audio, and animations.
3. **Components = pure-ish views** that read store state and emit actions.

The key idea is:
- game state changes happen in one place
- UI reads from that state
- Pixi renders from a normalized data model
- animation/timers are managed separately from the store, but driven by store state

## Why Pinia fits best
- Native Vue ecosystem choice
- Lightweight and widely used
- Works well with TypeScript
- Easy to read from components and composables
- Good fit for a UI-heavy app where state needs to be shared across `App.vue`, prepare/play/result screens, and the Pixi scene

## Step-by-step plan
1. Define the state boundaries.
   - Identify what belongs in the store:
     - current page (`prepare` / `play` / `result`)
     - selected mode / pieces / board preset
     - game state snapshot
     - winner / turn / dice-related UI state
     - loading and animation flags that affect rendering
   - Identify what should stay outside the store:
     - Pixi `Application` instance
     - DOM refs
     - RAF ids and timers if they are implementation details only
     - audio engine internals
2. Add Pinia to the project.
   - Install Pinia.
   - Register the store in the Vue app bootstrap.
3. Create a dedicated game UI store.
   - Store should expose:
     - state
     - computed getters
     - actions for prepare/play/result transitions
     - actions for dice roll, move selection, board preset changes, replay, and back navigation
4. Move screen-level state into the store.
   - Replace scattered `ref(...)` ownership in `App.vue` where appropriate.
   - Make `PrepareScreen.vue`, `PlayScreen.vue`, and `ResultScreen.vue` read from the store instead of duplicating local state.
5. Keep Pixi orchestration in composables, but feed it from the store.
   - `useFlightLudoPlayScene.ts` should subscribe to store state and dispatch actions back into the store.
   - Rendering should consume a normalized snapshot rather than pulling from multiple local refs.
6. Reduce UI logic inside the components.
   - Components should mainly render data and emit actions.
   - Avoid derived UI state being recomputed in several places.
7. Make the render path more data-driven.
   - Convert visual inputs into explicit data objects:
     - active player
     - legal pieces
     - current dice face
     - animation state
     - board preset metrics
   - Pass that data into the Pixi renderer in a more structured way.
8. Keep animation/timer side effects isolated.
   - Store should not own Pixi objects or timers directly.
   - Controllers can still handle timing, but should be triggered by store actions and update store state when the animation/turn stage changes.
9. Add regression coverage.
   - Update tests so they validate store-backed state flow and existing UI behavior.
   - Ensure the migration does not break prepare/play/result transitions.
10. Validate incrementally.
   - First prove the store boots.
   - Then migrate one screen/state slice at a time.
   - Then run lint/build/tests.

## Files likely to change
- `package.json`
- `src/main.ts` or the Vue bootstrap entry
- `src/stores/*` for the new Pinia store(s)
- `src/App.vue`
- `src/components/game/PrepareScreen.vue`
- `src/components/game/PlayScreen.vue`
- `src/components/game/ResultScreen.vue`
- `src/composables/useFlightLudoPlayScene.ts`
- `src/composables/flight-ludo-play-scene/diceController.ts`
- `src/composables/flight-ludo-play-scene/turnController.ts`
- `src/composables/flight-ludo-play-scene/moveController.ts`
- `src/ui-layout.test.ts`
- possibly `src/game/*` if a store-facing adapter or snapshot type is useful

## Tests / validation
- `npm run lint`
- `npm run build`
- `node --test src/ui-layout.test.ts`
- Any game logic tests already present in `src/game/*.test.ts`

Manual checks:
- Prepare → play → result flow still works.
- Dice and turn UI still respond correctly.
- UI reads from one shared state source.
- Repeated rolls no longer rely on scattered state duplication.
- No new regression in mobile/desktop layout.

## Risks / tradeoffs
- Moving to Pinia introduces a new dependency and a migration step.
- If too much Pixi-specific state is moved into the store, the store may become bloated.
- If too little is moved, the codebase will still feel fragmented.
- A phased migration is safer than a big-bang rewrite.

## Open questions
- Should the store hold only game/UI state, or also transient animation flags?
- Do we want one central store for the whole game, or separate store modules for prepare/play/result?
- Should the Pixi scene read directly from the store, or through a derived adapter object to keep the renderer decoupled?
