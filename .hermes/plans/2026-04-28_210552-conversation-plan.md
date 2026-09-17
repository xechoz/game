# Plan: Fix red-player start/end points and route numbering

## Goal
Correct the red player's path markers so they follow the user-defined rule:
- `0` = base
- `1` = the first step on the outer track
- the route continues along the track in the correct order
- the final endpoint is the actual finish/home destination, not an arbitrary point

The currently rendered numbered path does not match the intended start/end semantics.

## Current context / assumptions
- The play page background is already set to white.
- The current route numbering was added in `src/composables/flight-ludo-play-scene/boardRenderer.ts`.
- The board geometry and route generation live in `src/composables/flight-ludo-play-scene/boardLayout.ts`.
- The user has explicitly corrected the model of the path:
  - base is the launch point
  - `1` should be the first playable outer-track point after leaving base
  - the outer-track step indexes must match the board geometry; in particular, the current numbering is wrong around the left-bottom corner, where step `7` should land
  - the route numbering should reflect the actual game path, not a loose visual graph
- Previous attempts mixed together outer-track points, home-entry points, and finish slots in a way that made the shown start/end points incorrect.

## Proposed approach
1. Re-read the route-building logic in `boardLayout.ts` and separate three concepts clearly:
   - base / launch position
   - outer track progression
   - home/finish lane progression

2. Redefine the red route numbering source of truth:
   - `0` should not be a track point; it should be the base slot or the launch origin
   - `1` should be the first playable outer-track point after the base launch
   - intermediate labels should follow the real track order
   - the final label should land on the actual finish slot determined by `homeSteps`

3. Update `boardRenderer.ts` so the labels are attached to the intended semantic points instead of just iterating a raw mixed route array.
   - If needed, build a small helper that returns the red route milestones explicitly.
   - Keep the visual dotted route if it still matches the board.
   - Ensure the numbered labels do not imply a false starting point or ending point.

4. If the route data model is too ambiguous, adjust the layout data structure in `types.ts` or `boardLayout.ts` to expose named points such as:
   - base point
   - first outer step
   - home-entry point
   - finish endpoint

5. Verify that the red route still matches the user's chosen reference direction and that the numbering does not shift when board presets change.

## Files likely to change
- `src/composables/flight-ludo-play-scene/boardLayout.ts`
- `src/composables/flight-ludo-play-scene/boardRenderer.ts`
- possibly `src/composables/flight-ludo-play-scene/types.ts`

## Tests / validation
- Visually confirm that:
  - `0` is shown at base
  - `1` is the first outer-track step
  - the route numbering proceeds in the correct direction
  - the finish/end point is the actual home destination
- Check all board presets, especially the current preset used in play mode.
- If tooling is available, run the project build or at least the relevant TypeScript/Vite validation after the geometry update.

## Risks / tradeoffs
- The route numbering may need to be decoupled from the actual `trackPoints` array if that array is only a geometric helper.
- Changing the point model may affect piece movement rendering, so the movement path and the static label overlay should be kept consistent.
- The finish point definition must remain compatible with `homeSteps` and with the existing movement rules.

## Open questions
- Should `0` be drawn on the base slot itself, or on a small label marker near the base?
- Should the final endpoint label be placed on the last finish slot or on the home-entry connection point?
- Do we want the red-route labels only, or should the same semantic markers later be reusable for the other three colors too?
