// ============================================================
// STARFIELD BACKGROUND
// Lightweight canvas starfield used behind the landing page
// and the natal-info flow screens. Not p5 — plain canvas so it
// can run on pages that don't load the p5 library.
// ============================================================

function initStarfield(canvasId) {

    const canvas = document.getElementById(canvasId);

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    let stars = [];

    function resize() {

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const count = Math.floor((canvas.width * canvas.height) / 9000);

        stars = Array.from({ length: count }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.2 + 0.2,
            s: Math.random() * 0.02 + 0.006,
            p: Math.random() * Math.PI * 2
        }));

    }

    function tick() {

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fffbfb";

        stars.forEach((star) => {
            star.p += star.s;
            const alpha = 0.25 + Math.abs(Math.sin(star.p)) * 0.55;
            ctx.globalAlpha = alpha;
            ctx.fillRect(star.x, star.y, star.r, star.r);
        });

        ctx.globalAlpha = 1;

        requestAnimationFrame(tick);

    }

    window.addEventListener("resize", resize);

    resize();
    tick();

}

// ============================================================
// UNIVERSE STRAY PARTICLES
// ------------------------------------------------------------
// A loose field of drifting particles that fades in behind the
// Sun / Moon / ASC picker (and out again on every other screen),
// echoing the "stray corona" specks around the bodies on the
// display pages. Three tiers: fine dust, motes, and a few rare
// glowing sparks. Each particle also sits on a depth layer, so
// far ones are dimmer and slower and near ones brighter and
// faster, which gives the field some parallax. Most of the
// field gathers in a band across the middle of the screen where
// the three bodies sit; the rest scatters over the whole page.
//
// Drawn on its own 2D canvas (not p5 / three.js) so it stays
// cheap next to the three model scenes.
// ============================================================

function initUniverseStrays(canvasId) {

    const canvas = document.getElementById(canvasId);

    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const universeScreen = document.getElementById("screen-universe");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Tunables
    const PIXELS_PER_PARTICLE = 300;    // lower = denser field
    const MAX_PARTICLES = 6000;
    const BAND_SHARE = 0.65;            // share of particles gathered around the bodies
    const BAND_CENTER = 0.48;           // band centre, as a fraction of screen height
    const BAND_SPREAD = 0.2;            // band spread, as a fraction of screen height
    const FADE_SPEED = 2.5;             // how quickly the field fades in / out

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let fade = 0;
    let time = 0;
    let lastFrame = performance.now();

    // Soft glow used for the rare bright "spark" particles.
    const glow = document.createElement("canvas");
    glow.width = 64;
    glow.height = 64;

    const glowCtx = glow.getContext("2d");
    const glowGradient = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);

    glowGradient.addColorStop(0, "rgba(255, 251, 251, 1)");
    glowGradient.addColorStop(0.25, "rgba(255, 251, 251, 0.35)");
    glowGradient.addColorStop(1, "rgba(255, 251, 251, 0)");

    glowCtx.fillStyle = glowGradient;
    glowCtx.fillRect(0, 0, 64, 64);

    // Roughly normal random number (mean 0, spread 1).
    function gaussian() {
        return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.577;
    }

    function makeParticle() {

        const roll = Math.random();
        const tier = roll < 0.76 ? 0 : roll < 0.98 ? 1 : 2;   // dust, mote, spark
        const depth = 0.35 + Math.random() * 0.65;            // 0.35 far / slow, 1 near / fast

        let y = Math.random() * height;

        if (Math.random() < BAND_SHARE) {
            const bandY = height * BAND_CENTER + gaussian() * height * BAND_SPREAD;
            if (bandY >= 0 && bandY <= height) y = bandY;
        }

        const radius = tier === 0 ? 0.5 + Math.random() * 0.6
            : tier === 1 ? 1.1 + Math.random() * 0.9
                : 2.2 + Math.random() * 1.2;

        const alpha = (tier === 0 ? 0.15 + Math.random() * 0.3
            : tier === 1 ? 0.3 + Math.random() * 0.3
                : 0.55 + Math.random() * 0.35) * depth;

        // Most particles drift gently down-right (matching the sun's
        // diagonal tilt); a fifth go the other way so it never feels
        // like a uniform wind.
        const heading = 0.25 + (Math.random() - 0.5) * 1.1 + (Math.random() < 0.2 ? Math.PI : 0);
        const speed = (4 + Math.random() * 10) * depth;

        return {
            x: Math.random() * width,
            y,
            tier,
            radius,
            alpha,
            vx: Math.cos(heading) * speed,
            vy: Math.sin(heading) * speed,
            sway: (4 + Math.random() * 8) * depth,
            swaySpeed: 0.15 + Math.random() * 0.35,
            twinkleSpeed: 0.6 + Math.random() * 1.6,
            phase: Math.random() * Math.PI * 2,
            phase2: Math.random() * Math.PI * 2
        };

    }

    function resize() {

        const oldWidth = width;
        const oldHeight = height;

        width = window.innerWidth;
        height = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        const target = Math.min(MAX_PARTICLES, Math.floor((width * height) / PIXELS_PER_PARTICLE));

        // Keep existing particles where they were (scaled to the new size)
        // so a resize doesn't reshuffle the whole field, then add / trim.
        if (oldWidth && oldHeight) {
            particles.forEach((p) => {
                p.x *= width / oldWidth;
                p.y *= height / oldHeight;
            });
        }

        while (particles.length < target) particles.push(makeParticle());
        particles.length = Math.min(particles.length, target);

    }

    function frame(now) {

        requestAnimationFrame(frame);

        // Motion uses a capped step so a stalled frame can't make particles
        // jump; the fade uses real elapsed time so it takes the same
        // time to fade in / out however slowly the page is running.
        const elapsed = Math.min((now - lastFrame) / 1000, 0.5);
        const dt = Math.min(elapsed, 0.05);
        lastFrame = now;

        const active = !!universeScreen && universeScreen.classList.contains("is-active");

        fade += ((active ? 1 : 0) - fade) * Math.min(elapsed * FADE_SPEED, 1);

        // Nothing to draw while the field is faded out on other screens.
        if (fade < 0.004) {
            canvas.style.opacity = "0";
            return;
        }

        canvas.style.opacity = fade.toFixed(3);

        if (!reduceMotion) time += dt;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#fffbfb";

        const margin = 12;

        for (let i = 0; i < particles.length; i++) {

            const p = particles[i];

            if (!reduceMotion) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
            }

            if (p.x < -margin) p.x = width + margin;
            if (p.x > width + margin) p.x = -margin;
            if (p.y < -margin) p.y = height + margin;
            if (p.y > height + margin) p.y = -margin;

            const drawX = p.x + Math.sin(time * p.swaySpeed + p.phase) * p.sway;
            const drawY = p.y + Math.cos(time * p.swaySpeed * 0.8 + p.phase2) * p.sway;

            const twinkle = 0.7 + 0.3 * Math.sin(time * p.twinkleSpeed + p.phase);

            ctx.globalAlpha = p.alpha * twinkle;

            if (p.tier === 2) {
                const size = p.radius * 6;
                ctx.drawImage(glow, drawX - size / 2, drawY - size / 2, size, size);
            } else if (p.tier === 0) {
                // Fine dust is sub-pixel, so a tiny square reads the same as a
                // circle and is much cheaper to draw with thousands of them.
                ctx.fillRect(drawX - p.radius, drawY - p.radius, p.radius * 2, p.radius * 2);
            } else {
                ctx.beginPath();
                ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }

        }

        ctx.globalAlpha = 1;

    }

    window.addEventListener("resize", resize);

    resize();
    requestAnimationFrame(frame);

}