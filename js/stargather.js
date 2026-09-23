// ============================================================
// STAR GATHER
// ------------------------------------------------------------
// The screen between the loading scan and the Sun / Moon / ASC
// picker. Thousands of particles drift loose across the page.
// The viewer holds a key or the mouse (or taps / mashes them),
// and the field is pulled into a spiral, condenses into one
// bright star, then bursts: a glare that rises to a soft grey
// haze (the star still visible inside it, never a full white-out)
// and fades, while the universe screen fades in and the Moon,
// Sun and Ascendant grow out of the middle into their places.
//
//   drift  ->  gather (hold / mash)  ->  charge  ->  burst
//
// Public API (used by js/flow.js):
//
//   StarGather.begin(onBurst)
//       Start listening and animating. onBurst() is called just
//       after the burst begins, at the peak of the glare; flow.js
//       shows the universe screen there and starts the bodies
//       emerging from the centre.
//
// Drawn on its own 2D canvas (#starCanvas), layered above the
// flow screens so the burst can keep playing over the universe
// screen while it fades in underneath.
// ============================================================

(function () {

    const screenEl = document.getElementById("screen-stars");
    const canvas = document.getElementById("starCanvas");

    if (!screenEl || !canvas) return;

    const ctx = canvas.getContext("2d");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

    const hintEl = document.getElementById("starHint");
    const barEl = document.getElementById("starBar");
    const percentEl = document.getElementById("starPercent");
    const statusEl = document.getElementById("starStatus");


    // ------------------------------------------------------------
    // TUNABLES
    // ------------------------------------------------------------

    // Input -> progress (0..1)
    const HOLD_RATE = 0.19;         // per second while a key / the mouse is held  (~5s to fill)
    const TAP_GAIN = 0.032;         // added by every fresh press, so mashing works too
    const DECAY = 0.10;             // per second lost when the viewer lets go
    const DECAY_GRACE = 0.45;       // seconds of no input before it starts to slip
    const ARM_DELAY = 0.5;          // ignore input this long after arriving (stray clicks)

    // Sequence timing (seconds)
    const CHARGE_TIME = 1.25;       // star compresses and shakes before the burst
    const FLASH_PEAK = 0.22;        // glare reaches its peak this long after the burst starts
    const FLASH_HOLD = 0.16;        // ...holds there this long
    const FLASH_END = 1.9;          // ...then fades out completely by here
    const FLASH_LEVEL = 0.5;        // peak strength at the centre (1 would be a full white-out)
    const FLASH_EDGE = 0.6;         // strength at the screen edges, relative to the centre
    const SWAP_AT = 0.3;            // universe screen starts fading in this long after the burst starts
    const BURST_TIME = 2.7;         // whole burst, then the canvas hides

    // Particles
    const MIN_PARTICLES = 5000;
    const MAX_PARTICLES = 11000;
    const PX_PER_PARTICLE = 140;    // lower = denser

    // Star shape, in fractions of the short screen side
    const CORE_A = 0.05;            // Plummer scale radius (size of the dense white core)
    const CORE_MAX = 0.36;          // nothing in the core / halo sits beyond this
    const RING_R = 0.27;            // faint ring near the edge of the star
    const STRAY_SHARE = 0.13;       // share of particles that never join the star

    const GATHER_SPREAD = 0.55;     // how staggered the particles' arrival is
    const BAR_SEGMENTS = 32;

    const TAU = Math.PI * 2;

    const STATUS = [
        [0.00, "DUST ADRIFT"],
        [0.12, "DUST GATHERING"],
        [0.40, "CLOUD COLLAPSING"],
        [0.68, "CORE FORMING"],
        [0.92, "NEARING CRITICAL MASS"]
    ];


    // ------------------------------------------------------------
    // STATE
    // ------------------------------------------------------------

    let state = "off";              // off | gather | charge | burst
    let raf = 0;
    let onBurstCb = null;
    let burstCbFired = false;

    let last = 0;
    let clock = 0;                  // seconds since begin()
    let armedAt = 0;
    let phaseT = 0;                 // seconds inside the current charge / burst phase
    let spin = 0;                   // accumulated rotation clock for the star

    let progress = 0;               // where the viewer has taken it (0..1)
    let shown = 0;                  // eased copy of it that the visuals use
    let lastInput = 0;
    let kick = 0;                   // brief pulse on every press
    let held = false;

    let riserBuffer = null;
    let riserReverseBuffer = null;
    let riserSource = null;
    let riserDirection = 0;
    let riserLoading = null;
    const burstSound = new Audio("assets/sfx/burst.mp3");
    burstSound.preload = "auto";
    let burstSoundStarted = false;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let cx = 0;
    let cy = 0;
    let S = 0;                      // short side of the screen, the unit everything scales with

    let N = 0;

    // per-particle data (typed arrays, allocated in allocate())
    let fx, fy;                     // start position as a fraction of the screen
    let rh, ah;                     // home in the star: radius (fraction of S) and angle
    let ph, ph2, fr, amp;           // drift
    let peak, sz, tw, spinRate;     // look
    let rnd, stray;
    let x0, y0, r0, a0, da, dly;    // derived from the screen size (layout())
    let bx, by, bvx, bvy;           // current position / burst velocity

    let hairH = null;
    let hairV = null;

    const keysDown = new Set();
    const pointers = new Set();

    const glowSprite = makeGlowSprite();
    const sparkleSprite = makeSparkleSprite();

    let lastPercent = -1;

    buildBar();


    // ------------------------------------------------------------
    // SMALL HELPERS
    // ------------------------------------------------------------

    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const smooth = (t) => t * t * (3 - 2 * t);
    const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.577;

    function buildBar() {

        if (!barEl || barEl.children.length) return;

        for (let i = 0; i < BAR_SEGMENTS; i++) {
            const seg = document.createElement("span");
            seg.className = "completion-seg";
            barEl.appendChild(seg);
        }

    }

    function loadRiser() {

        if (riserLoading || riserBuffer) return riserLoading;

        riserLoading = fetch("assets/sfx/riser.mp3")
            .then((response) => response.arrayBuffer())
            .then((data) => getAudioContext().decodeAudioData(data))
            .then((buffer) => {
                riserBuffer = buffer;
                riserReverseBuffer = getAudioContext().createBuffer(
                    buffer.numberOfChannels,
                    buffer.length,
                    buffer.sampleRate
                );

                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                    const source = buffer.getChannelData(channel);
                    const reversed = riserReverseBuffer.getChannelData(channel);

                    for (let i = 0; i < source.length; i++) {
                        reversed[i] = source[source.length - 1 - i];
                    }
                }
            })
            .catch((error) => {
                console.warn("js/stargather.js: could not load the riser sound.", error);
            });

        return riserLoading;

    }

    function stopRiser() {

        if (!riserSource) return;

        riserSource.onended = null;
        riserSource.stop();
        riserSource.disconnect();
        riserSource = null;
        riserDirection = 0;

    }

    function syncRiser(direction) {

        if (!riserBuffer || direction === riserDirection) return;

        stopRiser();

        if (!direction || state !== "gather") return;

        const context = getAudioContext();
        const source = context.createBufferSource();
        const isReverse = direction < 0;
        const duration = riserBuffer.duration;
        const safeDuration = Math.max(0, duration - 0.001);
        const offset = isReverse
            ? (1 - progress) * safeDuration
            : progress * safeDuration;

        source.buffer = isReverse ? riserReverseBuffer : riserBuffer;
        source.loop = false;
        source.playbackRate.value = duration * (isReverse ? DECAY : HOLD_RATE);
        source.connect(context.destination);
        source.start(0, Math.max(0, Math.min(safeDuration, offset)));

        source.onended = () => {
            if (riserSource !== source) return;
            riserSource = null;
            riserDirection = 0;
        };

        riserSource = source;
        riserDirection = direction;

    }

    function updateRiser() {

        if (!riserBuffer || state !== "gather") return;

        const direction = held ? 1 : progress > 0 ? -1 : 0;
        syncRiser(direction);

    }


    // ------------------------------------------------------------
    // SPRITES (pre-rendered once, drawn additively)
    // ------------------------------------------------------------

    // Soft round glow: the bloom around the star.
    function makeGlowSprite() {

        const c = document.createElement("canvas");
        c.width = c.height = 256;

        const g = c.getContext("2d");
        const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);

        // A tight hot core plus a wide soft tail. Built from many stops
        // (a smooth curve, not a straight ramp) so the edge of the glow
        // never shows as a visible ring.
        for (let i = 0; i <= 32; i++) {
            const r = i / 32;
            const a = 0.9 * Math.exp(-r / 0.07) + 0.3 * Math.exp(-Math.pow(r / 0.38, 2));
            grad.addColorStop(r, `rgba(255, 251, 251, ${Math.min(1, a).toFixed(4)})`);
        }

        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 256);

        return c;

    }

    // Four-point sparkle, the same shape as the star in the title art:
    // two thin spikes crossing at the centre.
    function makeSparkleSprite() {

        const c = document.createElement("canvas");
        c.width = c.height = 512;

        const g = c.getContext("2d");

        for (let axis = 0; axis < 2; axis++) {

            g.save();
            g.translate(256, 256);
            g.rotate(axis * Math.PI / 2);
            g.scale(1, 0.03);

            const grad = g.createRadialGradient(0, 0, 0, 0, 0, 256);

            grad.addColorStop(0, "rgba(255, 251, 251, 1)");
            grad.addColorStop(0.18, "rgba(255, 251, 251, 0.55)");
            grad.addColorStop(0.55, "rgba(255, 251, 251, 0.14)");
            grad.addColorStop(1, "rgba(255, 251, 251, 0)");

            g.fillStyle = grad;
            g.fillRect(-256, -256, 512, 512);
            g.restore();

        }

        return c;

    }


    // ------------------------------------------------------------
    // PARTICLES
    // ------------------------------------------------------------

    function allocate(n) {

        N = n;

        [fx, fy, rh, ah, ph, ph2, fr, amp, peak, sz, tw, spinRate, rnd,
            x0, y0, r0, a0, da, dly, bx, by, bvx, bvy] = Array.from({ length: 23 }, () => new Float32Array(n));

        stray = new Uint8Array(n);

    }

    // Home radius (fraction of S) for the dense core: a Plummer profile,
    // so density piles up toward the middle and blows out to white there.
    function plummer() {

        let r;

        do {
            r = CORE_A / Math.sqrt(Math.pow(Math.random(), -2 / 3) - 1);
        } while (r > CORE_MAX);

        return r;

    }

    function halo() {

        let r;

        do {
            r = 0.05 - Math.log(1 - Math.random()) * 0.085;
        } while (r > CORE_MAX + 0.04);

        return r;

    }

    function ring() {
        return RING_R + gauss() * 0.02;
    }

    function seed() {

        for (let i = 0; i < N; i++) {

            // Start a little beyond the screen so the drift never shows an edge.
            fx[i] = rand(-0.04, 1.04);
            fy[i] = rand(-0.04, 1.04);

            const roll = Math.random();

            stray[i] = roll < STRAY_SHARE ? 1 : 0;

            if (!stray[i]) {
                const pick = Math.random();
                rh[i] = pick < 0.74 ? plummer() : pick < 0.91 ? halo() : ring();
            }

            ah[i] = Math.random() * TAU;

            ph[i] = Math.random() * TAU;
            ph2[i] = Math.random() * TAU;
            fr[i] = rand(0.15, 0.55);
            amp[i] = rand(5, 22);

            // mostly fine grains, a few bigger motes
            const big = Math.random();
            sz[i] = big < 0.04 ? rand(2.4, 3.4) : big < 0.25 ? rand(1.6, 2.2) : rand(1.0, 1.6);
            peak[i] = clamp(rand(0.4, 0.95) + (big < 0.04 ? 0.2 : 0), 0, 1);

            tw[i] = rand(0.8, 3.6);
            rnd[i] = Math.random();

            // inner particles orbit faster than outer ones
            spinRate[i] = 1.1 / (1 + rh[i] / 0.07);

        }

    }

    // Everything that depends on the screen size.
    function layout() {

        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        cx = w / 2;
        cy = h / 2;
        S = Math.min(w, h);

        // Assigning width / height wipes the canvas even when the value is
        // unchanged, and js/flow.js fires a synthetic resize right after it
        // swaps to the universe screen (mid-flash). Only touch it if the
        // size really changed, or the flash would drop out for a frame.
        const cw = Math.round(w * dpr);
        const ch = Math.round(h * dpr);

        if (canvas.width !== cw) canvas.width = cw;
        if (canvas.height !== ch) canvas.height = ch;

        const target = clamp(Math.round((w * h) / PX_PER_PARTICLE), MIN_PARTICLES, MAX_PARTICLES);

        // Only reshuffle the field if the screen changed a lot; a small
        // resize just re-derives the positions from the stored fractions.
        if (!N || Math.abs(target - N) / N > 0.25) {
            allocate(target);
            seed();
        }

        const maxR = Math.hypot(w, h) / 2;

        for (let i = 0; i < N; i++) {

            const x = fx[i] * w;
            const y = fy[i] * h;
            const dx = x - cx;
            const dy = y - cy;

            x0[i] = x;
            y0[i] = y;
            r0[i] = Math.hypot(dx, dy);
            a0[i] = Math.atan2(dy, dx);

            // Always spiral the same way round on the way in (counter-clockwise).
            da[i] = stray[i] ? 0 : (((ah[i] - a0[i]) % TAU) + TAU) % TAU;

            // Nearer dust falls in first, the far field arrives last.
            dly[i] = GATHER_SPREAD * (0.62 * Math.min(1, r0[i] / maxR) + 0.38 * rnd[i]);

        }

        // Hairlines through the middle, echoing the grid lines in the title art.
        hairH = ctx.createLinearGradient(0, 0, w, 0);
        hairV = ctx.createLinearGradient(0, 0, 0, h);

        [hairH, hairV].forEach((g) => {
            g.addColorStop(0, "rgba(255, 251, 251, 0.15)");
            g.addColorStop(0.5, "rgba(255, 251, 251, 1)");
            g.addColorStop(1, "rgba(255, 251, 251, 0.15)");
        });

    }


    // ------------------------------------------------------------
    // INPUT
    // Any key, or the mouse / a finger. Holding fills it steadily,
    // and every fresh press adds a little on top, so mashing works too.
    // ------------------------------------------------------------

    function press() {

        if (state !== "gather" || clock < armedAt) return;

        progress = Math.min(1, progress + TAP_GAIN);
        lastInput = clock;
        kick = 1;

        if (riserBuffer) {
            syncRiser(1);
        }

    }

    function onKeyDown(e) {

        if (state !== "gather") return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;      // leave browser shortcuts alone
        if (e.key === "Escape" || /^F\d+$/.test(e.key)) return;

        e.preventDefault();                                  // no page scroll on Space, no button "click" on Enter

        // Holding a key sends repeated keydowns; held state is tracked
        // by keydown / keyup instead, so the repeats are ignored.
        if (e.repeat || keysDown.has(e.code)) return;

        keysDown.add(e.code);
        press();

    }

    function onKeyUp(e) {
        keysDown.delete(e.code);
    }

    function onPointerDown(e) {

        if (state !== "gather") return;

        pointers.add(e.pointerId);
        press();

    }

    function onPointerUp(e) {
        pointers.delete(e.pointerId);
    }

    function releaseAll() {
        keysDown.clear();
        pointers.clear();
    }

    function onContextMenu(e) {
        if (state === "gather") e.preventDefault();          // long-press / right-click shouldn't pop a menu
    }

    function listen(on) {

        const fn = on ? "addEventListener" : "removeEventListener";

        window[fn]("keydown", onKeyDown);
        window[fn]("keyup", onKeyUp);
        window[fn]("pointerdown", onPointerDown);
        window[fn]("pointerup", onPointerUp);
        window[fn]("pointercancel", onPointerUp);
        window[fn]("blur", releaseAll);
        window[fn]("contextmenu", onContextMenu);
        window[fn]("resize", layout);

    }


    // ------------------------------------------------------------
    // HUD TEXT
    // ------------------------------------------------------------

    function setText(el, text, cache) {

        if (el && cache.v !== text) {
            el.textContent = text;
            cache.v = text;
        }

    }

    const percentCache = {};
    const statusCache = {};
    const hintCache = {};

    function updateHud() {

        const pct = Math.round(shown * 100);

        if (pct !== lastPercent) {

            lastPercent = pct;

            if (barEl) {
                const filled = Math.round(shown * BAR_SEGMENTS);
                Array.prototype.forEach.call(barEl.children, (seg, i) => {
                    seg.classList.toggle("is-filled", i < filled);
                });
            }

        }

        setText(percentEl, pct + "%", percentCache);

        let status = STATUS[0][1];

        for (let i = 0; i < STATUS.length; i++) {
            if (shown >= STATUS[i][0]) status = STATUS[i][1];
        }

        if (state !== "gather") status = "IGNITION";

        setText(statusEl, status, statusCache);

        let hint;

        if (state !== "gather") {
            hint = "";
        } else if (progress < 0.01 && shown < 0.01) {
            hint = touchOnly
                ? "HOLD OR TAP TO GATHER THE STARS"
                : "HOLD ANY KEY OR CLICK TO GATHER THE STARS";
        } else if (!held && clock - lastInput > DECAY_GRACE) {
            hint = "DON'T STOP - THE STARS ARE DRIFTING APART";
        } else {
            hint = "KEEP GOING";
        }

        setText(hintEl, hint, hintCache);

    }


    // ------------------------------------------------------------
    // DRAWING
    // ------------------------------------------------------------

    function drawGlow(size, alpha) {

        if (alpha <= 0.002) return;

        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(glowSprite, cx - size, cy - size, size * 2, size * 2);

    }

    function drawSparkle(len, alpha) {

        if (alpha <= 0.002) return;

        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(sparkleSprite, cx - len, cy - len, len * 2, len * 2);

    }

    function drawHairlines(alpha) {

        if (alpha <= 0.002) return;

        ctx.globalAlpha = alpha;

        ctx.fillStyle = hairH;
        ctx.fillRect(0, Math.round(cy) - 0.5, w, 1);

        ctx.fillStyle = hairV;
        ctx.fillRect(Math.round(cx) - 0.5, 0, 1, h);

        // one small tick + live count on the horizontal line, like a plot readout
        const tx = cx + S * 0.31;

        ctx.fillStyle = "#fffbfb";
        ctx.fillRect(Math.round(tx) - 0.5, cy - 4, 1, 8);

    }

    function drawReadout(count, alpha) {

        if (alpha <= 0.002) return;

        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = "#fffbfb";
        ctx.font = "10px \"input-mono\", \"Input Mono\", \"JetBrains Mono\", \"Courier New\", monospace";
        ctx.textBaseline = "top";
        ctx.fillText(String(count).padStart(5, "0"), cx + S * 0.31 - 3, cy + 10);

    }

    // Drift / gather / charge: place every particle and draw it.
    function drawField(dt, fadeIn) {

        const s = shown;
        const u = state === "charge" ? clamp(phaseT / CHARGE_TIME, 0, 1) : 0;

        // While charging, the star pulls in tight and starts to shake.
        const k = 1 - 0.55 * Math.pow(u, 2.2) - 0.05 * kick;
        const shake = reduceMotion ? 0 : Math.pow(u, 2) * 3.2;
        const ox = shake ? (Math.random() - 0.5) * 2 * shake : 0;
        const oy = shake ? (Math.random() - 0.5) * 2 * shake : 0;

        // The pull is front-loaded: the first seconds of holding should
        // visibly move the field, and the last stretch is the slow squeeze.
        const m = 1 - Math.pow(1 - s, 1.35);
        const sk = m * (1 + GATHER_SPREAD);
        const driftAmt = reduceMotion ? 0.25 : 1;
        const bright = 1 + 0.7 * u;

        const R = S * k;
        const ccx = cx + ox;
        const ccy = cy + oy;

        // bloom behind the particles
        const heat = Math.pow(s, 2.2);
        const glowSize = S * (0.16 + 0.34 * s) * (1 + 0.7 * u * u + 0.08 * kick) * (0.6 + 0.4 * k);

        drawGlow(glowSize, (0.3 * heat + 0.15 * kick * s) * fadeIn * (1 + 0.8 * u));

        ctx.fillStyle = "#fffbfb";

        let gathered = 0;

        for (let i = 0; i < N; i++) {

            let t = sk - dly[i];
            t = t < 0 ? 0 : t > 1 ? 1 : t;

            const e = smooth(t);
            const ea = e * e;
            const free = 1 - e;

            const dx = Math.sin(clock * fr[i] + ph[i]) * amp[i] * driftAmt * free;
            const dy = Math.cos(clock * fr[i] * 0.83 + ph2[i]) * amp[i] * driftAmt * free;

            let px;
            let py;

            if (stray[i]) {

                px = x0[i] + dx;
                py = y0[i] + dy;

            } else {

                const r = r0[i] + (rh[i] * R - r0[i]) * e;
                const ang = a0[i] + da[i] * ea + spin * spinRate[i] * ea;

                px = ccx + Math.cos(ang) * r + dx;
                py = ccy + Math.sin(ang) * r + dy;

                if (e > 0.97) gathered++;

            }

            bx[i] = px;
            by[i] = py;

            if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;

            const twinkleAmp = 0.55 * (1 - 0.8 * e);
            const twinkle = 1 - twinkleAmp + twinkleAmp * (0.5 + 0.5 * Math.sin(clock * tw[i] + ph[i] * 3.1));

            ctx.globalAlpha = clamp(peak[i] * (0.42 + 0.58 * e) * twinkle * bright * fadeIn, 0, 1);

            const size = sz[i] * (1 + 0.25 * e);

            ctx.fillRect(px - size / 2, py - size / 2, size, size);

        }

        // white-hot heart of the star: this is what blows out to pure white
        drawGlow(glowSize * 0.5, heat * 0.9 * fadeIn * (1 + 0.5 * u));

        // sparkle spikes: a short glint while gathering, then they stretch
        // out during the final charge
        const s3 = Math.pow(s, 3);

        drawSparkle(S * (0.04 + 0.2 * s3 + 0.5 * u * u), (0.8 * s3 + 0.2 * u) * fadeIn);

        // hairlines fade in as the star forms
        const hair = clamp(s * 1.8, 0, 1) * 0.3 * fadeIn * (1 + u);

        drawHairlines(hair);
        drawReadout(gathered, hair * 1.4);

    }

    // Burst: every particle flies outward, decelerating, on a short trail.
    function drawBurst(dt) {

        const t = phaseT;
        const life = clamp(1 - t / (BURST_TIME - 0.3), 0, 1);

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#fffbfb";
        ctx.strokeStyle = "#fffbfb";

        const drag = Math.exp(-1.15 * dt);

        if (life > 0) {

            for (let i = 0; i < N; i++) {

                bx[i] += bvx[i] * dt;
                by[i] += bvy[i] * dt;
                bvx[i] *= drag;
                bvy[i] *= drag;

                const px = bx[i];
                const py = by[i];

                if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;

                const speed = Math.hypot(bvx[i], bvy[i]);
                const glint = clamp(speed / (S * 0.9), 0, 1);

                ctx.globalAlpha = clamp((peak[i] * 0.8 + 0.3 * glint) * Math.pow(life, 1.3), 0, 1);

                const size = sz[i] * (1 + 0.6 * glint);

                ctx.fillRect(px - size / 2, py - size / 2, size, size);

                // A short streak behind some of the fast ones (kept sparse and soft).
                // Drawn as a line along the velocity and the canvas is wiped clean
                // each frame, so every alpha in here means exactly what it says.
                if (i % 3 === 0 && speed > S * 0.12) {

                    ctx.globalAlpha *= 0.3;
                    ctx.lineWidth = size * 0.7;
                    ctx.beginPath();
                    ctx.moveTo(px - bvx[i] * 0.035, py - bvy[i] * 0.035);
                    ctx.lineTo(px, py);
                    ctx.stroke();

                }

            }

        }

        // shockwave rings
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "#fffbfb";

        [0, 0.14].forEach((delay, n) => {

            const rt = t - delay;

            if (rt <= 0) return;

            const rr = S * (n ? 1.15 : 1.5) * (1 - Math.exp(-rt * 2.4));
            const ra = Math.pow(clamp(1 - rt / 1.5, 0, 1), 2) * (n ? 0.35 : 0.6);

            if (ra <= 0.004) return;

            ctx.globalAlpha = ra;
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, TAU);
            ctx.stroke();

        });

        // last big glow + sparkle at the centre of the blast
        const boom = Math.pow(clamp(1 - t / 1.1, 0, 1), 2);
        const grow = 1 - Math.exp(-t * 6);

        drawGlow(S * (0.3 + 1.1 * grow), boom * 0.9);
        drawSparkle(S * (0.44 + 1.0 * grow), boom);

        drawHairlines(0.3 * Math.pow(clamp(1 - t / 0.8, 0, 1), 2));

        // haze on top; the star and its streaks stay readable through it
        const flash = flashAmount(t);

        if (flash > 0.003) {

            const a = flash * FLASH_LEVEL * (reduceMotion ? 0.7 : 1);
            const edge = FLASH_EDGE * smooth(clamp(t / FLASH_PEAK, 0, 1));
            const reach = Math.hypot(w, h) * (0.2 + 0.8 * clamp(t / FLASH_PEAK, 0, 1));

            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);

            // Brightest at the centre and softer toward the edges: a haze of
            // light around the star, not a white-out.
            g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
            g.addColorStop(0.4, `rgba(255, 251, 251, ${a * (0.55 + 0.45 * edge)})`);
            g.addColorStop(1, `rgba(255, 251, 251, ${a * edge})`);

            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);

        }

    }

    function flashAmount(t) {

        if (t < FLASH_PEAK) return Math.pow(t / FLASH_PEAK, 0.55);
        if (t < FLASH_PEAK + FLASH_HOLD) return 1;

        const x = (t - FLASH_PEAK - FLASH_HOLD) / (FLASH_END - FLASH_PEAK - FLASH_HOLD);

        return x >= 1 ? 0 : Math.pow(1 - x, 1.8);

    }


    // ------------------------------------------------------------
    // SEQUENCE
    // ------------------------------------------------------------

    function startCharge() {

        state = "charge";
        phaseT = 0;
        releaseAll();
        stopRiser();

        screenEl.classList.add("is-igniting");

    }

    function startBurst() {

        state = "burst";
        phaseT = 0;

        // bx / by already hold each particle's last drawn position.
        for (let i = 0; i < N; i++) {

            const dx = bx[i] - cx;
            const dy = by[i] - cy;
            const d = Math.hypot(dx, dy) || 1;
            const ux = dx / d;
            const uy = dy / d;

            let speed = S * (0.1 + 1.7 * Math.pow(Math.random(), 2.2));

            if (stray[i]) speed *= 0.15;

            // a curl on the outward push, so the blast keeps the star's spin
            const curl = speed * 0.3;
            const jitter = S * 0.05;

            bvx[i] = ux * speed - uy * curl + rand(-jitter, jitter);
            bvy[i] = uy * speed + ux * curl + rand(-jitter, jitter);

        }

    }

    function finish() {

        state = "off";
        stopRiser();

        cancelAnimationFrame(raf);
        listen(false);
        releaseAll();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        canvas.classList.remove("is-on");

    }

    function frame(now) {

        raf = requestAnimationFrame(frame);

        const elapsed = Math.min((now - last) / 1000, 0.5);
        const dt = Math.min(elapsed, 0.05);

        last = now;
        clock += dt;

        // ---- state updates
        if (state === "gather") {

            held = clock >= armedAt && (keysDown.size > 0 || pointers.size > 0);

            if (held) {
                progress += HOLD_RATE * dt;
                lastInput = clock;
            } else if (clock - lastInput > DECAY_GRACE) {
                progress -= DECAY * dt;
            }

            progress = clamp(progress, 0, 1);

            if (progress >= 1 && !burstSoundStarted) {
                burstSoundStarted = true;
                burstSound.currentTime = 0;
                burstSound.play().catch((error) => {
                    console.warn("js/stargather.js: could not play the burst sound.", error);
                });
            }

            updateRiser();

            if (progress >= 1 && shown > 0.985) {
                startCharge();
            }

        }

        shown += (progress - shown) * (1 - Math.exp(-5 * dt));

        if (state === "charge" || state === "burst") shown = Math.max(shown, progress);

        kick *= Math.exp(-7 * dt);

        const spinBoost = state === "charge" ? 1 + 5 * Math.pow(clamp(phaseT / CHARGE_TIME, 0, 1), 2) : 1;

        if (!reduceMotion) spin += dt * spinBoost;

        if (state === "charge" || state === "burst") phaseT += dt;

        if (state === "charge" && phaseT >= CHARGE_TIME) startBurst();

        if (state === "burst" && !burstCbFired && phaseT >= SWAP_AT) {

            burstCbFired = true;

            if (typeof onBurstCb === "function") onBurstCb();

        }

        // ---- draw
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, w, h);

        if (state === "burst") {

            drawBurst(dt);

        } else {

            ctx.globalCompositeOperation = "lighter";
            drawField(dt, clamp(clock / 0.8, 0, 1));

        }

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;

        updateHud();

        if (state === "burst" && phaseT >= BURST_TIME) finish();

    }


    // ------------------------------------------------------------
    // PUBLIC
    // ------------------------------------------------------------

    function begin(onBurst) {

        if (state !== "off") return;

        onBurstCb = onBurst;
        burstCbFired = false;

        if (document.activeElement && typeof document.activeElement.blur === "function") {
            document.activeElement.blur();
        }

        layout();

        releaseAll();
        loadRiser();

        state = "gather";
        clock = 0;
        armedAt = ARM_DELAY;
        lastInput = 0;
        phaseT = 0;
        spin = 0;
        progress = 0;
        shown = 0;
        kick = 0;
        held = false;
        burstSoundStarted = false;

        lastPercent = -1;

        screenEl.classList.remove("is-igniting");
        canvas.classList.add("is-on");

        listen(true);

        last = performance.now();
        raf = requestAnimationFrame(frame);

    }

    window.StarGather = { begin };

})();