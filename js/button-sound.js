(function () {

    const clickSound = new Audio("assets/sfx/click.mp3");
    const switchSound = new Audio("assets/sfx/click2.mp3");
    const hoverSound = new Audio("assets/sfx/hover.mp3");
    const typingSound = new Audio("assets/sfx/typing.mp3");
    clickSound.preload = "auto";
    switchSound.preload = "auto";
    hoverSound.preload = "auto";
    typingSound.preload = "auto";
    window.startTypingSound = function () {
        let stopped = false;

        function playFromRandomPosition() {
            if (stopped) return;

            const duration = typingSound.duration;
            typingSound.currentTime = Number.isFinite(duration) && duration > 0
                ? Math.random() * duration
                : 0;
            typingSound.play().catch(function (error) {
                console.warn("js/button-sound.js: could not play the typing sound.", error);
            });
        }

        typingSound.loop = true;

        if (typingSound.readyState >= 1) {
            playFromRandomPosition();
        } else {
            typingSound.addEventListener("loadedmetadata", playFromRandomPosition, { once: true });
            typingSound.load();
        }

        return function () {
            stopped = true;
            typingSound.removeEventListener("loadedmetadata", playFromRandomPosition);
            typingSound.pause();
            typingSound.currentTime = 0;
            typingSound.loop = false;
        };
    };

    document.addEventListener("pointerover", function (event) {
        const target = event.target.closest("button, .universe-body");

        if (!target || target.disabled || target.contains(event.relatedTarget)) return;

        hoverSound.currentTime = 0;
        hoverSound.play().catch(function (error) {
            console.warn("js/button-sound.js: could not play the hover sound.", error);
        });
    }, true);

    document.addEventListener("click", function (event) {
        const button = event.target.closest("button");

        if (!button || button.disabled || button.classList.contains("location-option")) return;

        const sound = button.matches(".planet-tab, .universe-body")
            ? switchSound
            : clickSound;

        sound.currentTime = 0;
        sound.play().catch(function (error) {
            console.warn("js/button-sound.js: could not play the button sound.", error);
        });
    }, true);

})();