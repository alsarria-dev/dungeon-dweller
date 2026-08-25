# `styles/` — CSS

| File | Used by | Contents |
|------|---------|----------|
| [`index_styles.css`](index_styles.css) | `index.html` | Menu: title plaque, menu items, instructions panel. |
| [`game_styles.css`](game_styles.css) | `html/game.html` | Arena, entities, HUD, overlay, and every animation. |
| [`fonts/`](fonts) | both | Bundled MedievalSharp font, loaded via `@font-face`. |

## This CSS is not just presentation

`game_styles.css` holds state the simulation reads back. Three couplings to know
before editing it:

**1. Entity dimensions are defined here.** `.enemy` is `120px` tall and `70px` wide;
`#player` is `100x50`; `.rock` is `140x140`. The JavaScript creates the element, then
measures it with `getBoundingClientRect()` and uses the result as the hitbox. Change a
height here and you have changed collision behaviour. A new entity class **must** have
an explicit size, or it will measure as zero and never collide with anything.

**2. Sprite and facing state are driven by attributes.** JavaScript writes
`data-facing="up"` and toggles `.walking`; selectors do the rest:

```css
.icon[data-facing="up"]          { background-image: url("../images/character_up.png"); }
.icon.walking[data-facing="up"]  { animation: characterMoveUp 500ms step-end infinite; }
```

No JavaScript anywhere sets `background-image`. Renaming these selectors breaks the
game silently — the sprite simply stops changing.

**3. The explosion depends on custom properties.** A CSS animation overrides an
element's inline transform, so `@keyframes explode` would yank the blast to the
arena's origin. `Fireball.explode()` writes the impact point into `--ex` / `--ey`, and
every keyframe re-applies that translation. Keep the custom properties in all three
keyframe stops if you touch that animation.

## Layering

Entities are stacked by a `z-index` derived from their bottom edge, so lower sprites
overlap higher ones. That occupies roughly `2`–`500`. Everything above is reserved:

| Band | Occupant |
|------|----------|
| 2–500 | Depth-sorted entities |
| 600 / 700 | Fireballs / spear |
| 1500 | Low-health vignette |
| 1900 | Start hint |
| 2000 | HUD |
| 3000 | Overlay |

New UI belongs above 1500; new field entities belong in the depth-sorted band.

## Conventions

- **Colours come from custom properties** on `:root` (`--hp`, `--mp`, `--gold`,
  `--ink`, `--panel`, `--panel-edge`). Use them rather than new literals.
- **Positioned entities are `position: absolute; top: 0; left: 0`** and moved purely
  by transform, with `will-change: transform`. Never give them offsets.
- **Sizing uses `clamp()`** against viewport units so panels scale without breakpoints;
  there are only two media queries, plus a `prefers-reduced-motion` block.
- **Respect `prefers-reduced-motion`.** New animations should be disabled in that
  block, as the existing ones are.
- **Artwork is local.** Two backgrounds that were once remote images are now CSS
  gradients, and the overlay card is drawn in CSS rather than being a stretched PNG.
  Avoid reintroducing third-party asset requests.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for how the CSS layer fits the whole.
