# Plan: Implement resource-driven glossy dice renderer & UI (flight-ludo)

Date: 2026-04-28 21:02:01
Author: Hermes Agent (plan)

## Goal
Implement a resource-driven dice renderer and accompanying Vue UI that:
- Uses the existing public/dice-1.svg ... public/dice-6.svg assets directly.
- Renders a glossy, enamel-like dice appearance.
- Keeps seams/front/top/right faces visually "tight" with no visible gaps.
- Shows the idle question prompt centered inside the current face (transparent background, printed-on-dice look, no black shadow artifacts).
- Is usable inside the existing Pixi.js play screen (fits into the Play UI flow: prepare → play → result).

This plan is focused and scoped: it covers renderer design, Vue wrapper, UX details (idle prompt), animation states (idle/rolling/landed), and tests/validation steps. It does not implement code — only describes concrete changes and verification.

## Current context / assumptions
- The project is a Vue 3 + TypeScript + PixiJS 8 + Vite template (flight-ludo). Root game entry: src/App.vue and gameplay code under src/game/.
- The public assets dice-1.svg ... dice-6.svg already exist in the project's public/ directory.
- Play screen owns the Pixi canvas; play-screen controls sit above/aside the board and must not cover it.
- The user prefers the dice to look like glossy enamel, with tight seams on the front/top/right faces and an idle question prompt printed on face texture.
- No code will be modified in this plan step — only a plan document is saved.

If any assumption above is incorrect, update the plan scope before starting implementation.

## Proposed approach (high level)
1. Create a Pixi-native DiceRenderer class (TypeScript) that accepts resource paths for the 6 face textures and exposes an API: setFace(n), rollAnimation(), setIdlePrompt(text), setSize(px).
2. Drive textures directly from public/ SVG paths. For Pixi + Vite, use absolute public URLs (e.g. `/dice-1.svg`) or import via new URL if necessary for bundling.
3. Compose the dice visually from layered sprites to achieve glossy enamel and tight seams:
   - Base face sprite (the SVG texture).
   - Specular highlight overlay (small, semi-transparent PNG or a procedurally-generated PIXI.Graphics gradient) to give glossy enamel.
   - Edge-overlay/trim sprite (thin mask) to visually tighten seams between adjacent faces.
   - Idle prompt rendered as a centered PIXI.Text or SVG overlay texture, with transparent background and no drop shadow.
4. Wrap DiceRenderer in a Vue component (src/game/dice/Dice.vue) that exposes props and events and integrates with the Play screen.
5. Add unit-ish test harnesses and manual verification steps (visual acceptance tests).

Rationale: layering keeps the original SVG artwork untouched (uses assets as-is). Overlays allow the glossy look without modifying SVGs and provide control over seams and prompt rendering.

## Step-by-step implementation plan
(Use this checklist when writing the code; each step is concrete and contains file paths likely to change.)

1. Add DiceRenderer core (TypeScript)
   - Create: src/game/dice/DiceRenderer.ts
   - Responsibilities:
     - Load 6 textures from public paths (absolute '/dice-1.svg'... '/dice-6.svg') via PIXI.Assets or PIXI.Texture.from.
     - Create a PIXI.Container with child sprites: face sprite, highlight sprite, seam-trim sprite, prompt container.
     - Expose methods:
       - constructor(options: {paths: string[], sizePx?: number, initialFace?: number})
       - setFace(faceIndex: 1|2|3|4|5|6)
       - rollAnimation(durationMs?: number): Promise<void>
       - setIdlePrompt(text: string | null)
       - setSize(px: number)
     - Implement pixel-snapping (positions on integers) and disable subpixel rendering for seam-critical overlays.
     - Avoid any drop-shadow filters on face or prompt layers. Use stroke/outline where needed instead.
   - Notes on Pixi usage:
     - For SVGs in public, using PIXI.Texture.from('/dice-1.svg') works at runtime. If bundler issues occur, use new URL('/dice-1.svg', import.meta.url).href.
     - Ensure scaleMode is appropriate for crispness. Use PIXI.SCALE_MODES.LINEAR for vector->raster scaling but rely on integer sizes for seam precision.

2. Create Vue wrapper component
   - Create: src/game/dice/Dice.vue
   - Responsibilities:
     - Mount a Pixi canvas or accept the parent Pixi stage/container (preferred: accept parent container via provide/inject or prop 'parentContainer').
     - Provide props: face (number), size (number), idlePrompt (string | null), rolling (boolean), accessibleLabel (string).
     - Emit events: roll-start, roll-end, clicked.
     - On mount, instantiate DiceRenderer and add its container to the provided parent. On unmount, clean up.
     - Provide click/tap handling by intercepting pointerdown on the dice container and emitting clicked.

   - File: src/game/dice/Dice.vue
   - Small CSS: src/game/dice/Dice.css (if needed) for any DOM-level controls near the canvas.

3. Integrate into Play screen
   - Edit: src/game/ui/PlayScreen.vue or src/views/Play.vue (depending on repo structure)
   - Replace or add existing dice UI to use the new Dice Vue component. Ensure dice controls remain above/aside the board but not covering it.
   - Wire game state to props: when dice should show idle prompt (e.g., 'Roll?') call setIdlePrompt("?") or pass idlePrompt prop.
   - Ensure dice is keyboard-accessible: bind Enter/Space to emit click event when focussed.

4. Graphics assets and overlays
   - Option A (fast): Use a small PNG specular highlight overlay asset (e.g., public/dice-highlight.png) sized to the dice and tinted/alpha-blended in PIXI.
   - Option B (vector): Create highlight via PIXI.Graphics with gradient and alpha to simulate glossy enamel.
   - Create an optional seam-trim overlay (thin border along front/top/right) to hide micro-gaps introduced by rasterization.
   - Files (if added): public/dice-highlight.png, public/dice-trim.png

5. Animation and state transitions
   - Implement rollAnimation in DiceRenderer:
     - Simple approach: animate rotation and swap face textures at end. Use gsap or PIXI.Ticker + easing.
     - More elaborate: use frame-based 3D-like tumble with easing for believable motion.
     - Always resolve Promise on animation end and emit roll-end event in the Vue wrapper.

6. Idle prompt rendering
   - Render the prompt centered in the face via PIXI.Text with these style choices:
     - fill: light color (e.g., #ffffff) if face is dark, or choose adaptive contrast.
     - stroke: 1-2 px subtle stroke, but avoid strong black drop shadows (no dropShadow filter).
     - align: center both horizontally and vertically; anchor set to 0.5,0.5 and positioned at face center.
   - Alternative: rasterize prompt into a small transparent PNG (only if text style needs anti-aliased control on export).

7. Tests, verification & QA
   - Add unit-ish tests (non-visual) to verify renderer API loads textures and switches face indices without throwing:
     - File: tests/unit/dice.spec.ts
     - Use Vitest with jsdom mocking of PIXI (or run lightweight integration test in a headful browser during CI).
   - Manual visual QA checklist (must be performed by developer/tester):
     - Idle prompt appears centered, inside face, no black shadow artifacts.
     - Seams between faces (front/top/right) show no visible gaps at target sizes (50–200 px).
     - Roll animation feels responsive and resolves correctly to a final face.
     - Click/tap on dice triggers expected game actions; accessible via keyboard.
     - Verified in Chrome & Firefox at devicePixelRatio = 1 and 2.
   - Optional: add a visual snapshot test using Playwright or Storybook snapshotting if CI supports browser runs.

8. Documentation & developer notes
   - Update README or docs: docs/dice.md or README under src/game/dice/ describing API and how to change assets.
   - Add usage example in PlayScreen comments.

## Files likely to change (exact paths)
- src/game/dice/DiceRenderer.ts (new)
- src/game/dice/Dice.vue (new)
- src/game/dice/Dice.css (optional)
- src/game/ui/PlayScreen.vue or src/views/Play.vue (edit)
- tests/unit/dice.spec.ts (new)
- public/dice-highlight.png (optional)
- public/dice-trim.png (optional)
- docs/dice.md (new)

If the project organizes game code under src/game/, use that folder. If PlayScreen component has a different path, adapt accordingly.

## Tests / validation steps (concrete acceptance criteria)
1. Automated smoke test (unit): instantiate DiceRenderer in Node/JSDOM test to ensure loadTextures() does not throw and setFace(1..6) works.
   - Target file: tests/unit/dice.spec.ts
2. Manual visual acceptance:
   - Start dev server (npm run dev).
   - Navigate to Play screen and verify:
     - Idle prompt text is centered on dice face and uses transparent background.
     - No drop shadow or dark artifact around prompt.
     - Dice seams on front/top/right faces look continuous (no visible white/black gaps) at 100px and 200px sizes.
     - Rolling animation resolves to a valid face and emits roll-end event.
3. Cross-browser check: test in Chrome and Firefox, devicePixelRatio 1 and 2.
4. Accessibility: dice has aria-label updated on face change and responds to keyboard activation.

## Risks, tradeoffs, and open questions
- Vector vs raster: using SVGs from public preserves crisp vector artwork, but rasterization in the browser can create micro-gaps when adjacent faces are simulated via overlays. Mitigation: use seam-trim overlays and pixel-snapping (integer positioning), or rasterize single-face assets at exact pixel sizes.
- Using PIXI filters (dropShadow) can reintroduce dark artifacts; avoid these for the prompt layer.
- If the bundler does not serve '/dice-1.svg' at runtime, importer patterns (new URL(import.meta.url)) must be used. Verify Vite/public handling.
- Visual snapshot tests require a headful browser in CI; if unavailable, manual QA is required.
- Performance: layering overlays and highlight sprites increases draw calls slightly. Keep highlight overlays small and use batchable textures where possible.

Open questions to confirm before implementation:
1. Preferred default dice size in the Play UI (px). I suggest 100px square as default; user preference could be 80 or 120.
2. Do you want the specular highlight to be an asset (PNG) or procedurally drawn? Asset is faster to implement; procedural is more flexible.
3. For seam-tightening: are you open to adding trim overlay assets, or should we attempt pure-positioning fixes first?

## Estimated implementation time
- DiceRenderer core + texture loading: 2–4 hours
- Vue wrapper and PlayScreen integration: 1–2 hours
- Specular/highlight and seam overlay tuning: 1–3 hours (depends on visual iteration)
- Animation polish and events: 1–2 hours
- Tests & docs: 1–2 hours
Total: 6–13 hours (one developer, single session plus visual tuning)

---

If you'd like, I can next (pick one):
- Produce the actual TypeScript DiceRenderer and Vue component (I will implement files listed above), or
- Create a minimal PoC design sketch for the layering approach (SVG overlays + highlight) showing how to combine the existing assets.

If you prefer a different plan (toolbar/layout focus or full-project roadmap), tell me and I'll write that plan instead.
