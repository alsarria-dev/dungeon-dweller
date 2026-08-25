/**
 * Dungeon Dweller - entity library.
 *
 * Everything is exposed on the single `DD` global so that script.js can pull in
 * what it needs without either file reaching into the other's variables.
 */
const DD = (() => {
    "use strict";

    // ---------------------------------------------------------------- config
    // Speeds are px/second so the game plays identically on 60Hz and 144Hz.
    // Cooldowns and durations are milliseconds.
    const CONFIG = {
        step: 1000 / 60,          // fixed simulation step
        maxFrameTime: 250,        // clamp after tab-out so we never spiral
        player: {
            speed: 300,
            maxLife: 100,
            maxMana: 100,
            attack: 10,
            attackCooldown: 320,
            castCooldown: 260,
            meleeReach: 58,
            manaRegen: 10,
            manaRegenInterval: 1000,
        },
        fireball: { speed: 1200, attack: 25, manaCost: 20, explodeMs: 300 },
        spawn: { interval: 3500, bossInterval: 25000, softCap: 5, safeRadius: 220, maxTries: 24 },
    };

    const ENEMY_VARIANTS = {
        enemy: {
            className: "enemy", iconClass: "iconEnemy", barClass: "health-barEnemy",
            maxLife: 100, attack: 5, speed: 200, attackCooldown: 700,
            score: 10, lifeReward: 30, manaReward: 40,
        },
        enemySpecial: {
            className: "enemySpecial", iconClass: "iconEnemySpecial", barClass: "health-barEnemySpecial",
            maxLife: 300, attack: 20, speed: 150, attackCooldown: 900,
            score: 100, lifeReward: 100, manaReward: 100,
        },
    };

    // ------------------------------------------------------------- geometry
    const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

    /** Plain AABB overlap test. No side effects - safe to use for hit detection. */
    function overlaps(a, b) {
        return a.x < b.x + b.width
            && a.x + a.width > b.x
            && a.y < b.y + b.height
            && a.y + a.height > b.y;
    }

    /**
     * Push `a` out of `b` along the axis of least penetration and report whether
     * they were touching. This replaces the four hand-written sign trees that
     * used to live on each class.
     */
    function resolve(a, b) {
        if (!overlaps(a, b)) return false;
        const dx = (a.x + a.width / 2) - (b.x + b.width / 2);
        const dy = (a.y + a.height / 2) - (b.y + b.height / 2);
        const penX = (a.width + b.width) / 2 - Math.abs(dx);
        const penY = (a.height + b.height) / 2 - Math.abs(dy);
        if (penX < penY) {
            a.x += dx < 0 ? -penX : penX;
        } else {
            a.y += dy < 0 ? -penY : penY;
        }
        return true;
    }

    // ---------------------------------------------------------------- audio
    const Sfx = {
        tracks: {},
        muted: false,
        register(name, selector) {
            const el = document.querySelector(selector);
            if (el) this.tracks[name] = el;
        },
        play(name) {
            const track = this.tracks[name];
            if (!track || this.muted) return;
            track.currentTime = 0;
            // Autoplay policies reject until the first gesture; that is expected.
            const played = track.play();
            if (played) played.catch(() => { });
        },
        loop(name) {
            const track = this.tracks[name];
            if (!track || this.muted) return;
            track.loop = true;
            const played = track.play();
            if (played) played.catch(() => { });
        },
        stop(name) {
            const track = this.tracks[name];
            if (!track) return;
            track.pause();
            track.currentTime = 0;
        },
    };

    // --------------------------------------------------------------- entity
    /**
     * Shared position/render plumbing. Every write to the DOM is guarded by a
     * cached previous value, so a stationary entity costs zero style writes.
     */
    class Entity {
        constructor() {
            this.x = 0;
            this.y = 0;
            this.width = 0;
            this.height = 0;
            this.alive = true;
            this._transform = "";
            this._facing = "";
            this._barWidth = -1;
        }

        get centerX() { return this.x + this.width / 2; }
        get centerY() { return this.y + this.height / 2; }

        /** Compositor-only position update. Rounded to keep pixel art crisp. */
        render(rotation) {
            const x = Math.round(this.x);
            const y = Math.round(this.y);
            const transform = rotation
                ? `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`
                : `translate3d(${x}px, ${y}px, 0)`;
            if (transform !== this._transform) {
                this.element.style.transform = transform;
                this._transform = transform;
            }
        }

        /** Facing drives the sprite through CSS attribute selectors, not inline styles. */
        setFacing(icon, facing) {
            if (facing && facing !== this._facing) {
                icon.dataset.facing = facing;
                this._facing = facing;
            }
        }

        setBar(bar, percent) {
            const rounded = Math.round(clamp(percent, 0, 100));
            if (rounded !== this._barWidth) {
                bar.style.width = `${rounded}%`;
                this._barWidth = rounded;
            }
        }

        destroy() {
            this.alive = false;
            if (this.element) this.element.remove();
        }
    }

    // --------------------------------------------------------------- player
    class Player extends Entity {
        constructor(bounds) {
            super();
            this.element = document.querySelector("#player");
            this.icon = this.element.querySelector(".icon");
            this.healthBar = this.element.querySelector(".health-bar");
            this.manaBar = this.element.querySelector(".mana-bar");

            const rect = this.element.getBoundingClientRect();
            this.height = rect.height;
            this.width = rect.width;

            this.bounds = bounds;
            this.x = bounds.width / 2 - this.width / 2;
            this.y = bounds.height / 2 - this.height / 2;

            const cfg = CONFIG.player;
            this.speed = cfg.speed;
            this.attack = cfg.attack;
            this.maxLife = cfg.maxLife;
            this.maxMana = cfg.maxMana;
            this.life = cfg.maxLife;
            this.mana = cfg.maxMana;

            this.facing = "down";
            this.moving = false;
            this._moving = false;
            this.attackTimer = 0;
            this.castTimer = 0;
            this.gameOver = false;
            this.score = 0;

            this.render();
            this.setFacing(this.icon, this.facing);
        }

        /**
         * @param dt      seconds elapsed this step
         * @param input   { up, down, left, right, facing }
         */
        update(dt, input) {
            let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
            this.moving = mx !== 0 || my !== 0;

            if (this.moving) {
                // Normalise so diagonals are not ~1.41x faster than the axes.
                const scale = this.speed * dt / Math.hypot(mx, my);
                this.x += mx * scale;
                this.y += my * scale;
                this.x = clamp(this.x, 0, this.bounds.width - this.width);
                this.y = clamp(this.y, 0, this.bounds.height - this.height);
                if (input.facing) this.facing = input.facing;
            }

            if (this.attackTimer > 0) this.attackTimer -= dt * 1000;
            if (this.castTimer > 0) this.castTimer -= dt * 1000;

            this.setFacing(this.icon, this.facing);
            if (this.moving !== this._moving) {
                this.icon.classList.toggle("walking", this.moving);
                this._moving = this.moving;
            }
            this.render();
        }

        canAttack() { return this.attackTimer <= 0; }

        beginAttack() { this.attackTimer = CONFIG.player.attackCooldown; }

        // Without this, a key that repeats without setting `event.repeat` (or a
        // player mashing L) empties the whole mana pool in a single frame burst.
        canCast() { return this.castTimer <= 0; }

        beginCast() { this.castTimer = CONFIG.player.castCooldown; }

        /** Rectangle swept by the spear, used for melee hit detection. */
        meleeBox() {
            const reach = CONFIG.player.meleeReach;
            switch (this.facing) {
                case "up": return { x: this.x, y: this.y - reach, width: this.width, height: reach };
                case "down": return { x: this.x, y: this.y + this.height, width: this.width, height: reach };
                case "left": return { x: this.x - reach, y: this.y, width: reach, height: this.height };
                default: return { x: this.x + this.width, y: this.y, width: reach, height: this.height };
            }
        }

        heal(life, mana) {
            this.life = clamp(this.life + life, 0, this.maxLife);
            this.mana = clamp(this.mana + mana, 0, this.maxMana);
        }

        regenMana(amount) {
            this.mana = clamp(this.mana + amount, 0, this.maxMana);
        }

        spendMana(amount) {
            if (this.mana < amount) return false;
            this.mana -= amount;
            return true;
        }

        takeDamage(amount) {
            this.life = clamp(this.life - amount, 0, this.maxLife);
            return this.life <= 0;
        }

        syncBars() {
            this.setBar(this.healthBar, (this.life / this.maxLife) * 100);
            const mana = Math.round((this.mana / this.maxMana) * 100);
            if (mana !== this._manaWidth) {
                this.manaBar.style.width = `${mana}%`;
                this._manaWidth = mana;
            }
        }
    }

    // ---------------------------------------------------------------- enemy
    // Measuring a fresh element forces a layout flush, so we do it once per
    // variant instead of once per spawn.
    const sizeCache = Object.create(null);

    class Enemy extends Entity {
        constructor(variantName, bounds) {
            super();
            this.variantName = variantName;
            this.variant = ENEMY_VARIANTS[variantName];
            this.bounds = bounds;
            this.speed = this.variant.speed;
            this.attack = this.variant.attack;
            this.maxLife = this.variant.maxLife;
            this.life = this.variant.maxLife;
            this.attackTimer = 0;
            this.facing = "down";
            this.build();
        }

        build() {
            const variant = this.variant;
            this.element = document.createElement("div");
            this.element.className = variant.className;

            this.icon = document.createElement("div");
            this.icon.className = variant.iconClass;
            this.icon.dataset.facing = this.facing;

            const barTrack = document.createElement("div");
            barTrack.className = "enemy-bar-track";
            this.healthBar = document.createElement("div");
            this.healthBar.className = variant.barClass;
            barTrack.appendChild(this.healthBar);

            // Bar first so it sits above the sprite, matching the player.
            this.element.appendChild(barTrack);
            this.element.appendChild(this.icon);
            this.bounds.element.appendChild(this.element);

            const cached = sizeCache[variant.className];
            if (cached) {
                this.width = cached.width;
                this.height = cached.height;
            } else {
                const rect = this.element.getBoundingClientRect();
                this.width = rect.width;
                this.height = rect.height;
                sizeCache[variant.className] = { width: this.width, height: this.height };
            }
        }

        /** Place the enemy away from the player and clear of scenery. */
        placeAwayFrom(player, obstacles) {
            const { safeRadius, maxTries } = CONFIG.spawn;
            for (let attempt = 0; attempt < maxTries; attempt++) {
                this.x = Math.random() * (this.bounds.width - this.width);
                this.y = Math.random() * (this.bounds.height - this.height);
                const dx = this.centerX - player.centerX;
                const dy = this.centerY - player.centerY;
                if (Math.hypot(dx, dy) < safeRadius) continue;
                if (obstacles.some((obstacle) => overlaps(this, obstacle))) continue;
                break;
            }
            this.render();
        }

        chase(player, dt) {
            const dx = player.centerX - this.centerX;
            const dy = player.centerY - this.centerY;
            const distance = Math.hypot(dx, dy);
            if (distance > 1) {
                const scale = this.speed * dt / distance;
                this.x += dx * scale;
                this.y += dy * scale;
                this.x = clamp(this.x, 0, this.bounds.width - this.width);
                this.y = clamp(this.y, 0, this.bounds.height - this.height);
                this.facing = Math.abs(dx) > Math.abs(dy)
                    ? (dx < 0 ? "left" : "right")
                    : (dy < 0 ? "up" : "down");
            }
            if (this.attackTimer > 0) this.attackTimer -= dt * 1000;
            this.setFacing(this.icon, this.facing);
            this.render();
        }

        /** Returns damage dealt this step (0 when out of range or on cooldown). */
        strike(player) {
            const touching = resolve(this, player);
            if (!touching || this.attackTimer > 0) return 0;
            this.attackTimer = this.variant.attackCooldown;
            return this.attack;
        }

        takeDamage(amount) {
            this.life -= amount;
            this.setBar(this.healthBar, (this.life / this.maxLife) * 100);
            return this.life <= 0;
        }
    }

    // --------------------------------------------------------- field object
    class FieldObject extends Entity {
        constructor(kind, bounds) {
            super();
            this.kind = kind;
            this.bounds = bounds;
            this.blocksProjectiles = !kind.startsWith("lake");

            if (kind === "lake" || kind === "lake1") {
                const wrapperClass = kind === "lake" ? "lake_surroundings" : "lake_surroundings1";
                this.element = document.createElement("div");
                this.element.className = wrapperClass;
                const inner = document.createElement("div");
                inner.className = kind;
                this.element.appendChild(inner);
            } else {
                this.element = document.createElement("div");
                this.element.className = kind;
            }
            bounds.element.appendChild(this.element);

            const cached = sizeCache[kind];
            if (cached) {
                this.width = cached.width;
                this.height = cached.height;
            } else {
                const rect = this.element.getBoundingClientRect();
                this.width = rect.width;
                this.height = rect.height;
                sizeCache[kind] = { width: this.width, height: this.height };
            }
        }

        moveTo(x, y) {
            this.x = clamp(x, 0, this.bounds.width - this.width);
            this.y = clamp(y, 0, this.bounds.height - this.height);
            this.render();
        }
    }

    // ------------------------------------------------------------- fireball
    const FIREBALL_ROTATION = { up: -90, down: 90, left: 180, right: 0 };

    class Fireball extends Entity {
        constructor(player, bounds) {
            super();
            this.bounds = bounds;
            this.direction = player.facing || "down";
            this.speed = CONFIG.fireball.speed;
            this.attack = CONFIG.fireball.attack;
            this.exploded = false;

            this.element = document.createElement("div");
            this.element.className = "fireBall";
            bounds.element.appendChild(this.element);

            const cached = sizeCache.fireBall;
            if (cached) {
                this.width = cached.width;
                this.height = cached.height;
            } else {
                const rect = this.element.getBoundingClientRect();
                this.width = rect.width;
                this.height = rect.height;
                sizeCache.fireBall = { width: this.width, height: this.height };
            }

            switch (this.direction) {
                case "up":
                    this.y = player.y - this.height;
                    this.x = player.centerX - this.width / 2;
                    break;
                case "down":
                    this.y = player.y + player.height;
                    this.x = player.centerX - this.width / 2;
                    break;
                case "left":
                    this.y = player.centerY - this.height / 2;
                    this.x = player.x - this.width;
                    break;
                default:
                    this.y = player.centerY - this.height / 2;
                    this.x = player.x + player.width;
                    break;
            }
            this.render(FIREBALL_ROTATION[this.direction]);
        }

        update(dt) {
            if (this.exploded) return;
            const distance = this.speed * dt;
            switch (this.direction) {
                case "up": this.y -= distance; break;
                case "down": this.y += distance; break;
                case "left": this.x -= distance; break;
                default: this.x += distance; break;
            }
            this.render(FIREBALL_ROTATION[this.direction]);

            const outOfBounds = this.y + this.height <= 0
                || this.y >= this.bounds.height
                || this.x + this.width <= 0
                || this.x >= this.bounds.width;
            if (outOfBounds) this.explode();
        }

        /** Marked dead immediately so it cannot hit a second target this frame. */
        explode() {
            if (this.exploded) return;
            this.exploded = true;
            this.alive = false;
            this.element.classList.add("exploding");
            this.render();
            setTimeout(() => this.element.remove(), CONFIG.fireball.explodeMs);
        }
    }

    return {
        CONFIG, ENEMY_VARIANTS,
        clamp, overlaps, resolve,
        Sfx, Entity, Player, Enemy, FieldObject, Fireball,
    };
})();
