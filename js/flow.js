// ============================================================
// FLOW CONTROLLER
// Screens: intro (typing) -> form (database card) ->
// loading (scan) -> stars (hold / mash to form a star that bursts,
// js/stargather.js)
// -> universe (choose sun/moon/asc).
//
// Talks to sketch.js only through three optional global hooks
// that generateChart() calls if they exist:
//   window.onChartGenerateStart()
//   window.onChartReady()
//   window.onChartGenerateError(error)
// This keeps sketch.js reusable on its own.
// ============================================================

(function () {

    initStarfield("bgCanvas");
    initUniverseStrays("universeStrayCanvas");

    const screens = {
        intro: document.getElementById("screen-intro"),
        form: document.getElementById("screen-form"),
        loading: document.getElementById("screen-loading"),
        stars: document.getElementById("screen-stars"),
        universe: document.getElementById("screen-universe")
    };

    function showScreen(name) {

        Object.keys(screens).forEach((key) => {

            const el = screens[key];

            if (!el) return;

            el.classList.toggle("is-active", key === name);

        });

        if (name === "universe") {
            // The preview canvases are mounted while this screen is hidden,
            // so their first measured size is zero. Refit them after reveal.
            requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
        }

    }

    // Show the form screen with the data card "materializing" in: a sliver
    // at its centre that grows tall, then widens out to the full card,
    // corner ticks and text catching up a beat behind. CSS-driven
    // (#screen-form.is-materializing in css/style.css) — this just adds the
    // class for the length of that sequence, so it can replay every time
    // the card comes back on screen.
    function enterForm() {

        const screen = screens.form;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (screen && !reduce) {

            screen.classList.add("is-materializing");
            setTimeout(() => screen.classList.remove("is-materializing"), 1350);

        }

        showScreen("form");

    }


    // ------------------------------------------------------------
    // INTRO — TYPE, PAUSE, FADE, TYPE, PAUSE, FADE INTO FORM
    // ------------------------------------------------------------

    const INTRO_LINES = [
        "the day you were born, the universe aligned, everything is already decided",
        "will u let the universe unveil your fate?"
    ];

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function typeLine(text, target, speed) {

        return new Promise((resolve) => {

            target.textContent = "";
            const stopTypingSound = window.startTypingSound
                ? window.startTypingSound()
                : null;

            let i = 0;

            (function step() {

                if (i <= text.length) {
                    target.textContent = text.slice(0, i);
                    i++;
                    setTimeout(step, speed);
                } else {
                    if (stopTypingSound) stopTypingSound();
                    resolve();
                }

            })();

        });

    }

    // Set once the intro is over, either because it finished or because it
    // was skipped. runIntro() checks it after every pause and stops.
    let introOver = false;

    async function runIntro() {

        const typedEl = document.getElementById("introTyped");
        const lineEl = document.getElementById("introLine");

        if (!typedEl || !lineEl || !screens.intro) {
            introOver = true;
            enterForm();
            return;
        }

        for (let i = 0; i < INTRO_LINES.length; i++) {

            lineEl.classList.remove("is-out");

            await typeLine(INTRO_LINES[i], typedEl, 28);
            if (introOver) return;

            await wait(1500);
            if (introOver) return;

            if (i < INTRO_LINES.length - 1) {
                lineEl.classList.add("is-out");
                await wait(550);
                if (introOver) return;
            }

        }

        await wait(500);
        if (introOver) return;

        screens.intro.classList.add("is-out");

        await wait(750);
        if (introOver) return;

        introOver = true;
        window.removeEventListener("keydown", onIntroKey);
        window.removeEventListener("pointerup", skipIntro);
        enterForm();

    }

    // display.html's "back to universe" link opens this page with
    // #universe. The chart is already saved in sessionStorage, so skip the
    // intro and form and land straight on the Sun / Moon / ASC picker.
    if (window.location.hash === "#universe") {

        introOver = true;
        showScreen("universe");

    } else {

        runIntro();

    }


    // ------------------------------------------------------------
    // SKIP THE INTRO — press [E] (tap anywhere on touch devices)
    // Only listens while the intro is showing, so typing "e" into the
    // form fields afterwards is never affected.
    // ------------------------------------------------------------

    function skipIntro() {

        if (introOver) return;

        introOver = true;

        window.removeEventListener("keydown", onIntroKey);
        window.removeEventListener("pointerup", skipIntro);

        screens.intro.classList.add("is-out");

        setTimeout(() => enterForm(), 450);

    }

    function onIntroKey(e) {

        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.code === "KeyE" || e.key.toLowerCase() === "e") skipIntro();

    }

    window.addEventListener("keydown", onIntroKey);

    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {

        const hint = document.getElementById("introSkipHint");
        if (hint) hint.textContent = "TAP TO SKIP";

        window.addEventListener("pointerup", skipIntro);

    }


    // ------------------------------------------------------------
    // PROFILE COMPLETION BAR
    // Reflects date / time / place, all of which live as
    // top-level bindings in sketch.js (birthDate, birthTime,
    // selectedLocation) — classic scripts share one global
    // scope, so they're readable here without importing anything.
    // ------------------------------------------------------------

    const BAR_SEGMENTS = 32;

    const completionBar = document.getElementById("completionBar");
    const completionCount = document.getElementById("completionCount");
    const cardMessage = document.getElementById("cardMessage");

    if (completionBar) {

        for (let i = 0; i < BAR_SEGMENTS; i++) {
            const seg = document.createElement("span");
            seg.className = "completion-seg";
            completionBar.appendChild(seg);
        }

    }

    function fieldsFilled() {

        let n = 0;

        if (typeof birthDate !== "undefined" && birthDate && birthDate.value) n++;
        if (typeof birthTime !== "undefined" && birthTime && birthTime.value) n++;
        if (typeof selectedLocation !== "undefined" && selectedLocation) n++;

        return n;

    }

    function updateCompletion() {

        const n = fieldsFilled();
        const filled = Math.round((n / 3) * BAR_SEGMENTS);

        if (completionBar) {
            Array.prototype.forEach.call(completionBar.children, (seg, i) => {
                seg.classList.toggle("is-filled", i < filled);
            });
        }

        if (completionCount) {
            completionCount.textContent = `${n}/3`;
        }

        if (cardMessage && !cardMessage.dataset.errorLock) {
            cardMessage.textContent = n === 3
                ? "COORDINATES LOCKED. READY TO PROCEED"
                : "FILL IN ALL FIELDS TO PROCEED";
        }

    }

    setInterval(updateCompletion, 250);
    updateCompletion();


    // ------------------------------------------------------------
    // LOADING SCREEN
    // ------------------------------------------------------------

    const LOG_LINES = [
        "> LOCATING BIRTH COORDINATES ......... OK",
        "> SYNCING SWISS EPHEMERIS ............ OK",
        "> CALCULATING PLANETARY POSITIONS .... OK",
        "> RESOLVING HOUSES ................... OK",
        "> CROSS-REFERENCING SIGN DATA ........ OK",
        "> COMPILING NATAL PROFILE ............ DONE"
    ];

    const loadingLog = document.getElementById("loadingLog");
    const loadingBar = document.getElementById("loadingBar");
    const loadingPercent = document.getElementById("loadingPercent");

    let loadingTimer = null;
    let loadingProgress = 0;
    let chartIsReady = false;

    function resetLoading() {

        loadingProgress = 0;
        chartIsReady = false;

        if (loadingLog) loadingLog.innerHTML = "";
        if (loadingBar) loadingBar.style.width = "0%";
        if (loadingPercent) loadingPercent.textContent = "0%";

    }

    function pushLogLine(index) {

        if (!loadingLog || index >= LOG_LINES.length) return;

        const line = document.createElement("p");
        line.textContent = LOG_LINES[index];
        loadingLog.appendChild(line);
        loadingLog.scrollTop = loadingLog.scrollHeight;

    }

    function tickLoading() {

        const cap = chartIsReady ? 100 : 92;

        if (loadingProgress < cap) {
            loadingProgress += chartIsReady ? 4 : (Math.random() * 2 + 0.6);
            loadingProgress = Math.min(loadingProgress, cap);
        }

        const shown = Math.round(loadingProgress);

        if (loadingBar) loadingBar.style.width = `${shown}%`;
        if (loadingPercent) loadingPercent.textContent = `${shown}%`;

        const lineIndex = Math.floor((loadingProgress / 100) * LOG_LINES.length);

        while (
            loadingLog &&
            loadingLog.children.length <= lineIndex &&
            loadingLog.children.length < LOG_LINES.length
        ) {
            pushLogLine(loadingLog.children.length);
        }

        if (loadingProgress >= 100) {
            clearInterval(loadingTimer);
            loadingTimer = null;
            setTimeout(enterStars, 550);
        }

    }

    // After the scan: gather the stars, then burst into the universe.
    // If js/stargather.js is missing for any reason, go straight to the
    // universe picker like before.
    function enterStars() {

        if (!window.StarGather || !screens.stars) {
            showScreen("universe");
            return;
        }

        showScreen("stars");

        // The callback fires just after the burst begins, at the peak of its glare.
        window.StarGather.begin(revealUniverse);

    }

    // Fade the universe in with the Moon, Sun and Ascendant growing out of the
    // middle of the screen, as if the burst threw them out, and travelling to
    // their places. It is CSS (#screen-universe.is-emerging in css/style.css);
    // all that is needed here is how far each body has to travel.
    function revealUniverse() {

        const screen = screens.universe;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (screen && !reduce) {

            const midX = window.innerWidth / 2;
            const midY = window.innerHeight / 2;

            // that screen is visibility:hidden, which keeps its layout,
            // so every body is already measurable in its final place
            screen.querySelectorAll(".universe-body").forEach((body, i) => {

                const frame = body.querySelector(".universe-model-frame");

                if (!frame) return;

                const r = frame.getBoundingClientRect();

                frame.style.setProperty("--emerge-x", (midX - (r.left + r.width / 2)).toFixed(1) + "px");
                frame.style.setProperty("--emerge-y", (midY - (r.top + r.height / 2)).toFixed(1) + "px");
                frame.style.setProperty("--emerge-delay", [0.06, 0, 0.12][i] + "s");

            });

            screen.classList.add("is-emerging");

            setTimeout(() => screen.classList.remove("is-emerging"), 2400);

        }

        showScreen("universe");

    }

    window.onChartGenerateStart = function () {

        resetLoading();
        showScreen("loading");

        if (!loadingTimer) {
            loadingTimer = setInterval(tickLoading, 140);
        }

    };

    window.onChartReady = function () {

        chartIsReady = true;

        if (!loadingTimer) {
            showScreen("loading");
            loadingTimer = setInterval(tickLoading, 140);
        }

    };

    window.onChartGenerateError = function () {

        clearInterval(loadingTimer);
        loadingTimer = null;

        enterForm();

        if (cardMessage) {
            cardMessage.dataset.errorLock = "true";
            cardMessage.textContent = "SIGNAL LOST — COULD NOT REACH THE UNIVERSE. TRY AGAIN";

            setTimeout(() => {
                delete cardMessage.dataset.errorLock;
            }, 4000);
        }

    };


    // ------------------------------------------------------------
    // UNIVERSE SCREEN — CHOOSE STARTING PLANET
    // ------------------------------------------------------------

    document.querySelectorAll(".universe-body").forEach((btn) => {

        btn.addEventListener("click", () => {

            try {
                sessionStorage.setItem("startPlanet", btn.dataset.planet);
            } catch (error) {
                console.warn("Could not save starting planet.", error);
            }

            window.location.href = "display.html";

        });

    });

})();