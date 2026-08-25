/**
 * Dungeon Dweller - game orchestrator.
 *
 * Runs a fixed-timestep simulation (accumulator + clamped frame time) so the
 * game plays identically regardless of the display's refresh rate.
 */
(() => {
    "use strict";

    const { CONFIG, clamp, overlaps, resolve, Sfx, Player, Enemy, FieldObject, Fireball } = DD;

    // ------------------------------------------------------------------ dom
    const gameAreaElement = document.querySelector("#game-area");
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

    Sfx.register("slash", "#audioSlash");
    Sfx.register("fireball", "#audioFireball");
    Sfx.register("kill", "#audioKill");
    Sfx.register("dead", "#audioDead");
    Sfx.register("enemySlash", "#audioEnemySlash");
    Sfx.register("music", "#audioGame");
    Sfx.register("gameOver", "#audioGameOver");

    // ---------------------------------------------------------------- state
    const bounds = { element: gameAreaElement, width: 0, height: 0 };

    function measureBounds() {
        const rect = gameAreaElement.getBoundingClientRect();
        bounds.width = rect.width;
        bounds.height = rect.height;
    }
    measureBounds();

    const player = new Player(bounds);
    const enemies = [];
    const fireballs = [];
    const fieldObjects = [];

    const state = {
        running: true,
        paused: false,
        gameOver: false,
        elapsed: 0,          // ms of simulated play time
        kills: 0,
        nextSpawn: CONFIG.spawn.interval,
        nextBoss: CONFIG.spawn.bossInterval,
        nextManaTick: CONFIG.player.manaRegenInterval,
        bossSpawned: false,
    };

    // ---------------------------------------------------------------- world
    // Positions are expressed relative to the arena so a resize re-lays them out
    // instead of reloading the page and destroying the run.
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

    function layoutField() {
        for (const object of fieldObjects) {
            const [x, y] = object.spec.at(bounds.width, bounds.height, object.width, object.height);
            object.moveTo(x, y);
        }
    }

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
    const KEYMAP = {
        w: "up", arrowup: "up",
        s: "down", arrowdown: "down",
        a: "left", arrowleft: "left",
        d: "right", arrowright: "right",
    };
    const held = { up: false, down: false, left: false, right: false };
    const facingStack = [];   // most recently pressed direction wins

    const input = {
        get up() { return held.up; },
        get down() { return held.down; },
        get left() { return held.left; },
        get right() { return held.right; },
        get facing() { return facingStack[facingStack.length - 1] || null; },
    };

    function releaseAll() {
        held.up = held.down = held.left = held.right = false;
        facingStack.length = 0;
    }

    let audioUnlocked = false;
    function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        Sfx.loop("music");
        if (hint) hint.classList.add("is-hidden");
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && !state.gameOver) setPaused(true);
    });

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
            event.preventDefault();
            if (!held[direction]) {
                held[direction] = true;
                facingStack.push(direction);
            }
            return;
        }

        if (event.repeat) return;
        if (key === "k") meleeAttack();
        else if (key === "l") castFireball();
    }

    function onKeyUp(event) {
        const direction = KEYMAP[event.key.toLowerCase()];
        if (!direction) return;
        held[direction] = false;
        const index = facingStack.lastIndexOf(direction);
        if (index !== -1) facingStack.splice(index, 1);
    }

    // --------------------------------------------------------------- combat
    const spear = document.createElement("div");
    spear.className = "spear";
    gameAreaElement.appendChild(spear);
    let spearTimer = 0;

    const SPEAR_POSE = {
        up: (p, w, h) => [p.centerX - w / 2, p.y - h + 30, -30],
        down: (p, w, h) => [p.centerX - w / 2, p.y + p.height - 30, 150],
        left: (p, w, h) => [p.x - w + 30, p.centerY - h / 2, 250],
        right: (p, w, h) => [p.x + p.width - 30, p.centerY - h / 2, 45],
    };

    function showSpear() {
        const [x, y, rotation] = SPEAR_POSE[player.facing](player, 70, 90);
        spear.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) rotate(${rotation}deg)`;
        spear.classList.add("is-active");
        spearTimer = 120;
    }

    function meleeAttack() {
        if (!player.canAttack()) return;
        player.beginAttack();
        Sfx.play("slash");
        showSpear();

        const box = player.meleeBox();
        for (const enemy of enemies) {
            if (!enemy.alive || !overlaps(box, enemy)) continue;
            if (enemy.takeDamage(player.attack)) killEnemy(enemy);
        }
    }

    function castFireball() {
        if (!player.canCast()) return;
        if (!player.spendMana(CONFIG.fireball.manaCost)) return;
        player.beginCast();
        Sfx.play("fireball");
        fireballs.push(new Fireball(player, bounds));
    }

    function killEnemy(enemy) {
        if (!enemy.alive) return;
        Sfx.play("kill");
        state.kills++;
        player.score += enemy.variant.score;
        player.heal(enemy.variant.lifeReward, enemy.variant.manaReward);
        if (enemy.variantName === "enemySpecial") state.bossSpawned = false;
        enemy.destroy();
    }

    function spawnEnemy(variantName) {
        const enemy = new Enemy(variantName, bounds);
        enemy.placeAwayFrom(player, fieldObjects);
        enemies.push(enemy);
        return enemy;
    }

    // ------------------------------------------------------------------ hud
    const lastHud = { health: -1, mana: -1, score: -1, kills: -1, time: -1, low: null };

    function updateHud() {
        const health = Math.round(player.life);
        if (health !== lastHud.health) {
            hud.health.style.width = `${(health / player.maxLife) * 100}%`;
            hud.healthValue.textContent = health;
            lastHud.health = health;

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

    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    // -------------------------------------------------------------- overlay
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
            lastFrame = performance.now();
            accumulator = 0;
        }
    }

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
        const first = overlayActions.querySelector("button");
        if (first) first.focus();
    }

    function hideOverlay() {
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
    }

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
    function step(dt, dtMs) {
        state.elapsed += dtMs;

        // --- timed events, driven off simulated time rather than setInterval
        if (state.elapsed >= state.nextManaTick) {
            state.nextManaTick += CONFIG.player.manaRegenInterval;
            player.regenMana(CONFIG.player.manaRegen);
        }
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
        if (state.elapsed >= state.nextBoss) {
            state.nextBoss += CONFIG.spawn.bossInterval;
            state.bossSpawned = true;
            spawnEnemy("enemySpecial");
        }

        // --- movement
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
     */
    function depthSort(entity) {
        const layer = 2 + Math.min(Math.round(entity.y + entity.height) >> 3, 498);
        if (layer !== entity._layer) {
            entity.element.style.zIndex = String(layer);
            entity._layer = layer;
        }
    }

    /** Remove dead entries in place; cheaper than repeated splice() calls. */
    function compact(list) {
        let write = 0;
        for (let read = 0; read < list.length; read++) {
            if (list[read].alive) list[write++] = list[read];
        }
        list.length = write;
    }

    // --------------------------------------------------------------- loop
    let lastFrame = performance.now();
    let accumulator = 0;
    const stepMs = CONFIG.step;
    const stepSeconds = stepMs / 1000;

    function frame(now) {
        window.requestAnimationFrame(frame);
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
            if (!state.running) break;
        }
        updateHud();
    }

    window.requestAnimationFrame(frame);
    updateHud();

    // ------------------------------------------------------------- resize
    // Re-lay out the arena rather than reloading and throwing away the run.
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            measureBounds();
            layoutField();
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
