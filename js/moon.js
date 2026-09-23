// ============================================================
// MOON.JS
// ------------------------------------------------------------
// Builds the Moon visual as a point-cloud particle body, in the
// same family as the Sun's particle sphere in main.js, rather
// than a single textured mesh.
//
// SHADOW / ECLIPSE BEHAVIOUR
// The dark "shadow" is a genuinely SEPARATE object — a dark circle
// (`moonShadowMesh`) that lives at a FIXED position in world space,
// between the moon and the camera's starting side. It is a real
// object in the scene, not a screen-space overlay, so:
//   - It is NOT pinned to the camera. Orbiting the camera makes it
//     slide across the moon (parallax), so the moon looks different
//     from every angle instead of always wearing the same cut.
//   - It only hides the moon when the camera, the disc and the moon
//     line up. Away from that alignment the moon is fully visible;
//     as it approaches alignment the disc eclipses more and more of
//     the moon, and at exact alignment it covers it.
//   - It is depth-tested against the moon body, so it only ever
//     hides what is actually behind it (never anything in front).
//   - Only its facing is billboarded (it always turns its flat face
//     to the camera so it reads as a perfect circle); its POSITION
//     never depends on the camera.
//
// LIGHT SOURCE FLARE
// A bright starburst (`lightFlarePoints`) marks where the light is
// coming from — built as a point cloud, the same family as the moon
// body and halo, rather than a shader plane. It is NOT parented to
// `moonGroup`, so the moon's own spin never moves it. Instead, like
// the shadow disc, its position is recomputed every frame from the
// camera's own right/up axes and held at a fixed clock-face spot
// off the moon (2 o'clock by default — see STAR_CONFIG), so it
// visually stays put at that spot as the camera orbits.
//   - It's nudged slightly AWAY from the camera (the opposite of the
//     shadow disc's bias toward the camera), so where it overlaps
//     the moon body, the moon's own particle depth can occlude it —
//     the same "further away is the light, closer to camera is the
//     shadow" relationship, just anchored to a fixed screen spot
//     instead of a fixed point in space.
//
// CRATERED, ROCKY SURFACE
// The moon is a hollow SHELL of particles (not a filled ball), built
// once at load from a seeded crater field (same craters every load):
// hundreds of craters of every size (many small, few huge), each with
// a depressed dark floor and a raised bright rim, like the ink-drawn
// moon in the reference. Particles are placed by rejection sampling,
// so rims come out densely packed (bright rings) and floors sparse
// (dark pits). The far hemisphere is culled in the shader so the moon
// reads as a solid rocky body. Toward the silhouette the surface is
// seen edge-on, so particles pile up (denser) and are also boosted in
// brightness and size (shinier), while the face turned toward the
// camera stays dim.
//
// SURFACE ROUGHNESS
// Each particle's distance from the moon's centre is perturbed
// once (on the CPU, at build time) by a small 3D value-noise bump,
// so the body isn't a perfect sphere — the point cloud itself
// reads as pitted/uneven. On top of that, a per-frame GPU simplex
// noise field ("granulation") darkens/brightens patches of the
// surface slightly, adding fine, softly shifting surface grain.
//
// STRAY PARTICLE FIELD
// A second, sparser swarm of particles ("moonHalo") orbits loosely
// around the body — denser close in, thinning with distance,
// twinkling and drifting — separate from the static deep-space
// starfield behind everything. It spins slowly on its own axis,
// independent of the moon's own spin, for a bit of parallax.
// ============================================================

import * as THREE from "https://unpkg.com/three@0.185.1/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.185.1/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/OutputPass.js";

console.log("Moon module is working!");

// ============================================================
// SECTION: GLOBAL SETTINGS
// ------------------------------------------------------------
const BLOOM_STRENGTH = 0.16;

const MOON_RADIUS = 1.6;

// Slow, constant spin applied to the moon body itself (on top of
// whatever the user does with OrbitControls), so craters keep
// creeping into/out of the fixed shadow disc over time.
const MOON_SPIN_SPEED = 0.0009;

// The stray/halo swarm spins independently of the moon body, at
// its own (slightly different) rate, so it drifts past the body
// rather than rotating rigidly with it — a small bit of parallax.
const HALO_SPIN_SPEED = -0.00045;

// Where the light "sun" sits, in fixed WORLD space (not attached
// to the moon group) — this is what lets orbiting the camera
// actually change how much of the lit face you see, same as a
// real moon phase. Only its direction from the origin matters.
const LIGHT_DIRECTION = new THREE.Vector3(3.2, 2.4, 2.6).normalize();

// ============================================================
// SECTION: MOON BODY CONFIG
// ------------------------------------------------------------
const MOON_CONFIG = {

    particleCount: 450000,

    radius: MOON_RADIUS,

    // Radius perturbation (fraction of radius) that gives the
    // body a pitted, uneven surface instead of a perfect sphere.
    roughFreqLow: 1.6,
    roughFreqHigh: 5.5,
    roughAmp: 0.018,

    // Fraction of particles pulled inward off the shell. Kept at 0:
    // the moon is now a surface shell, so the limb is naturally dense
    // (a shell seen edge-on stacks many particles per pixel) and the
    // craters read crisply instead of being buried in a filled volume.
    interiorRatio: 0.0,

    sizeSmall: 0.22,
    sizeMedium: 0.75,
    sizeBig: 1.05,
    smallChance: 0.68,
    mediumChance: 0.25,

    uSize: 0.5,
    sizeScale: 18,

    color: [1.0, 1.0, 1.0],

    // Baseline brightness floor so the surface never goes fully
    // flat/blown-out white — the shadow disc (a separate object,
    // see below) is what actually creates the dark side now.
    baseBrightness: 1.0,

    // Brightness at the silhouette edge vs. at the core (the face
    // turned toward the camera). The edge is much brighter, the core
    // stays dim.
    rimBrightness: 2.6,
    coreDarken: 0.28,
    // Limb window, from 0 (surface facing the camera) to 1 (exactly
    // edge-on). The brightening ramps up gradually from rimStart to
    // rimEnd and is shaped by rimPower (higher = stays dim longer and
    // only lights up right at the edge).
    rimStart: 0.12,
    rimEnd: 0.92,
    rimPower: 1.8,
    // Opacity of the particles on the face turned toward the camera
    // (1 = fully opaque). Dim core particles used to be dim AND
    // transparent, so the black background showed through the gaps;
    // keeping them opaque makes the core read as a solid surface.
    // (Brightness is still controlled by coreDarken.)
    coreOpacity: 1.0,
    // Extra particle size on the camera-facing side (0.8 = up to 80%
    // bigger), so neighbouring core particles overlap and close the
    // gaps between them.
    coreSizeBoost: 0.8,

    // Extra particle size at the very edge (0.5 = up to 50% bigger),
    // so the limb also looks denser and shinier.
    limbSizeBoost: 0.5,

    // Per-frame surface granulation (fine light/dark grain).
    granulationScale: 2.6,
    granulationSpeed: 0.03,
    darkPatchIntensity: 0.75,

    // Small organic breathing/drift so the body doesn't look
    // perfectly frozen, echoing the sun's particle body.
    breathAmount: 0.008,
    breathSpeed: 0.35,
    movementAmount: 0.003
};

// ============================================================
// SECTION: CRATER CONFIG
// ------------------------------------------------------------
// Controls the procedural crater field baked into the moon body.
// ============================================================
const CRATER_CONFIG = {

    // Seed for the crater layout — change it for a different moon.
    seed: 7,

    // Number of craters and their angular radius range (radians, as
    // seen from the moon's centre). Sizes follow a power law, so
    // there are many small craters and only a few big ones.
    count: 270,
    minRadius: 0.068,
    maxRadius: 0.26,

    // How evenly craters are spread over the moon. Candidates = how
    // many random spots are tried per crater (higher = more even, 1 =
    // fully random). Spacing = how much of each crater's size counts
    // as personal space (lower lets them overlap more).
    placementCandidates: 14,
    placementSpacing: 0.95,

    // Relief, as a multiple of a natural crater profile. Raises the
    // floors / rims so the silhouette and surface look rocky.
    depthScale: 0.4,

    // Density of particles per surface type (0..1 = probability a
    // random spot keeps a particle). The surface is packed almost
    // solid; crater floors are carved out to near-empty, so the
    // craters read as BLACK pits rather than outlines of particles.
    baseDensity: 0.92,
    // Rims are now THINNER than the surrounding rock (negative = fewer
    // particles on the rim ring), so a crater outline is never denser
    // than its inside or the terrain around it.
    rimDensityBoost: -0.4,
    ejectaDensityBoost: 0.0,

    // Crater floors are filled with SPARSE, CLUMPED particles: most of
    // the floor stays black, with small dense patches of particles
    // scattered through it (rather than an even thin sprinkle).
    //   floorClumpDensity - how packed a clump is (0..1)
    //   floorGapDensity   - how many stray particles sit in the black
    //                       gaps between clumps (0 = perfectly black)
    //   floorClumpFreq    - clump frequency (higher = smaller clumps)
    //   floorClumpLow/High- noise thresholds; raise them for fewer,
    //                       smaller clumps (more black), lower for more
    floorClumpDensity: 0.9,
    floorGapDensity: 0.09,
    floorClumpFreq: 34,
    floorClumpLow: 0.47,
    floorClumpHigh: 0.62,

    // Optional: hide floor particles where the floor faces the camera
    // (0 = never hide, 1 = fully hide face-on, showing them only near
    // the edge). Off now that floors are filled on purpose.
    pitHideAmount: 0.0,
    pitHideStart: 0.28,
    pitHideEnd: 0.5,

    // Brightness (shade) per surface type. Floors that still hold a
    // few particles are also dimmed, so they fade into the black.
    baseShade: 0.7,
    // 0 = rim no brighter than the rock around it (negative dims it).
    rimShadeBoost: 0.0,
    ejectaShadeBoost: 0.15,
    floorShadeCut: 0.5,

    // Big soft dark regions ("seas") that are smoother and dimmer.
    seaFrequency: 1.3,
    seaThresholdLow: 0.52,
    seaThresholdHigh: 0.66,
    seaDensityCut: 0.15,
    seaShadeCut: 0.3

};

// ============================================================
// SECTION: SHADOW DISC CONFIG
// ------------------------------------------------------------
// The shadow is a dark, camera-facing circle placed at a fixed spot
// in WORLD space between the moon and the camera's start position.
// See the SHADOW / ECLIPSE BEHAVIOUR note at the top of this file.
// ============================================================
const SHADOW_CONFIG = {

    // Radius of the disc in world units. Big enough that, at exact
    // alignment, it fully covers the moon as seen from the default
    // camera distance.
    radius: 1.0,

    // Where the disc sits, in world space, relative to the moon's
    // centre. The camera starts on the +Z axis, so the disc is
    // placed on the +Z side ("towards the screen").
    //   distance     - how far in front of the moon (world units)
    //   azimuthDeg   - angle around the moon's vertical axis, from
    //                  the +Z axis. 0 = dead ahead of the starting
    //                  camera (fully hides the moon at the start),
    //                  positive = towards the right of the screen.
    //   elevationDeg - angle above/below the moon's equator. Keep 0
    //                  if you want the auto-orbit to pass through
    //                  perfect alignment; raise it to make the disc
    //                  only ever partly overlap during auto-orbit
    //                  (you can still line it up by dragging).
    distance: 3.0,
    azimuthDeg: 35,
    elevationDeg: 0,

    // Softness of the disc's outer edge, as a fraction of its own
    // radius (0 = razor hard edge, higher = fuzzier falloff).
    edgeSoftness: 0.2,

    // Match the black background so the disc reads as a dark hole.
    color: [0.0, 0.0, 0.0]

};

// ============================================================
// SECTION: LIGHT SOURCE FLARE CONFIG
// ------------------------------------------------------------
// A bright "sun" starburst, built the same way as the moon body and
// halo — a point cloud, not a shader plane — so it matches the rest
// of the scene's particle look. Unlike the moon and halo, it is kept
// screen-locked: its position is recomputed every frame from the
// camera's own right/up axes (the same technique `updateShadowDisc`
// uses for the shadow disc), pinned at a fixed clock-face direction
// off the moon so it visually stays put at that spot as you orbit,
// rather than drifting the way a true fixed-world-space point would.
// ------------------------------------------------------------
const STAR_CONFIG = {

    // Clock-face direction off the moon's centre, measured clockwise
    // from 12 o'clock (0 = straight up, 90 = 3 o'clock, etc).
    // 60 degrees = 2 o'clock.
    clockAngleDeg: 60,

    // How far from the moon's centre the star sits, in the camera's
    // screen-facing plane, as a fraction of MOON_RADIUS. Just over 1
    // so its core sits right at the moon's silhouette edge (as seen
    // on screen, the moon's outline is at exactly 1x MOON_RADIUS)
    // rather than inside the visible surface.
    offsetFraction: 1.12,

    // How far behind the moon (away from the camera, along the view
    // direction) the star is nudged, as a fraction of MOON_RADIUS —
    // the opposite of the shadow disc's forward bias, so the moon's
    // own particles can occlude the star where the two overlap.
    forwardBiasFraction: 0.45,

    color: [1.0, 0.97, 0.85],

    // Dense bright cluster of particles at the very centre of the star.
    coreCount: 380,
    coreRadiusFraction: 0.22,
    coreSizeBig: 4.6,
    coreSizeSmall: 1.0,

    // Radiating spike arms, each a cluster of particles that thins
    // out and shrinks toward the tip. Cardinal arms (0/90/180/270)
    // are drawn long, reaching well across the screen like the ray
    // crossing the whole reference image; the diagonal arms are
    // shorter, rounding out the star shape.
    particlesPerArm: 240,
    spikeAngles: [0, 90, 180, 270, 45, 135, 225, 315],
    mainSpikeLengthFraction: 9.0,
    diagSpikeLengthFraction: 2.4,
    mainSpikeWidthRad: 0.035,
    diagSpikeWidthRad: 0.08,
    spikeDensityPower: 2.0,
    mainSizeBig: 2.8,
    mainSizeSmall: 0.2,
    diagSizeBig: 2.0,
    diagSizeSmall: 0.2,

    uSize: 0.42,
    sizeScale: 18,
    alphaMult: 1.0,

    twinkleSpeed: 1.4

};

// ============================================================
// SECTION: STRAY PARTICLE FIELD CONFIG
// ------------------------------------------------------------
const HALO_CONFIG = {

    count: 6000,

    color: [0.85, 0.88, 1.0],

    innerRadiusMult: 1.2,
    outerRadiusMult: 4.5,
    falloffPower: 2.4,

    sizeSmall: 2.0,
    sizeMedium: 3.4,
    sizeBig: 5.2,
    smallChance: 0.6,
    mediumChance: 0.32,

    brightnessMin: 0.1,
    brightnessMax: 0.85,

    uSize: 0.4,
    sizeScale: 20,
    alphaMult: 0.55,

    driftAmount: 0.04,

    twinkleSpeed: 0.6
};

// ============================================================
// SECTION: STARFIELD SETTINGS
// ------------------------------------------------------------
const STAR_COUNT = 3600;
const STAR_INNER_RADIUS = 14;
const STAR_OUTER_RADIUS = 30;

// ============================================================
// SECTION: CONTAINER / SCENE / CAMERA / RENDERER / CONTROLS
// ------------------------------------------------------------
const container = document.getElementById("moon-container");
const isUniversePreview = document.body.classList.contains("flow-page");

// How far back the universe-screen camera sits (display page uses 1.9).
// css/style.css scales the moon canvas by 1.22 * UNIVERSE_FIT_FACTOR / 1.9
// so the moon still looks the same size on the universe screen.
const UNIVERSE_FIT_FACTOR = 2.6;

// Universe screen only: fraction of the moon's surface particles drawn
// (lower = bigger black gaps) and how strong the glow is (lower = the gaps
// stay black instead of being washed out).
const UNIVERSE_BODY_KEEP = 0.3;
const UNIVERSE_BLOOM_STRENGTH = 0.06;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.01,
    1000
);

camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
});

renderer.setClearColor(0x000000, 0);

// ------------------------------------------------------------
// RENDER RESOLUTION (universe screen)
// ------------------------------------------------------------
// The universe screen shows this canvas enlarged with a CSS
// `transform: scale(...)`. Stretching a small canvas made the moon
// blurry and its particles sparse, so render at the size it is
// actually shown at: multiply the pixel ratio by the CSS scale and
// tell the shaders (uPointScale) so particles keep their intended
// on-screen size. Same approach as js/main.js for the Sun.
// ------------------------------------------------------------
const MAX_RENDER_PIXEL_RATIO = 4;

function getCssScale() {
    if (!isUniversePreview) return 1;
    try {
        const m = new DOMMatrix(getComputedStyle(container).transform);
        const s = Math.hypot(m.a, m.b);
        return s > 0.01 ? s : 1;
    } catch (error) {
        return 1;
    }
}

function getRenderPixelRatio() {
    return Math.min(Math.min(window.devicePixelRatio, 2) * getCssScale(), MAX_RENDER_PIXEL_RATIO);
}

let renderPixelRatio = getRenderPixelRatio();
let pointScale = renderPixelRatio / Math.min(window.devicePixelRatio, 2);

// Smallest a particle is drawn on the universe screen (canvas pixels,
// 0 = no floor, as on the display page). At that small size most moon
// particles are under a pixel, which left gaps in the surface and made
// particles flicker; the floor makes them overlap and fill in.
function getMinDrawSize() {
    return isUniversePreview ? Math.max(pointScale * 0.6, 1.0) : 0.0;
}

renderer.setPixelRatio(renderPixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.enableRotate = !isUniversePreview;
controls.enableZoom = !isUniversePreview;
controls.minDistance = 2;
controls.maxDistance = 30;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

let baseCameraDistance = camera.position.length();

window.addEventListener("visual-zoom", (event) => {
    if (event.detail.planet !== "moon") return;
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).add(direction.multiplyScalar(baseCameraDistance / event.detail.zoom));
    controls.update();
});

// ============================================================
// SECTION: BLOOM (POST-PROCESSING)
// ------------------------------------------------------------
const composer = new EffectComposer(renderer);

composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    isUniversePreview ? UNIVERSE_BLOOM_STRENGTH : BLOOM_STRENGTH,
    0.4,
    0.7
);

composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ============================================================
// SECTION: CPU-SIDE VALUE NOISE
// ------------------------------------------------------------
function hash3(x, y, z) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return s - Math.floor(s);
}

function valueNoise3D(x, y, z) {

    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;

    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const interpolate = (a, b, t) => a + (b - a) * t;

    const c000 = hash3(xi, yi, zi),         c100 = hash3(xi + 1, yi, zi);
    const c010 = hash3(xi, yi + 1, zi),     c110 = hash3(xi + 1, yi + 1, zi);
    const c001 = hash3(xi, yi, zi + 1),     c101 = hash3(xi + 1, yi, zi + 1);
    const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);

    const x00 = interpolate(c000, c100, u), x10 = interpolate(c010, c110, u);
    const x01 = interpolate(c001, c101, u), x11 = interpolate(c011, c111, u);

    const y0 = interpolate(x00, x10, v), y1 = interpolate(x01, x11, v);

    return interpolate(y0, y1, w);
}

// ============================================================
// SECTION: SEEDED RANDOM + CRATER FIELD
// ------------------------------------------------------------
// mulberry32: small seeded PRNG so the crater layout (and the
// particle placement on it) is identical on every page load.
// ============================================================
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function smoothstep01(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------
// FUNCTION: buildCraterField(config, rand)
// ------------------------------------------------------------
// Scatters craters over the unit sphere. Each has a centre
// direction, an angular radius, a depth, a rim height and a
// "freshness" (young craters have brighter rims). Sorted big to
// small so small craters land on top of big ones' floors.
// ------------------------------------------------------------
const CRATER_GRID = 8;

function buildCraterField(config, rand) {

    const n = config.count;
    const list = [];

    const ratio = (config.minRadius / config.maxRadius) ** 2;

    // Sizes first (power law: N(>R) ~ R^-2), biggest first, so the big
    // craters claim their space and the small ones fit around them.
    const radii = [];
    for (let k = 0; k < n; k++) {
        radii.push(config.minRadius / Math.sqrt(1 - rand() * (1 - ratio)));
    }
    radii.sort((a, b) => b - a);

    // Even placement (best-candidate sampling): for each crater try
    // several random spots and keep the one with the most clearance
    // from the craters already placed. Pure random placement piles
    // craters up on one side and leaves big bare gaps on the other;
    // this keeps them spread evenly over the whole moon.
    const CANDIDATES = config.placementCandidates;

    for (let k = 0; k < n; k++) {

        const r = radii[k];
        let best = null;
        let bestScore = -Infinity;

        for (let t = 0; t < CANDIDATES; t++) {

            const u = rand() * 2 - 1;
            const th = rand() * Math.PI * 2;
            const sp = Math.sqrt(1 - u * u);
            const x = sp * Math.cos(th), y = u, z = sp * Math.sin(th);

            // Smallest gap (radians) between this crater's edge and any
            // placed crater's edge; negative = overlapping.
            let score = Infinity;
            for (let q = 0; q < list.length; q++) {
                const c = list[q];
                const d = x * c.x + y * c.y + z * c.z;
                const ang = Math.acos(d > 1 ? 1 : d < -1 ? -1 : d);
                const gap = ang - (c.r + r) * config.placementSpacing;
                if (gap < score) score = gap;
            }

            if (score > bestScore) {
                bestScore = score;
                best = { x, y, z };
            }

        }

        list.push({
            x: best.x, y: best.y, z: best.z,
            r,
            depth: 0.16 * r * config.depthScale,
            rimH: 0.06 * r * config.depthScale,
            fresh: 0.45 + rand() * 0.55,
            // How hollow the floor is: 1 = fully black pit, lower = a
            // shallow, partly filled crater.
            dark: 0.55 + rand() * 0.45
        });

    }

    list.sort((a, b) => b.r - a.r);

    const field = {
        n,
        cx: new Float32Array(n), cy: new Float32Array(n), cz: new Float32Array(n),
        cr: new Float32Array(n), cosReach: new Float32Array(n),
        depth: new Float32Array(n), rimH: new Float32Array(n), fresh: new Float32Array(n),
        dark: new Float32Array(n)
    };

    list.forEach((c, k) => {
        field.cx[k] = c.x; field.cy[k] = c.y; field.cz[k] = c.z;
        field.cr[k] = c.r;
        // Beyond 1.5x the crater radius nothing is affected.
        field.cosReach[k] = Math.cos(Math.min(Math.PI, c.r * 1.5));
        field.depth[k] = c.depth; field.rimH[k] = c.rimH; field.fresh[k] = c.fresh;
        field.dark[k] = c.dark;
    });

    // Speed-up: bucket craters into a coarse 3D grid so each sample
    // only tests the few craters that can actually reach its cell,
    // instead of every crater on the moon.
    const G = CRATER_GRID;
    const cell = 2 / G;
    const buckets = Array.from({ length: G * G * G }, () => []);

    for (let k = 0; k < n; k++) {

        const chord = 2 * Math.sin(Math.min(Math.PI / 2, field.cr[k] * 1.5 / 2));

        for (let ix = 0; ix < G; ix++) {
            const x0 = -1 + ix * cell, x1 = x0 + cell;
            const ex = Math.max(x0 - field.cx[k], 0, field.cx[k] - x1);
            for (let iy = 0; iy < G; iy++) {
                const y0 = -1 + iy * cell, y1 = y0 + cell;
                const ey = Math.max(y0 - field.cy[k], 0, field.cy[k] - y1);
                for (let iz = 0; iz < G; iz++) {
                    const z0 = -1 + iz * cell, z1 = z0 + cell;
                    const ez = Math.max(z0 - field.cz[k], 0, field.cz[k] - z1);
                    if (ex * ex + ey * ey + ez * ez <= chord * chord) {
                        buckets[(ix * G + iy) * G + iz].push(k);
                    }
                }
            }
        }

    }

    field.buckets = buckets.map((b) => Int32Array.from(b));

    return field;

}

// ------------------------------------------------------------
// FUNCTION: sampleCraterSurface(field, dx, dy, dz, out)
// ------------------------------------------------------------
// For one direction on the sphere, adds up every nearby crater's
// profile in `out`:
//   height - radial displacement (fraction of the moon radius)
//   rim    - 0..1, how much this spot is on a crater rim
//   floor  - 0..1, how much it is inside a crater floor
//   eject  - 0..1, how much it is in the bright ejecta blanket
// Profile by t = (angle from crater centre) / (crater radius):
//   t < ~0.9  : depressed floor   t ~ 1 : raised rim   t > 1 : ejecta
// ------------------------------------------------------------
function sampleCraterSurface(field, dx, dy, dz, out) {

    let height = 0, rim = 0, floor = 0, eject = 0;

    const G = CRATER_GRID;
    const gx = Math.min(G - 1, Math.floor((dx + 1) * 0.5 * G));
    const gy = Math.min(G - 1, Math.floor((dy + 1) * 0.5 * G));
    const gz = Math.min(G - 1, Math.floor((dz + 1) * 0.5 * G));
    const nearby = field.buckets[(gx * G + gy) * G + gz];

    for (let m = 0; m < nearby.length; m++) {

        const k = nearby[m];

        const dot = dx * field.cx[k] + dy * field.cy[k] + dz * field.cz[k];
        if (dot < field.cosReach[k]) continue;

        const ang = Math.acos(dot > 1 ? 1 : dot);
        const t = ang / field.cr[k];

        // Floor covers most of the crater with a fairly crisp edge, so
        // the pit is a clean dark disc bounded by its bright rim.
        const fl = (t < 0.95 ? 1 - smoothstep01(0.78, 0.95, t) : 0) * field.dark[k];
        const rd = (t - 0.98) / 0.09;
        const rm = Math.exp(-rd * rd) * field.fresh[k];
        const ej = t > 0.97 ? (1 - smoothstep01(0.97, 1.5, t)) * 0.6 * field.fresh[k] : 0;

        height += -field.depth[k] * fl + field.rimH[k] * rm + 0.15 * field.rimH[k] * ej;

        if (rm > rim) rim = rm;
        if (fl > floor) floor = fl;
        if (ej > eject) eject = ej;

    }

    out.height = height;
    out.rim = rim;
    out.floor = floor;
    out.eject = eject;

}

// ============================================================
// SECTION: MOON BODY BUILDER
// ------------------------------------------------------------
// FUNCTION: buildMoonBody(config)
// ------------------------------------------------------------
// Builds the moon's particle body procedurally. Most of the shading
// here is surface texture (granulation + a brightness floor); the
// main moon's occasional full eclipse still comes from the separate
// occluder disc built in buildShadowDisc() below/updateShadowDisc().
//
// PHASE SHADOW (config.shadowOffset / shadowRadius / shadowEdge /
// shadowFloor): an optional, separate per-particle darkening term
// used by the smaller phase "variants" (see the MOUSE INTERACTION
// section) to bake their crescent/gibbous shape directly into their
// own particles rather than covering them with a flat disc mesh. It
// reuses the exact two-circle-overlap test the old shadow disc used
// — a second circle of radius shadowRadius, offset by shadowOffset
// along the camera's right axis — but evaluates it per-particle in
// the vertex shader, against each particle's own (already bumped)
// surface position. That means the terminator comes out with the
// same slight irregularity as the rest of the cratered surface,
// instead of a perfectly smooth cutout edge, so the shadow reads as
// part of the rocky texture. Left unset (as on the main moon's own
// MOON_CONFIG), the shader defaults these to values that can never
// trigger, so the main body is unaffected.
// ============================================================
function buildMoonBody(config) {

    const count = config.particleCount;
    const cfgPitStart = CRATER_CONFIG.pitHideStart.toFixed(3);
    const cfgPitEnd = CRATER_CONFIG.pitHideEnd.toFixed(3);
    const cfgPitAmount = CRATER_CONFIG.pitHideAmount.toFixed(3);

    const positions = new Float32Array(count * 3);
    const originals = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const shades = new Float32Array(count);
    const pits = new Float32Array(count);

    const rand = mulberry32(CRATER_CONFIG.seed);
    const craterField = buildCraterField(CRATER_CONFIG, rand);
    const surf = { height: 0, rim: 0, floor: 0, eject: 0 };
    const cc = CRATER_CONFIG;

    let i = 0;
    let attempts = 0;
    const maxAttempts = count * 60;

    // Rejection sampling: pick a random direction, look up what kind
    // of terrain it is (crater rim / floor / ejecta / plain / sea) and
    // keep a particle there with a probability that matches — so rims
    // end up densely packed and floors sparse.
    while (i < count && attempts < maxAttempts) {

        attempts++;

        const u = rand() * 2 - 1;
        const theta = rand() * Math.PI * 2;
        const sinPhi = Math.sqrt(1 - u * u);

        const dx = sinPhi * Math.cos(theta);
        const dy = u;
        const dz = sinPhi * Math.sin(theta);

        sampleCraterSurface(craterField, dx, dy, dz, surf);

        // Big dim "sea" regions from very low-frequency noise.
        const seaNoise = valueNoise3D(
            dx * cc.seaFrequency + 11.3, dy * cc.seaFrequency + 4.7, dz * cc.seaFrequency + 8.1
        );
        const sea = smoothstep01(cc.seaThresholdLow, cc.seaThresholdHigh, seaNoise);

        const openFloor = surf.floor * (1 - surf.rim);

        let density = cc.baseDensity
            - cc.seaDensityCut * sea
            + cc.rimDensityBoost * surf.rim
            + cc.ejectaDensityBoost * surf.eject;
        density = Math.min(1, Math.max(0.01, density));

        // Inside a crater floor the density is replaced by a clumpy
        // pattern: dense patches separated by black gaps.
        if (openFloor > 0) {
            const f = cc.floorClumpFreq;
            const clumpNoise = valueNoise3D(dx * f + 3.1, dy * f + 9.4, dz * f + 6.2) * 0.65
                + valueNoise3D(dx * f * 2.3 + 1.7, dy * f * 2.3 + 5.5, dz * f * 2.3 + 2.9) * 0.35;
            const clump = smoothstep01(cc.floorClumpLow, cc.floorClumpHigh, clumpNoise);
            const floorDensity = cc.floorGapDensity + (cc.floorClumpDensity - cc.floorGapDensity) * clump;
            density = density + (floorDensity - density) * openFloor;
        }

        if (rand() > density) continue;

        let shade = (cc.baseShade - cc.seaShadeCut * sea) * (1 - cc.floorShadeCut * openFloor)
            + cc.rimShadeBoost * surf.rim
            + cc.ejectaShadeBoost * surf.eject;
        // Fine rocky speckle so no two neighbouring particles match.
        shade *= 0.8 + 0.4 * rand();
        shade = Math.min(2.0, Math.max(0.12, shade));

        const lowNoise = valueNoise3D(
            dx * config.roughFreqLow, dy * config.roughFreqLow, dz * config.roughFreqLow
        );
        const highNoise = valueNoise3D(
            dx * config.roughFreqHigh, dy * config.roughFreqHigh, dz * config.roughFreqHigh
        );

        const bump = ((lowNoise * 0.7 + highNoise * 0.3) * 2 - 1) * config.roughAmp;
        const shellRadius = config.radius * (1 + bump + surf.height);

        let px = dx * shellRadius;
        let py = dy * shellRadius;
        let pz = dz * shellRadius;

        if (rand() < config.interiorRatio) {
            const f = Math.cbrt(rand());
            px *= f;
            py *= f;
            pz *= f;
        }

        const index = i * 3;

        positions[index] = px;
        positions[index + 1] = py;
        positions[index + 2] = pz;

        originals[index] = px;
        originals[index + 1] = py;
        originals[index + 2] = pz;

        phases[i] = rand() * Math.PI * 2;
        randoms[i] = rand();
        shades[i] = shade;
        pits[i] = openFloor;

        const sizeRoll = rand();
        let size;
        if (sizeRoll < config.smallChance) {
            size = config.sizeSmall;
        } else if (sizeRoll < config.smallChance + config.mediumChance) {
            size = config.sizeMedium;
        } else {
            size = config.sizeBig;
        }
        // Rim particles are slightly smaller so the ring stays subtle.
        baseSizes[i] = size * (1.0 - 0.2 * surf.rim);

        i++;

    }

    // If sampling somehow ran out of attempts, hide the unused slots
    // instead of leaving stray particles at the origin.
    for (; i < count; i++) {
        shades[i] = 0;
        baseSizes[i] = 0;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("originalPosition", new THREE.BufferAttribute(originals, 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("rand", new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSizes, 1));
    geometry.setAttribute("shade", new THREE.BufferAttribute(shades, 1));
    geometry.setAttribute("pit", new THREE.BufferAttribute(pits, 1));

    const material = new THREE.ShaderMaterial({

        transparent: true,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NormalBlending,

        uniforms: {
            uTime: { value: 0 },
            uSize: { value: config.uSize },
            uPointScale: { value: pointScale },
            uMinDrawSize: { value: getMinDrawSize() },
            // Share of the moon's particles that are drawn (1 = all). The
            // universe screen thins the surface so black gaps show between
            // particles, like the Sun next to it.
            uKeep: { value: isUniversePreview ? UNIVERSE_BODY_KEEP : 1.0 },
            uColor: { value: new THREE.Vector3(...config.color) },
            // Mouse-press interaction (see "SECTION: MOUSE INTERACTION"
            // further down). uCoreBoost multiplies only the core term of
            // the core->rim mix, so holding the mouse down dims just the
            // camera-facing face while the limb keeps glowing. uGlobalBoost
            // multiplies the final brightness of the WHOLE body and is
            // pulsed on release, then eases back down to 1.
            uCoreBoost: { value: 1.0 },
            uGlobalBoost: { value: 1.0 },
            // Whole-object fade multiplier — 1.0 for the main moon
            // always; phase variants ease this 0 -> 1 on entrance and
            // 1 -> 0 on exit for a smooth materialise/dissolve instead
            // of a size pop.
            uOpacity: { value: 1.0 },
            // Per-particle phase shadow (see the shader comment). Left
            // undefined on the main moon's own config, so these fall
            // back to values that never trigger: an offset far outside
            // any particle's reach, and a zero radius.
            uShadowOffset: { value: config.shadowOffset !== undefined ? config.shadowOffset : 1e6 },
            uShadowRadius: { value: config.shadowRadius !== undefined ? config.shadowRadius : 0.0 },
            uShadowEdge: { value: config.shadowEdge !== undefined ? config.shadowEdge : config.radius * 0.06 },
            // Floor brightness multiplier on the dark side — kept just
            // above 0 (rather than a hard 0) so the shadowed particles
            // still read as part of the rocky surface, faintly, instead
            // of vanishing into flat black.
            uShadowFloor: { value: config.shadowFloor !== undefined ? config.shadowFloor : 0.045 }
        },

        vertexShader: `

            uniform float uTime;
            uniform float uSize;
            uniform float uPointScale;
            uniform float uMinDrawSize;
            uniform float uKeep;
            uniform float uCoreBoost;
            uniform float uGlobalBoost;

            // Phase shadow, baked directly into the particles instead of
            // a separate disc mesh laid over the top (see "PHASE SHADOW"
            // note above buildMoonBody). uShadowOffset/uShadowRadius are
            // the same two-circle-overlap terms the old shadow disc used
            // (view-space X distance from the moon's centre to the
            // shadow circle's centre, and that circle's radius); with no
            // per-variant shadow configured these default to values that
            // never trigger, so the main moon body is unaffected.
            uniform float uShadowOffset;
            uniform float uShadowRadius;
            uniform float uShadowEdge;
            uniform float uShadowFloor;

            attribute vec3 originalPosition;
            attribute float phase;
            attribute float rand;
            attribute float baseSize;
            attribute float shade;
            attribute float pit;

            varying float vIntensity;
            varying float vAlpha;

            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {

                const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);

                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);

                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;

                i = mod289(i);
                vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;

                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);

                vec4 x = x_ * ns.x + ns.yyyy;
                vec4 y = y_ * ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);

                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);

                vec4 s0 = floor(b0) * 2.0 + 1.0;
                vec4 s1 = floor(b1) * 2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));

                vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);

                vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;

                vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
                m = m * m;

                return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));

            }

            void main() {

                vec3 pos = originalPosition;

                float breath = sin(uTime * ${config.breathSpeed.toFixed(2)} + phase);
                pos *= 1.0 + breath * ${config.breathAmount.toFixed(4)};

                pos.x += sin(uTime * 0.5 + originalPosition.y * 3.0 + phase) * ${config.movementAmount.toFixed(4)};
                pos.y += cos(uTime * 0.45 + originalPosition.x * 2.4 + phase) * ${config.movementAmount.toFixed(4)};
                pos.z += sin(uTime * 0.55 + originalPosition.x * 2.4 + phase) * ${config.movementAmount.toFixed(4)};

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

                float granField = snoise(
                    originalPosition * ${config.granulationScale.toFixed(3)}
                    + vec3(0.0, 0.0, uTime * ${config.granulationSpeed.toFixed(4)})
                );
                float granulation = granField * 0.5 + 0.5;
                float roughShade = mix(${config.darkPatchIntensity.toFixed(3)}, 1.0, granulation);

                // View-dependent rim term (a per-particle Fresnel), not a
                // 3D-radius threshold: most particles actually sit near the
                // outer shell already (the volume-uniform distribution used
                // to build the body concentrates points there), so keying
                // brightness off raw distance-from-centre lit up nearly the
                // whole sphere. Instead compare each particle's outward
                // direction against the direction back to the camera — that
                // ratio is near 1 only where the surface is turned edge-on
                // to the camera, i.e. the true silhouette limb, and near 0
                // on the face turned toward the viewer, regardless of how
                // many particles happen to share that 3D radius.
                //
                // Computed from the STABLE, unperturbed originalPosition
                // (only carried through the model/view rotation, not the
                // breathing/drift jitter above) — using the jittered pos
                // here made each particle's limb value wobble a little
                // every frame, which with the high rim/core contrast read
                // as flicker. The rendered position (mvPosition) still uses
                // the jittered pos, so the organic drift is unaffected.
                vec4 mvOriginal = modelViewMatrix * vec4(originalPosition, 1.0);
                vec3 centerView = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                vec3 viewOffset = mvOriginal.xyz - centerView;
                vec3 radialDir = normalize(viewOffset);
                vec3 viewDir = normalize(-mvOriginal.xyz);

                // PHASE SHADOW, per-particle: the exact same two-circle
                // trick the old shadow disc used (a second circle of
                // radius uShadowRadius, offset by uShadowOffset along the
                // camera's right axis in view space; where a particle
                // falls inside it, it's on the dark side), just evaluated
                // per-particle instead of drawn as a flat mesh laid over
                // the body. Because it reads each particle's own bumped
                // surface position (not a perfect sphere), the terminator
                // comes out slightly irregular/grainy like the rest of
                // the cratered surface, rather than a razor-smooth cutout
                // edge -- it reads as baked into the particles.
                float shadowDist = length(vec2(viewOffset.x - uShadowOffset, viewOffset.y));
                float shadowLit = smoothstep(uShadowRadius - uShadowEdge, uShadowRadius + uShadowEdge, shadowDist);
                float shadowMul = mix(uShadowFloor, 1.0, shadowLit);

                // How much this bit of surface faces the camera:
                // +1 = looking straight at it, 0 = edge-on (the limb),
                // negative = on the far side of the moon.
                float facing = dot(radialDir, viewDir);

                if (rand > uKeep) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    gl_PointSize = 0.0;
                    vIntensity = 0.0;
                    vAlpha = 0.0;
                    return;
                }

                // Cull the far hemisphere so the moon reads as a solid
                // rocky body instead of a see-through cloud. A small
                // margin keeps the true limb particles.
                if (facing < -0.03) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    gl_PointSize = 0.0;
                    vIntensity = 0.0;
                    vAlpha = 0.0;
                    return;
                }

                // Crater-floor particles fade out where they face the
                // camera (a black pit) and reappear toward the limb.
                float hidden = pit * ${cfgPitAmount} * smoothstep(
                    ${cfgPitStart},
                    ${cfgPitEnd},
                    facing
                );
                if (hidden > 0.98) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    gl_PointSize = 0.0;
                    vIntensity = 0.0;
                    vAlpha = 0.0;
                    return;
                }

                float limb = 1.0 - max(facing, 0.0);

                // Gradual ramp toward the edge, shaped by rimPower so
                // the middle stays dim and only the outer band lights.
                float edgeFactor = pow(
                    smoothstep(
                        ${config.rimStart.toFixed(3)},
                        ${config.rimEnd.toFixed(3)},
                        limb
                    ),
                    ${config.rimPower.toFixed(3)}
                );

                // Dim core -> bright rim. Only the core side of the mix is
                // scaled by uCoreBoost, so pressing the mouse down dims the
                // core while edgeFactor -> 1 at the limb stays untouched
                // (the rim keeps glowing).
                float rimMix = mix(${config.coreDarken.toFixed(3)} * uCoreBoost, 1.0 + ${config.rimBrightness.toFixed(3)}, edgeFactor);

                // "shade" carries the baked crater/rock detail (bright
                // rims, dark floors), so craters show at every angle.
                // uGlobalBoost scales the whole body (core AND rim) and is
                // pulsed on mouse release for a brightness flash.
                vIntensity = ${config.baseBrightness.toFixed(3)} * roughShade * rimMix * shade * (1.0 - hidden) * uGlobalBoost * shadowMul;

                // Opacity is kept separate from brightness: a dim core
                // particle is still opaque, so the core has no gaps.
                vAlpha = mix(${config.coreOpacity.toFixed(3)}, 1.0, edgeFactor) * (1.0 - hidden);

                float perspectiveSize = uSize * baseSize * (${config.sizeScale.toFixed(1)} / -mvPosition.z);

                // Particles get bigger right at the edge -> denser, shinier limb.
                perspectiveSize *= 1.0 + ${config.limbSizeBoost.toFixed(3)} * edgeFactor;

                // Camera-facing particles are bigger too, so they overlap
                // and close the gaps across the core.
                perspectiveSize *= 1.0 + ${config.coreSizeBoost.toFixed(3)} * max(facing, 0.0);

                gl_PointSize = max(clamp(perspectiveSize, 0.03, 14.0) * uPointScale, uMinDrawSize);

                gl_Position = projectionMatrix * mvPosition;
            }

        `,

        fragmentShader: `

            uniform vec3 uColor;
            uniform float uOpacity;

            varying float vIntensity;
            varying float vAlpha;

            void main() {

                vec2 uv = gl_PointCoord - vec2(0.5);
                float distanceFromCenter = length(uv);

                float circle = 1.0 - smoothstep(0.34, 0.5, distanceFromCenter);

                if (circle < 0.01) discard;

                gl_FragColor = vec4(uColor * vIntensity, circle * vAlpha * uOpacity);

            }

        `

    });

    const points = new THREE.Points(geometry, material);
    points.name = "MOON_BODY";

    return { points, material };

}

// ============================================================
// SECTION: SHADOW DISC BUILDER
// ------------------------------------------------------------
// FUNCTION: buildShadowDisc(config)
// ------------------------------------------------------------
// A flat circle that always turns its face to the camera (so it
// reads as a perfect circle from any angle) but sits at a fixed
// WORLD position. It is depth-tested and writes depth, so it hides
// only what is genuinely behind it — the moon body when aligned —
// and anything drawn later that is nearer the camera (e.g. stray
// halo particles floating in front of it) still shows on top.
// Positioning is set once in the build section below; only its
// facing is updated per frame in updateShadowDisc().
// ============================================================
function buildShadowDisc(config) {

    const geometry = new THREE.CircleGeometry(1, 96);

    const material = new THREE.ShaderMaterial({

        transparent: true,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NormalBlending,

        uniforms: {
            uColor: { value: new THREE.Vector3(...config.color) },
            uSoftness: { value: config.edgeSoftness },
            // 1.0 for the main moon's shadow always; phase variants'
            // shadow discs fade in lockstep with their sphere's
            // uOpacity so the combined crescent shape materialises
            // together instead of the shadow snapping in at full
            // strength and briefly showing a hard edge.
            uOpacity: { value: 1.0 }
        },

        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,

        fragmentShader: `
            uniform vec3 uColor;
            uniform float uSoftness;
            uniform float uOpacity;
            varying vec2 vUv;

            void main() {
                float dist = length(vUv - vec2(0.5)) * 2.0;
                float alpha = 1.0 - smoothstep(1.0 - uSoftness, 1.0, dist);
                if (alpha < 0.02) discard;
                gl_FragColor = vec4(uColor, alpha * uOpacity);
            }
        `

    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "MOON_SHADOW";
    // Drawn after the moon body so it can cover it; the halo is
    // drawn after it (see renderOrder on haloPoints) and, being
    // depth-tested, only shows where it is nearer than the disc.
    mesh.renderOrder = 10;

    return mesh;

}

// ============================================================
// SECTION: LIGHT SOURCE FLARE BUILDER
// ------------------------------------------------------------
// FUNCTION: buildLightFlare(config, bodyRadius)
// ------------------------------------------------------------
// Builds the star as a point cloud, the same family as the moon
// body and halo: a dense bright cluster at the centre plus a set of
// radiating "spike" arms, each a cluster of particles that thins out
// and shrinks toward its tip (cardinal arms drawn long, diagonal
// arms shorter, rounding out the star shape — see STAR_CONFIG).
// All particle positions are built once, in a local XY plane; the
// whole group is repositioned and billboarded toward the camera
// every frame in updateLightFlare(), the same way the shadow disc
// is — see the LIGHT SOURCE FLARE note at the top of this file.
// ------------------------------------------------------------
function buildLightFlare(config, bodyRadius) {

    const coreCount = config.coreCount;
    const armCount = config.spikeAngles.length;
    const perArm = config.particlesPerArm;
    const count = coreCount + armCount * perArm;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);

    let i = 0;

    const coreRadius = bodyRadius * config.coreRadiusFraction;

    // Dense bright cluster at the centre.
    for (let n = 0; n < coreCount; n++) {

        const t = Math.pow(Math.random(), 1.8);
        const r = t * coreRadius;
        const theta = Math.random() * Math.PI * 2;

        positions[i * 3] = Math.cos(theta) * r;
        positions[i * 3 + 1] = Math.sin(theta) * r;
        positions[i * 3 + 2] = 0;

        phases[i] = Math.random() * Math.PI * 2;
        randoms[i] = Math.random();
        baseSizes[i] = config.coreSizeBig + (config.coreSizeSmall - config.coreSizeBig) * t;
        brightnesses[i] = 1.0 - t * 0.15;

        i++;

    }

    // Radiating spike arms.
    for (const armAngleDeg of config.spikeAngles) {

        const isMain = (armAngleDeg % 90 === 0);
        const armAngle = THREE.MathUtils.degToRad(armAngleDeg);
        const armLength = bodyRadius * (isMain ? config.mainSpikeLengthFraction : config.diagSpikeLengthFraction);
        const armWidth = isMain ? config.mainSpikeWidthRad : config.diagSpikeWidthRad;
        const sizeBig = isMain ? config.mainSizeBig : config.diagSizeBig;
        const sizeSmall = isMain ? config.mainSizeSmall : config.diagSizeSmall;

        for (let n = 0; n < perArm; n++) {

            const t = Math.pow(Math.random(), config.spikeDensityPower);
            const r = t * armLength;
            const jitterAngle = armAngle + (Math.random() - 0.5) * armWidth;

            positions[i * 3] = Math.cos(jitterAngle) * r;
            positions[i * 3 + 1] = Math.sin(jitterAngle) * r;
            positions[i * 3 + 2] = 0;

            phases[i] = Math.random() * Math.PI * 2;
            randoms[i] = Math.random();
            baseSizes[i] = sizeBig + (sizeSmall - sizeBig) * t;
            brightnesses[i] = 1.0 - t * 0.6;

            i++;

        }

    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("rand", new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSizes, 1));
    geometry.setAttribute("brightness", new THREE.BufferAttribute(brightnesses, 1));

    const material = new THREE.ShaderMaterial({

        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,

        uniforms: {
            uTime: { value: 0 },
            uSize: { value: config.uSize },
            uColor: { value: new THREE.Vector3(...config.color) }
        },

        vertexShader: `

            uniform float uTime;
            uniform float uSize;

            attribute float phase;
            attribute float rand;
            attribute float baseSize;
            attribute float brightness;

            varying float vBrightness;

            void main() {

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                float twinkle = sin(uTime * ${config.twinkleSpeed.toFixed(3)} + rand * 6.2831) * 0.5 + 0.5;
                vBrightness = mix(brightness * 0.8, brightness, twinkle);

                float perspectiveSize = uSize * baseSize * (${config.sizeScale.toFixed(1)} / -mvPosition.z);

                gl_PointSize = clamp(perspectiveSize, 0.03, 16.0);

                gl_Position = projectionMatrix * mvPosition;

            }

        `,

        fragmentShader: `

            uniform vec3 uColor;

            varying float vBrightness;

            void main() {

                vec2 uv = gl_PointCoord - vec2(0.5);
                float distanceFromCenter = length(uv);

                float circle = 1.0 - smoothstep(0.3, 0.5, distanceFromCenter);

                if (circle < 0.01) discard;

                gl_FragColor = vec4(
                    uColor * vBrightness,
                    circle * vBrightness * ${config.alphaMult.toFixed(3)}
                );

            }

        `

    });

    const points = new THREE.Points(geometry, material);
    points.name = "LIGHT_FLARE";

    return { points, material };

}

// ============================================================
// SECTION: STRAY PARTICLE FIELD BUILDER
// ------------------------------------------------------------
function buildHaloField(config, bodyRadius) {

    const count = config.count;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);

    const innerRadius = bodyRadius * config.innerRadiusMult;
    const outerRadius = bodyRadius * config.outerRadiusMult;

    for (let i = 0; i < count; i++) {

        const u = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const sinPhi = Math.sqrt(1 - u * u);

        const rf = Math.pow(Math.random(), config.falloffPower);
        const r = innerRadius + rf * (outerRadius - innerRadius);

        const index = i * 3;

        positions[index] = sinPhi * Math.cos(theta) * r;
        positions[index + 1] = u * r;
        positions[index + 2] = sinPhi * Math.sin(theta) * r;

        phases[i] = Math.random() * Math.PI * 2;
        randoms[i] = Math.random();

        const sizeRoll = Math.random();
        if (sizeRoll < config.smallChance) {
            baseSizes[i] = config.sizeSmall;
        } else if (sizeRoll < config.smallChance + config.mediumChance) {
            baseSizes[i] = config.sizeMedium;
        } else {
            baseSizes[i] = config.sizeBig;
        }

        brightnesses[i] = config.brightnessMin + Math.random() * (config.brightnessMax - config.brightnessMin);

    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("originalPosition", new THREE.BufferAttribute(positions.slice(), 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("rand", new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSizes, 1));
    geometry.setAttribute("brightness", new THREE.BufferAttribute(brightnesses, 1));

    const material = new THREE.ShaderMaterial({

        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,

        uniforms: {
            uTime: { value: 0 },
            uSize: { value: config.uSize },
            uColor: { value: new THREE.Vector3(...config.color) }
        },

        vertexShader: `

            uniform float uTime;
            uniform float uSize;
            uniform float uPointScale;
            uniform float uMinDrawSize;
            uniform float uDiscClip;
            uniform float uMoonRadius;

            attribute vec3 originalPosition;
            attribute float phase;
            attribute float rand;
            attribute float baseSize;
            attribute float brightness;

            varying float vBrightness;

            void main() {

                vec3 pos = originalPosition;

                pos.x += sin(uTime * 0.15 + phase) * ${config.driftAmount.toFixed(4)};
                pos.y += cos(uTime * 0.12 + phase * 1.3) * ${config.driftAmount.toFixed(4)};
                pos.z += sin(uTime * 0.18 + phase * 0.7) * ${config.driftAmount.toFixed(4)};

                float twinkle = sin(uTime * ${config.twinkleSpeed.toFixed(3)} + rand * 6.2831) * 0.5 + 0.5;
                vBrightness = mix(brightness * 0.75, brightness, twinkle);

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

                float perspectiveSize = uSize * baseSize * (${config.sizeScale.toFixed(1)} / -mvPosition.z);

                gl_PointSize = max(clamp(perspectiveSize, 0.02, 10.0) * uPointScale, uMinDrawSize);

                gl_Position = projectionMatrix * mvPosition;

                // Universe screen: only keep stray particles that sit in
                // front of the moon's own circle, so nothing shows outside it.
                if (uDiscClip > 0.5) {
                    vec3 centerView = (viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                    vec2 offset = mvPosition.xy / -mvPosition.z - centerView.xy / -centerView.z;
                    float inCircle = step(length(offset), 0.97 * uMoonRadius / -centerView.z);
                    float inFront = step(centerView.z, mvPosition.z);
                    if (inCircle * inFront < 0.5) {
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        gl_PointSize = 0.0;
                    }
                }

            }

        `,

        fragmentShader: `

            uniform vec3 uColor;

            varying float vBrightness;

            void main() {

                vec2 uv = gl_PointCoord - vec2(0.5);
                float distanceFromCenter = length(uv);

                float circle = 1.0 - smoothstep(0.3, 0.5, distanceFromCenter);

                if (circle < 0.01) discard;

                gl_FragColor = vec4(
                    uColor * vBrightness,
                    circle * vBrightness * ${config.alphaMult.toFixed(3)}
                );

            }

        `

    });

    const points = new THREE.Points(geometry, material);
    points.name = "MOON_HALO";

    return { points, material };

}

// ============================================================
// SECTION: BUILD THE MOON + SHADOW + LIGHT FLARE + STRAY FIELD
// ------------------------------------------------------------
const moonGroup = new THREE.Group();
const haloGroup = new THREE.Group();

const { points: moonPoints, material: moonMaterial } = buildMoonBody(MOON_CONFIG);
// On the universe screen the stray field is only shown where it overlaps
// the moon's own circle (see uDiscClip in the halo shader), so nothing
// appears outside the moon. There are more of them because most are
// clipped away.
const UNIVERSE_HALO_OVERRIDES = {
    count: 14000,
    outerRadiusMult: 2.4,
    // Much finer than on the display page so the specks match the
    // Sun and Ascendant next to it.
    sizeSmall: 0.8,
    sizeMedium: 1.3,
    sizeBig: 2.1
};

const { points: haloPoints, material: haloMaterial } = buildHaloField(
    isUniversePreview ? { ...HALO_CONFIG, ...UNIVERSE_HALO_OVERRIDES } : HALO_CONFIG,
    MOON_RADIUS
);

haloMaterial.uniforms.uPointScale = { value: pointScale };
haloMaterial.uniforms.uMinDrawSize = { value: getMinDrawSize() };
haloMaterial.uniforms.uDiscClip = { value: isUniversePreview ? 1.0 : 0.0 };
haloMaterial.uniforms.uMoonRadius = { value: MOON_RADIUS };

moonGroup.add(moonPoints);
haloGroup.add(haloPoints);

// Render the halo after the shadow disc (a higher renderOrder). The
// disc writes depth, so halo particles behind it are hidden and
// halo particles in front of it still draw on top of it.
haloPoints.renderOrder = 11;

scene.add(moonGroup);
scene.add(haloGroup);

// Pivot group for the phase "variants" (see the MOUSE INTERACTION /
// PHASE VARIANTS section below). It is parked at the moon's own
// ORIGINAL centre (moonGroup's position) rather than variants being
// parented straight to the scene, so each variant's own transform is
// expressed relative to that shared centre instead of its own local
// origin. That means rotating this pivot later rotates every variant
// as a group around the real moon's centre (the way a moon-phase
// strip sweeps around the body), instead of each variant spinning in
// place about its own individual centre.
const phaseVariantsPivot = new THREE.Group();
phaseVariantsPivot.position.copy(moonGroup.position);
scene.add(phaseVariantsPivot);

// The shadow disc is added straight to the scene — deliberately
// NOT inside moonGroup — so the moon's own spin never rotates it.
// It is placed ONCE at a fixed world position (in front of the moon,
// on the camera's starting side) and never re-positioned; only its
// facing is updated per frame in updateShadowDisc().
const moonShadowMesh = buildShadowDisc(SHADOW_CONFIG);
moonShadowMesh.scale.setScalar(SHADOW_CONFIG.radius);
{
    const az = THREE.MathUtils.degToRad(SHADOW_CONFIG.azimuthDeg);
    const el = THREE.MathUtils.degToRad(SHADOW_CONFIG.elevationDeg);
    const d = SHADOW_CONFIG.distance;
    moonShadowMesh.position.set(
        Math.sin(az) * Math.cos(el) * d,
        Math.sin(el) * d,
        Math.cos(az) * Math.cos(el) * d
    );
}
if (!isUniversePreview) scene.add(moonShadowMesh);

// The light flare is likewise added straight to the scene, not to
// moonGroup — it is repositioned every frame in updateLightFlare()
// at a fixed clock-face spot relative to the camera (see
// STAR_CONFIG), so it stays put at that spot as you orbit rather
// than sliding around like a true fixed-world-space point would.
const { points: lightFlarePoints, material: lightFlareMaterial } = buildLightFlare(STAR_CONFIG, MOON_RADIUS);
if (!isUniversePreview) scene.add(lightFlarePoints);

// Reused scratch vectors for positioning the shadow disc and the
// light flare each frame (avoids allocating new THREE.Vector3s
// every animate() call).
const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const starPosition = new THREE.Vector3();

// ============================================================
// SECTION: BACKGROUND STARFIELD
// ------------------------------------------------------------
function buildStarField() {

    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {

        const r = STAR_INNER_RADIUS + Math.random() * (STAR_OUTER_RADIUS - STAR_INNER_RADIUS);
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const sinPhi = Math.sqrt(1 - u * u);

        const index = i * 3;
        positions[index] = r * sinPhi * Math.cos(theta);
        positions[index + 1] = r * u;
        positions[index + 2] = r * sinPhi * Math.sin(theta);

        sizes[i] = Math.random() < 0.85 ? 1.0 : 2.2;

    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.045,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    return new THREE.Points(geometry, material);

}

if (!isUniversePreview) scene.add(buildStarField());

// ------------------------------------------------------------
// FUNCTION: fitCamera(object)
// ------------------------------------------------------------
function fitCamera(object) {

    const boundingBox = new THREE.Box3().setFromObject(object);
    const size = boundingBox.getSize(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);

    const cameraDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    // The universe screen pulls the camera back further (and css/style.css
    // scales the canvas up to match) so the stray field fits in frame.
    camera.position.set(0, 0, cameraDistance * (isUniversePreview ? UNIVERSE_FIT_FACTOR : 3.0));
    baseCameraDistance = camera.position.length();

    camera.near = maxSize * 0.01;
    camera.far = maxSize * 100;
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update();

}

fitCamera(moonPoints);

// ------------------------------------------------------------
// FUNCTION: updateShadowDisc()
// ------------------------------------------------------------
// Only re-orients the disc each frame (billboard): its quaternion
// is copied from the camera's so its flat face always points at the
// viewer and it reads as a perfect circle. Its POSITION is fixed in
// world space and is deliberately not touched here, so orbiting the
// camera slides the disc across the moon (parallax) and it only
// hides the moon when camera, disc and moon line up.
// ------------------------------------------------------------
function updateShadowDisc() {

    moonShadowMesh.quaternion.copy(camera.quaternion);

}

// ------------------------------------------------------------
// FUNCTION: updateLightFlare()
// ------------------------------------------------------------
// Repositions and re-orients the star every frame, the same way
// updateShadowDisc() handles the shadow disc:
//   1. Always faces the camera (billboard) — its quaternion is
//      copied straight from the camera's.
//   2. Its screen offset comes from a fixed clock-face angle
//      (STAR_CONFIG.clockAngleDeg) projected onto the camera's
//      current right/up axes, so it stays at that same spot
//      relative to the moon — e.g. 2 o'clock — as the camera orbits,
//      rather than drifting the way a true fixed-world point would.
//   3. It's nudged AWAY from the camera (the opposite of the shadow
//      disc's bias) so the moon's own particle depth can occlude it
//      where the two overlap, keeping it reading as sitting behind
//      the moon rather than floating in front of it.
// This never reads moonGroup's rotation, so the moon's own spin has
// no effect on where the star sits on screen.
// ------------------------------------------------------------
function updateLightFlare() {

    camera.getWorldDirection(camForward);
    camRight.crossVectors(camForward, camera.up).normalize();
    camUp.crossVectors(camRight, camForward).normalize();

    const clockAngle = THREE.MathUtils.degToRad(STAR_CONFIG.clockAngleDeg);
    // Clockwise from 12 o'clock: screen-right component grows with
    // sin, screen-up component shrinks with cos.
    const screenX = Math.sin(clockAngle);
    const screenY = Math.cos(clockAngle);

    const offset = MOON_RADIUS * STAR_CONFIG.offsetFraction;
    const forwardBias = MOON_RADIUS * STAR_CONFIG.forwardBiasFraction;

    starPosition.set(0, 0, 0)
        .addScaledVector(camRight, screenX * offset)
        .addScaledVector(camUp, screenY * offset)
        .addScaledVector(camForward, forwardBias);

    lightFlarePoints.position.copy(starPosition);
    lightFlarePoints.quaternion.copy(camera.quaternion);

}

// ============================================================
// SECTION: MOUSE INTERACTION
// ------------------------------------------------------------
// Everything here is driven purely by cursor POSITION over the
// moon canvas — nothing is tied to clicking or dragging:
//
//   - VERTICAL position: cursor near the BOTTOM eases the CORE
//     (the camera-facing face) toward a dim value while the
//     rim/limb keeps glowing at full strength — it reuses the
//     shader's existing core/rim mix (see uCoreBoost above), so
//     only the core term is affected. Cursor near the TOP eases
//     the WHOLE body (core + rim) brighter (uGlobalBoost).
//
//   - HORIZONTAL position: cursor toward the RIGHT reveals phase
//     "variants" — real point-cloud moons built the exact same way
//     as the main body (buildMoonBody again, just smaller and
//     lighter). Each one's shadow is baked directly into its own
//     particles by the body's shader (see the PHASE SHADOW comment
//     above buildMoonBody), rather than a separate disc laid over
//     the top, so the dark side reads as part of the cratered
//     surface, terminator and all, instead of a flat cutout floating
//     in front of it. They grow in on the LEFT and RIGHT at once,
//     working outward from the moon through a fixed illumination
//     sequence (near full -> gibbous -> crescent), each step darker
//     than the last — echoing the classic moon-phase strip. Cursor
//     toward the LEFT shrinks them back out again, one pair at a
//     time, until none are left.
//
// All targets ease in smoothly each frame rather than snapping, so
// sweeping the cursor around reads as one continuous, responsive
// gesture.
// ============================================================
const INTERACTION_CONFIG = {

    // Core brightness multiplier when the cursor is at the very
    // bottom of the canvas (this multiplies the shader's existing
    // core-darken term — the rim term is never touched).
    coreDimTarget: 0.12,

    // Overall body brightness multiplier when the cursor is at the
    // very top of the canvas (multiplies core AND rim).
    globalBrightPeak: 1.55,

    // How quickly uCoreBoost / uGlobalBoost ease toward their
    // cursor-driven target each frame (higher = snappier).
    easeSpeed: 4.5

};

const PHASE_CONFIG = {

    maxPerSide: 3,

    // Fraction of the canvas width (0..1, left..right) below which no
    // variants are revealed — the whole left half plus dead centre is
    // a neutral zone; only crossing into the right half starts the
    // reveal, reaching maxPerSide at the right edge.
    revealStartX: 0.5,

    // How many particles each variant's point-cloud body is built
    // from — far fewer than the main moon's 450k (it's smaller on
    // screen and there can be up to six on screen at once) but
    // built by the exact same procedural craters/shading code.
    particleCount: 42000,
    radius: MOON_RADIUS * 0.55,

    // Illuminated fraction (0 = new moon, 1 = full) for each
    // variant, working outward from the moon: near-full, then
    // gibbous, then a thin crescent right at the end of the row.
    // Lower value = the shadow circle sits closer to the variant's
    // own centre (see createPhaseVariant below), so farther-out
    // variants show progressively more of their dark side.
    illumination: [0.5, 0.2, 0.05],

    // Spacing from the moon and between variants — pushed further
    // out so the row reads as more spread out / sparse rather than a
    // tight cluster.
    firstOffset: MOON_RADIUS * 1.75,
    stepOffset: MOON_RADIUS * 2.35,

    // Variants stay full size throughout — only uOpacity animates,
    // from 0 -> 1 on entrance and 1 -> 0 on exit, so they gradually
    // materialise/dissolve in place instead of growing or shrinking.
    fadeInDuration: 0.9,
    fadeOutDuration: 0.6

};

let coreBoost = 1.0;
let globalBoost = 1.0;

// 0 = cursor at the very top/left of the moon canvas, 1 = very
// bottom/right. normalizedMouseX starts at 0 (nothing revealed)
// rather than centred, so no variants appear until the cursor
// actually moves right.
let normalizedMouseX = 0;
let normalizedMouseY = 0.5;

// ------------------------------------------------------------
// FUNCTION: drawnMoonPhaseIllumination(slotIndex)
// ------------------------------------------------------------
function phaseIllumination(slotIndex) {
    return PHASE_CONFIG.illumination[Math.min(slotIndex, PHASE_CONFIG.illumination.length - 1)];
}

// ------------------------------------------------------------
// Two lists of phase-variant pairs, one per side of the moon. Each
// variant is a REAL point-cloud moon (buildMoonBody again, smaller),
// with its crescent/gibbous shape baked into its own shader via
// shadowOffset/shadowRadius/shadowEdge (the same two-circle-overlap
// math the old separate shadow disc used, just per-particle now) —
// so the variants read as genuinely the same model as the main moon,
// just smaller and phase-shifted. Each entry fades in (uOpacity
// 0 -> 1) on creation and fades back out (uOpacity 1 -> 0) when
// dismissed, then disposes itself — full size throughout, no scale
// animation.
// ------------------------------------------------------------
const phaseVariants = { left: [], right: [] };

function createPhaseVariant(slotIndex, side) {

    const illum = phaseIllumination(slotIndex);
    // Left-side variants read as waxing (lit toward the centre, on
    // their right); right-side variants read as waning (lit toward
    // the centre, on their left) — mirrored either side of the
    // moon, same as the reference strip.
    const litOnRight = side < 0;

    // Same two-circle-overlap trick the old separate shadow disc used
    // (0 = fully overlapping/new, one full radius = a clean quarter,
    // two radii = no overlap/full) — see the PHASE SHADOW shader
    // comment in buildMoonBody. Now handed to the body's own shader
    // as a per-particle darkening term instead of a floating mesh, so
    // the shadow reads as baked into the cratered surface: further
    // slots (farther from the main moon in the row) get a lower
    // illum, which shifts the shadow circle's centre closer in
    // toward the variant's own middle, covering progressively more
    // of the body — the same growing-shadow progression as the real
    // moon cycle. The shadow circle is kept the SAME size as the
    // variant's own body (shadowRadius below) rather than enlarged,
    // because two equal-size overlapping circles is what produces a
    // properly curved terminator; a bigger shadow circle flattens
    // that curve into a near-straight cut.
    const shadowOffset = 2 * PHASE_CONFIG.radius * illum * (litOnRight ? -1 : 1);

    const { points: sphere, material: sphereMaterial } = buildMoonBody({
        ...MOON_CONFIG,
        particleCount: PHASE_CONFIG.particleCount,
        radius: PHASE_CONFIG.radius,
        shadowOffset,
        shadowRadius: PHASE_CONFIG.radius,
        // Softer, more organic terminator than the main moon's own
        // (unused) default — reads closer to the ink-drawn reference.
        shadowEdge: PHASE_CONFIG.radius * 0.16,
        // Darker dark-side floor than the main moon's default (0.045)
        // so each variant's shadowed side reads as a much deeper
        // black, while staying just above 0 so it doesn't vanish into
        // flat, textureless black.
        shadowFloor: 0.012
    });
    sphere.name = "MOON_VARIANT";
    sphereMaterial.uniforms.uOpacity.value = 0;
    // Parented to phaseVariantsPivot (fixed at the moon's original
    // centre) rather than the scene directly, so the variant's
    // position below is set relative to that shared centre and the
    // whole row can be rotated around it as one group later.
    phaseVariantsPivot.add(sphere);

    return {
        sphere,
        sphereMaterial,
        side,
        slotIndex,
        illum,
        litOnRight,
        state: "entering",
        t: 0,
        removed: false
    };

}

function addPhaseVariantPair() {

    if (phaseVariants.left.length >= PHASE_CONFIG.maxPerSide) return;

    const slotIndex = phaseVariants.left.length;

    phaseVariants.left.push(createPhaseVariant(slotIndex, -1));
    phaseVariants.right.push(createPhaseVariant(slotIndex, 1));

}

function removeOutermostVariantPair() {

    const outermostLeft = [...phaseVariants.left].reverse().find((v) => v.state !== "exiting");
    const outermostRight = [...phaseVariants.right].reverse().find((v) => v.state !== "exiting");

    if (outermostLeft) { outermostLeft.state = "exiting"; outermostLeft.t = 0; }
    if (outermostRight) { outermostRight.state = "exiting"; outermostRight.t = 0; }

}

function getDesiredVariantCount() {
    // Dead zone: the left half of the canvas (and dead centre) reveals
    // nothing. Only once the cursor crosses past the middle into the
    // right half does the reveal progress start climbing toward
    // maxPerSide, reaching it at the right edge.
    const rightProgress = Math.max(
        0,
        (THREE.MathUtils.clamp(normalizedMouseX, 0, 1) - PHASE_CONFIG.revealStartX) / (1 - PHASE_CONFIG.revealStartX)
    );
    return Math.round(rightProgress * PHASE_CONFIG.maxPerSide);
}

// ------------------------------------------------------------
// FUNCTION: updatePhaseVariantSide(list, side, dt, elapsed)
// ------------------------------------------------------------
// Animates + positions every variant on one side. Position is
// recomputed from camRight / camForward every frame (the same
// shared scratch vectors updateLightFlare() keeps current), so the
// row always reads correctly from wherever the camera has orbited
// to, exactly like the main moon's own shadow disc / light flare.
// ------------------------------------------------------------
function updatePhaseVariantSide(list, side, dt, elapsed) {

    for (const variant of list) {

        variant.t += dt;

        let opacity;

        if (variant.state === "entering") {

            const progress = Math.min(variant.t / PHASE_CONFIG.fadeInDuration, 1);
            opacity = progress * progress * (3 - 2 * progress); // smoothstep ease
            if (progress >= 1) variant.state = "idle";

        } else if (variant.state === "exiting") {

            const progress = Math.min(variant.t / PHASE_CONFIG.fadeOutDuration, 1);
            opacity = 1 - progress * progress * (3 - 2 * progress);
            if (progress >= 1) {
                phaseVariantsPivot.remove(variant.sphere);
                variant.sphere.geometry.dispose();
                variant.sphereMaterial.dispose();
                variant.removed = true;
            }

        } else {
            opacity = 1;
        }

        if (variant.removed) continue;

        const rowOffset = (PHASE_CONFIG.firstOffset + variant.slotIndex * PHASE_CONFIG.stepOffset) * side;

        // Offset FROM the moon's original centre (variant.sphere is a
        // child of phaseVariantsPivot, which sits exactly at that
        // centre — see its setup near moonGroup above), not an
        // absolute world position. While the pivot itself stays
        // unrotated this is numerically the same as before, but any
        // future phaseVariantsPivot.rotation applied around that
        // pivot now sweeps every variant around the real moon centre
        // as one group, rather than each variant orbiting its own
        // local origin.
        variantCenter.set(0, 0, 0)
            .addScaledVector(camRight, rowOffset)
            .addScaledVector(camForward, PHASE_CONFIG.radius * 0.05);

        variant.sphereMaterial.uniforms.uTime.value = elapsed;
        variant.sphereMaterial.uniforms.uOpacity.value = opacity;
        variant.sphere.position.copy(variantCenter);

        // The shadow itself is now baked into the body's own particle
        // shader (uShadowOffset/uShadowRadius, set once in
        // createPhaseVariant — see the PHASE SHADOW comment in
        // buildMoonBody) rather than positioned here as a separate
        // disc, so there's nothing left to update per frame beyond the
        // sphere's own position, time and fade above.

    }

    return list.filter((variant) => !variant.removed);

}

// Reused scratch vector for positioning phase variants each frame.
const variantCenter = new THREE.Vector3();

function updatePhaseVariants(dt, elapsed) {

    // Display page only — the small universe-screen preview never
    // shows phase variants.
    if (isUniversePreview) return;

    const desiredCount = getDesiredVariantCount();
    const activeCount = phaseVariants.left.filter((v) => v.state !== "exiting").length;

    if (activeCount < desiredCount && phaseVariants.left.length < PHASE_CONFIG.maxPerSide) {
        addPhaseVariantPair();
    } else if (activeCount > desiredCount) {
        removeOutermostVariantPair();
    }

    phaseVariants.left = updatePhaseVariantSide(phaseVariants.left, -1, dt, elapsed);
    phaseVariants.right = updatePhaseVariantSide(phaseVariants.right, 1, dt, elapsed);

}

// ------------------------------------------------------------
// FUNCTION: updateMouseBrightness(dt)
// ------------------------------------------------------------
// Reads the cursor's current vertical position (tracked on every
// pointermove, see the listener below) and eases uCoreBoost /
// uGlobalBoost toward the value it implies: bottom of the canvas
// dims the core, top of the canvas brightens the whole body.
// ------------------------------------------------------------
function updateMouseBrightness(dt) {

    // Display page only — without this the universe-screen preview,
    // which never receives pointermove updates, would permanently
    // sit at the mid-point targets below instead of its normal
    // brightness.
    if (isUniversePreview) return;

    const coreTarget = THREE.MathUtils.lerp(1.0, INTERACTION_CONFIG.coreDimTarget, normalizedMouseY);
    const globalTarget = THREE.MathUtils.lerp(INTERACTION_CONFIG.globalBrightPeak, 1.0, normalizedMouseY);

    const ease = Math.min(1, dt * INTERACTION_CONFIG.easeSpeed);
    coreBoost += (coreTarget - coreBoost) * ease;
    globalBoost += (globalTarget - globalBoost) * ease;

    moonMaterial.uniforms.uCoreBoost.value = coreBoost;
    moonMaterial.uniforms.uGlobalBoost.value = globalBoost;

}

if (!isUniversePreview) {

    // Right-click's browser context menu would otherwise interrupt
    // a cursor sweep over the canvas; nothing here is bound to any
    // click or button, only position.
    renderer.domElement.addEventListener("contextmenu", (event) => {
        event.preventDefault();
    });

    // Tracked on window (not just the canvas) so the interaction
    // keeps responding smoothly even if the cursor briefly slips
    // past the canvas edge.
    window.addEventListener("pointermove", (event) => {

        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        normalizedMouseX = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
        normalizedMouseY = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height, 0, 1);

    });

}

// ============================================================
// SECTION: ANIMATION LOOP
// ------------------------------------------------------------
const clock = new THREE.Clock();
let lastElapsed = 0;

function animate() {

    requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();
    const dt = Math.min(Math.max(elapsed - lastElapsed, 0), 0.1);
    lastElapsed = elapsed;

    moonMaterial.uniforms.uTime.value = elapsed;
    haloMaterial.uniforms.uTime.value = elapsed;
    lightFlareMaterial.uniforms.uTime.value = elapsed;

    // Constant, independent spin so craters keep drifting under
    // the (separately positioned) shadow disc even without any
    // user input, while the stray field turns at its own separate
    // (slower, reversed) rate for a bit of parallax against the body.
    moonGroup.rotation.y += MOON_SPIN_SPEED;
    haloGroup.rotation.y += HALO_SPIN_SPEED;

    controls.update();

    window.dispatchEvent(new CustomEvent("canvas-zoom", {
        detail: { planet: "moon", zoom: baseCameraDistance / camera.position.distanceTo(controls.target) }
    }));

    updateShadowDisc();
    updateLightFlare();
    updateMouseBrightness(dt);
    updatePhaseVariants(dt, elapsed);

    window.dispatchEvent(new CustomEvent("visual-coordinates", {
        detail: { planet: "moon", x: camera.position.x, y: camera.position.y, z: camera.position.z }
    }));

    composer.render();

}

animate();

// ============================================================
// SECTION: RESIZE HANDLING
// ------------------------------------------------------------
window.addEventListener("resize", () => {

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    if (!containerWidth || !containerHeight) return;

    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();

    // Re-measure the CSS scale: the universe screen only gets its final
    // size once it is revealed.
    renderPixelRatio = getRenderPixelRatio();
    pointScale = renderPixelRatio / Math.min(window.devicePixelRatio, 2);

    [moonMaterial, haloMaterial].forEach((material) => {
        material.uniforms.uPointScale.value = pointScale;
        material.uniforms.uMinDrawSize.value = getMinDrawSize();
    });

    renderer.setPixelRatio(renderPixelRatio);
    composer.setPixelRatio(renderPixelRatio);

    renderer.setSize(containerWidth, containerHeight);
    composer.setSize(containerWidth, containerHeight);

});