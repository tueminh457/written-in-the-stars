// ================================================
// [H] HIDE   —  toggles all on-screen text/HUD/
// lines off, leaving only the stars.
// [S] SAVE   —  downloads the current screen (the
// planet render AND the on-screen text/HUD, unless
// hidden) as a PNG.
// [C] CREDIT — opens a popup listing the Pixabay
// music tracks used on this page.
// ================================================
(function () {

    const hideButton = document.getElementById("hideButton");
    const hideButtonLabel = document.getElementById("hideButtonLabel");
    const saveButton = document.getElementById("saveButton");
    const creditButton = document.getElementById("creditButton");
    const creditOverlay = document.getElementById("creditOverlay");
    const creditCloseBtn = document.getElementById("creditCloseBtn");

    // Finds whichever planet stage is currently on screen and
    // returns its <canvas> element (three.js draws one canvas
    // per stage: #three-container, #moon-container, #ascendant-container).
    // Used only as a fallback if a full-screen capture isn't possible.
    function getActiveCanvas() {

        const stages = [
            document.getElementById("three-container"),
            document.getElementById("moon-container"),
            document.getElementById("ascendant-container")
        ];

        for (const stage of stages) {
            if (stage && !stage.classList.contains("is-hidden")) {
                const canvas = stage.querySelector("canvas");
                if (canvas) return canvas;
            }
        }

        return null;

    }

    function triggerDownload(canvas) {

        canvas.toBlob(function (blob) {

            if (!blob) {
                console.warn("js/save-credit.js: could not create image blob.");
                return;
            }

            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `written-in-the-stars-${stamp}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(url);

        }, "image/png");

    }

    // Fallback used only if html2canvas isn't available or fails:
    // grabs just the active three.js canvas (stars/planet render),
    // without the surrounding text.
    function downloadCanvasOnly() {

        const sourceCanvas = getActiveCanvas();

        if (!sourceCanvas) {
            console.warn("js/save-credit.js: no active canvas found to capture.");
            return;
        }

        try {

            const output = document.createElement("canvas");
            output.width = sourceCanvas.width;
            output.height = sourceCanvas.height;

            const ctx = output.getContext("2d");
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, output.width, output.height);
            ctx.drawImage(sourceCanvas, 0, 0, output.width, output.height);

            triggerDownload(output);

        } catch (error) {
            console.warn("js/save-credit.js: canvas-only capture failed.", error);
        }

    }

    // Captures the full visible screen — the planet render plus
    // all on-screen text/HUD (header, sign panel, coordinates,
    // instructions, tabs) — using html2canvas.
    function downloadScreenshot() {

        if (typeof html2canvas !== "function") {
            console.warn("js/save-credit.js: html2canvas not available, falling back to canvas-only capture.");
            downloadCanvasOnly();
            return;
        }

        html2canvas(document.body, {
            backgroundColor: "#000000",
            useCORS: true,
            scale: window.devicePixelRatio || 1,
            width: window.innerWidth,
            height: window.innerHeight,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            ignoreElements: function (el) {
                // Don't bake the credit popup itself into the shot.
                return el.id === "creditOverlay";
            }
        }).then(function (canvas) {
            triggerDownload(canvas);
        }).catch(function (error) {
            console.warn("js/save-credit.js: full-screen capture failed, falling back to canvas-only capture.", error);
            downloadCanvasOnly();
        });

    }

    function openCredits() {
        if (!creditOverlay) return;
        creditOverlay.classList.add("is-active");
        creditOverlay.setAttribute("aria-hidden", "false");
    }

    function closeCredits() {
        if (!creditOverlay) return;
        creditOverlay.classList.remove("is-active");
        creditOverlay.setAttribute("aria-hidden", "true");
    }

    // [H] HIDE — toggles every on-screen text/HUD/line element off
    // (via the "interface-hidden" body class in css/style.css),
    // leaving only the star render. downloadScreenshot() below
    // just captures document.body as it currently looks, so this
    // is also what makes SAVE grab a clean stars-only shot when
    // the interface is hidden, and the normal full shot when it's
    // not — no extra logic needed there.
    function toggleInterface() {

        const isHidden = document.body.classList.toggle("interface-hidden");

        if (hideButton) hideButton.setAttribute("aria-pressed", String(isHidden));
        if (hideButtonLabel) hideButtonLabel.textContent = isHidden ? "SHOW" : "HIDE";

    }

    if (hideButton) hideButton.addEventListener("click", toggleInterface);

    if (saveButton) saveButton.addEventListener("click", downloadScreenshot);
    if (creditButton) creditButton.addEventListener("click", openCredits);
    if (creditCloseBtn) creditCloseBtn.addEventListener("click", closeCredits);

    if (creditOverlay) {
        creditOverlay.addEventListener("click", function (event) {
            if (event.target === creditOverlay) closeCredits();
        });
    }

    window.addEventListener("keydown", function (event) {

        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        const key = event.key.toLowerCase();

        if (key === "s") downloadScreenshot();
        if (key === "h") toggleInterface();
        if (key === "c") openCredits();
        if (key === "escape" && creditOverlay && creditOverlay.classList.contains("is-active")) {
            closeCredits();
        }

    });

})();