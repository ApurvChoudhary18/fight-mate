/**
 * ParallaxSystem.js — Procedural Parallax Background Renderer
 *
 * WHY procedural instead of image-based:
 *   The project may not ship separate parallax assets, so we generate
 *   atmospheric depth layers with canvas gradients and geometry.
 *   This means the system works out of the box with zero extra files,
 *   while still looking good and providing true depth perception.
 *
 * Design decisions:
 *   - Each ParallaxLayer owns its scroll multiplier (0 = fixed sky,
 *     1 = moves 1:1 with camera).  Layers between 0 and 1 appear at
 *     different "depths" — classic parallax.
 *   - Seamless looping: we draw the layer at x AND x + tileWidth so
 *     there is never a visible seam when the camera scrolls.
 *   - ParallaxSystem draws back-to-front (painters algorithm) so each
 *     layer composites over the previous ones correctly.
 *   - No state lives outside classes — caller passes cameraX each frame.
 */

// ─── ParallaxLayer ────────────────────────────────────────────────────────────

export class ParallaxLayer {
    /**
     * @param {object} config
     * @param {number}   config.speedMultiplier  - 0–1. 0=sky, 1=ground-locked.
     * @param {number}   config.width            - World width (same as canvas).
     * @param {number}   config.height           - Canvas height.
     * @param {Function} config.drawFn           - (ctx, x, y, w, h) → void.
     *   Receives the current tile offset and dimensions; called twice for looping.
     */
    constructor({ speedMultiplier = 0.2, width = 1024, height = 576, drawFn }) {
        this.speedMultiplier = speedMultiplier;
        this.width  = width;
        this.height = height;
        this.drawFn = drawFn;

        // Current computed x offset (updated each frame via update())
        this.offsetX = 0;
    }

    /**
     * update() — recompute this layer's horizontal offset based on camera.
     * @param {number} cameraX - Camera's world-space X position.
     */
    update(cameraX) {
        // Multiply camera movement by the speed factor to create depth illusion.
        // We modulo by width so the offset wraps cleanly for seamless looping.
        this.offsetX = -(cameraX * this.speedMultiplier) % this.width;
    }

    /**
     * draw() — render this layer to the canvas.
     * Draws the tile at offsetX AND offsetX + width to fill any gap at the edge.
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        // Draw the primary tile
        this.drawFn(ctx, this.offsetX, 0, this.width, this.height);
        // Draw the adjacent tile to prevent visible seam during scroll
        this.drawFn(ctx, this.offsetX + this.width, 0, this.width, this.height);
        // Also draw on the left in case camera can scroll backwards
        this.drawFn(ctx, this.offsetX - this.width, 0, this.width, this.height);
    }
}

// ─── Procedural Draw Functions ────────────────────────────────────────────────

/**
 * Factory functions that return a drawFn for each atmospheric depth layer.
 * They are pure functions — no side effects, no shared state.
 */

/** Layer 0 — Deep sky gradient (fixed, speed = 0) */
function createSkyLayer(canvasWidth, canvasHeight) {
    return (ctx, x, y, w, h) => {
        const grad = ctx.createLinearGradient(x, 0, x, canvasHeight);
        grad.addColorStop(0,    '#0a0612');   // Near-black deep purple at zenith
        grad.addColorStop(0.35, '#1a0a2e');   // Rich dark violet midpoint
        grad.addColorStop(0.65, '#2d1b4e');   // Atmospheric purple at horizon
        grad.addColorStop(1,    '#1a0a1e');   // Dark transition to ground level
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);
    };
}

/** Layer 1 — Distant mountains silhouette (speed = 0.05, very slow) */
function createDistantMountainsLayer(canvasWidth, canvasHeight) {
    return (ctx, x, y, w, h) => {
        ctx.save();
        ctx.globalAlpha = 0.6;

        // Mountain gradient — dark blue-purple, lighter than sky so it reads
        const grad = ctx.createLinearGradient(0, canvasHeight * 0.3, 0, canvasHeight * 0.75);
        grad.addColorStop(0, '#1e1040');
        grad.addColorStop(1, '#0d0820');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, h);

        // Procedural mountain profile — deterministic via sin with prime offsets
        // so it looks organic but never requires a random seed
        const steps = 24;
        const stepW  = w / steps;
        for (let i = 0; i <= steps; i++) {
            const px = x + i * stepW;
            // Multiple sin harmonics layered for a natural silhouette
            const py = h * 0.55
                - Math.sin(i * 0.31 + 1.1) * h * 0.12
                - Math.sin(i * 0.17 + 2.3) * h * 0.09
                - Math.abs(Math.sin(i * 0.47 + 0.5)) * h * 0.07;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(x + w, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
    };
}

/** Layer 2 — Mid fog band (speed = 0.15) */
function createFogLayer(canvasWidth, canvasHeight) {
    return (ctx, x, y, w, h) => {
        ctx.save();
        const grad = ctx.createLinearGradient(0, h * 0.45, 0, h * 0.75);
        grad.addColorStop(0,   'rgba(80, 40, 120, 0)');
        grad.addColorStop(0.4, 'rgba(60, 30, 100, 0.18)');
        grad.addColorStop(0.7, 'rgba(40, 20, 70,  0.22)');
        grad.addColorStop(1,   'rgba(20, 10, 40,  0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, w, h);
        ctx.restore();
    };
}

/** Layer 3 — Near hills (speed = 0.25) */
function createNearHillsLayer(canvasWidth, canvasHeight) {
    return (ctx, x, y, w, h) => {
        ctx.save();
        const grad = ctx.createLinearGradient(0, h * 0.55, 0, h * 0.85);
        grad.addColorStop(0, '#150b30');
        grad.addColorStop(1, '#0a0618');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, h);

        const steps = 18;
        const stepW  = w / steps;
        for (let i = 0; i <= steps; i++) {
            const px = x + i * stepW;
            const py = h * 0.72
                - Math.sin(i * 0.41 + 0.7) * h * 0.10
                - Math.abs(Math.sin(i * 0.29 + 1.9)) * h * 0.06;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(x + w, h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };
}

/** Layer 4 — Ground / arena floor gradient (speed = 0.4) */
function createGroundLayer(canvasWidth, canvasHeight) {
    return (ctx, x, y, w, h) => {
        ctx.save();
        const grad = ctx.createLinearGradient(0, h * 0.78, 0, h);
        grad.addColorStop(0, '#1c0e3a');
        grad.addColorStop(0.4, '#120830');
        grad.addColorStop(1, '#080415');

        ctx.fillStyle = grad;
        ctx.fillRect(x, h * 0.78, w, h * 0.22);

        // Subtle reflective sheen on the "floor" — adds a dojo/arena feel
        const sheen = ctx.createLinearGradient(x, h * 0.78, x + w, h * 0.78);
        sheen.addColorStop(0,    'rgba(120, 60, 200, 0)');
        sheen.addColorStop(0.35, 'rgba(140, 70, 220, 0.07)');
        sheen.addColorStop(0.65, 'rgba(120, 60, 200, 0.05)');
        sheen.addColorStop(1,    'rgba(100, 50, 180, 0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(x, h * 0.78, w, h * 0.04);

        ctx.restore();
    };
}

/** Layer 5 — Distant lanterns / glowing orbs (speed = 0.12) */
function createLanternLayer(canvasWidth, canvasHeight) {
    // Pre-define lantern positions deterministically (no Math.random — stable each frame)
    const lanterns = [
        { rx: 0.08, ry: 0.52, r: 6,  hue: '200, 120, 255' },
        { rx: 0.22, ry: 0.48, r: 4,  hue: '255, 160, 80'  },
        { rx: 0.37, ry: 0.55, r: 7,  hue: '150, 100, 255' },
        { rx: 0.51, ry: 0.46, r: 5,  hue: '255, 180, 100' },
        { rx: 0.65, ry: 0.50, r: 6,  hue: '180, 120, 255' },
        { rx: 0.79, ry: 0.53, r: 4,  hue: '255, 140, 60'  },
        { rx: 0.91, ry: 0.49, r: 5,  hue: '200, 100, 255' },
    ];

    return (ctx, x, y, w, h) => {
        ctx.save();
        for (const l of lanterns) {
            const lx = x + l.rx * w;
            const ly = h * l.ry;

            // Radial glow
            const grd = ctx.createRadialGradient(lx, ly, 0, lx, ly, l.r * 5);
            grd.addColorStop(0,   `rgba(${l.hue}, 0.45)`);
            grd.addColorStop(0.4, `rgba(${l.hue}, 0.15)`);
            grd.addColorStop(1,   `rgba(${l.hue}, 0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(lx, ly, l.r * 5, 0, Math.PI * 2);
            ctx.fill();

            // Core bright dot
            ctx.fillStyle = `rgba(${l.hue}, 0.9)`;
            ctx.beginPath();
            ctx.arc(lx, ly, l.r * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    };
}

// ─── ParallaxSystem ───────────────────────────────────────────────────────────

export class ParallaxSystem {
    /**
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     */
    constructor(canvasWidth = 1024, canvasHeight = 576) {
        this.layers = [];
        this._buildProcedualLayers(canvasWidth, canvasHeight);
    }

    /** Build all atmospheric depth layers. */
    _buildProcedualLayers(w, h) {
        // Layers are added back-to-front (lowest speedMultiplier drawn first)
        this.addLayer({ speedMultiplier: 0,    width: w, height: h, drawFn: createSkyLayer(w, h) });
        this.addLayer({ speedMultiplier: 0.05, width: w, height: h, drawFn: createDistantMountainsLayer(w, h) });
        this.addLayer({ speedMultiplier: 0.12, width: w, height: h, drawFn: createLanternLayer(w, h) });
        this.addLayer({ speedMultiplier: 0.15, width: w, height: h, drawFn: createFogLayer(w, h) });
        this.addLayer({ speedMultiplier: 0.25, width: w, height: h, drawFn: createNearHillsLayer(w, h) });
        this.addLayer({ speedMultiplier: 0.4,  width: w, height: h, drawFn: createGroundLayer(w, h) });
    }

    /**
     * addLayer() — register a new parallax layer.
     * @param {object} config — passed directly to ParallaxLayer constructor.
     */
    addLayer(config) {
        this.layers.push(new ParallaxLayer(config));
    }

    /**
     * update() — update all layers with current camera position.
     * @param {number} cameraX
     */
    update(cameraX) {
        for (const layer of this.layers) {
            layer.update(cameraX);
        }
    }

    /**
     * draw() — render all layers back-to-front.
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        // ctx here is in SCREEN space (no camera transform applied yet)
        // because parallax layers do their own offset calculation and
        // should NOT be double-shifted by the camera transform.
        for (const layer of this.layers) {
            layer.draw(ctx);
        }
    }
}

export default ParallaxSystem;
