// ============================================================
// LANDING PAGE EFFECTS
//   0. Press [E] to continue
//   1. Title timing offsets (barcode scan, checkerboard, stripes)
//   2. Flickering digit columns (replaces the outlined numbers)
//   3. Flickering particle field behind the title
// The keyframes for the title live in css/style.css.
// ============================================================

(function () {

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const svg = document.querySelector(".landing-title-svg");

    if (svg) {
        initTitleTimings(svg);
        initDigitFlicker(svg);
    }

    initParticleField("particleCanvas");
    initContinue("form.html");


    // ------------------------------------------------------------
    // 0. Continue: press [E] to go to the next page.
    // Touch-only devices have no keyboard, so they get "TAP TO CONTINUE"
    // and a tap anywhere does the same thing.
    // ------------------------------------------------------------
    function initContinue(nextPage) {

        let leaving = false;

        const go = () => {
            if (leaving) return;
            leaving = true;
            window.location.href = nextPage;
        };

        window.addEventListener("keydown", (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.code === "KeyE" || e.key.toLowerCase() === "e") go();
        });

        const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

        if (touchOnly) {
            const label = document.getElementById("landingCtaText");
            if (label) label.textContent = "TAP TO CONTINUE";
            window.addEventListener("pointerup", go);
        }

    }


    // ------------------------------------------------------------
    // 1. Title timing offsets
    // ------------------------------------------------------------
    function initTitleTimings(svg) {

        // Barcode: a scan sweeps left -> right across the bars
        const bars = [...svg.querySelectorAll("#barcode rect")];
        const xs = bars.map(r => parseFloat(r.getAttribute("x")));
        const minX = Math.min(...xs);
        const span = (Math.max(...xs) - minX) || 1;
        bars.forEach((r, i) => {
            r.style.animationDelay = ((xs[i] - minX) / span * 1.4) + "s";
        });

        // Checkerboard: each square blinks on its own random rhythm
        svg.querySelectorAll("#checkered rect").forEach(r => {
            r.style.animationDuration = (2.5 + Math.random() * 3) + "s";
            r.style.animationDelay = -(Math.random() * 5) + "s";
        });

        // Striped bar: a dim wave travels along the stripes
        const stripes = svg.querySelectorAll("#cross-rectangle path");
        stripes.forEach((p, i) => {
            p.style.animationDelay = (i / stripes.length * 1.8) + "s";
        });

    }


    // ------------------------------------------------------------
    // 2. Flickering digits
    // Swaps the outlined numbers inside #number-random for live
    // Input Mono text and randomly re-rolls / flashes the digits.
    // Position and glow are taken from the outlined artwork, so this
    // keeps working after the SVG is re-exported.
    // ------------------------------------------------------------
    function initDigitFlicker(svg) {

        if (reduceMotion) return;                 // keep the static outlined digits

        const groups = svg.querySelectorAll("#number-random > g");
        if (!groups.length) return;

        const SVG_NS = "http://www.w3.org/2000/svg";
        const XML_NS = "http://www.w3.org/XML/1998/namespace";

        const LINES = ["092326", "09 2326", "0923 26"];
        const LINE_GAP = 17.58;                   

        const TICK_MS = 80;                       
        const BASE = 0.8;                        
        const P_CHANGE = 0.02;                    
        const P_BURST = 0.012;                   

        const lines = [];                        

        groups.forEach(g => {

            const box = g.getBBox();              

            while (g.firstChild) g.removeChild(g.firstChild);

            LINES.forEach((str, li) => {

                const text = document.createElementNS(SVG_NS, "text");
                text.setAttribute("class", "title-digits");
                text.setAttribute("x", box.x - 0.7);
                text.setAttribute("y", box.y + box.height - (LINES.length - 1 - li) * LINE_GAP);
                text.setAttributeNS(XML_NS, "xml:space", "preserve");

                const chars = [];

                [...str].forEach(ch => {
                    const span = document.createElementNS(SVG_NS, "tspan");
                    span.textContent = ch;
                    span.style.fillOpacity = BASE;
                    text.appendChild(span);
                    if (ch !== " ") chars.push({ el: span, a: BASE, shown: BASE });
                });

                g.appendChild(text);
                lines.push(chars);

            });

        });

        const randDigit = () => String(Math.floor(Math.random() * 10));

        // re-roll a digit and kick its brightness either up (flash) or down (dropout)
        function glitch(c) {
            c.el.textContent = randDigit();
            c.a = Math.random() < 0.65 ? 1 : 0.08;
        }

        setInterval(() => {

            lines.forEach(chars => {

                if (Math.random() < P_BURST) chars.forEach(glitch);

                chars.forEach(c => {

                    if (Math.random() < P_CHANGE) glitch(c);

                    // ease brightness back to the resting level
                    c.a += (BASE - c.a) * 0.3;
                    if (Math.abs(c.a - BASE) < 0.02) c.a = BASE;

                    if (c.a !== c.shown) {
                        c.el.style.fillOpacity = c.a.toFixed(2);
                        c.shown = c.a;
                    }

                });

            });

        }, TICK_MS);

    }


    // ------------------------------------------------------------
    // 3. Particle field
    // Small square dots and tiny crosses that drift slowly, fade in
    // and out, and flicker on/off. Denser around the title.
    // ------------------------------------------------------------
    function initParticleField(canvasId) {

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        let w = 0;
        let h = 0;
        let particles = [];

        const rand = (a, b) => a + Math.random() * (b - a);
        const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;   // ~ -1..1, bell shaped

        function place(p) {

            // ~55% cluster around the title, the rest scatter across the screen
            if (Math.random() < 0.55) {
                p.x = w * 0.5 + gauss() * w * 0.32;
                p.y = h * 0.42 + gauss() * h * 0.30;
            } else {
                p.x = Math.random() * w;
                p.y = Math.random() * h;
            }

        }

        function spawn(p, now, randomAge) {

            place(p);

            p.size = rand(0.8, 2.2);
            p.cross = Math.random() < 0.1;
            p.vx = rand(-0.05, 0.05);
            p.vy = rand(-0.1, 0.01);              // slight upward drift
            p.peak = rand(0.35, 0.95);
            p.ttl = rand(3500, 9000);
            p.born = now - (randomAge ? Math.random() * p.ttl : 0);
            p.dim = 1;
            p.nextFlick = now + rand(50, 800);

            return p;

        }

        function resize() {

            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            w = window.innerWidth;
            h = window.innerHeight;

            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const count = Math.max(90, Math.min(420, Math.round((w * h) / 5500)));
            const now = performance.now();

            particles = Array.from({ length: count }, () => spawn({}, now, true));

            if (reduceMotion) drawStatic();

        }

        function draw(p, alpha) {

            if (alpha <= 0.01) return;

            ctx.globalAlpha = alpha;

            if (p.cross) {

                const len = 2 + p.size * 1.6;
                ctx.fillRect(p.x - len, p.y - 0.5, len * 2, 1);
                ctx.fillRect(p.x - 0.5, p.y - len, 1, len * 2);

            } else {

                ctx.fillRect(p.x, p.y, p.size, p.size);

                // faint halo on the bigger dots
                if (p.size > 1.7) {
                    ctx.globalAlpha = alpha * 0.15;
                    ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 3, p.size * 3);
                }

            }

        }

        function drawStatic() {
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = "#fffbfb";
            particles.forEach(p => draw(p, p.peak * 0.6));
            ctx.globalAlpha = 1;
        }

        function frame(now) {

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = "#fffbfb";

            particles.forEach(p => {

                const age = (now - p.born) / p.ttl;

                if (age >= 1) {
                    spawn(p, now, false);
                    return;
                }

                p.x += p.vx;
                p.y += p.vy;

                // fade in / out over the particle's life
                const envelope = Math.pow(Math.sin(Math.PI * age), 0.6);

                // digital flicker: mostly on, with quick dropouts
                if (now > p.nextFlick) {
                    p.dim = Math.random() < 0.3 ? rand(0, 0.25) : 1;
                    p.nextFlick = now + (p.dim < 1 ? rand(40, 180) : rand(80, 900));
                }

                draw(p, p.peak * envelope * p.dim);

            });

            ctx.globalAlpha = 1;

            requestAnimationFrame(frame);

        }

        window.addEventListener("resize", resize);

        resize();

        if (!reduceMotion) requestAnimationFrame(frame);

    }

})();