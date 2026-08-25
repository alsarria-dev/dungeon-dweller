# `src/` — JavaScript

Three plain scripts. No modules, no bundler, no transpilation: what is written here
is what the browser executes.

| File | Loaded by | Responsibility |
|------|-----------|----------------|
| [`elements.js`](elements.js) | `html/game.html` (first) | Tuning constants, geometry helpers, audio registry, entity classes. Exposes the `DD` global. |
| [`script.js`](script.js) | `html/game.html` (second) | Builds the world, reads input, runs the game loop, updates the HUD, ends the run. |
| [`index.js`](index.js) | `index.html` | Main-menu behaviour only. Shares nothing with the other two. |

Load order matters: `script.js` reads `DD` at parse time, so `elements.js` must come
first. Both are wrapped in IIFEs under `"use strict"`, so nothing leaks to `window`
except `DD` itself.

## How the two game files divide the work

The split is **"what an entity is"** versus **"what happens this frame"**.

`elements.js` knows how a single entity moves, renders itself, and takes damage. It
knows nothing about the run: no score, no spawn schedule, no pause state, no other
entities. `Enemy.chase()` takes the player as an argument rather than looking one up.

`script.js` owns everything plural and everything temporal — the entity lists, the
clock, the timers, input, and the order in which each frame's work happens.

The full interface between them is `DD`'s export list:

```js
const { CONFIG, clamp, overlaps, resolve, Sfx, Player, Enemy, FieldObject, Fireball } = DD;
```

Anything not on that list (`sizeCache`, `FIREBALL_ROTATION`, `ENEMY_VARIANTS`'
internals) is private to the library. Keep it that way when adding features: if
`script.js` needs something new from an entity, add a method or a config key rather
than reaching in.

## Conventions

- **Units.** Speeds are pixels per second, cooldowns and durations are milliseconds.
  Simulation methods take `dt` in *seconds*; `step()` also receives `dtMs` for
  millisecond timers. Multiplying the wrong one by 1000 is the easy mistake here.
- **Constants live in `CONFIG`.** New tunable numbers go there, not inline in the loop.
- **Never write a sprite from JavaScript.** Set `data-facing` or toggle a class and
  let CSS choose the image.
- **Never write `top`/`left`.** Position goes through `Entity.render()`, which uses a
  `translate3d` transform.
- **Guard DOM writes** with a cached previous value, following the existing
  `_transform` / `_facing` / `_barWidth` / `lastHud` pattern.
- **No `innerHTML`.** Overlay content is built with `createElement` and `textContent`.
- **Removal is a flag.** Set `alive = false` (or call `destroy()`); `compact()` sweeps
  the lists once per frame. Do not splice during iteration.

## Reading order for a newcomer

1. `CONFIG` and `ENEMY_VARIANTS` at the top of `elements.js` — the whole game's balance
   on one screen.
2. `Entity` — the render/caching pattern every other class inherits.
3. `step()` in `script.js` — one frame of the game, top to bottom.
4. `blockMovement()` in `script.js` — the trickiest function in the repo, and the one
   most likely to be broken by an innocent-looking change.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for the collision model and frame
lifecycle in detail.
