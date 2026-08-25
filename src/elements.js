/**
 * Dungeon Dweller - entity library.
 *
 * Responsibility: define *what an entity is*. Every class here knows how a single
 * object moves, draws itself and takes damage. None of them know anything about
 * the run in progress - there is no score, no spawn schedule, no pause state and
 * no list of other entities in this file. That all lives in script.js, which owns
 * *what happens this frame*.
 *
 * This file must be loaded before script.js: it publishes the `DD` global that
 * script.js destructures at parse time. Everything not named in the return
 * statement at the bottom (`sizeCache`, `FIREBALL_ROTATION`) is private to this
 * IIFE, and script.js is expected to go through the public surface rather than
 * reaching for internals.
 *
 * Key exports:
 *   CONFIG, ENEMY_VARIANTS  - every tunable number in the game
 *   clamp, overlaps, resolve - geometry helpers (see the collision note below)
 *   Sfx                      - name-to-<audio> registry
 *   Entity, Player, Enemy, FieldObject, Fireball - the entity classes
 *
 * Two conventions run through the whole file:
 *   1. Sizes come from CSS. A class builds its element, then *measures* it; it
 *      never sets its own width or height.
 *   2. Sprites come from CSS too. Code sets `data-facing` or toggles a class and
 *      lets stylesheet selectors choose the image - no `background-image` is ever
 *      assigned from JavaScript.
 */
const DD = (() => {
    "use strict";

    // ---------------------------------------------------------------- config
    // Speeds are px/second so the game plays identically on 60Hz and 144Hz.
    // Cooldowns and durations are milliseconds.
    //
    // This object plus ENEMY_VARIANTS below is the entire balance surface of the
    // game: to retune anything, change a number here rather than in the loop.
    const CONFIG = {
        step: 1000 / 60,          // fixed simulation step
        maxFrameTime: 250,        // clamp after tab-out so we never spiral
        player: {
            speed: 300,           // px/s; diagonals are normalised to this too
            maxLife: 100,         // run ends when life hits 0
            maxMana: 100,
            attack: 10,           // damage per spear strike
            attackCooldown: 320,  // ms between strikes
            castCooldown: 260,    // ms between fireballs, independent of attack
            meleeReach: 58,       // px the spear box extends in front of the player
            manaRegen: 10,        // mana restored per tick
            manaRegenInterval: 1000, // ms per tick, so effectively 10 mana/second
        },
        // explodeMs must stay in sync with the `explode` animation in
        // game_styles.css - it is how long the blast element survives before it
        // is pulled out of the DOM.
        fireball: { speed: 1200, attack: 25, manaCost: 20, explodeMs: 300, blastSize: 100 },
        // interval:     ms between routine skeleton spawns
        // bossInterval: ms between forced brute spawns
        // softCap:      enemy count above which routine spawning pauses, but only
        //               while a brute is alive (see the spawn block in script.js)
        // safeRadius:   px of clearance a spawn needs from the player
        // maxTries:     attempts to find a legal spawn point before giving up
        spawn: { interval: 3500, bossInterval: 25000, softCap: 5, safeRadius: 220, maxTries: 24 },
        // Separation leaves bodies exactly touching, which a strict overlap test
        // reads as "apart". Enemies reach this far past their box to connect.
        contactReach: 6,
    };

    /**
     * The two enemy types, expressed as data rather than as two subclasses.
     *
     * `enemy` is the common skeleton; `enemySpecial` is the slower, far tougher
     * brute the game refers to elsewhere as the boss. Both are instantiated from
     * the same `Enemy` class - only this table differs.
     *
     * The three class names are the contract with game_styles.css:
     *   className  - the outer positioned element; **its CSS height/width become
     *                the hitbox**, because Enemy measures the element it builds
     *   iconClass  - the sprite layer that reacts to `data-facing`
     *   barClass   - the health bar fill
     *
     * lifeReward/manaReward are granted to the player on kill, and are the only
     * way health is ever restored.
     *
     * To add a third enemy: add an entry here, add matching CSS rules (including
     * an explicit size), and call spawnEnemy() with the new key from script.js.
     */
    const ENEMY_VARIANTS = {
        enemy: {
            className: "enemy", iconClass: "iconEnemy", barClass: "health-barEnemy",
            maxLife: 100, attack: 5, speed: 165, attackCooldown: 700,
            score: 10, lifeReward: 30, manaReward: 40,
        },
        enemySpecial: {
            className: "enemySpecial", iconClass: "iconEnemySpecial", barClass: "health-barEnemySpecial",
            maxLife: 300, attack: 20, speed: 120, attackCooldown: 900,
            score: 100, lifeReward: 100, manaReward: 100,
        },
    };

    // ------------------------------------------------------------- geometry
    //
    // Two collision primitives with deliberately different contracts. There is a
    // third, blockMovement(), over in script.js. Which one you reach for matters:
    //
    //   overlaps() - asks a question, changes nothing. Use for ALL hit detection.
    //   resolve()  - answers and *moves* its first argument. Use for scenery.
    //
    // Testing a hit with resolve() would shove whatever it touched, which is how
    // an attack ends up displacing the attacker and how an enemy ends up pushing
    // the player into a lava pool. Keep hit detection side-effect free.

    /**
     * Constrain a value to a range.
     *
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number} `value` limited to [min, max].
     */
    const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

    /**
     * Plain AABB overlap test. No side effects - safe to use for hit detection.
     *
     * Operates on any object with x/y/width/height, not just Entity instances -
     * callers routinely pass throwaway rectangles such as the spear box or an
     * inflated contact box.
     *
     * Note this is a *strict* test: rectangles that share an edge exactly are
     * reported as not overlapping. That is why enemies inflate their hitbox by
     * CONFIG.contactReach before testing for a hit.
     *
     * @param {{x:number,y:number,width:number,height:number}} a
     * @param {{x:number,y:number,width:number,height:number}} b
     * @returns {boolean} true when the two rectangles genuinely intersect.
     */
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
     *
     * "Axis of least penetration" means the entity pops out the short way: clip
     * the corner of a rock and you are nudged sideways by a few pixels rather
     * than being teleported around it. Only `a` moves, so `b` is effectively
     * immovable - which is why this is used for scenery and not for bodies.
     *
     * SIDE EFFECT: mutates `a.x` or `a.y`.
     *
     * @param {{x:number,y:number,width:number,height:number}} a - moved out of `b`.
     * @param {{x:number,y:number,width:number,height:number}} b - the immovable one.
     * @returns {boolean} true if they were overlapping (and `a` was therefore moved).
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
    /**
     * Name-to-`<audio>` registry.
     *
     * The sound bank is declared in the HTML, not created here: each page ships a
     * list of `<audio>` elements, and script.js binds friendly names to them at
     * start-up. That keeps preload hints in the markup where the browser can act
     * on them early.
     *
     * Every method is a no-op for an unregistered name, so a missing element
     * silences one effect rather than throwing mid-frame.
     */
    const Sfx = {
        /** @type {Object<string, HTMLAudioElement>} name -> element. */
        tracks: {},
        // Honoured by play() and loop(), but nothing currently sets it - there is
        // no mute control in the UI yet.
        muted: false,
        /**
         * Bind a name to an `<audio>` element already present in the document.
         * Silently ignores a selector that matches nothing.
         *
         * @param {string} name     - key used by play/loop/stop.
         * @param {string} selector - CSS selector for the `<audio>` element.
         */
        register(name, selector) {
            const el = document.querySelector(selector);
            if (el) this.tracks[name] = el;
        },
        /**
         * Play a one-shot effect from the beginning.
         *
         * Rewinding first is what allows the same element to retrigger on rapid
         * repeats - without it, a second strike during playback would be ignored.
         *
         * @param {string} name - a registered track name.
         */
        play(name) {
            const track = this.tracks[name];
            if (!track || this.muted) return;
            track.currentTime = 0;
            // Autoplay policies reject until the first gesture; that is expected.
            const played = track.play();
            if (played) played.catch(() => { });
        },
        /**
         * Start a track looping (background music). Does not rewind, so resuming
         * after a pause continues where the music left off.
         *
         * @param {string} name - a registered track name.
         */
        loop(name) {
            const track = this.tracks[name];
            if (!track || this.muted) return;
            track.loop = true;
            const played = track.play();
            if (played) played.catch(() => { });
        },
        /**
         * Stop a track and rewind it. Ignores `muted` so a muted track can still
         * be reset.
         *
         * @param {string} name - a registered track name.
         */
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
     *
     * Base class for Player, Enemy, FieldObject and Fireball. It deliberately
     * does not create an element: subclasses either look one up (Player) or build
     * one (everything else) and assign `this.element` themselves.
     *
     * The caching matters more than it looks. The game moves dozens of nodes per
     * frame, and redundant style assignments are the dominant cost in a
     * DOM-rendered game - so `_transform`, `_facing` and `_barWidth` hold the last
     * value written and every setter compares before touching the DOM.
     *
     * @property {number} x,y            - top-left position within the arena, px.
     * @property {number} width,height   - hitbox, measured from CSS by subclasses.
     * @property {boolean} alive         - false marks it for removal by compact().
     * @property {HTMLElement} element   - assigned by the subclass.
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

        /** @returns {number} Horizontal centre, used for aiming and distances. */
        get centerX() { return this.x + this.width / 2; }
        /** @returns {number} Vertical centre, used for aiming and distances. */
        get centerY() { return this.y + this.height / 2; }

        /**
         * Compositor-only position update. Rounded to keep pixel art crisp.
         *
         * Uses `translate3d` rather than `top`/`left` so the browser can move the
         * element without a layout pass. Nothing in this codebase should ever set
         * an entity's offsets directly.
         *
         * @param {number} [rotation] - degrees; only fireballs pass this.
         */
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

        /**
         * Facing drives the sprite through CSS attribute selectors, not inline styles.
         *
         * Writes `data-facing="up|down|left|right"`, which stylesheet rules turn
         * into the right `background-image` (and, with `.walking`, the right walk
         * cycle). Renaming those selectors breaks sprites silently.
         *
         * @param {HTMLElement} icon - the sprite layer inside `this.element`.
         * @param {string} facing    - one of "up" | "down" | "left" | "right".
         */
        setFacing(icon, facing) {
            if (facing && facing !== this._facing) {
                icon.dataset.facing = facing;
                this._facing = facing;
            }
        }

        /**
         * Set a health-bar fill width, clamped and rounded to whole percent so the
         * DOM is only touched when the visible width actually changes.
         *
         * Only one bar per entity can use this cache; the player's second bar
         * keeps its own (see Player#syncBars).
         *
         * @param {HTMLElement} bar - the fill element.
         * @param {number} percent  - 0-100; values outside are clamped.
         */
        setBar(bar, percent) {
            const rounded = Math.round(clamp(percent, 0, 100));
            if (rounded !== this._barWidth) {
                bar.style.width = `${rounded}%`;
                this._barWidth = rounded;
            }
        }

        /**
         * Remove the entity from the field: flag it dead and detach its element.
         *
         * The flag is what actually removes it from play - script.js sweeps dead
         * entries out of the entity lists once per frame with compact(), so it is
         * always safe to call this while those lists are being iterated.
         */
        destroy() {
            this.alive = false;
            if (this.element) this.element.remove();
        }
    }

    // --------------------------------------------------------------- player
    /**
     * The character the user drives.
     *
     * Unlike every other entity, the player's element is already in the markup
     * (`#player` in html/game.html) rather than being created here - so exactly
     * one Player can exist, and its size is read straight off that element.
     *
     * The player is passive about its own fate: it exposes `takeDamage`,
     * `heal`, cooldown queries and a melee box, but never decides that the run is
     * over, never spawns a fireball, and never plays a sound. script.js does all
     * of that.
     */
    class Player extends Entity {
        /**
         * Look up the pre-existing player element, measure it, and start centred
         * in the arena at full health and mana.
         *
         * @param {{element: HTMLElement, width: number, height: number}} bounds -
         *        the arena. Held by reference, so a resize that updates
         *        bounds.width/height is picked up without rebuilding the player.
         */
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
            // Cooldowns count *down* in milliseconds; <= 0 means ready.
            this.attackTimer = 0;
            this.castTimer = 0;
            // TODO(doc): `gameOver` is assigned here and set to true in endGame(),
            // but nothing ever reads it - the loop and the overlay both branch on
            // `state.gameOver` in script.js instead. Unclear whether this is a
            // leftover or an intentional hook for something.
            this.gameOver = false;
            this.score = 0;

            this.render();
            this.setFacing(this.icon, this.facing);
        }

        /**
         * Advance the player one simulation step: move, tick cooldowns, refresh
         * sprite state, and repaint.
         *
         * Movement is clamped to the arena here, but collision against enemies and
         * scenery is *not* handled - script.js corrects the position afterwards
         * and re-renders. That is why this method's render() is not the last word
         * on where the player appears.
         *
         * SIDE EFFECTS: mutates position and cooldowns; writes `data-facing` and
         * the `.walking` class; writes a transform.
         *
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

        /** @returns {boolean} true when the spear is off cooldown. */
        canAttack() { return this.attackTimer <= 0; }

        /** Start the strike cooldown. Call once per accepted attack. */
        beginAttack() { this.attackTimer = CONFIG.player.attackCooldown; }

        // Without this, a key that repeats without setting `event.repeat` (or a
        // player mashing L) empties the whole mana pool in a single frame burst.
        /** @returns {boolean} true when a fireball may be cast. */
        canCast() { return this.castTimer <= 0; }

        /** Start the cast cooldown. Call once per accepted cast. */
        beginCast() { this.castTimer = CONFIG.player.castCooldown; }

        /**
         * Rectangle swept by the spear, used for melee hit detection.
         *
         * A plain rectangle in front of the player - as wide as the player's body
         * on the axis it faces, and CONFIG.player.meleeReach deep. It is a value,
         * not an element: nothing is drawn from it, and the visible spear sprite
         * is posed separately in script.js.
         *
         * @returns {{x:number,y:number,width:number,height:number}} box to test
         *          against enemies with overlaps().
         */
        meleeBox() {
            const reach = CONFIG.player.meleeReach;
            switch (this.facing) {
                case "up": return { x: this.x, y: this.y - reach, width: this.width, height: reach };
                case "down": return { x: this.x, y: this.y + this.height, width: this.width, height: reach };
                case "left": return { x: this.x - reach, y: this.y, width: reach, height: this.height };
                default: return { x: this.x + this.width, y: this.y, width: reach, height: this.height };
            }
        }

        /**
         * Grant a kill reward. This is the game's only source of healing, which is
         * what forces the player to keep engaging rather than retreat forever.
         *
         * @param {number} life - health to restore, capped at maxLife.
         * @param {number} mana - mana to restore, capped at maxMana.
         */
        heal(life, mana) {
            this.life = clamp(this.life + life, 0, this.maxLife);
            this.mana = clamp(this.mana + mana, 0, this.maxMana);
        }

        /**
         * Apply one tick of passive mana regeneration.
         *
         * @param {number} amount - mana to add, capped at maxMana.
         */
        regenMana(amount) {
            this.mana = clamp(this.mana + amount, 0, this.maxMana);
        }

        /**
         * Attempt to pay a mana cost. All-or-nothing: an unaffordable cost leaves
         * the pool untouched, so the caller can use the return value as a gate.
         *
         * @param {number} amount - mana required.
         * @returns {boolean} true if it was affordable and has been deducted.
         */
        spendMana(amount) {
            if (this.mana < amount) return false;
            this.mana -= amount;
            return true;
        }

        /**
         * Apply damage. Reports death rather than acting on it - ending the run is
         * script.js's job.
         *
         * @param {number} amount - damage to apply.
         * @returns {boolean} true if this brought the player to 0 health.
         */
        takeDamage(amount) {
            this.life = clamp(this.life - amount, 0, this.maxLife);
            return this.life <= 0;
        }

        /**
         * Push current health and mana into the two small bars floating above the
         * character. (The large HUD meters are updated separately by script.js.)
         *
         * The mana bar keeps its own `_manaWidth` cache instead of calling
         * setBar(). The inherited cache holds a single value, so routing two bars
         * through it would make each one invalidate the other and defeat the
         * caching entirely.
         */
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
    //
    // Shared by Enemy, FieldObject and Fireball, keyed by CSS class name. It is
    // safe to share because size is a property of the *class*, not the instance:
    // every `.enemy` is the same 120x70 that game_styles.css says it is. A
    // null-prototype object avoids collisions with names like "constructor".
    const sizeCache = Object.create(null);

    /**
     * A hostile that walks at the player and damages them on contact.
     *
     * Both enemy types in the game are this one class - the differences live in
     * ENEMY_VARIANTS. `chase()` is the whole of the AI: head straight for the
     * player, stop on contact. There is no pathfinding, so enemies bunch up
     * against rocks rather than walking round them.
     */
    class Enemy extends Entity {
        /**
         * @param {string} variantName - key into ENEMY_VARIANTS ("enemy" | "enemySpecial").
         * @param {{element: HTMLElement, width: number, height: number}} bounds - the arena.
         */
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

        /**
         * Construct the DOM for this enemy, attach it to the arena, and adopt the
         * size CSS gives it.
         *
         * Structure built here:
         *   div.<className>            positioned body; its size is the hitbox
         *     div.enemy-bar-track      health bar background
         *       div.<barClass>         health bar fill
         *     div.<iconClass>          sprite, driven by data-facing
         *
         * The element must be in the document before it can be measured, so the
         * append happens before the getBoundingClientRect() below.
         */
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

        /**
         * Place the enemy away from the player and clear of scenery.
         *
         * Rejection sampling: pick a random spot, reject it if it is inside the
         * player's safe radius or overlapping scenery, and try again.
         *
         * Best-effort by design - after CONFIG.spawn.maxTries failures the loop
         * exits and the last candidate is used as-is, even if it is a poor spot.
         * A crowded arena therefore degrades to an occasional awkward spawn rather
         * than stalling the frame in a search that might never succeed.
         *
         * @param {Player} player - kept at least CONFIG.spawn.safeRadius away.
         * @param {FieldObject[]} obstacles - scenery to avoid landing inside.
         */
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

        /**
         * Advance one step toward the player, tick the attack cooldown, repaint.
         *
         * Facing and movement are decided separately: an enemy that has closed to
         * contact stops moving but keeps turning to face its target, so it never
         * appears to attack sideways.
         *
         * Movement is clamped to the arena, but scenery collision is applied
         * afterwards by script.js.
         *
         * SIDE EFFECTS: mutates position, facing and cooldown; writes to the DOM.
         *
         * @param {Player} player - the target.
         * @param {number} dt - seconds elapsed this step.
         */
        chase(player, dt) {
            const dx = player.centerX - this.centerX;
            const dy = player.centerY - this.centerY;
            const distance = Math.hypot(dx, dy);

            // Face the player whether or not we can close the gap.
            if (distance > 1) {
                this.facing = Math.abs(dx) > Math.abs(dy)
                    ? (dx < 0 ? "left" : "right")
                    : (dy < 0 ? "up" : "down");
            }

            // Stand firm once in contact, so neither body shoves the other.
            if (distance > 1 && !overlaps(this, player)) {
                const scale = this.speed * dt / distance;
                this.x += dx * scale;
                this.y += dy * scale;
                this.x = clamp(this.x, 0, this.bounds.width - this.width);
                this.y = clamp(this.y, 0, this.bounds.height - this.height);
            }

            if (this.attackTimer > 0) this.attackTimer -= dt * 1000;
            this.setFacing(this.icon, this.facing);
            this.render();
        }

        /**
         * Returns damage dealt this step (0 when out of range or on cooldown).
         * A pure overlap test - separating the bodies is the caller's job, so
         * that landing a hit never displaces the enemy.
         *
         * There is no attack animation or wind-up: an enemy in contact and off
         * cooldown simply deals damage, which is why standing next to one is
         * immediately costly.
         *
         * The hitbox is inflated by CONFIG.contactReach on every side. Collision
         * separation leaves bodies exactly touching, and overlaps() treats
         * touching-but-not-intersecting as apart - without the inflation an enemy
         * pressed against the player could never land a hit.
         *
         * SIDE EFFECT: starts the attack cooldown when it connects.
         *
         * @param {Player} player - the target.
         * @returns {number} damage to apply, or 0.
         */
        strike(player) {
            if (this.attackTimer > 0) return 0;
            const reach = CONFIG.contactReach;
            const hitbox = {
                x: this.x - reach,
                y: this.y - reach,
                width: this.width + reach * 2,
                height: this.height + reach * 2,
            };
            if (!overlaps(hitbox, player)) return 0;
            this.attackTimer = this.variant.attackCooldown;
            return this.attack;
        }

        /**
         * Apply damage and refresh the health bar. Reports death rather than
         * acting on it: the caller (killEnemy in script.js) awards score, heals
         * the player, plays the sound and removes the body.
         *
         * @param {number} amount - damage to apply.
         * @returns {boolean} true if this killed the enemy.
         */
        takeDamage(amount) {
            this.life -= amount;
            this.setBar(this.healthBar, (this.life / this.maxLife) * 100);
            return this.life <= 0;
        }
    }

    // --------------------------------------------------------- field object
    /**
     * Static scenery: rocks and lava pools.
     *
     * Field objects never move themselves and have no update method - script.js
     * positions them once via moveTo() and again after a resize. They block
     * movement for the player and enemies alike (via resolve()).
     *
     * Recognised kinds, each of which must exist as a CSS class with an explicit
     * size: "rock", "rock1" (a smaller rock), "lake", "lake1" (a larger pool).
     */
    class FieldObject extends Entity {
        /**
         * Build the element for `kind`, attach it to the arena, and adopt the size
         * CSS gives it.
         *
         * @param {string} kind - "rock" | "rock1" | "lake" | "lake1".
         * @param {{element: HTMLElement, width: number, height: number}} bounds - the arena.
         */
        constructor(kind, bounds) {
            super();
            this.kind = kind;
            this.bounds = bounds;
            // Fireballs fly over lava but are stopped by rocks - lava sits at
            // ground level, rocks stand up. Note this only affects projectiles:
            // both kinds block walking.
            this.blocksProjectiles = !kind.startsWith("lake");

            // Lakes are two nested elements: an outer dirt ring (drawn with a CSS
            // gradient) wrapping the lava surface. The *outer* element is the one
            // that gets measured, so the ring is part of the hitbox - you are
            // stopped at the edge of the bank rather than at the lava itself.
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

        /**
         * Position the object, clamped so it stays fully inside the arena.
         *
         * Called on set-up and again on every resize, which is why scenery
         * positions in script.js are expressed as functions of arena size rather
         * than fixed coordinates.
         *
         * @param {number} x - desired left edge, px.
         * @param {number} y - desired top edge, px.
         */
        moveTo(x, y) {
            this.x = clamp(x, 0, this.bounds.width - this.width);
            this.y = clamp(y, 0, this.bounds.height - this.height);
            this.render();
        }
    }

    // ------------------------------------------------------------- fireball
    // The sprite is drawn pointing right, so each direction is a rotation from
    // that. Screen coordinates put +y downwards, which is why "down" is +90.
    const FIREBALL_ROTATION = { up: -90, down: 90, left: 180, right: 0 };

    /**
     * The player's ranged attack: a bolt that travels in a straight line and
     * explodes on the first thing it touches.
     *
     * Direction is fixed at construction from the player's facing - fireballs do
     * not steer. The projectile dies on its first hit (see explode()), so it
     * cannot chain through a line of enemies.
     */
    class Fireball extends Entity {
        /**
         * Spawn a bolt just outside the player's body, facing the way they are.
         *
         * @param {Player} player - source of position and direction; not retained.
         * @param {{element: HTMLElement, width: number, height: number}} bounds - the arena.
         */
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

            // Start clear of the player's own box and centred on the axis of
            // travel, so a bolt never appears to erupt from inside the character.
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

        /**
         * Fly one step and self-destruct on leaving the arena.
         *
         * Collision with enemies and scenery is not checked here - script.js does
         * that after moving every projectile, so a bolt cannot be tested against a
         * stale position.
         *
         * @param {number} dt - seconds elapsed this step.
         */
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

        /**
         * Detonate: mark the bolt dead, swap it to the blast sprite, and schedule
         * the element's removal once the animation has played.
         *
         * Marked dead immediately so it cannot hit a second target this frame.
         * The element outlives the entity here - `alive = false` takes it out of
         * the simulation right away, while the node lingers for the duration of
         * the explosion animation. It is therefore *not* removed by destroy().
         *
         * Safe to call more than once; repeat calls are ignored.
         */
        explode() {
            if (this.exploded) return;
            this.exploded = true;
            this.alive = false;

            // The blast is square and larger than the bolt, so re-anchor it on the
            // bolt's centre; otherwise it renders offset from the impact point.
            // Kept inside the arena so a wall hit is still visible.
            const size = CONFIG.fireball.blastSize;
            const x = clamp(this.centerX - size / 2, 0, this.bounds.width - size);
            const y = clamp(this.centerY - size / 2, 0, this.bounds.height - size);
            this.element.style.setProperty("--ex", `${Math.round(x)}px`);
            this.element.style.setProperty("--ey", `${Math.round(y)}px`);
            this.element.classList.add("exploding");

            setTimeout(() => this.element.remove(), CONFIG.fireball.explodeMs);
        }
    }

    // The complete public surface of this file. Anything not listed here is
    // private to the IIFE and should stay that way - if script.js needs something
    // new from an entity, add a method or a CONFIG key rather than exporting
    // internals.
    return {
        CONFIG, ENEMY_VARIANTS,
        clamp, overlaps, resolve,
        Sfx, Entity, Player, Enemy, FieldObject, Fireball,
    };
})();
