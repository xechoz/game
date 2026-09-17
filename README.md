# Vue + Pixi + TypeScript Template

A minimal template for future HTML/JS mini games.

## Stack

- Vue 3
- TypeScript
- PixiJS 8
- Vite
- ESLint
- Prettier

## Development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm run format:check
npm run build
```

## Build

```bash
npm run build
```

## GitHub Pages

This repository is configured to deploy via GitHub Actions to GitHub Pages on every push to `main`.

After the first successful deployment, the site will be available at:

`https://xechoz.github.io/game/`

## How to use as a template

1. Click `Use this template` on GitHub, or clone this repository.
2. Rename the project for your game.
3. Keep `src/App.vue` as the Pixi bootstrapping entry.
4. Put gameplay code in `src/game/`.
5. Put shared assets in `src/assets/`.
6. Replace the placeholder copy and canvas shell with your game UI.

## Conventions

- Keep the project empty by default.
- Put Pixi initialization in the root view component only.
- Keep reusable game logic in `src/game/`.
- Keep rendering assets in `src/assets/`.
- Prefer small, focused commits when evolving the template.
