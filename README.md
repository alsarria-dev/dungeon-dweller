# 🎮 Dungeon Dweller

> An endless 2D dungeon survival game built with vanilla JavaScript and HTML5 — no engine, no framework, no build step.

![Game Status](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)
![HTML5](https://img.shields.io/badge/HTML5-E34C26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Getting Started](#-getting-started)
- [How to Play](#-how-to-play)
- [Game Mechanics](#-game-mechanics)
- [Project Structure](#-project-structure)
- [Technologies](#-technologies)
- [Development](#-development)
- [Where to Go Next](#-where-to-go-next)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)

---

## 🎯 Overview

**Dungeon Dweller** is a top-down arena survival game. You control a lone spear-carrier
in a stone dungeon while skeletons and the occasional armoured brute spawn around you
and close in. Kill them to claw back health and mana; they are your only source of both.

There is **no win condition and no end of the dungeon** — enemies keep coming, and the
run ends when your health reaches zero. Your result is the score, kill count and
survival time shown on the game-over card.

The whole game is vanilla JavaScript, HTML and CSS. There is no game engine, no
bundler, no dependency to install, and no `package.json`. The browser loads the
source files as they are written.

---

## 🚀 Getting Started

### Prerequisites

- A modern browser (Chrome, Firefox, Safari, or Edge)
- Any static file server. Python 3 (preinstalled on macOS/Linux) or Node.js both work.

Nothing else — there is no install step and no dependency tree.

### Run it locally

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd dungeon-dweller
   ```

2. **Start a static server from the repository root**

   ```bash
   python -m http.server 8000
   ```

   or, if you prefer Node:

   ```bash
   npx http-server -p 8000
   ```

   VS Code's Live Server extension also works (right-click `index.html` →
   *Open with Live Server*).

3. **Open the menu** at <http://localhost:8000> and click **Start Game**.

> **Serve it over HTTP — don't double-click `index.html`.**
> Opening the file directly gives the page a `file://` origin, where browsers
> apply stricter rules to media loading and audio playback. The game may look
> fine and then behave inconsistently. Always go through a local server.

### Tests and builds

There are **none**. This repository has no test suite, no linter config and no build
pipeline, so there is no command to run before committing. Changes are verified by
playing the game in a browser.

Two cheap sanity checks are available if you have Node installed:

```bash
node --check src/elements.js   # parse-check a source file
node --check src/script.js
node --check src/index.js
```

These only prove the files parse — they do not run the game.

---

## 🎮 How to Play

1. **Start the game**: click *Start Game* on the main menu.
2. **Move** with `WASD` or the arrow keys. Your character faces the direction you
   pressed most recently.
3. **Fight**: press `K` to stab with the spear. It hits everything in a rectangle
   directly in front of you.
4. **Cast**: press `L` to fire a fireball in the direction you are facing. It costs
   20 mana and explodes on the first thing it touches.
5. **Survive**: health only comes back by killing things. When it hits zero the run ends.

### Objective

Survive as long as you can and score as highly as you can. Skeletons are worth 10
points, brutes 100.

---

## 🕹️ Game Mechanics

### Player

| Stat | Value | Notes |
|------|-------|-------|
| **Health** | 100 | Run ends at 0. Only restored by kills. |
| **Mana** | 100 | Regenerates 10 per second, capped at 100. |
| **Spear damage** | 10 | Per strike. |
| **Spear reach** | 58 px | A rectangle in front of you, the width of your body. |
| **Movement speed** | 300 px/second | Diagonals are normalised so they are not faster. |
| **Strike cooldown** | 320 ms | Minimum gap between spear hits. |
| **Cast cooldown** | 260 ms | Minimum gap between fireballs. |

### Enemies

| | Skeleton | Brute |
|---|---|---|
| **Health** | 100 | 300 |
| **Damage per hit** | 5 | 20 |
| **Speed** | 165 px/s | 120 px/s |
| **Attack cooldown** | 700 ms | 900 ms |
| **Score** | 10 | 100 |
| **Health returned on kill** | +30 | +100 |
| **Mana returned on kill** | +40 | +100 |

Both are the same `Enemy` class with different numbers — see
[ARCHITECTURE.md](ARCHITECTURE.md) for how variants work.

### Spawning

- A skeleton spawns every **3.5 seconds**.
- A brute is forced in every **25 seconds**, unconditionally.
- A brute also arrives alongside a routine spawn once four or more enemies are on
  the field, but only if no brute is currently flagged as alive.
- Because the 25-second timer does not check first, **more than one brute can be
  on the field at once**.
- Spawns are placed at least **220 px** from you and clear of scenery, so nothing
  materialises on top of you.

### Combat and collision

- **Fireballs** travel at 1200 px/s, deal 25 damage, and die on their first hit —
  they cannot chain through a line of enemies. Rocks stop them; lava pools do not.
- **Enemy contact damage** is applied when an enemy is touching you and off cooldown.
  Enemies do not need to "swing"; standing next to one hurts.
- **Bodies are solid but nothing shoves anything.** Walking into an enemy stops you
  and lets you slide along it, and an enemy walking into you cannot push you — which
  is what stops you being shunted into a lava pool.
- **Lava pools and rocks block movement** for you and for enemies alike.

### Resource management

The core tension: melee is free but puts you in contact range, where you take damage.
Fireballs are safe but cost 20 mana and you only regenerate 10 per second. Killing
things is the only way to heal, so retreating indefinitely is not a strategy.

---

## 📁 Project Structure

| Path | What lives there |
|------|------------------|
| `index.html` | Main menu page — the entry point, and the only page at the repo root. |
| `html/` | The game page (`game.html`), which holds the arena, HUD and overlay markup. |
| `src/` | All JavaScript: the entity library, the game loop, and the menu script. See [src/README.md](src/README.md). |
| `styles/` | Stylesheets, plus the bundled MedievalSharp font. Entity sizes and sprites are defined here. See [styles/README.md](styles/README.md). |
| `images/` | Sprites, scenery textures, UI art, and the nine-frame walk cycles under `images/animations/`. |
| `sounds/` | Music and sound effects, loaded through `<audio>` elements declared in the HTML. |
| `ARCHITECTURE.md` | How the system fits together. Read this before your first change. |

---

## 💻 Technologies

| Technology | Purpose |
|-----------|---------|
| **HTML5** | Page structure; every entity is a `<div>`, and `<audio>` elements are the sound bank |
| **CSS3** | All artwork, entity dimensions, sprite/facing state, and walk-cycle animation |
| **Vanilla JavaScript** | Simulation, collision, input and HUD (ES2015 classes, no modules) |
| **HTML5 Audio** | Music and sound effects via plain `<audio>` elements |

**No frameworks, no libraries, no canvas** — the game is rendered as ordinary DOM
elements moved with CSS transforms.

---

## ⌨️ Controls

### In-game

| Key | Action |
|-----|--------|
| `W` / `↑` | Move up |
| `S` / `↓` | Move down |
| `A` / `←` | Move left |
| `D` / `→` | Move right |
| `K` | Strike with the spear |
| `L` | Cast fireball (20 mana) |
| `P` / `Esc` | Pause / resume |

### On the game-over screen

| Key | Action |
|-----|--------|
| `Enter` | Restart |
| `Esc` | Back to the main menu |

The game pauses itself when the tab loses focus, and held keys are released when the
window loses focus so your character does not run off on its own.

### Menu

The menu is mouse and keyboard accessible: `Tab` between items, `Enter` to activate,
`Esc` to close the instructions panel.

---

## 🔧 Development

### Making a change

Edit a file and reload the browser. That is the entire workflow — there is nothing
to compile and no dev server beyond the static file server.

### Tuning gameplay

Every balance number lives in one place: the `CONFIG` and `ENEMY_VARIANTS` objects at
the top of [`src/elements.js`](src/elements.js). Speeds are pixels per second and
cooldowns are milliseconds, so the values read the way you would say them out loud.
Change a number, reload, play.

### The one trap to know about

`html/game.html` sits one directory below the repo root, so **everything it references
uses a `../` prefix** — its `<script>` and `<link>` tags, the `url()`s in
`styles/game_styles.css`, and the image paths hardcoded in `src/script.js`. The menu,
at the root, uses `./`. Mixing these up produces a silently broken page: the layout
loads but sprites or sounds go missing.

### Debugging tips

- Sprites are real DOM nodes, so the browser's element inspector works normally —
  select a skeleton and watch its `transform` update live.
- Entity dimensions come from CSS. If an entity behaves as though it were the wrong
  size, check its class in `styles/game_styles.css` before looking at the JavaScript.
- Audio silently refuses to play until you have pressed a key or clicked. That is a
  browser autoplay policy, not a bug.

---

## 🧭 Where to Go Next

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the system as a whole: layers, the frame
  lifecycle, the collision model, and a "where do I look if I want to change X" map.
- **[src/README.md](src/README.md)** — how the three scripts divide the work.
- **[styles/README.md](styles/README.md)** — why the CSS carries real game state.

---

## 🗺️ Roadmap

### Recently fixed

- [x] Game speed is tied to elapsed time instead of the browser's frame rate
- [x] Walk frames are warmed up after first paint, removing animation stutter
- [x] Sprite/facing changes are driven by CSS attribute selectors instead of
      per-frame inline style writes
- [x] Fireball key was bound twice, so every cast spent 40 mana and spawned two projectiles
- [x] Attacking no longer displaces the player
- [x] Held keys no longer stick when the window loses focus
- [x] Resizing re-lays out the arena instead of reloading and losing the run

### Known issues

- [ ] Walk-cycle frames are ~238x356 but display at 40x90, so the sprite set is far
      heavier than it needs to be
- [ ] Mana regeneration balance needs tuning
- [ ] No mobile or touch controls
- [ ] No mute control, although the audio layer supports one

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Guidelines

- Keep gameplay constants in `CONFIG` / `ENEMY_VARIANTS` rather than scattering
  numbers through the loop.
- Preserve the rendering discipline described in ARCHITECTURE.md — transforms only,
  cached DOM writes, sprite state via CSS attributes.
- Play-test before submitting; there is no test suite to catch you.

---

## 📊 Project Tracker

- [Project Tracker](https://shorturl.at/fktV1)

---

## 📝 License

Open source under the **MIT License**.

---

**Made with ❤️ by the Dungeon Dweller Team**

*Last updated: August 2026*
