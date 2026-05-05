/**
 * index.js — Game Entry Point & Main Loop
 *
 * Responsibilities:
 *   1. Import and initialise all subsystems.
 *   2. Wire Fighter callbacks to EffectsManager.
 *   3. Run the main requestAnimationFrame loop with proper deltaTime.
 *   4. Maintain strict draw-order:
 *        a. Clear canvas
 *        b. Draw parallax (screen space — no camera transform)
 *        c. Push camera transform
 *        d. Draw world-space game objects (fighters, ground)
 *        e. Draw world-space effects (sparks, slash trails)
 *        f. Pop camera transform
 *        g. Draw screen-space UI (health bars, timer)
 *        h. Draw screen-space effects (hit flash)
 *        i. Draw cinematic letterbox last (always on top)
 *
 * WHY this ordering:
 *   - Parallax uses its own offset logic and must NOT be inside the
 *     camera transform (or it would double-shift).
 *   - Fighters and particles ARE inside the camera transform so they
 *     shake with the camera on hit.
 *   - UI/HUD is outside the transform so it never shakes — very
 *     important for readability during combat.
 */

import { player, enemy }                    from './Fighter.js';
// Sprite.js is still loaded indirectly (Fighter extends Sprite), but we no
// longer use the static 'background' sprite — parallax replaces it.
import { loadKeyDownEvents, loadkeyUpEvents } from './Keys.js';
import { Camera }                            from './Camera.js';
import { ParallaxSystem }                    from './ParallaxSystem.js';
import { ParticleSystem }                    from './ParticleSystem.js';
import { EffectsManager }                    from './EffectsManager.js';

// ─── Canvas Setup ─────────────────────────────────────────────────────────────

const canvas = document.querySelector('canvas');
const c      = canvas.getContext('2d');

// Canvas dimensions are set in Fighter.js (1024×576) so we just read them.
const W = canvas.width;   // 1024
const H = canvas.height;  // 576

// ─── Game State ───────────────────────────────────────────────────────────────

let timer     = 30;     // Game timer (seconds).
let timerID;            // clearTimeout handle.
let gameEnded = false;  // Prevent multiple winner announcements.

// ─── Subsystem Initialisation ─────────────────────────────────────────────────

// Camera — world size equals canvas size (no scrolling world for now,
// but shake still works correctly).
const camera = new Camera({
    worldWidth:  W,
    worldHeight: H,
    viewWidth:   W,
    viewHeight:  H,
    lerpFactor:  0.1,
    deadZone:    40,
    shakeDecay:  0.86,
});

// Parallax background — replaces the static background sprite entirely.
const parallax = new ParallaxSystem(W, H);

// Particle engine — single shared pool for all emitters.
const particles = new ParticleSystem();

// Effects coordinator — receives camera and particles by reference.
const effects = new EffectsManager(camera, particles);

// ─── Fighter Effect Callbacks ─────────────────────────────────────────────────

/**
 * Wire callbacks onto the fighters AFTER both Fighter and EffectsManager
 * exist.  This keeps Fighter.js free of any import dependency on effects.
 */

// Player hits the enemy → effects at hit point
player.onHitCallback = (x, y, damage, direction) => {
    effects.onHit(x, y, damage, direction);
};
// Player swings → slash trail at weapon tip
player.onAttackCallback = (x, y, direction) => {
    effects.onAttack(x, y, direction);
};

// Enemy hits the player → effects at hit point
enemy.onHitCallback = (x, y, damage, direction) => {
    effects.onHit(x, y, damage, direction);
};
// Enemy swings → slash trail at weapon tip
enemy.onAttackCallback = (x, y, direction) => {
    effects.onAttack(x, y, direction);
};

// ─── Input ────────────────────────────────────────────────────────────────────

loadKeyDownEvents(player, enemy);
loadkeyUpEvents(player, enemy);

// ─── Ambient Particle Spawning ────────────────────────────────────────────────

// Accumulate time between ambient spawns so we're not frame-rate dependent.
let _dustTimer  = 0;
let _emberTimer = 0;

const DUST_INTERVAL  = 0.055;  // Spawn a dust mote every ~55ms  (≈18/sec)
const EMBER_INTERVAL = 0.28;   // Spawn an ember every ~280ms    (≈3.5/sec)

function updateAmbientParticles(dt) {
    _dustTimer  += dt;
    _emberTimer += dt;

    if (_dustTimer >= DUST_INTERVAL) {
        _dustTimer -= DUST_INTERVAL;
        particles.spawnAmbientDust(W, H);
    }
    if (_emberTimer >= EMBER_INTERVAL) {
        _emberTimer -= EMBER_INTERVAL;
        particles.spawnEmber(W);
    }
}

// ─── Camera Follow Target ─────────────────────────────────────────────────────

/**
 * Returns the midpoint between the two fighters so the camera tries to
 * keep both in frame.  In this game the world == viewport so x will always
 * clamp to 0 — but the system is ready for a wider world if needed.
 */
function getCameraTarget() {
    return {
        x: (player.position.x + enemy.position.x) / 2,
        y: (player.position.y + enemy.position.y) / 2,
    };
}

// ─── Cinematic Letterbox ──────────────────────────────────────────────────────

const LETTERBOX_H = 38; // Height of each letterbox bar in pixels.

/**
 * drawLetterbox() — draw top and bottom black bars for a cinematic 2.35:1 feel.
 * Called LAST so it's always on top of everything including HUD.
 */
function drawLetterbox() {
    c.save();
    c.fillStyle = '#000000';
    c.fillRect(0,          0, W, LETTERBOX_H);  // Top bar
    c.fillRect(0, H - LETTERBOX_H, W, LETTERBOX_H);  // Bottom bar
    c.restore();
}

// ─── HUD Drawing ─────────────────────────────────────────────────────────────

/**
 * drawHUD() — render health bars and timer in screen space (no shake).
 * Drawn between resetTransform() and drawLetterbox() so bars are always
 * visible but letterbox sits on top of clipped areas.
 */
function drawHUD() {
    const barW = 280;
    const barH = 14;
    const barY = LETTERBOX_H + 14;
    const margin = 20;

    // ── Player 1 health bar (left side) ──────────────────────────────────────
    const p1BarX = margin;

    // Background track
    c.fillStyle = 'rgba(0,0,0,0.6)';
    _roundRect(c, p1BarX - 2, barY - 2, barW + 4, barH + 4, 4);
    c.fill();

    // Empty health (dark red)
    c.fillStyle = '#4a0a0a';
    _roundRect(c, p1BarX, barY, barW, barH, 3);
    c.fill();

    // Remaining health — gradient purple→pink
    const p1Health = Math.max(0, (player.health / 100) * barW);
    if (p1Health > 0) {
        const grad1 = c.createLinearGradient(p1BarX, barY, p1BarX + barW, barY);
        grad1.addColorStop(0, '#8B5CF6');
        grad1.addColorStop(1, '#c084fc');
        c.fillStyle = grad1;
        _roundRect(c, p1BarX, barY, p1Health, barH, 3);
        c.fill();

        // Sheen highlight on top half
        const sheen1 = c.createLinearGradient(p1BarX, barY, p1BarX, barY + barH);
        sheen1.addColorStop(0,   'rgba(255,255,255,0.22)');
        sheen1.addColorStop(0.5, 'rgba(255,255,255,0)');
        c.fillStyle = sheen1;
        _roundRect(c, p1BarX, barY, p1Health, barH, 3);
        c.fill();
    }

    // Player label
    c.fillStyle = '#e2d4ff';
    c.font = "bold 11px 'silver', Arial, sans-serif";
    c.textAlign = 'left';
    c.fillText('P1', p1BarX, barY - 4);

    // ── Player 2 health bar (right side, flipped) ─────────────────────────────
    const p2BarX = W - margin - barW;

    c.fillStyle = 'rgba(0,0,0,0.6)';
    _roundRect(c, p2BarX - 2, barY - 2, barW + 4, barH + 4, 4);
    c.fill();

    c.fillStyle = '#4a0a0a';
    _roundRect(c, p2BarX, barY, barW, barH, 3);
    c.fill();

    const p2Health = Math.max(0, (enemy.health / 100) * barW);
    if (p2Health > 0) {
        // Draw from the RIGHT side so enemy bar depletes left
        const p2StartX = p2BarX + (barW - p2Health);
        const grad2 = c.createLinearGradient(p2StartX, barY, p2StartX + p2Health, barY);
        grad2.addColorStop(0, '#c084fc');
        grad2.addColorStop(1, '#8B5CF6');
        c.fillStyle = grad2;
        _roundRect(c, p2StartX, barY, p2Health, barH, 3);
        c.fill();

        const sheen2 = c.createLinearGradient(p2StartX, barY, p2StartX, barY + barH);
        sheen2.addColorStop(0,   'rgba(255,255,255,0.22)');
        sheen2.addColorStop(0.5, 'rgba(255,255,255,0)');
        c.fillStyle = sheen2;
        _roundRect(c, p2StartX, barY, p2Health, barH, 3);
        c.fill();
    }

    // Player 2 label
    c.fillStyle = '#e2d4ff';
    c.font = "bold 11px 'silver', Arial, sans-serif";
    c.textAlign = 'right';
    c.fillText('P2', p2BarX + barW, barY - 4);

    // ── Timer ─────────────────────────────────────────────────────────────────
    const timerStr = timer.toString();
    c.textAlign   = 'center';
    c.font        = "bold 32px 'silver', Arial, sans-serif";
    c.shadowColor = 'rgba(120,60,220,0.7)';
    c.shadowBlur  = 10;
    c.fillStyle   = timer <= 10 ? '#ff6060' : '#f0e0ff'; // Red when low
    c.fillText(timerStr, W / 2, barY + barH + 10);
    c.shadowBlur  = 0;
}

/** Helper: draw a rounded rectangle path (no native roundRect in all browsers). */
function _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
}

// ─── Fighter Update (non-draw logic) ──────────────────────────────────────────

/**
 * updateFighter() — run a fighter's update tick (physics, state machine).
 * Separating "update" from "draw" keeps logic out of rendering passes.
 */
function updateFighter(fighter) {
    if (fighter.health > 0) {
        fighter.update();   // Includes draw() via Sprite.update() — existing code
    } else {
        fighter.animateFrames();
        fighter.draw();
    }
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function decreaseTimer() {
    if (timer > 0) {
        timerID = setTimeout(decreaseTimer, 1000);
        timer--;
    } else {
        determineWinner({ player, enemy, timerID });
    }
}

// ─── Winner Determination ─────────────────────────────────────────────────────

function determineWinner({ player, enemy, timerID }) {
    clearTimeout(timerID);
    gameEnded = true;
    document.querySelector('#result').style.display = 'flex';
    if (player.health === enemy.health) {
        document.querySelector('#result').innerHTML = 'Tie!';
    } else if (player.health > enemy.health) {
        document.querySelector('#result').innerHTML = 'Player 1 won!';
        enemy.health = 0;
        enemy.switchSprite('death');
    } else {
        document.querySelector('#result').innerHTML = 'Player 2 won!';
        player.health = 0;
        player.switchSprite('death');
    }
}

// ─── Bot AI ───────────────────────────────────────────────────────────────────

function intervalBot() {
    setInterval(botMoves,  1000);
    setInterval(botAttack, 1000);
}

function botMoves() {
    const r = Math.random();
    if (r < 0.45) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' })), r * 3000);
    } else if (r < 0.85) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })), r * 3000);
    }
}

function botAttack() {
    if (enemy.attackCooldown && enemy.isHitting(player)) {
        enemy.isAttacking = true;
        enemy.attack(player);
        setTimeout(() => { enemy.isAttacking = false; }, 1000);
    }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

// -1 sentinel: on the very first frame we set _lastTime = timestamp and
// return early (dt = 0 guard handles it). This avoids the huge dt that would
// occur if we used 0 and the page has been open for several seconds.
let _lastTime = -1;

/**
 * animate() — the main requestAnimationFrame loop.
 *
 * Frame order (see module docblock for rationale):
 *   1.  Compute deltaTime
 *   2.  Update all systems (camera, parallax, particles, effects)
 *   3.  Clear canvas
 *   4.  Draw parallax (screen space — before camera transform)
 *   5.  Push camera transform
 *   6.  Draw fighters & arena floor stripe
 *   7.  Draw particles (world space, shake-affected)
 *   8.  Draw world effects (slash trails, damage numbers, rings)
 *   9.  Pop camera transform
 *   10. Draw HUD (screen space, never shakes)
 *   11. Draw screen effects (hit flash)
 *   12. Draw letterbox (always on top)
 */
function animate(timestamp) {
    window.requestAnimationFrame(animate);

    // ── 1. DeltaTime ──────────────────────────────────────────────────────────
    // On the very first frame, initialise _lastTime and skip the update
    // so we don't get a huge dt equal to the page's uptime.
    if (_lastTime < 0) {
        _lastTime = timestamp;
        return;
    }
    // Cap at 100ms to avoid huge jumps after tab-switch / focus loss.
    const dt = Math.min((timestamp - _lastTime) / 1000, 0.1);
    _lastTime = timestamp;

    // ── 2. System Updates ─────────────────────────────────────────────────────
    camera.follow(getCameraTarget());
    camera.update(dt);
    parallax.update(camera.x);
    updateAmbientParticles(dt);
    particles.update(dt);
    effects.update(dt);

    // Fighter movement (reset x vel each frame — existing behaviour preserved)
    player.velocity.x = 0;
    enemy.velocity.x  = 0;

    if (!player.movement() && !player.isAttacking && !player.isTakingHit) {
        player.switchSprite('idle');
    }
    if (!enemy.movement() && !enemy.isAttacking && !enemy.isTakingHit) {
        enemy.switchSprite('idle');
    }

    // ── 3. Clear Canvas ───────────────────────────────────────────────────────
    c.clearRect(0, 0, W, H);

    // ── 4. Parallax Background (screen space) ─────────────────────────────────
    parallax.draw(c);

    // ── 5. Push Camera Transform ──────────────────────────────────────────────
    camera.applyTransform(c);

    // ── 6. Draw Fighters ──────────────────────────────────────────────────────
    updateFighter(player);
    updateFighter(enemy);

    // Arena floor accent stripe — thin glowing line at the ground level.
    // Drawn inside camera transform so shake hits it naturally.
    _drawArenaFloor(c);

    // ── 7. Particles (world space) ────────────────────────────────────────────
    particles.draw(c);

    // ── 8. World Effects ──────────────────────────────────────────────────────
    effects.drawWorldEffects(c);

    // ── 9. Pop Camera Transform ───────────────────────────────────────────────
    camera.resetTransform(c);

    // ── 10. HUD (screen space, no shake) ──────────────────────────────────────
    drawHUD();

    // ── 11. Screen Effects ────────────────────────────────────────────────────
    effects.drawScreenEffects(c, W, H);

    // ── 12. Letterbox (always on top) ─────────────────────────────────────────
    drawLetterbox();

    // ── Attack / Hit detection ────────────────────────────────────────────────
    // Kept at end of frame (same position as original code) so callbacks
    // fired in attack() write to effects arrays that will be drawn next frame.
    player.attack(enemy);
    enemy.attack(player);

    // ── Win condition ─────────────────────────────────────────────────────────
    if (!gameEnded && (enemy.health <= 0 || player.health <= 0)) {
        determineWinner({ player, enemy, timerID });
    }
}

/**
 * _drawArenaFloor() — subtle glowing ground line for arena feel.
 * Drawn in world space so it shakes with the camera on impact.
 */
function _drawArenaFloor(ctx) {
    const groundY = H - 95; // Matches the ground collision in Fighter.js
    const grad = ctx.createLinearGradient(0, groundY, W, groundY);
    grad.addColorStop(0,    'rgba(100, 50, 200, 0)');
    grad.addColorStop(0.2,  'rgba(140, 70, 230, 0.35)');
    grad.addColorStop(0.5,  'rgba(160, 90, 255, 0.5)');
    grad.addColorStop(0.8,  'rgba(140, 70, 230, 0.35)');
    grad.addColorStop(1,    'rgba(100, 50, 200, 0)');

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2;
    ctx.shadowColor = 'rgba(150, 80, 255, 0.6)';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.restore();
}

// ─── Game Start ───────────────────────────────────────────────────────────────

intervalBot();

setTimeout(() => {
    animate(0);         // Kick off the loop
    decreaseTimer();    // Start countdown
}, 1000);
