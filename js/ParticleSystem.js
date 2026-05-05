/**
 * ParticleSystem.js — Object-Pooled Particle Engine
 *
 * WHY object pooling?
 *   Spawning and garbage-collecting hundreds of Particle objects every
 *   second causes GC pauses that break the 60fps target.  Object pooling
 *   pre-allocates a fixed array of Particle instances and reuses them
 *   by resetting their state — zero allocation during gameplay.
 *
 * Design decisions:
 *   - Pool size 200 covers the heaviest simultaneous hit + ambient load
 *     we realistically expect in a 1v1 fighting game without wasting memory.
 *   - Particle draw() is intentionally minimal (no shadow blur, no
 *     composite ops) for perf. Visual richness comes from quantity,
 *     colour variance, and size change over lifetime.
 *   - Physics: simple Euler integration is fine at this scale and keeps
 *     the math readable.  deltaTime normalises it to real seconds.
 *   - 'drift' simulates turbulent air — each particle gets a tiny random
 *     horizontal acceleration each frame, making dust look alive.
 */

// ─── Particle ─────────────────────────────────────────────────────────────────

export class Particle {
    constructor() {
        // All fields initialised here so the object shape is fixed —
        // V8 loves monomorphic hidden classes.
        this.x           = 0;
        this.y           = 0;
        this.vx          = 0;
        this.vy          = 0;
        this.lifetime    = 0;       // Seconds remaining
        this.maxLifetime = 1;       // Total lifespan (for opacity/size lerp)
        this.size        = 4;       // Current render radius in px
        this.startSize   = 4;       // Size at birth (we shrink toward 0)
        this.color       = '#ffffff';
        this.opacity     = 1;
        this.gravity     = 0;       // Per-particle gravity (px/s²)
        this.drift       = 0;       // Random horizontal turbulence strength
        this.active      = false;   // Pool flag — false = available for reuse
        this.shape       = 'circle'; // 'circle' | 'square' | 'spark'
    }

    /**
     * reset() — re-initialise this particle with a new config.
     * Called instead of `new Particle()` to avoid allocation.
     *
     * @param {object} cfg
     */
    reset(cfg) {
        this.x           = cfg.x           ?? 0;
        this.y           = cfg.y           ?? 0;
        this.vx          = cfg.vx          ?? 0;
        this.vy          = cfg.vy          ?? 0;
        this.lifetime    = cfg.lifetime    ?? 1;
        this.maxLifetime = this.lifetime;
        this.size        = cfg.size        ?? 4;
        this.startSize   = this.size;
        this.color       = cfg.color       ?? '#ffffff';
        this.opacity     = 1;
        this.gravity     = cfg.gravity     ?? 0;
        this.drift       = cfg.drift       ?? 0;
        this.active      = true;
        this.shape       = cfg.shape       ?? 'circle';
    }

    /**
     * update() — advance physics one frame.
     * @param {number} dt - Delta time in seconds.
     */
    update(dt) {
        // Gravity pull
        this.vy += this.gravity * dt;

        // Turbulent drift — random per frame, scaled by the drift parameter
        this.vx += (Math.random() * 2 - 1) * this.drift * dt;

        // Euler integration
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Shrink size linearly to 0 over lifetime so particles "burn out"
        const progress  = this.lifetime / this.maxLifetime; // 1 → 0
        this.size       = this.startSize * progress;

        // Fade opacity over the last 40% of lifetime for a smooth vanish
        this.opacity    = progress < 0.4 ? progress / 0.4 : 1;

        // Tick down remaining life
        this.lifetime  -= dt;

        // Return self to pool when dead
        if (this.lifetime <= 0) {
            this.active = false;
        }
    }

    /**
     * draw() — render particle at current state.
     * No logic here — only rendering. State was already computed in update().
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        if (!this.active || this.size < 0.2) return;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, this.opacity));

        if (this.shape === 'spark') {
            // Sparks are short lines in the velocity direction — more visually
            // interesting than circles for hit effects
            ctx.strokeStyle = this.color;
            ctx.lineWidth   = Math.max(0.5, this.size * 0.4);
            ctx.lineCap     = 'round';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            // Trail length proportional to velocity magnitude
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const trailLen = Math.min(speed * 0.04, 12);
            ctx.lineTo(
                this.x - (this.vx / (speed || 1)) * trailLen,
                this.y - (this.vy / (speed || 1)) * trailLen
            );
            ctx.stroke();
        } else if (this.shape === 'square') {
            ctx.fillStyle = this.color;
            ctx.fillRect(
                this.x - this.size / 2,
                this.y - this.size / 2,
                this.size,
                this.size
            );
        } else {
            // Default: circle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(0.1, this.size / 2), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /** isDead() — convenience for external callers. */
    isDead() {
        return !this.active;
    }
}

// ─── ParticleSystem ───────────────────────────────────────────────────────────

const POOL_SIZE = 200; // Pre-allocated pool size — tune if needed

export class ParticleSystem {
    constructor() {
        // Pre-allocate the entire pool upfront — zero GC during gameplay
        this._pool   = Array.from({ length: POOL_SIZE }, () => new Particle());
        this._active = []; // Subset currently alive (rebuilt each frame)
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    /** _getFromPool() — find an inactive particle or return null if pool exhausted. */
    _getFromPool() {
        for (let i = 0; i < this._pool.length; i++) {
            if (!this._pool[i].active) return this._pool[i];
        }
        // Pool exhausted — silently drop instead of spawning (avoids allocation)
        return null;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * emit() — spawn N particles from a config template.
     *
     * @param {object} config
     * @param {number}   config.x           - Spawn world X.
     * @param {number}   config.y           - Spawn world Y.
     * @param {number}   [config.count]     - Number of particles (default 8).
     * @param {number}   [config.speed]     - Base ejection speed (px/s).
     * @param {number}   [config.spread]    - Angle spread in radians (default 2π = all directions).
     * @param {number}   [config.angle]     - Base angle in radians (default random).
     * @param {string}   [config.color]     - CSS colour or comma-separated palette.
     * @param {string[]} [config.colors]    - Array of colours to randomly pick from.
     * @param {number}   [config.lifetime]  - Particle life in seconds.
     * @param {number}   [config.lifetimeVariance] - Random ± variance in lifetime.
     * @param {number}   [config.size]      - Particle radius.
     * @param {number}   [config.sizeVariance] - Random ± variance in size.
     * @param {number}   [config.gravity]   - Gravity acceleration (px/s²).
     * @param {number}   [config.drift]     - Horizontal turbulence.
     * @param {string}   [config.shape]     - 'circle' | 'square' | 'spark'.
     */
    emit(config) {
        const count    = config.count    ?? 8;
        const speed    = config.speed    ?? 120;
        const spread   = config.spread   ?? Math.PI * 2;
        const baseAngle = config.angle   ?? 0;
        const colors   = config.colors   ?? [config.color ?? '#ffffff'];
        const lifetime = config.lifetime ?? 0.8;
        const lifetimeVar = config.lifetimeVariance ?? 0.3;
        const size     = config.size     ?? 4;
        const sizeVar  = config.sizeVariance ?? 2;
        const gravity  = config.gravity  ?? 0;
        const drift    = config.drift    ?? 0;
        const shape    = config.shape    ?? 'circle';

        for (let i = 0; i < count; i++) {
            const p = this._getFromPool();
            if (!p) break; // Pool exhausted — skip remaining particles

            // Randomise angle within spread cone around baseAngle
            const angle = baseAngle - spread / 2 + Math.random() * spread;
            const spd   = speed * (0.6 + Math.random() * 0.8); // ±40% speed variance

            p.reset({
                x:        config.x + (Math.random() - 0.5) * 10, // Tiny position jitter
                y:        config.y + (Math.random() - 0.5) * 10,
                vx:       Math.cos(angle) * spd,
                vy:       Math.sin(angle) * spd,
                lifetime: lifetime + (Math.random() * 2 - 1) * lifetimeVar,
                size:     size + (Math.random() * 2 - 1) * sizeVar,
                color:    colors[Math.floor(Math.random() * colors.length)],
                gravity,
                drift,
                shape,
            });
        }
    }

    /**
     * update() — advance all active particles.
     * @param {number} dt - Delta time in seconds.
     */
    update(dt) {
        // We iterate the full pool rather than maintaining a separate active
        // list to avoid allocation on the hot path.  Pool size is small enough
        // that the extra iterations are negligible.
        for (let i = 0; i < this._pool.length; i++) {
            if (this._pool[i].active) {
                this._pool[i].update(dt);
            }
        }
    }

    /**
     * draw() — render all active particles.
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        for (let i = 0; i < this._pool.length; i++) {
            if (this._pool[i].active) {
                this._pool[i].draw(ctx);
            }
        }
    }

    /**
     * Preset emitter: ambient floating dust motes.
     * Call once per frame with a random canvas position to keep the
     * scene feeling alive without requiring manual placement.
     *
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     */
    spawnAmbientDust(canvasWidth, canvasHeight) {
        // Spawn in the upper 70% of the screen — dust floats in the air
        this.emit({
            x:        Math.random() * canvasWidth,
            y:        Math.random() * canvasHeight * 0.7,
            count:    1,
            speed:    12,
            spread:   Math.PI * 2,
            colors:   ['rgba(200,180,255,0.7)', 'rgba(255,220,180,0.5)', 'rgba(180,160,255,0.6)'],
            lifetime: 3.5,
            lifetimeVariance: 1.5,
            size:     2.5,
            sizeVariance: 1.5,
            gravity:  -6,       // Negative = rises slowly
            drift:    15,       // Horizontal turbulence makes it float naturally
            shape:    'circle',
        });
    }

    /**
     * Preset emitter: glowing embers / slow falling sparks.
     * Evokes a smoky battlefield atmosphere.
     *
     * @param {number} canvasWidth
     */
    spawnEmber(canvasWidth) {
        this.emit({
            x:        Math.random() * canvasWidth,
            y:        -5,       // Start just above canvas top
            count:    1,
            speed:    20,
            angle:    Math.PI / 2,   // Downward
            spread:   Math.PI * 0.6, // ±54° spread
            colors:   ['rgba(255,140,30,0.8)', 'rgba(255,180,60,0.6)', 'rgba(255,100,20,0.7)'],
            lifetime: 4.0,
            lifetimeVariance: 2.0,
            size:     2.0,
            sizeVariance: 1.0,
            gravity:  18,       // Falls slowly
            drift:    20,
            shape:    'circle',
        });
    }

    /**
     * Preset emitter: hit sparks — explosive directional burst.
     *
     * @param {number} x       - Hit world X.
     * @param {number} y       - Hit world Y.
     * @param {number} direction - +1 = hit going right, -1 = going left.
     */
    spawnHitSparks(x, y, direction = 1) {
        // Main burst — reduced count for performance
        this.emit({
            x, y,
            count:    8,
            speed:    220,
            angle:    direction > 0 ? 0 : Math.PI,
            spread:   Math.PI * 0.6,
            colors:   ['#ffffff', '#ffe080', '#ff9020'],
            lifetime: 0.25,
            lifetimeVariance: 0.1,
            size:     4,
            sizeVariance: 2,
            gravity:  180,
            drift:    0,
            shape:    'spark',
        });

        // Secondary ring — fewer particles
        this.emit({
            x, y,
            count:    4,
            speed:    80,
            spread:   Math.PI * 2,
            colors:   ['#ff8020', '#ffaa40'],
            lifetime: 0.35,
            lifetimeVariance: 0.15,
            size:     2.5,
            sizeVariance: 1,
            gravity:  100,
            drift:    5,
            shape:    'circle',
        });
    }

    /**
     * Preset emitter: attack slash air disturbance.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} direction - +1 | -1
     */
    spawnAttackPuff(x, y, direction = 1) {
        // Much fewer particles for performance
        this.emit({
            x, y,
            count:    3,
            speed:    70,
            angle:    direction > 0 ? 0 : Math.PI,
            spread:   Math.PI * 0.4,
            colors:   ['rgba(200,180,255,0.4)', 'rgba(255,255,255,0.25)'],
            lifetime: 0.2,
            lifetimeVariance: 0.08,
            size:     5,
            sizeVariance: 2,
            gravity:  -20,
            drift:    20,
            shape:    'circle',
        });
    }
}

export default ParticleSystem;
