/**
 * Camera.js — 2D Camera System
 *
 * WHY this exists: Without a camera system, screen shake requires
 * translating every drawn object manually. By centralising the
 * canvas transform here we can shake / follow with a single
 * ctx.translate() call and the rest of the code stays clean.
 *
 * Design decisions:
 *  - LERP follow with a dead zone so the camera only starts chasing
 *    after the target exits the comfort zone — prevents micro-jitter.
 *  - Exponential shake decay feels physically correct (fast onset,
 *    smooth fade) and is just one multiply per frame.
 *  - Bounds clamping stops the camera from revealing empty space
 *    beyond the world edges.
 *  - applyTransform / resetTransform must always be called in pairs;
 *    the caller (index.js) is responsible for this contract.
 */

export class Camera {
    /**
     * @param {object} config
     * @param {number} config.worldWidth   - Total pixel width of the game world.
     * @param {number} config.worldHeight  - Total pixel height of the game world.
     * @param {number} config.viewWidth    - Canvas viewport width.
     * @param {number} config.viewHeight   - Canvas viewport height.
     * @param {number} [config.lerpFactor] - 0–1, how quickly camera catches target (default 0.08).
     * @param {number} [config.deadZone]   - Pixels target can move before camera follows (default 80).
     * @param {number} [config.shakeDecay] - Shake multiplier per frame (default 0.88).
     */
    constructor({
        worldWidth,
        worldHeight,
        viewWidth,
        viewHeight,
        lerpFactor  = 0.08,
        deadZone    = 80,
        shakeDecay  = 0.88,
    } = {}) {
        // Current camera offset (top-left world position visible in viewport)
        this.x = 0;
        this.y = 0;

        // Where the camera WANTS to be (lerp target)
        this._targetX = 0;
        this._targetY = 0;

        // Shake state
        this.shakeIntensity = 0;    // Current shake magnitude in pixels
        this.shakeDecay     = shakeDecay;

        // Follow parameters
        this.lerpFactor = lerpFactor;
        this.deadZone   = deadZone;

        // World + view dimensions — used for bounds clamping
        this.worldWidth  = worldWidth  || 1024;
        this.worldHeight = worldHeight || 576;
        this.viewWidth   = viewWidth   || 1024;
        this.viewHeight  = viewHeight  || 576;

        // Cached shake offset applied this frame (separated so we can
        // draw HUD without shake by NOT including this offset)
        this._shakeOffsetX = 0;
        this._shakeOffsetY = 0;
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * follow() — smoothly chase a target world position.
     * Call this every frame before update() so the lerp has fresh data.
     *
     * @param {{ x: number, y: number }} target - World-space point to follow.
     */
    follow(target) {
        // Centre of the viewport in world space
        const idealX = target.x - this.viewWidth  / 2;
        const idealY = target.y - this.viewHeight / 2;

        // Dead zone: only move target if we've left the comfort zone.
        // This prevents the camera from chasing every pixel of movement.
        if (Math.abs(idealX - this._targetX) > this.deadZone) {
            this._targetX = idealX;
        }
        if (Math.abs(idealY - this._targetY) > this.deadZone) {
            this._targetY = idealY;
        }
    }

    /**
     * shake() — trigger a screen shake impulse.
     * Subsequent frames will decay it automatically via update().
     *
     * @param {number} intensity - Shake strength in pixels (e.g. 8 for light hit, 16 for heavy).
     */
    shake(intensity) {
        // Additive so rapid hits stack slightly, but cap so it never goes
        // completely insane on the screen.
        this.shakeIntensity = Math.min(this.shakeIntensity + intensity, 30);
    }

    /**
     * update() — advance camera state one frame.
     * Must be called once per frame, before applyTransform().
     *
     * @param {number} deltaTime - Seconds since last frame (for future
     *   frame-rate-independent lerp; shake decay is already multiplicative
     *   so it's naturally frame-rate-sensitive but at 60fps the difference
     *   is imperceptible at these magnitudes).
     */
    update(deltaTime) {
        // LERP camera position toward target
        this.x += (this._targetX - this.x) * this.lerpFactor;
        this.y += (this._targetY - this.y) * this.lerpFactor;

        // Clamp to world bounds so we never see past the edge
        this.x = Math.max(0, Math.min(this.x, this.worldWidth  - this.viewWidth));
        this.y = Math.max(0, Math.min(this.y, this.worldHeight - this.viewHeight));

        // Decay shake exponentially — feels natural and is one multiply
        this.shakeIntensity *= this.shakeDecay;

        // Snap to zero below threshold to avoid floating-point drift
        if (this.shakeIntensity < 0.15) {
            this.shakeIntensity = 0;
        }

        // Generate a NEW random shake offset every frame so it feels jittery
        this._shakeOffsetX = (Math.random() * 2 - 1) * this.shakeIntensity;
        this._shakeOffsetY = (Math.random() * 2 - 1) * this.shakeIntensity;
    }

    /**
     * applyTransform() — push camera transform onto the canvas context.
     * Everything drawn after this call is in world-space (affected by shake).
     * MUST be paired with resetTransform().
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    applyTransform(ctx) {
        ctx.save();
        // Translate by negative camera position (world → screen) plus shake
        ctx.translate(
            -Math.round(this.x) + this._shakeOffsetX,
            -Math.round(this.y) + this._shakeOffsetY
        );
    }

    /**
     * resetTransform() — pop the camera transform.
     * Everything drawn after this is in screen-space (HUD, UI — no shake).
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    resetTransform(ctx) {
        ctx.restore();
    }
}

export default Camera;
