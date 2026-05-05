/**
 * EffectsManager.js — Game Juice / Visual Feedback Coordinator
 *
 * WHY a dedicated manager?
 *   Effects (slash trails, damage numbers, sparks) are transient — they
 *   exist for a fraction of a second and have no game-logic state.  By
 *   centralising them here we keep Fighter.js clean (no rendering
 *   concerns) and can iterate / draw all effects in a single pass.
 *
 * Design decisions:
 *   - Damage numbers use simple physics (rise + fade) stored as plain
 *     objects — no class overhead needed for something this lightweight.
 *   - Slash trails are a sequence of [x,y] points captured at attack
 *     time.  We render them as a fading bezier-like polyline.
 *   - Flash overlays (brief screen-wide colour tint) are drawn at the
 *     very end so they always appear on top of everything.
 *   - EffectsManager does NOT own the Camera or ParticleSystem — it
 *     receives them at construction so callers keep control over lifetime.
 */

export class EffectsManager {
    /**
     * @param {import('./Camera.js').Camera}           camera
     * @param {import('./ParticleSystem.js').ParticleSystem} particleSystem
     */
    constructor(camera, particleSystem) {
        this._camera  = camera;
        this._particles = particleSystem;

        // ── Damage Numbers ─────────────────────────────────────────────────
        // Each entry: { x, y, damage, opacity, age, maxAge, vy }
        this._damageNumbers = [];

        // ── Slash Trails ────────────────────────────────────────────────────
        // Each entry: { points:[{x,y}], color, opacity, age, maxAge, width }
        this._slashTrails = [];

        // ── Hit Flash (screen-space colour overlay) ─────────────────────────
        // Each entry: { color, opacity, age, maxAge }
        this._hitFlashes = [];

        // ── Impact Rings ────────────────────────────────────────────────────
        // Each entry: { x, y, radius, maxRadius, opacity, age, maxAge, color }
        this._impactRings = [];
    }

    // ─── Public Trigger Methods ───────────────────────────────────────────────

    /**
     * onHit() — called when a fighter successfully lands a hit.
     * Triggers: sparks, impact ring, damage number, screen shake, hit flash.
     *
     * @param {number} x         - World X of the hit point.
     * @param {number} y         - World Y of the hit point.
     * @param {number} damage    - Damage amount (used for intensity scaling).
     * @param {number} direction - +1 = hit was delivered rightward, -1 = leftward.
     */
    onHit(x, y, damage, direction) {
        // ── Particle sparks ──
        this._particles.spawnHitSparks(x, y, direction);

        // ── Damage number ──
        this.addDamageNumber(x, y, damage);

        // ── Screen shake (delegated to camera) ──
        // Scale intensity to damage: 20 damage → 9px shake
        const shakeIntensity = Math.min(6 + damage * 0.25, 18);
        this._camera.shake(shakeIntensity);

        // ── Impact ring — expands outward at hit point ──
        this._impactRings.push({
            x,
            y,
            radius:    4,
            maxRadius: 38 + damage * 0.6,
            opacity:   0.9,
            age:       0,
            maxAge:    0.22,
            color:     damage >= 20 ? '#ff6020' : '#ffe060',
        });

        // ── Brief white hit flash (subtle) ──
        this._hitFlashes.push({
            color:  'rgba(255, 255, 255, 0.12)',
            opacity: 1,
            age:    0,
            maxAge: 0.08,
        });
    }

    /**
     * onAttack() — called when a fighter begins an attack swing.
     * Triggers: slash trail, attack puff particles.
     *
     * @param {number}   x         - World X of the attacker's weapon tip.
     * @param {number}   y         - World Y of the attacker's weapon tip.
     * @param {number}   direction - +1 | -1.
     */
    onAttack(x, y, direction) {
        this._particles.spawnAttackPuff(x, y, direction);

        // Build a slash trail: a short arc of points radiating from the tip
        const points = [];
        const arcSpan = Math.PI * 0.55;
        const baseAngle = direction > 0 ? -Math.PI * 0.15 : Math.PI + Math.PI * 0.15;
        const trailLen  = 70;
        const steps     = 8;

        for (let i = 0; i <= steps; i++) {
            const t   = i / steps;
            const a   = baseAngle + (direction > 0 ? -1 : 1) * arcSpan * t;
            points.push({
                x: x + Math.cos(a) * trailLen * t,
                y: y + Math.sin(a) * trailLen * t - 20 * t, // slight upward curve
            });
        }

        this.addSlashTrail(points, direction > 0 ? '#c0a8ff' : '#a8c0ff');
    }

    /**
     * addDamageNumber() — spawn a floating damage indicator.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} damage
     */
    addDamageNumber(x, y, damage) {
        this._damageNumbers.push({
            x,
            y:       y - 30,           // Start slightly above hit point
            damage,
            opacity: 1,
            age:     0,
            maxAge:  0.9,              // Lives for ~0.9 seconds
            vy:      -55,              // Rise speed (px/s)
            scale:   damage >= 20 ? 1.3 : 1.0,  // Big hits get bigger text
        });
    }

    /**
     * addSlashTrail() — register a fading slash trail.
     *
     * @param {{ x: number, y: number }[]} points - Polyline points in world space.
     * @param {string} color - CSS colour for the trail.
     */
    addSlashTrail(points, color = '#ffffff') {
        this._slashTrails.push({
            points,
            color,
            opacity: 0.85,
            age:     0,
            maxAge:  0.18,   // Fades out in ~0.18 seconds — snappy, not lingering
            width:   4,
        });
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    /**
     * update() — advance all effect states.
     * @param {number} dt - Delta time in seconds.
     */
    update(dt) {
        this._updateDamageNumbers(dt);
        this._updateSlashTrails(dt);
        this._updateHitFlashes(dt);
        this._updateImpactRings(dt);
    }

    _updateDamageNumbers(dt) {
        for (let i = this._damageNumbers.length - 1; i >= 0; i--) {
            const n = this._damageNumbers[i];
            n.age     += dt;
            n.y       += n.vy * dt;
            // Ease the rise: slow down as it approaches maxAge
            n.vy      *= 0.92;
            n.opacity  = 1 - (n.age / n.maxAge);

            if (n.age >= n.maxAge) {
                this._damageNumbers.splice(i, 1);
            }
        }
    }

    _updateSlashTrails(dt) {
        for (let i = this._slashTrails.length - 1; i >= 0; i--) {
            const t = this._slashTrails[i];
            t.age    += dt;
            t.opacity = 1 - (t.age / t.maxAge);

            if (t.age >= t.maxAge) {
                this._slashTrails.splice(i, 1);
            }
        }
    }

    _updateHitFlashes(dt) {
        for (let i = this._hitFlashes.length - 1; i >= 0; i--) {
            const f = this._hitFlashes[i];
            f.age    += dt;
            f.opacity = 1 - (f.age / f.maxAge);

            if (f.age >= f.maxAge) {
                this._hitFlashes.splice(i, 1);
            }
        }
    }

    _updateImpactRings(dt) {
        for (let i = this._impactRings.length - 1; i >= 0; i--) {
            const r  = this._impactRings[i];
            r.age    += dt;
            const t   = r.age / r.maxAge;          // 0 → 1
            r.radius  = r.maxRadius * t;             // Expand linearly
            r.opacity = 1 - t;                       // Fade as it expands

            if (r.age >= r.maxAge) {
                this._impactRings.splice(i, 1);
            }
        }
    }

    // ─── Draw ─────────────────────────────────────────────────────────────────

    /**
     * drawWorldEffects() — effects that live in world space (shake-affected).
     * Call this INSIDE the camera transform block, after drawing fighters.
     *
     * @param {CanvasRenderingContext2D} ctx
     */
    drawWorldEffects(ctx) {
        this._drawSlashTrails(ctx);
        this._drawImpactRings(ctx);
        this._drawDamageNumbers(ctx);
    }

    /**
     * drawScreenEffects() — effects that live in screen space (not shake-affected).
     * Call this OUTSIDE the camera transform block, after resetTransform().
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     */
    drawScreenEffects(ctx, canvasWidth, canvasHeight) {
        this._drawHitFlashes(ctx, canvasWidth, canvasHeight);
    }

    _drawSlashTrails(ctx) {
        for (const trail of this._slashTrails) {
            if (trail.points.length < 2) continue;

            ctx.save();
            ctx.globalAlpha  = Math.max(0, trail.opacity);
            ctx.strokeStyle  = trail.color;
            ctx.lineWidth    = trail.width * trail.opacity; // Trails thin as they fade
            ctx.lineCap      = 'round';
            ctx.lineJoin     = 'round';

            // Draw a glow pass first (wider, more transparent)
            ctx.shadowColor  = trail.color;
            ctx.shadowBlur   = 12 * trail.opacity;
            ctx.globalAlpha  = Math.max(0, trail.opacity * 0.4);
            ctx.lineWidth    = trail.width * 3;
            ctx.beginPath();
            ctx.moveTo(trail.points[0].x, trail.points[0].y);
            for (let i = 1; i < trail.points.length; i++) {
                ctx.lineTo(trail.points[i].x, trail.points[i].y);
            }
            ctx.stroke();

            // Sharp core pass
            ctx.shadowBlur   = 0;
            ctx.globalAlpha  = Math.max(0, trail.opacity);
            ctx.lineWidth    = trail.width * trail.opacity;
            ctx.strokeStyle  = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(trail.points[0].x, trail.points[0].y);
            for (let i = 1; i < trail.points.length; i++) {
                ctx.lineTo(trail.points[i].x, trail.points[i].y);
            }
            ctx.stroke();

            ctx.restore();
        }
    }

    _drawDamageNumbers(ctx) {
        for (const n of this._damageNumbers) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, n.opacity);

            const fontSize = Math.round(18 * n.scale);
            ctx.font        = `bold ${fontSize}px 'silver', Arial, sans-serif`;
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';

            // Shadow for legibility against any background
            ctx.shadowColor  = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur   = 4;

            // Colour based on damage: heavy hits glow red-orange, light hits yellow
            const hue        = n.damage >= 20 ? '#ff4020' : '#ffdd20';
            ctx.fillStyle    = hue;
            ctx.fillText(`-${n.damage}`, n.x, n.y);

            // White highlight stroke for pop
            ctx.shadowBlur   = 0;
            ctx.strokeStyle  = 'rgba(255,255,255,0.6)';
            ctx.lineWidth    = 0.8;
            ctx.strokeText(`-${n.damage}`, n.x, n.y);

            ctx.restore();
        }
    }

    _drawImpactRings(ctx) {
        for (const ring of this._impactRings) {
            ctx.save();
            ctx.globalAlpha  = Math.max(0, ring.opacity * 0.8);
            ctx.strokeStyle  = ring.color;
            ctx.lineWidth    = 2.5 * ring.opacity;
            ctx.shadowColor  = ring.color;
            ctx.shadowBlur   = 8;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    _drawHitFlashes(ctx, w, h) {
        for (const flash of this._hitFlashes) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, flash.opacity);
            ctx.fillStyle   = flash.color;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }
    }
}

export default EffectsManager;
