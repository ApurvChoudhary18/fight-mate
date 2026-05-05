/**
 * ParallaxSystem.js — Beautiful Background
 * 
 * Features:
 * - Animated clouds that drift slowly
 * - Multiple parallax layers for depth
 * - Stunning sunset/dusk atmosphere
 */

// Fixed dimensions
const _canvasWidth = 1024;
const _canvasHeight = 576;

// ─── Parallax Layer ────────────────────────────────────────────────────────
class ParallaxLayer {
    constructor({ speedMultiplier = 0.2, width = 1024, height = 576, drawFn }) {
        this.speedMultiplier = speedMultiplier;
        this.width  = width;
        this.height = height;
        this.drawFn = drawFn;
        this.offsetX = 0;
    }

    update(cameraX, timeOffset = 0) {
        this.offsetX = -(cameraX * this.speedMultiplier + timeOffset) % this.width;
    }

    draw(ctx) {
        this.drawFn(ctx, this.offsetX, 0, this.width, this.height);
        this.drawFn(ctx, this.offsetX + this.width, 0, this.width, this.height);
    }
}

// ─── Layer Factories (Stunning Dusk/Sunset Theme) ─────────────────────

// Layer 1: Deep dusk sky with gradient
function createSkyLayer(w, h) {
    return (ctx, x, y, width, height) => {
        const grad = ctx.createLinearGradient(x, 0, x, h);
        grad.addColorStop(0, '#0D1B3E');      // Deep night blue
        grad.addColorStop(0.3, '#1E3A5F');  // Navy
        grad.addColorStop(0.5, '#4A2C5A');   // Purple dusk
        grad.addColorStop(0.7, '#8B4557');  // Rose
        grad.addColorStop(0.85, '#D4726A'); // Coral
        grad.addColorStop(1, '#F5A962');    // Warm sunset
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, width, height);
        
        // Stars in upper sky
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 50; i++) {
            const sx = (x + i * 137) % width;
            const sy = (i * 73) % (h * 0.35);
            const sr = 0.8 + (i % 3) * 0.5;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}

// Layer 2: Distant clouds (subtle)
function createFarCloudsLayer(w, h) {
    const clouds = [
        { x: 0.08, y: 0.15, rx: 70, ry: 25 },
        { x: 0.28, y: 0.10, rx: 85, ry: 30 },
        { x: 0.52, y: 0.14, rx: 60, ry: 22 },
        { x: 0.75, y: 0.11, rx: 75, ry: 28 },
    ];
    
    return (ctx, x, y, wdt, hgt) => {
        ctx.fillStyle = 'rgba(180, 140, 180, 0.25)';
        for (const cloud of clouds) {
            const cx = x + cloud.x * wdt;
            const cy = hgt * cloud.y;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cloud.rx, cloud.ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}

// Layer 3: Mid clouds with orange tint (sunset colors)
function createMidCloudsLayer(w, h) {
    const clouds = [
        { x: 0.12, y: 0.22, rx: 80, ry: 30, color: 'rgba(255, 180, 140, 0.35)' },
        { x: 0.38, y: 0.18, rx: 95, ry: 35, color: 'rgba(255, 165, 120, 0.3)' },
        { x: 0.65, y: 0.25, rx: 70, ry: 26, color: 'rgba(255, 190, 150, 0.32)' },
        { x: 0.88, y: 0.20, rx: 85, ry: 30, color: 'rgba(255, 175, 135, 0.28)' },
    ];
    
    return (ctx, x, y, wdt, hgt) => {
        for (const cloud of clouds) {
            const cx = x + cloud.x * wdt;
            const cy = hgt * cloud.y;
            ctx.fillStyle = cloud.color;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cloud.rx, cloud.ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}

// Layer 4: Near clouds (warmer, brighter)
function createNearCloudsLayer(w, h) {
    const clouds = [
        { x: 0.05, y: 0.30, rx: 90, ry: 35, color: 'rgba(255, 200, 160, 0.4)' },
        { x: 0.32, y: 0.26, rx: 110, ry: 40, color: 'rgba(255, 190, 150, 0.35)' },
        { x: 0.58, y: 0.32, rx: 85, ry: 32, color: 'rgba(255, 195, 155, 0.38)' },
        { x: 0.82, y: 0.28, rx: 100, ry: 38, color: 'rgba(255, 185, 145, 0.32)' },
    ];
    
    return (ctx, x, y, wdt, hgt) => {
        for (const cloud of clouds) {
            const cx = x + cloud.x * wdt;
            const cy = hgt * cloud.y;
            ctx.fillStyle = cloud.color;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cloud.rx, cloud.ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    };
}

// Layer 5: Distant mountains/silhouette
function createMountainsLayer(w, h) {
    return (ctx, x, y, wdt, hgt) => {
        // Far mountains
        ctx.fillStyle = 'rgba(30, 25, 50, 0.7)';
        ctx.beginPath();
        ctx.moveTo(x, hgt);
        ctx.lineTo(x, hgt * 0.65);
        ctx.lineTo(x + wdt * 0.08, hgt * 0.50);
        ctx.lineTo(x + wdt * 0.18, hgt * 0.60);
        ctx.lineTo(x + wdt * 0.30, hgt * 0.45);
        ctx.lineTo(x + wdt * 0.42, hgt * 0.55);
        ctx.lineTo(x + wdt * 0.55, hgt * 0.42);
        ctx.lineTo(x + wdt * 0.65, hgt * 0.52);
        ctx.lineTo(x + wdt * 0.78, hgt * 0.48);
        ctx.lineTo(x + wdt * 0.88, hgt * 0.58);
        ctx.lineTo(x + wdt, hgt * 0.50);
        ctx.lineTo(x + wdt, hgt);
        ctx.closePath();
        ctx.fill();
        
        // Nearer mountain range
        ctx.fillStyle = 'rgba(40, 35, 60, 0.6)';
        ctx.beginPath();
        ctx.moveTo(x, hgt);
        ctx.lineTo(x, hgt * 0.72);
        ctx.lineTo(x + wdt * 0.12, hgt * 0.58);
        ctx.lineTo(x + wdt * 0.25, hgt * 0.68);
        ctx.lineTo(x + wdt * 0.40, hgt * 0.52);
        ctx.lineTo(x + wdt * 0.55, hgt * 0.62);
        ctx.lineTo(x + wdt * 0.70, hgt * 0.48);
        ctx.lineTo(x + wdt * 0.82, hgt * 0.58);
        ctx.lineTo(x + wdt * 0.92, hgt * 0.52);
        ctx.lineTo(x + wdt, hgt * 0.60);
        ctx.lineTo(x + wdt, hgt);
        ctx.closePath();
        ctx.fill();
    };
}

// Layer 6: Ground/arena floor
function createGroundLayer(w, h) {
    return (ctx, x, y, wdt, hgt) => {
        const groundY = hgt - 100;
        
        // Dark ground base
        ctx.fillStyle = '#1A1520';
        ctx.fillRect(x, groundY, wdt, 100);
        
        // Arena floor lines (retro feel)
        ctx.strokeStyle = 'rgba(255, 100, 80, 0.3)';
        ctx.lineWidth = 2;
        
        // Horizontal lines
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(x, groundY + 20 + i * 20);
            ctx.lineTo(x + wdt, groundY + 20 + i * 20);
            ctx.stroke();
        }
        
        // Vertical lines
        for (let i = 0; i < wdt; i += 80) {
            ctx.beginPath();
            ctx.moveTo(x + i, groundY);
            ctx.lineTo(x + i, groundY + 100);
            ctx.stroke();
        }
        
        // Ground highlight edge
        const edgeGrad = ctx.createLinearGradient(x, groundY, x, groundY + 15);
        edgeGrad.addColorStop(0, 'rgba(255, 120, 80, 0.5)');
        edgeGrad.addColorStop(1, 'rgba(255, 120, 80, 0)');
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(x, groundY, wdt, 15);
    };
}

// Layer 7: Glow overlay from sunset
function createGlowLayer(w, h) {
    return (ctx, x, y, wdt, hgt) => {
        // Warm glow from bottom
        const glow = ctx.createRadialGradient(
            x + wdt * 0.7, hgt, 0,
            x + wdt * 0.7, hgt, hgt * 1.2
        );
        glow.addColorStop(0, 'rgba(255, 150, 80, 0.15)');
        glow.addColorStop(0.5, 'rgba(255, 100, 60, 0.05)');
        glow.addColorStop(1, 'rgba(255, 80, 50, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, wdt, hgt);
    };
}

// ─── ParallaxSystem ─────────────────────────────────────────────────

export class ParallaxSystem {
    constructor() {
        this.layers = [];
        this._w = _canvasWidth;
        this._h = _canvasHeight;
        this._time = 0;
        this._init();
    }

    _init() {
        // Layer 1 - Sky with stars (fixed)
        this.layers.push({ 
            layer: new ParallaxLayer({ 
                speedMultiplier: 0, 
                width: this._w, 
                height: this._h, 
                drawFn: createSkyLayer(this._w, this._h) 
            }),
            timeDrift: 0
        });
        
        // Layer 2 - Far clouds
        this.layers.push({ 
            layer: new ParallaxLayer({ 
                speedMultiplier: 0.008, 
                width: this._w, 
                height: this._h, 
                drawFn: createFarCloudsLayer(this._w, this._h) 
            }),
            timeDrift: 0.05
        });
        
        // Layer 3 - Mid sunset clouds
        this.layers.push({ 
            layer: new ParallaxLayer({ 
                speedMultiplier: 0.02, 
                width: this._w, 
                height: this._h, 
                drawFn: createMidCloudsLayer(this._w, this._h) 
            }),
            timeDrift: 0.12
        });
        
        // Layer 4 - Near warm clouds
        this.layers.push({ 
            layer: new ParallaxLayer({ 
                speedMultiplier: 0.035, 
                width: this._w, 
                height: this._h, 
                drawFn: createNearCloudsLayer(this._w, this._h) 
            }),
            timeDrift: 0.18
        });
        
        // Layer 5 - Mountains
        this.layers.push({ 
            layer: new ParallaxLayer({ 
                speedMultiplier: 0.08, 
                width: this._w, 
                height: this._h, 
                drawFn: createMountainsLayer(this._w, this._h) 
            }),
            timeDrift: 0
        });
        
        // Layer 6 - Ground
        this.layers.push({ 
            layer: new ParallaxLayer({ 
                speedMultiplier: 0.2, 
                width: this._w, 
                height: this._h, 
                drawFn: createGroundLayer(this._w, this._h) 
            }),
            timeDrift: 0
        });
        
        // Layer 7 - Glow
        this.layers.push({ 
            layer: new ParallaxLayer({ 
                speedMultiplier: 0, 
                width: this._w, 
                height: this._h, 
                drawFn: createGlowLayer(this._w, this._h) 
            }),
            timeDrift: 0
        });
    }

    update(cameraX) {
        this._time += 1;
        
        for (const layerObj of this.layers) {
            const timeOffset = this._time * layerObj.timeDrift;
            layerObj.layer.update(cameraX, timeOffset);
        }
    }

    draw(ctx) {
        for (const layerObj of this.layers) {
            layerObj.layer.draw(ctx);
        }
    }
}

export default ParallaxSystem;