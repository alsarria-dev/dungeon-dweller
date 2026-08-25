/**
 * Dungeon Dweller - game orchestrator.
 *
 * Runs a fixed-timestep simulation (accumulator + clamped frame time) so the
 * game plays identically regardless of the display's refresh rate.
 *
 * Responsibility: *what happens this frame*. Where elements.js defines what a
 * single entity is, this file owns everything plural and everything temporal -
 * the entity lists, the clock, spawning, input, the HUD, and the order in which
 * each frame's work happens. It must be loaded after elements.js, whose `DD`
 * global it destructures below at parse time.
 *
 * There is no exported surface: the whole file is one IIFE that wires itself to
 * the DOM of html/game.html and starts running. A "run" therefore lives entirely
 * in memory - reloading the page is how the game restarts.
 *
 * Layout of this file, in order:
 *   dom        - element lookups and audio registration
 *   state      - the entity lists and the single mutable `state` record
 *   world      - scenery layout, expressed relative to arena size
 *   input      - keymap, held-key tracking, pause/blur handling
 *   combat     - melee, casting, kills, spawning
 *   hud        - cached HUD updates
 *   overlay    - pause and game-over cards
 *   simulation - step(), the collision correction, depth sorting
 *   loop       - the fixed-timestep accumulator
 *   resize     - re-layout without destroying the run
 *   warm-up    - pre-fetching animation frames
 */
(() => {
    "use strict";

    // The complete interface to elements.js. Anything not on this list is private
    // to that file by design.
    const { CONFIG, clamp, overlaps, resolve, Sfx, Player, Enemy, FieldObject, Fireball } = DD;

    // ------------------------------------------------------------------ dom
    // Everything here is looked up once at start-up. The markup in
    // html/game.html is a hard dependency: if an id changes there, it must change
    // here too, and a missing element will surface as a null dereference on the
    // first frame rather than as a graceful degradation.
    const gameAreaElement = document.querySelector("#game-area");
    // The large meters and counters along the top of the screen. The player also
    // carries two small bars above their head, which the Player class owns.
    const hud = {
        health: document.querySelector("#hud-health"),
        healthValue: document.querySelector("#hud-health-value"),
        mana: document.querySelector("#hud-mana"),
        manaValue: document.querySelector("#hud-mana-value"),
        score: document.querySelector("#hud-score"),
        kills: document.querySelector("#hud-kills"),
        time: document.querySelector("#hud-time"),
    };
    const overlay = document.querySelector("#overlay");
    const overlayTitle = document.querySelector("#overlay-title");
    const overlayStats = document.querySelector("#overlay-stats");
    const overlayActions = document.querySelector("#overlay-actions");
    const hint = document.querySelector("#start-hint");
    const vignette = document.querySelector("#low-health");

    // Bind friendly names to the <audio> elements declared in the page. The
    // elements carry their own preload hints in the markup, where the browser can
    // act on them before this script runs.
    Sfx.register("slash", "#audioSlash");
    Sfx.register("fireball", "#audioFireball");
    Sfx.register("kill", "#audioKill");
    Sfx.register("dead", "#audioDead");
    Sfx.register("enemySlash", "#audioEnemySlash");
    Sfx.register("music", "#audioGame");
    Sfx.register("gameOver", "#audioGameOver");

    // ---------------------------------------------------------------- state
    // The arena rectangle every entity is positioned within. Passed to entities
    // by reference and mutated in place on resize, so they all observe the new
    // size without needing to be rebuilt or notified.
    const bounds = { element: gameAreaElement, width: 0, height: 0 };

    /** Re-read the arena's size from the DOM into `bounds`. */
    function measureBounds() {
        const rect = gameAreaElement.getBoundingClientRect();
        bounds.width = rect.width;
        bounds.height = rect.height;
    }
    measureBounds();

    // Must follow measureBounds(): the player centres itself using bounds.
    const player = new Player(bounds);
    // The three entity lists. Dead entries are swept by compact() once per frame
    // rather than spliced out during iteration.
    const enemies = [];
    const fireballs = [];
    const fieldObjects = [];

    /**
     * All mutable run state that is not owned by an entity.
     *
     * `running` and `paused` are separate: pausing keeps the loop alive but skips
     * simulation, whereas `running` goes false only at death and is terminal -
     * nothing sets it back to true, so a reload is the only way to play again.
     *
     * The three `next*` fields are deadlines on the `elapsed` clock rather than
     * timer handles. Because `elapsed` only advances inside step(), every timed
     * event stops dead on pause and on game over - no setInterval anywhere.
     */
    const state = {
        running: true,       // false once the run has ended; terminal
        paused: false,       // loop still runs, simulation is skipped
        gameOver: false,
        elapsed: 0,          // ms of simulated play time
        kills: 0,
        nextSpawn: CONFIG.spawn.interval,          // ms deadline for next skeleton
        nextBoss: CONFIG.spawn.bossInterval,       // ms deadline for next forced brute
        nextManaTick: CONFIG.player.manaRegenInterval,
        // Set when a brute is spawned, cleared when any brute dies. See the spawn
        // block in step() for what it actually gates.
        bossSpawned: false,
    };

    // ---------------------------------------------------------------- world
    // Positions are expressed relative to the arena so a resize re-lays them out
    // instead of reloading the page and destroying the run.
    //
    // Each entry is { kind, at(W, H, w, h) -> [x, y] } where W/H are the arena's
    // dimensions and w/h the object's own, so an object can centre itself on a
    // fraction of the arena and stay put when the window changes shape. The
    // trailing pixel offsets are hand-placed art direction, not derived values.
    //
    // Note some entries deliberately push objects past an edge on a small window;
    // FieldObject#moveTo clamps them back inside, so the field compresses rather
    // than losing pieces.
    const FIELD_LAYOUT = [
        { kind: "lake1", at: (W, H, w, h) => [W / 4 - w / 2 - 120, H / 4 - h / 2 + 30] },
        { kind: "lake", at: (W, H, w, h) => [W / 4 - w / 2 - 80, 3 * H / 4 - h / 2] },
        { kind: "lake1", at: (W, H, w, h) => [3 * W / 4 - w / 2 + 120, 3 * H / 4 - h / 2 - 30] },
        { kind: "lake", at: (W, H, w, h) => [3 * W / 4 - w / 2 + 120, H / 4 - h / 2 + 100] },
        { kind: "rock", at: (W, H, w, h) => [W / 2 - w / 2 - 180, H / 4 - h / 2 - 40] },
        { kind: "rock", at: (W, H, w, h) => [W / 2 - w / 2 + 200, 3 * H / 4 - h / 2 - 40] },
        { kind: "rock1", at: (W, H, w, h) => [W / 2 - w / 2 + 500, 3 * H / 4 - h / 2 - 500] },
        { kind: "rock1", at: (W, H, w, h) => [W / 2 - w / 2 - 600, 3 * H / 4 - h / 2 + 180] },
        { kind: "rock1", at: (W, H, w, h) => [W / 2 - w / 2 - 200, 3 * H / 4 - h / 2 - 100] },
        { kind: "rock1", at: (W, H) => [W / 2 + 200, H / 2 - 200] },
    ];

    /** Re-position every scenery object from its spec. Run at start-up and on resize. */
    function layoutField() {
        for (const object of fieldObjects) {
            const [x, y] = object.spec.at(bounds.width, bounds.height, object.width, object.height);
            object.moveTo(x, y);
        }
    }

    // Build the scenery. The fragment batches the insertions into a single DOM
    // mutation. Note each FieldObject also appends itself to the arena in its
    // constructor, so moving it into the fragment here is a relocation, not a
    // duplicate - and it is what lets the objects be measured (they must be in
    // the document to have a size) before the batch insert below.
    const fragment = document.createDocumentFragment();
    for (const spec of FIELD_LAYOUT) {
        const object = new FieldObject(spec.kind, bounds);
        object.spec = spec;
        fieldObjects.push(object);
        fragment.appendChild(object.element);
    }
    gameAreaElement.appendChild(fragment);
    layoutField();

    // ---------------------------------------------------------------- input
    // Input is sampled, not queued: key events only update the `held` record and
    // `facingStack`, and the simulation reads their current value each step. That
    // keeps input independent of how often events arrive. Actions (strike, cast)
    // are the exception - they fire directly from the event, gated by cooldowns.
    //
    // Keys are lower-cased `event.key` values, so the map covers both WASD and the
    // arrow keys without caring about physical layout.
    const KEYMAP = {
        w: "up", arrowup: "up",
        s: "down", arrowdown: "down",
        a: "left", arrowleft: "left",
        d: "right", arrowright: "right",
    };
    const held = { up: false, down: false, left: false, right: false };
    // most recently pressed direction wins
    //
    // A stack rather than a single variable so that releasing one key falls back
    // to whatever else is still held: press left, then also up, and you face up;
    // release up and you face left again. A plain "last key pressed" would leave
    // you facing a direction you had already let go of.
    const facingStack = [];

    /** Read-only view of the current input state, handed to Player#update. */
    const input = {
        get up() { return held.up; },
        get down() { return held.down; },
        get left() { return held.left; },
        get right() { return held.right; },
        get facing() { return facingStack[facingStack.length - 1] || null; },
    };

    /**
     * Forget every held key.
     *
     * Called on blur, on pause and on death. A key that is down when the window
     * loses focus never delivers its keyup, so without this the character keeps
     * running in a direction the user has physically released.
     */
    function releaseAll() {
        held.up = held.down = held.left = held.right = false;
        facingStack.length = 0;
    }

    let audioUnlocked = false;
    /**
     * Start the music on the first key press and hide the controls hint.
     *
     * Browsers reject audio playback until the user has interacted with the page,
     * so music cannot simply start on load. Idempotent - only the first call does
     * anything.
     */
    function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        Sfx.loop("music");
        if (hint) hint.classList.add("is-hidden");
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    // Pause when the tab is backgrounded, so a run is not lost to a notification.
    // Deliberately one-way: coming back does not auto-resume, leaving the player
    // to unpause when they are ready.
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && !state.gameOver) setPaused(true);
    });

    /**
     * Route a key press, in priority order: game-over shortcuts, then pause, then
     * movement, then actions.
     *
     * The early returns matter - once the run has ended only Enter and Escape do
     * anything, and while paused every key except the pause key is ignored.
     *
     * @param {KeyboardEvent} event
     */
    function onKeyDown(event) {
        const key = event.key.toLowerCase();
        unlockAudio();

        if (state.gameOver) {
            if (key === "enter") window.location.reload();
            if (key === "escape") window.location.href = "../index.html";
            return;
        }

        if (key === "p" || key === "escape") {
            if (!event.repeat) setPaused(!state.paused);
            return;
        }
        if (state.paused) return;

        const direction = KEYMAP[key];
        if (direction) {
            // Stop the arrow keys scrolling the page under the arena.
            event.preventDefault();
            // Guard against auto-repeat pushing the same direction many times;
            // the stack must hold each held key exactly once for keyup to undo it.
            if (!held[direction]) {
                held[direction] = true;
                facingStack.push(direction);
            }
            return;
        }

        // Actions ignore auto-repeat so holding K does not machine-gun. Cooldowns
        // in Player are the real limit; this just avoids pointless calls.
        if (event.repeat) return;
        if (key === "k") meleeAttack();
        else if (key === "l") castFireball();
    }

    /**
     * Release a movement key: clear it and remove it from the facing stack.
     *
     * @param {KeyboardEvent} event
     */
    function onKeyUp(event) {
        const direction = KEYMAP[event.key.toLowerCase()];
        if (!direction) return;
        held[direction] = false;
        const index = facingStack.lastIndexOf(direction);
        if (index !== -1) facingStack.splice(index, 1);
    }

    // --------------------------------------------------------------- combat
    // One spear element is created up front and re-posed for each strike, rather
    // than being created and destroyed per attack. It is invisible until shown.
    const spear = document.createElement("div");
    spear.className = "spear";
    gameAreaElement.appendChild(spear);
    let spearTimer = 0;   // ms of visibility remaining; purely cosmetic

    // Where to draw the spear for each facing: [x, y, rotation-in-degrees].
    // Purely presentational - the actual hit test uses Player#meleeBox(), so
    // changing a pose here moves the picture without changing what it hits.
    // The 30px insets overlap the sprite slightly so the shaft appears held.
    const SPEAR_POSE = {
        up: (p, w, h) => [p.centerX - w / 2, p.y - h + 30, -30],
        down: (p, w, h) => [p.centerX - w / 2, p.y + p.height - 30, 150],
        left: (p, w, h) => [p.x - w + 30, p.centerY - h / 2, 250],
        right: (p, w, h) => [p.x + p.width - 30, p.centerY - h / 2, 45],
    };

    /**
     * Pose and reveal the spear for one strike. Hidden again by step() once
     * spearTimer runs out.
     */
    function showSpear() {
        // 70x90 must match `.spear`'s width/height in game_styles.css - the pose
        // functions need the sprite's size to centre it, and this element is not
        // measured the way entities are.
        const [x, y, rotation] = SPEAR_POSE[player.facing](player, 70, 90);
        spear.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) rotate(${rotation}deg)`;
        spear.classList.add("is-active");
        // Shorter than the 320ms strike cooldown, so the spear disappears before
        // the next strike is even possible.
        spearTimer = 120;
    }

    /**
     * Melee attack: hit every enemy inside the spear box, instantly.
     *
     * Unlike the fireball this is not a projectile - damage is applied in the same
     * tick as the key press, and it hits *all* enemies in the box rather than
     * stopping at the first. Silently does nothing while on cooldown.
     */
    function meleeAttack() {
        if (!player.canAttack()) return;
        player.beginAttack();
        Sfx.play("slash");
        showSpear();

        // overlaps() is used rather than resolve() so that hitting an enemy never
        // pushes it (or the player) around - see the geometry notes in elements.js.
        const box = player.meleeBox();
        for (const enemy of enemies) {
            if (!enemy.alive || !overlaps(box, enemy)) continue;
            if (enemy.takeDamage(player.attack)) killEnemy(enemy);
        }
    }

    /**
     * Spend mana and launch a fireball, if both the cooldown and the mana pool
     * allow it. Mana is only deducted when the cast actually happens.
     */
    function castFireball() {
        if (!player.canCast()) return;
        if (!player.spendMana(CONFIG.fireball.manaCost)) return;
        player.beginCast();
        Sfx.play("fireball");
        fireballs.push(new Fireball(player, bounds));
    }

    /**
     * Resolve a kill: award score, heal the player, and remove the body.
     *
     * This is the single place a run's rewards are granted, so every path that
     * kills something (melee and fireball) must route through it.
     *
     * @param {Enemy} enemy - already reduced to 0 health.
     */
    function killEnemy(enemy) {
        // Both a spear and a fireball can land on the same enemy in one frame;
        // this guard stops the second one paying out a second reward.
        if (!enemy.alive) return;
        Sfx.play("kill");
        state.kills++;
        player.score += enemy.variant.score;
        // The only source of healing in the game.
        player.heal(enemy.variant.lifeReward, enemy.variant.manaReward);
        if (enemy.variantName === "enemySpecial") state.bossSpawned = false;
        enemy.destroy();
    }

    /**
     * Create an enemy of the given variant at a legal spawn point.
     *
     * @param {string} variantName - key into ENEMY_VARIANTS.
     * @returns {Enemy} the spawned enemy, already added to `enemies`.
     */
    function spawnEnemy(variantName) {
        const enemy = new Enemy(variantName, bounds);
        enemy.placeAwayFrom(player, fieldObjects);
        enemies.push(enemy);
        return enemy;
    }

    // ------------------------------------------------------------------ hud
    // Last values pushed to the DOM. Every field below is compared before being
    // written, so a frame in which nothing visible changed costs no DOM work at
    // all. Initialised to impossible values so the first frame always paints.
    const lastHud = { health: -1, mana: -1, score: -1, kills: -1, time: -1, low: null };

    /**
     * Push changed values into the HUD.
     *
     * Called once per *frame* rather than once per simulation step - the numbers
     * only need to be correct at paint time, and several steps can run between
     * paints on a slow frame.
     *
     * Values are rounded before comparison, so a health bar draining fractionally
     * writes to the DOM roughly once per whole point rather than every frame.
     */
    function updateHud() {
        const health = Math.round(player.life);
        if (health !== lastHud.health) {
            hud.health.style.width = `${(health / player.maxLife) * 100}%`;
            hud.healthValue.textContent = health;
            lastHud.health = health;

            // Nested inside the health check on purpose: the low-health vignette
            // can only change when health does. 25 is a quarter of maxLife.
            const low = health <= 25 && !state.gameOver;
            if (low !== lastHud.low) {
                vignette.classList.toggle("is-active", low);
                lastHud.low = low;
            }
        }

        const mana = Math.round(player.mana);
        if (mana !== lastHud.mana) {
            hud.mana.style.width = `${(mana / player.maxMana) * 100}%`;
            hud.manaValue.textContent = mana;
            lastHud.mana = mana;
        }

        if (player.score !== lastHud.score) {
            hud.score.textContent = player.score;
            lastHud.score = player.score;
        }

        if (state.kills !== lastHud.kills) {
            hud.kills.textContent = state.kills;
            lastHud.kills = state.kills;
        }

        const seconds = Math.floor(state.elapsed / 1000);
        if (seconds !== lastHud.time) {
            hud.time.textContent = formatTime(seconds);
            lastHud.time = seconds;
        }

        player.syncBars();
    }

    /**
     * Format a duration as m:ss for the HUD clock and the game-over card.
     *
     * @param {number} totalSeconds - whole seconds.
     * @returns {string} e.g. "2:07". Minutes are not padded and do not roll over
     *          into hours.
     */
    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    // -------------------------------------------------------------- overlay
    /**
     * Enter or leave the paused state, showing or hiding the pause card.
     *
     * Ignored once the run is over, and a no-op if already in the requested
     * state - which matters because both the pause key and the visibility handler
     * can ask for the same transition.
     *
     * @param {boolean} paused - true to pause, false to resume.
     */
    function setPaused(paused) {
        if (state.gameOver || state.paused === paused) return;
        state.paused = paused;
        if (paused) {
            releaseAll();
            Sfx.stop("music");
            showOverlay("Paused", [], [{ label: "Resume", action: () => setPaused(false) }], "paused");
        } else {
            hideOverlay();
            if (audioUnlocked) Sfx.loop("music");
            // Discard the time that passed while paused. Without this the
            // accumulator would owe the loop every millisecond spent on the pause
            // screen and fast-forward the moment play resumes.
            lastFrame = performance.now();
            accumulator = 0;
        }
    }

    /**
     * Build and show the modal card used for both pause and game over.
     *
     * Content is constructed with createElement/textContent rather than innerHTML,
     * so nothing that reaches this function can inject markup.
     *
     * @param {string} title - heading text.
     * @param {{label: string, value: string|number}[]} stats - rows; may be empty.
     * @param {{label: string, action: Function}[]} actions - buttons, in order.
     * @param {string} variant - written to data-variant for CSS to style
     *        ("paused" | "gameover").
     */
    function showOverlay(title, stats, actions, variant) {
        overlayTitle.textContent = title;
        overlayStats.replaceChildren();
        for (const stat of stats) {
            const row = document.createElement("div");
            row.className = "overlay-stat";
            const label = document.createElement("span");
            label.className = "overlay-stat-label";
            label.textContent = stat.label;
            const value = document.createElement("strong");
            value.className = "overlay-stat-value";
            value.textContent = stat.value;
            row.append(label, value);
            overlayStats.appendChild(row);
        }
        overlayActions.replaceChildren();
        for (const action of actions) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "overlay-action popping";
            button.textContent = action.label;
            button.addEventListener("click", action.action);
            overlayActions.appendChild(button);
        }
        overlay.dataset.variant = variant;
        overlay.classList.add("is-visible");
        overlay.setAttribute("aria-hidden", "false");
        // Move focus into the dialog so it can be operated from the keyboard
        // alone, and so screen readers announce it.
        const first = overlayActions.querySelector("button");
        if (first) first.focus();
    }

    /** Hide the modal card. Its contents are left in place until next shown. */
    function hideOverlay() {
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
    }

    /**
     * End the run: stop the simulation, play the death sounds, and show the
     * game-over card with the final tally.
     *
     * Terminal - nothing sets `state.running` back to true, so both offered
     * actions navigate (reload to restart, or back to the menu).
     */
    function endGame() {
        state.gameOver = true;
        state.running = false;
        player.gameOver = true;
        releaseAll();
        vignette.classList.remove("is-active");

        Sfx.stop("music");
        Sfx.play("dead");
        Sfx.play("gameOver");
        player.element.classList.add("is-dead");

        showOverlay("You Fell", [
            { label: "Enemies defeated", value: state.kills },
            { label: "Total score", value: player.score },
            { label: "Time survived", value: formatTime(Math.floor(state.elapsed / 1000)) },
        ], [
            { label: "Restart", action: () => window.location.reload() },
            { label: "Exit", action: () => { window.location.href = "../index.html"; } },
        ], "gameover");
    }

    // ------------------------------------------------------------ simulation
    /**
     * Advance the world by exactly one fixed simulation step.
     *
     * The ordering below is deliberate and worth preserving:
     *   1. clock and timed events  - spawns and regen, off simulated time
     *   2. movement                - player, enemies, projectiles
     *   3. collision correction    - bodies first, then scenery
     *   4. render                  - once, after positions are final
     *   5. damage                  - enemy contact, then projectile impacts
     *   6. cleanup                 - sweep the dead, then depth-sort
     *
     * Rendering has to come after correction, or sprites would show their
     * pre-correction position and jitter against walls. Damage comes after
     * rendering because it can end the run, which returns early.
     *
     * @param {number} dt   - seconds elapsed this step (constant).
     * @param {number} dtMs - the same interval in milliseconds.
     */
    function step(dt, dtMs) {
        state.elapsed += dtMs;

        // --- timed events, driven off simulated time rather than setInterval
        // Each deadline advances by its interval rather than being reset to
        // `elapsed + interval`, so ticks keep a steady cadence instead of drifting
        // by whatever fraction of a step they overshot by.
        if (state.elapsed >= state.nextManaTick) {
            state.nextManaTick += CONFIG.player.manaRegenInterval;
            player.regenMana(CONFIG.player.manaRegen);
        }
        // Routine skeleton spawn, which can also drag a brute in with it.
        //
        // TODO(doc): the exact intent of this gate is unclear. As written, the
        // softCap only limits spawning while `bossSpawned` is true - with no brute
        // flagged, `!state.bossSpawned` short-circuits and skeletons keep arriving
        // regardless of how many are already on the field. It is unclear whether
        // the cap was meant to apply at all times. The literal 4 that triggers the
        // brute is also hardcoded here rather than living in CONFIG.spawn beside
        // the value it is compared against.
        if (state.elapsed >= state.nextSpawn) {
            state.nextSpawn += CONFIG.spawn.interval;
            if (!state.bossSpawned || enemies.length < CONFIG.spawn.softCap) {
                spawnEnemy("enemy");
                if (enemies.length >= 4 && !state.bossSpawned) {
                    state.bossSpawned = true;
                    spawnEnemy("enemySpecial");
                }
            }
        }
        // Forced brute on a slower timer. Unconditional: unlike the rule above it
        // does not check `bossSpawned` first, so this can put a second brute on
        // the field alongside one that is still alive.
        if (state.elapsed >= state.nextBoss) {
            state.nextBoss += CONFIG.spawn.bossInterval;
            state.bossSpawned = true;
            spawnEnemy("enemySpecial");
        }

        // --- movement
        // Captured before the player moves: blockMovement() needs to know where
        // they came from to tell which part of the move drove them into a body.
        const prevX = player.x;
        const prevY = player.y;
        player.update(dt, input);
        for (const enemy of enemies) enemy.chase(player, dt);
        for (const fireball of fireballs) fireball.update(dt);

        // --- enemies are solid, and neither body shoves the other: walking into
        //     a skeleton stops the player without moving it, and a skeleton
        //     walking into the player does not shove the player either.
        for (const enemy of enemies) blockMovement(player, enemy, prevX, prevY);

        // --- scenery blocks both the player and the enemies
        for (const object of fieldObjects) {
            resolve(player, object);
            for (const enemy of enemies) resolve(enemy, object);
        }

        // Positions were corrected after update(), so repaint at the final spot.
        player.render();
        for (const enemy of enemies) enemy.render();

        // --- enemy contact damage
        for (const enemy of enemies) {
            const damage = enemy.strike(player);
            if (!damage) continue;
            Sfx.play("enemySlash");
            if (player.takeDamage(damage)) {
                endGame();
                return;
            }
        }

        // --- projectiles. A fireball dies on its first hit, so it cannot chain.
        // Scenery is tested before enemies, so a bolt that would clear a rock and
        // an enemy in the same step is stopped by the rock.
        for (const fireball of fireballs) {
            if (!fireball.alive) continue;
            for (const object of fieldObjects) {
                if (object.blocksProjectiles && overlaps(fireball, object)) {
                    fireball.explode();
                    break;
                }
            }
            if (!fireball.alive) continue;
            for (const enemy of enemies) {
                if (!enemy.alive || !overlaps(fireball, enemy)) continue;
                fireball.explode();
                if (enemy.takeDamage(fireball.attack)) killEnemy(enemy);
                break;
            }
        }

        // --- single sweep of the dead, instead of splicing mid-iteration
        compact(enemies);
        compact(fireballs);

        depthSort(player);
        for (const enemy of enemies) depthSort(enemy);

        // Cosmetic only: retract the spear once its brief display time is up.
        if (spearTimer > 0) {
            spearTimer -= dtMs;
            if (spearTimer <= 0) spear.classList.remove("is-active");
        }
    }

    /**
     * Keep `entity` from driving deeper into `blocker`, one axis at a time so it
     * slides along the body instead of sticking. Unlike resolve(), neither party
     * is displaced: an enemy that walks into a standing player leaves the player
     * exactly where it was.
     *
     * Only movement that *increases* penetration is undone. That matters because
     * a chasing enemy closes the last couple of pixels itself, so the player is
     * routinely already overlapping at the start of a step - reverting to the
     * previous position there would pin the player in place with nowhere to go.
     * Moving back out always reduces penetration, so an escape route always
     * exists on both axes.
     *
     * Step by step:
     *   1. Bail out unless the two are actually overlapping.
     *   2. Measure how deeply they overlapped on each axis at the *previous*
     *      position (`wasX` / `wasY`). A negative value means they did not
     *      overlap on that axis at all.
     *   3. Settle X: put Y back where it was, so the test looks only at the
     *      horizontal part of the move, and undo X if it made things worse.
     *   4. Settle Y against the column just decided, and undo it on the same test.
     *
     * @param {Entity} entity - the one that may be pushed back (the player).
     * @param {Entity} blocker - never moves (an enemy).
     * @param {number} prevX - entity.x before this step's movement.
     * @param {number} prevY - entity.y before this step's movement.
     */
    function blockMovement(entity, blocker, prevX, prevY) {
        if (!overlaps(entity, blocker)) return;

        const width = entity.width;
        const height = entity.height;
        // Overlap along one axis; positive only when the two spans intersect.
        const penX = (x) => Math.min(x + width, blocker.x + blocker.width) - Math.max(x, blocker.x);
        const penY = (y) => Math.min(y + height, blocker.y + blocker.height) - Math.max(y, blocker.y);

        const movedX = entity.x;
        const movedY = entity.y;
        const wasX = penX(prevX);
        const wasY = penY(prevY);

        // Settle X against the previous row, then Y against the settled column.
        entity.y = prevY;
        if (overlaps(entity, blocker) && penX(movedX) > wasX) entity.x = prevX;

        entity.y = movedY;
        if (overlaps(entity, blocker) && penY(movedY) > wasY) entity.y = prevY;
    }

    /**
     * Taller sprites should overlap the ones behind them. Bucketing y keeps this
     * to a handful of style writes per second instead of one per frame.
     *
     * The bottom edge is shifted right by 3 (divided by 8) to give the bucket, and
     * capped so the result stays inside 2..500 - the band reserved for entities
     * below the HUD and overlay layers documented in game_styles.css.
     *
     * @param {Entity} entity - repositioned in the stacking order, not moved.
     */
    function depthSort(entity) {
        const layer = 2 + Math.min(Math.round(entity.y + entity.height) >> 3, 498);
        if (layer !== entity._layer) {
            entity.element.style.zIndex = String(layer);
            entity._layer = layer;
        }
    }

    /**
     * Remove dead entries in place; cheaper than repeated splice() calls.
     *
     * Single pass with a read and a write cursor: live entries are shifted down
     * over dead ones and the array is then truncated. Running this once at the end
     * of a step - instead of splicing during iteration - is what makes it safe for
     * anything to mark itself dead at any point earlier in the step.
     *
     * @param {{alive: boolean}[]} list - mutated in place.
     */
    function compact(list) {
        let write = 0;
        for (let read = 0; read < list.length; read++) {
            if (list[read].alive) list[write++] = list[read];
        }
        list.length = write;
    }

    // --------------------------------------------------------------- loop
    // Fixed-timestep accumulator. Real elapsed time is banked in `accumulator`,
    // and the simulation is advanced in whole `stepMs` slices - so `dt` is always
    // the same value and the physics is identical on any refresh rate. A 144Hz
    // display simply paints the same simulation more often than a 60Hz one.
    let lastFrame = performance.now();
    let accumulator = 0;   // ms of real time owed to the simulation
    const stepMs = CONFIG.step;
    const stepSeconds = stepMs / 1000;

    /**
     * One animation frame: bank elapsed time, run as many simulation steps as it
     * pays for, then repaint the HUD.
     *
     * @param {number} now - timestamp supplied by requestAnimationFrame.
     */
    function frame(now) {
        // Queued first so an exception thrown below cannot kill the loop
        // permanently - the next frame is already scheduled.
        window.requestAnimationFrame(frame);
        // Keep the clock moving while paused or dead, so the time spent there is
        // never banked and replayed on resume.
        if (!state.running || state.paused) {
            lastFrame = now;
            return;
        }

        // Clamp so returning from a background tab does not fast-forward the run.
        accumulator += Math.min(now - lastFrame, CONFIG.maxFrameTime);
        lastFrame = now;

        while (accumulator >= stepMs) {
            accumulator -= stepMs;
            step(stepSeconds, stepMs);
            // Death inside a step stops the remaining catch-up steps immediately.
            if (!state.running) break;
        }
        updateHud();
    }

    // Start the loop, and paint the HUD once up front so it shows full bars
    // before the first frame lands.
    window.requestAnimationFrame(frame);
    updateHud();

    // ------------------------------------------------------------- resize
    // Re-lay out the arena rather than reloading and throwing away the run.
    // Debounced, because a drag-resize fires continuously and each pass re-measures
    // and repositions everything on the field.
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            measureBounds();
            layoutField();
            // Pull anything that the new, smaller arena has left outside back in.
            // Entities read `bounds` by reference, so nothing else needs telling.
            player.x = clamp(player.x, 0, bounds.width - player.width);
            player.y = clamp(player.y, 0, bounds.height - player.height);
            player.render();
            for (const enemy of enemies) {
                enemy.x = clamp(enemy.x, 0, bounds.width - enemy.width);
                enemy.y = clamp(enemy.y, 0, bounds.height - enemy.height);
                enemy.render();
            }
        }, 150);
    });

    // --------------------------------------------------- asset warm-up
    // Walk cycles are CSS background-image keyframes, so the browser only fetches
    // each frame the first time it is displayed - that is the source of the
    // "animation stutter" in the README. Warm them after first paint.
    //
    // Constructing an Image and setting src is enough to pull a file into the HTTP
    // cache; the objects are deliberately discarded. This runs on `load` so it
    // competes with nothing the first screen actually needs.
    //
    // NOTE: these paths are relative to html/game.html, not to this file. Adding a
    // new walk direction or sprite means adding it here too, or it will stutter on
    // first use.
    window.addEventListener("load", () => {
        const warm = [];
        for (const direction of ["moveUp", "moveDown", "moveLeft", "moveRight"]) {
            for (let i = 1; i <= 9; i++) {
                warm.push(`../images/animations/character/${direction}/${i}.png`);
            }
        }
        warm.push(
            "../images/skelly_up.png", "../images/skelly_left.png",
            "../images/skelly_right.png", "../images/explosion.png",
        );
        for (const src of warm) new Image().src = src;
    }, { once: true });
})();
