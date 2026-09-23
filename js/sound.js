// ============================================================
// SOUND (p5.sound)
//
// space.mp3        — background ambience, loops on every page
//                     EXCEPT display.html
// sun/moon/asc.mp3  — display.html only, one per planet tab,
//                     crossfaded when the visitor switches tabs
//
// Kept separate from sketch.js on purpose: this file does not
// use p5's preload()/setup()/draw() lifecycle at all, so it can't
// interfere with anything sketch.js (or the landing-page
// constellation) is doing.
//
// Requires js/p5.js + js/addons/p5.sound.min.js to be loaded
// BEFORE this file on any page that should have sound.
//
// NOTE: this build of p5.sound is the new Tone.js-based rewrite,
// which changed the loading/playback API from older p5.sound:
//   - loadSound(path) takes ONLY a path and returns a Promise
//     that resolves with the p5.SoundFile once it's loaded
//     (there's no more success/error callback arguments).
//   - there's no setVolume()/isLoaded() anymore — volume fades
//     are done with amp(targetVolume, rampSeconds).
//   - loop(true) only sets the looping flag; you still have to
//     call play() (or start()) to actually start playback.
// ============================================================

(function () {

    const IS_DISPLAY_PAGE =
        document.body?.classList.contains("display-page") ?? false;

    const FADE_SECONDS = 1.5;

    const AMBIENCE_STORAGE_KEY = "sound:spaceAmbienceStartedAt";

    const sfx = {
        space: null,
        sun: null,
        moon: null,
        asc: null
    };

    let activeSfx = null;
    let loaded = 0;
    let toLoad = 0;
    let audioUnlocked = false;

    function planetKey(planet) {
        return planet === "ascendant" ? "asc" : planet;
    }

    function fadeIn(sound) {

        // sfx.* only ever gets set once its loadSound() promise has
        // resolved, so if it's non-null here it's ready to play.
        if (!sound) return;

        sound.amp(0, 0);
        sound.loop(true);
        sound.play();
        sound.amp(1, FADE_SECONDS);

    }

    function fadeOut(sound) {

        if (!sound || !sound.isPlaying()) return;

        sound.amp(0, FADE_SECONDS);

        setTimeout(function () {
            sound.stop();
        }, FADE_SECONDS * 1000 + 50);

    }

    function crossfadeTo(sound) {

        if (!sound || sound === activeSfx) return;

        fadeOut(activeSfx);
        fadeIn(sound);

        activeSfx = sound;

    }

    // Starts the space ambience on a non-display page, resuming from
    // where it "should" be if it's already been playing earlier this
    // session (see AMBIENCE_STORAGE_KEY above), instead of always
    // fading in from the beginning.
    function startAmbience(sound) {

        if (!sound || sound === activeSfx) return;

        const startedAtRaw = sessionStorage.getItem(AMBIENCE_STORAGE_KEY);
        const duration = sound.duration();

        if (startedAtRaw && duration > 0) {

            const elapsed = (Date.now() - Number(startedAtRaw)) / 1000;
            const position = elapsed % duration;

            sound.loop(true);
            sound.amp(1, 0);
            sound.play();
            sound.jump(position); // only takes effect once the source has started, hence the order

        } else {

            sessionStorage.setItem(AMBIENCE_STORAGE_KEY, String(Date.now()));
            fadeIn(sound);

        }

        activeSfx = sound;

    }

    // Only used for the very first sound on a page — once anything
    // is playing (e.g. the visitor jumped straight to a planet tab)
    // this is a no-op so it can't override their choice.
    function startDefault() {

        if (activeSfx) return;

        if (IS_DISPLAY_PAGE) {
            const activeTab = document.querySelector(".planet-tab.is-active");
            const planet = activeTab ? activeTab.dataset.planet : "sun";
            crossfadeTo(sfx[planetKey(planet)]);
        } else {
            startAmbience(sfx.space);
        }

    }

    function tryAutoStart() {

        if (loaded < toLoad || !audioUnlocked) return;

        startDefault();

    }

    function onFileLoaded(key, sound) {
        sfx[key] = sound;
        loaded++;
        tryAutoStart();
    }

    function onFileError(error) {
        console.error("js/sound.js: could not load an audio file.", error);
    }

    // Browsers block audio until the visitor has interacted with the
    // page. Try immediately, and otherwise wait for the first
    // click/keypress/tap anywhere on the page.
    function unlock() {

        if (audioUnlocked) return Promise.resolve();

        const context = getAudioContext();
        const resume = context.state === "running"
            ? Promise.resolve()
            : context.resume();

        return resume.then(function () {
            return userStartAudio();
        }).then(function () {
            audioUnlocked = true;
            tryAutoStart();
        }).catch(function (error) {
            console.error("js/sound.js: audio could not be unlocked.", error);
        });

    }

    function wireUpPlanetTabs() {

        document.querySelectorAll(".planet-tab").forEach(function (tab) {
            tab.addEventListener("click", function () {
                unlock().then(function () {
                    crossfadeTo(sfx[planetKey(tab.dataset.planet)]);
                });
            });
        });

    }

    // loadSound() in this build takes only a path and returns a
    // Promise that resolves with the loaded p5.SoundFile.
    function loadFile(key, path) {
        loadSound(path)
            .then(function (sound) {
                onFileLoaded(key, sound);
            })
            .catch(onFileError);
    }

    function loadFiles() {

        if (IS_DISPLAY_PAGE) {

            toLoad = 3;
            loadFile("sun", "assets/sfx/sun.mp3");
            loadFile("moon", "assets/sfx/moon.mp3");
            loadFile("asc", "assets/sfx/asc.mp3");

        } else {

            toLoad = 1;
            loadFile("space", "assets/sfx/space.mp3");

        }

    }

    function init() {

        loadFiles();

        if (IS_DISPLAY_PAGE) {
            wireUpPlanetTabs();
        }

        if (getAudioContext().state === "running") {
            audioUnlocked = true;
            tryAutoStart();
        } else {
            ["click", "keydown", "touchstart"].forEach(function (evt) {
                document.addEventListener(evt, function () {
                    unlock();
                }, { once: true });
            });
        }

    }

    // Wait until p5.sound's globals actually exist before doing
    // anything — avoids relying on exact <script> load timing.
    function whenReady(attemptsLeft) {

        if (typeof loadSound === "function" && typeof userStartAudio === "function") {
            init();
            return;
        }

        if (attemptsLeft <= 0) {
            console.warn("js/sound.js: p5.sound never became available — is js/addons/p5.sound.min.js loaded on this page?");
            return;
        }

        setTimeout(function () {
            whenReady(attemptsLeft - 1);
        }, 50);

    }

    whenReady(100); // ~5s before giving up

})();