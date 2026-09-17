# Plan: show all stacked pieces when multiple棋子 occupy the same slot

## Goal
Fix the flight-ludo board so that when multiple pieces land on the same position, all of them remain visible instead of only the most recently arrived piece.

## Current context / assumptions
- The board uses Pixi rendering in `src/composables/flight-ludo-play-scene/boardRenderer.ts`.
- Piece positions are resolved through `resolvePiecePoint(...)` and rendered per piece.
- The current issue is visual stacking/collision at identical coordinates, not game logic.
- The preferred behavior is to keep all pieces visible in a shared slot by offsetting them slightly or otherwise fanning them out while preserving the same logical position.
- This should not change move rules, capture rules, or base/finish progression.

## Proposed approach
Add a small, deterministic visual offset layer for pieces that share the same logical coordinate.

Likely implementation shape:
- Group rendered pieces by their resolved point or by a stable slot key.
- For groups with more than one piece, apply a small arrangement offset around the anchor position.
- Keep offsets stable per piece so pieces do not jitter between renders.
- Preserve each piece’s logical position for hit testing and movement logic; only the on-screen coordinates should change.

## Step-by-step plan
1. Inspect the piece rendering loop in `src/composables/flight-ludo-play-scene/boardRenderer.ts`.
2. Find where piece coordinates are assigned from `resolvePiecePoint(...)`.
3. Add a grouping step so pieces with the same slot/point can be detected before rendering.
4. Define a small offset pattern for stacks, such as a 2x2 grid or a compact radial fan.
5. Apply the offset only when two or more pieces share the same logical slot.
6. Keep the offset size small enough that the pieces still read as occupying the same square/base cell.
7. Make the placement deterministic so the same piece always lands in the same visual sub-position within the stack.
8. Verify that stacked pieces are still clickable/legible and that movement animations continue to work.
9. Add or update tests to guard against regressions in stacked-piece rendering.
10. Run lint and targeted tests after the change.

## Files likely to change
- `src/composables/flight-ludo-play-scene/boardRenderer.ts`
- `src/composables/flight-ludo-play-scene/moveController.ts` if the move path preview also needs stack-aware offsets
- `src/composables/flight-ludo-play-scene/boardLayout.ts` only if any slot metadata is needed for better stack placement
- `src/composables/flight-ludo-play-scene/boardLayout.test.ts` or `src/ui-layout.test.ts` if regression coverage is added there

## Tests / validation
- `npx eslint src/composables/flight-ludo-play-scene/boardRenderer.ts`
- `node --test src/composables/flight-ludo-play-scene/boardLayout.test.ts` if layout helpers change
- `node --test src/ui-layout.test.ts` if the stacking behavior is asserted through source-regression checks
- `npm run build` once the existing unrelated TS issue is cleared

Manual checks:
- Put 2, 3, and 4 pieces on the same base slot and confirm all remain visible.
- Put multiple pieces on the same track cell and confirm they do not collapse into one sprite.
- Confirm stacked pieces still look like a tight cluster rather than scattered apart.
- Confirm normal single-piece placement is unchanged.

## Risks / tradeoffs
- If the offset is too large, stacked pieces may look like they occupy adjacent cells instead of one slot.
- If the offset is too small, pieces may still visually overlap too much.
- Any stack arrangement must remain stable across redraws to avoid visual jitter.
- Hover/click handling may need attention if the topmost sprite captures interaction differently from the rest.

## Open questions
- Should stacks be arranged differently in base slots versus track slots?
- Should the active piece in a stack be visually emphasized slightly, or should all pieces remain equal?
- Do we want a fixed 2x2 stack pattern, or a slot-aware fan that depends on how many pieces are stacked?
