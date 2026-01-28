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
| **Attack Power** | 10 | Damage dealt per slash attack |
| **Movement Speed** | 5 pixels/frame | Character velocity |

### Combat System
- **Melee Attack**: Instantly deals damage to nearby enemies
- **Fireball Spell**: Ranged attack consuming mana, perfect for distant enemies
- **Enemy Attacks**: Take damage when enemies connect with melee attacks
- **Knockback Physics**: Realistic collision-based movement when hit

### Resource Management
- **Health**: Regenerates slowly when not in combat
- **Mana**: Regenerates between spell casts
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
│   ├── game_styles.css       # Game area styling
│   ├── restart_styles.css    # Game over screen styling
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
| `↑ / W` | Move up |
| `↓ / S` | Move down |
| `← / A` | Move left |
| `→ / D` | Move right |
| `K` | Melee attack (slash) |
| `L` | Cast fireball spell |

---

## 🔧 Development

### Running the Development Server
```bash
# Node.js (if http-server installed)
npx http-server
```
Or Install VS Code Live Server extension (Live Server: Open with Live Server)

### Code Architecture

**gamePlayer Class** (`elements.js`)
- Manages player position, health, and mana
- Handles movement and collision detection
- Processes attack and spell casting

**Enemy Classes** (`elements.js`)
- Different enemy types with unique behaviors
- AI pathfinding towards player
- Attack cooldown management

**Collision System**
- Pixel-perfect AABB collision detection
- Response handling for environment obstacles
- Damage calculation on enemy contact

**Game Loop** (`script.js`)
- 60 FPS rendering and update cycle
- Enemy spawning and management
- Sound effect triggering
- Score calculation

---

## 🗺️ Roadmap

### Current Status: 🟢 Active Development

### Known Issues
- [ ] Occasional animation frame stuttering at high enemy counts
- [ ] Game Speed not defined to elapsed time but controlled by Browser
- [ ] Not enough element caching impacting rendering
- [ ] Mana regeneration balance needs tuning

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

*Last Updated: January 2026*