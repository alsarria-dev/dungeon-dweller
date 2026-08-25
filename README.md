# 🎮 Dungeon Dweller

> An immersive 2D dungeon exploration and combat game built with vanilla JavaScript and HTML5

![Game Status](https://img.shields.io/badge/Status-Active-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)
![HTML5](https://img.shields.io/badge/HTML5-E34C26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Getting Started](#-getting-started)
- [How to Play](#-how-to-play)
- [Game Mechanics](#-game-mechanics)
- [Project Structure](#-project-structure)
- [Technologies](#-technologies)
- [Controls](#-controls)
- [Development](#-development)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)

---

## 🎯 Overview

**Dungeon Dweller** is an action-packed 2D dungeon exploration game where you navigate through treacherous environments filled with enemies and obstacles. Battle fierce monsters, manage your health and mana, cast spells, and survive the dangers lurking in the depths of the dungeon.

This project is built entirely with vanilla JavaScript, HTML5, and CSS3—no external game engines or frameworks required.

---

## ✨ Features

- **Dynamic Player Movement**: Smooth 4-directional character movement with animation support
- **Real-time Combat System**: Engage enemies with slash attacks and manage combat cooldowns
- **Magic Spell System**: Cast devastating fireball spells using mana
- **Health & Mana Management**: Strategic resource management with visual health and mana bars
- **Enemy AI**: Multiple enemy types with intelligent pathfinding and attack patterns
- **Environmental Obstacles**: Interact with lakes and rocks that block movement
- **Audio System**: Immersive sound effects for all actions (slash, fireball, kill sounds, etc.)
- **Score Tracking**: Earn points by defeating enemies and completing objectives
- **Game Over Detection**: Comprehensive game state management with restart functionality
- **Collision Detection**: Pixel-perfect collision detection for all game entities

---

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, or Edge)
- No additional dependencies or npm packages required!

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/dungeon-dweller.git
cd dungeon-dweller
```

2. **Open the game**
Simply open `index.html` in your web browser:
```bash
# Using a local server (recommended)
python -m http.server 8000
# Then navigate to http://localhost:8000

# Or directly open the file
open index.html  # macOS
start index.html # Windows
```

---

## 🎮 How to Play

1. **Start the Game**: Click "Start Game" on the main menu
2. **Navigate**: Use arrow keys or WASD to move your character through the dungeon
3. **Combat**: Approach enemies and press `K` to attack with your sword
4. **Cast Spells**: Press `L` to launch fireball attacks (costs mana)
5. **Survive**: Avoid enemy attacks and environmental hazards
6. **Win**: Defeat all enemies and reach the end of the dungeon

### Objective
- Survive waves of enemies
- Collect experience and power-ups
- Maximize your score before the game ends

---

## 🕹️ Game Mechanics

### Player Stats
| Stat | Value | Description |
|------|-------|-------------|
| **Health** | 100 | Life points; game ends at 0 |
| **Mana** | 100 | Resource for casting spells |
| **Attack Power** | 10 | Damage dealt per spear strike |
| **Movement Speed** | 300 px/second | Frame-rate independent; diagonals are normalised |
| **Strike Cooldown** | 320 ms | Minimum time between melee attacks |
| **Cast Cooldown** | 260 ms | Minimum time between fireballs |

### Combat System
- **Melee Attack**: Strikes a reach box in the direction you are facing
- **Fireball Spell**: Ranged attack consuming mana, perfect for distant enemies
- **Enemy Attacks**: Take damage when an enemy is in contact and off cooldown
- **Solid Bodies**: Enemies cannot be shoved. Walking into one stops you (you
  slide along it rather than sticking), and an enemy walking into you never
  displaces you - so nothing can push you into the lava

### Resource Management
- **Health**: Restored only by defeating enemies (+30 per skeleton, +100 per brute)
- **Mana**: Regenerates 10 per second, capped at 100; each fireball costs 20
- **Strategic Choices**: Decide between melee attacks (free) and spells (mana cost)

---

## 📁 Project Structure

```
dungeon-dweller/
├── index.html                 # Main menu page
├── README.md                  # Project documentation
├── html/
│   └── game.html             # Game page
├── src/
│   ├── index.js              # Main menu functionality
│   ├── script.js             # Game loop and core mechanics
│   └── elements.js           # Game object classes (Player, Enemy, Fireball, etc.)
├── styles/
│   ├── index_styles.css      # Main menu styling
│   ├── game_styles.css       # Game area, HUD and overlay styling
│   └── fonts/                # Custom font files
├── images/
│   ├── character_*.png       # Character sprite images
│   ├── animations/           # Character movement animations
│   │   └── character/
│   │       ├── moveDown/
│   │       ├── moveLeft/
│   │       ├── moveRight/
│   │       └── moveUp/
│   └── favicon.ico           # Browser tab icon
└── sounds/
    ├── intro_audio.mp3       # Menu background music
    ├── gameMusic.mp3         # Game background music
    ├── slash.mp3             # Melee attack sound
    ├── fireball.mp3          # Spell cast sound
    ├── kill.mp3              # Enemy defeat sound
    ├── dead.mp3              # Player death sound
    ├── enemyslash.mp3        # Enemy attack sound
    ├── gameOver.mp3          # Game over music
    └── openBox.mp3           # Item collection sound
```

---

## 💻 Technologies

| Technology | Purpose |
|-----------|---------|
| **HTML5** | Game structure and semantic markup |
| **CSS3** | Styling, animations, and responsive design |
| **Vanilla JavaScript** | Game logic, physics, and event handling |
| **Web Audio API** | Sound effects and music playback |

**No frameworks or libraries** - pure JavaScript game development!

---

## ⌨️ Controls

### Menu Navigation
| Key | Action |
|-----|--------|
| `Click` | Navigate menu options |

### In-Game Controls
| Key | Action |
|-----|--------|
| `W` / `↑` | Move up |
| `S` / `↓` | Move down |
| `A` / `←` | Move left |
| `D` / `→` | Move right |
| `K` | Strike with the spear |
| `L` | Cast fireball spell (20 mana) |
| `P` / `Esc` | Pause / resume |

On the game-over screen, `Enter` restarts and `Esc` returns to the menu. The game
also pauses itself when the tab loses focus.

---

## 🔧 Development

### Running the Development Server
```bash
# Node.js (if http-server installed)
npx http-server
```
Or Install VS Code Live Server extension (Live Server: Open with Live Server)

### Code Architecture

Both source files are plain scripts - no build step, no bundler.

**`elements.js`** exposes a single `DD` global containing the tunable `CONFIG`,
the geometry helpers, the audio wrapper, and the entity classes.

- `Entity` - shared base. Positions entities with `transform: translate3d(...)`
  so movement is composited rather than triggering layout, and guards every DOM
  write behind a cached previous value, so a stationary entity costs nothing.
- `Player` / `Enemy` / `FieldObject` / `Fireball` extend it. `Enemy` covers both
  the skeleton and the brute through the `ENEMY_VARIANTS` table rather than two
  near-identical classes.
- `overlaps(a, b)` is a side-effect-free AABB test used for hit detection;
  `resolve(a, b)` pushes `a` out of `b` along the axis of least penetration and
  is used for physical blocking. Keeping them separate is what stops attacking
  from shoving the attacker around.

**`script.js`** owns the world, input, HUD and the loop.

- Fixed-timestep accumulator at 60 Hz with a 250 ms clamp, so the simulation
  runs identically on a 60 Hz and a 144 Hz display and cannot fast-forward after
  the tab is backgrounded.
- Spawning, mana regen and the survival clock are driven off simulated time
  inside the loop, so they stop cleanly on pause and on game over.
- Entities carry an `alive` flag and are swept once per frame by `compact()`,
  instead of being spliced out of an array that is mid-iteration.

### Tuning
Gameplay constants live in one place - `CONFIG` and `ENEMY_VARIANTS` at the top
of `src/elements.js`. Speeds are px/second, cooldowns are milliseconds.

---

## 🗺️ Roadmap

### Current Status: 🟢 Active Development

### Recently Fixed
- [x] Game speed is now tied to elapsed time instead of the browser's frame rate
- [x] Animation frame stuttering - walk frames are warmed up after first paint
- [x] Element caching - sprite/facing changes are driven by CSS attribute
      selectors instead of per-frame inline style writes
- [x] Fireball key was bound twice, so every cast spent 40 mana and spawned two
      projectiles
- [x] Attacking no longer displaces the player
- [x] Held keys no longer stick when the window loses focus
- [x] Resizing re-lays out the arena instead of reloading and losing the run

### Known Issues
- [ ] Walk-cycle frames are ~238x356 but display at 40x90, so the sprite sheet is
      about 4 MB heavier than it needs to be
- [ ] Mana regeneration balance needs tuning
- [ ] No mobile/touch controls

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Write clean, commented code
- Test all new features before submitting
- Follow the existing code style
- Update documentation for major changes

---

## 📊 Project Tracker

Track active development and feature progress:
- [Project Tracker](https://shorturl.at/fktV1)

---

## 📝 License

This project is open source and available under the **MIT License**.

---

## 🎮 Enjoy the Game!

**Dungeon Dweller** is perfect for:
- Learning vanilla JavaScript game development
- Understanding collision detection and game loops
- Exploring HTML5 Canvas alternatives
- Building fun, interactive web experiences

### Quick Start Commands
```bash
git clone <repository-url>
cd dungeon-dweller
# Open index.html in your browser
open index.html
```

---

## 📮 Support & Feedback

Have questions or suggestions? Feel free to:
- Open an issue on GitHub
- Submit feature requests
- Report bugs you encounter
- Share your high scores!

---

**Made with ❤️ by the Dungeon Dweller Team**

*Last Updated: August 2026*