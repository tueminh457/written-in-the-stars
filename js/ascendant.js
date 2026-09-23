// ============================================================
// ASCENDANT.JS
// ------------------------------------------------------------
// Builds the Ascendant visual: a dark central hole ringed by a
// concentric, Saturn-like ring system (styled after the
// reference exoplanet-ring render), rendered entirely as
// additive-blended THREE.Points particles — the same core
// technique used for the Sun in main.js (per-particle attributes
// driving a custom GLSL vertex/fragment shader, bloom
// post-processing, OrbitControls auto-rotate).
//
// Two shape refinements on top of the base ring/hole system:
//   - Each band's INNER edge is shifted by angle via
//     ringEdgeShift(): pulled inward at the wide "ansae" side of
//     the ellipse (theta ~ 0/PI) and pushed outward at the
//     narrow top/bottom side (theta ~ PI/2), so the hole reads
//     as its own rounder, egg-like shape nested inside the
//     flatter ring ellipse, rather than a uniform-width annulus
//     or a shape that's simply pinched on one axis. Outer edges
//     are never touched.
//   - The central hole is no longer an empty, hard-edged gap:
//     CORE_SWIRL_CONFIG / buildCoreSwirl() fills it with a
//     multi-arm spiral (styled after a face-on/tilted galaxy
//     like Andromeda: a continuous, dust-lane-textured disc
//     rather than distinct wedges with empty gaps between them).
//     Its outer boundary is shifted by the exact same
//     ringEdgeShift() as band 0's inner edge, so the two curves
//     always coincide exactly — no matter how hard either is
//     pinched or widened, there's never a gap or seam between
//     the swirl and the innermost ring band.
//
// Mouse-driven behaviour (on top of the above):
//   - Mouse X controls how many EXTRA ring BANDS are generated
//     beyond the three default core bands (CORE_RING_BANDS). The
//     core bands are always fully visible — moving the mouse left
//     never removes or thins them, it just stays clamped at the
//     default look. Moving the mouse right of centre gradually
//     generates the GENERATED_RING_BANDS further out, each with a
//     visible gap from its neighbour so it reads as a genuinely
//     new, separate ring appearing rather than the existing ring
//     just thickening. Every ring particle is tagged with which
//     band it belongs to (bandIndex); moving the mouse right
//     raises a uVisibleBandCount uniform, and the shader fades a
//     whole band's worth of particles in/out together as the
//     count crosses that band's index — so a mouse sweep right
//     reads as new rings actually forming one at a time, while
//     sweeping left simply settles back to the untouched default
//     three-band look.
//   - Mouse Y controls brightness and how fast/far particles move,
//     and applies to every particle field on screen — rings,
//     glow, core swirl, the stray halo, AND the background
//     starfield — so nothing sits still while everything else
//     moves. Up = a touch brighter, quicker base motion, and
//     enough extra wandering that particles visibly leave their
//     original position rather than just jittering in place; down
//     = dimmer and calmer, motion scaled down toward barely-there.
//     The background starfield now carries its own small nonzero
//     base movement/drift (previously zero), so being flagged
//     reactive actually has a visible effect on it too, instead of
//     silently multiplying a zero base amount by the mouse-Y
//     multiplier and staying frozen.
// ============================================================

import * as THREE from "https://unpkg.com/three@0.185.1/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.185.1/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/OutputPass.js";

console.log("Ascendant ring module is working!");

// ============================================================
// SECTION: GLOBAL SETTINGS
// ------------------------------------------------------------
// Bloom strength for the glow, and the fixed tilt applied to the
// whole ring group. RING_TILT_X controls how face-on vs edge-on
// the ring system reads: a value near 90° looks almost perfectly
// circular (face-on), while a smaller value flattens the same
// circular ring geometry into a pronounced ellipse (edge-on),
// which is what actually produces the "oval" look. RING_TILT_Z
// then rotates that ellipse into the diagonal composition seen
// in the reference image.
// ============================================================
const BLOOM_STRENGTH = 0.22;
const RING_ROTATION_SPEED = 0.0018;

const RING_TILT_X = THREE.MathUtils.degToRad(50);
const RING_TILT_Z = THREE.MathUtils.degToRad(-18);

const RING_ELLIPSE_RATIO = 0.58;

const SPIRAL_TWIST = 3.2;

const RING_INNER_PINCH_AMOUNT = 0.15;
const RING_NARROW_WIDEN_AMOUNT = 0.08;
const RING_EDGE_SHIFT_POWER = 2;

// ------------------------------------------------------------
// FUNCTION: ringEdgeShift(theta, pinch, widen, power)
// ------------------------------------------------------------
// Returns how far (in the same units as rInner/rOuter) a
// boundary should move at this angle: NEGATIVE (inward) by up to
// `pinch` at theta = 0 / PI (the wide side), POSITIVE (outward)
// by up to `widen` at theta = PI/2 / 3PI/2 (the narrow side),
// with a smooth cosine²/sine² taper between the two. Add the
// result directly to a base radius.
// ------------------------------------------------------------
function ringEdgeShift(theta, pinch, widen, power = RING_EDGE_SHIFT_POWER) {
    const cosPow = Math.pow(Math.abs(Math.cos(theta)), power);
    const sinPow = Math.pow(Math.abs(Math.sin(theta)), power);
    return widen * sinPow - pinch * cosPow;
}

// ============================================================
// SECTION: HOLE + RING BAND LAYOUT
// ------------------------------------------------------------
// HOLE_RADIUS is the empty gap at the centre. CORE_RING_BANDS lays
// out the three bands that make up the default, always-on-arrival
// look (unchanged from before): `peak` sets each band's relative
// brightness/density, `edge` softens its inner and outer boundary
// and is deliberately wide enough that neighbouring bands' soft
// edges bleed into each other — so instead of reading as separated
// circles, adjacent bands overlap a bit (their envelopes are
// summed, not just maxed, so the overlap zone glows a little
// brighter, like two rings merging). The second band is by far the
// widest, brightest, and most densely populated — the one big,
// obviously-main ring — with a thinner, dimmer band further out.
// `ringletFreq` / `ringletContrast` control the fine sine-wave
// sub-ring texture per band.
//
// `innerPinch` / `narrowWiden` (optional, per band) override
// RING_INNER_PINCH_AMOUNT / RING_NARROW_WIDEN_AMOUNT for that
// band's inner edge. The innermost band gets the strongest
// pinch+widen — it's the one whose shape defines the hole itself
// — the main wide ring gets a moderate version so it still flows
// into the same rounded shape, and the thin outer band falls back
// to the subtle global defaults.
//
// HOLE_EDGE_BASE_RADIUS / HOLE_EDGE_PINCH / HOLE_EDGE_WIDEN are
// pulled out separately (rather than just being band 0's inline
// numbers) because CORE_SWIRL_CONFIG's outer boundary reuses these
// exact same three values below, via the exact same ringEdgeShift()
// call, so the swirl's outer edge and band 0's inner edge are
// mathematically the same curve — never a gap at the wide side,
// never an overlap at the narrow side.
//
// GENERATED_RING_BANDS then appends extra bands beyond
// CORE_RING_OUTER_MAX, each pushed further out with a visible gap
// (GENERATED_RING_GAP / GENERATED_RING_SPACING) so they read as
// genuinely new, separate rings forming outward rather than the
// existing ring simply thickening. These start hidden and fade in
// one whole band at a time as the mouse moves right (see
// buildRingSystem's bandIndex assignment and the animate loop's
// uVisibleBandCount below). The core bands are never subject to
// this fade — they're always fully revealed (see
// MIN_VISIBLE_RING_BANDS below).
// ============================================================
const HOLE_RADIUS = 1.55;

const HOLE_EDGE_BASE_RADIUS = HOLE_RADIUS + 0.05;
const HOLE_EDGE_PINCH = 0.55;
const HOLE_EDGE_WIDEN = 0.4;

const CORE_RING_BANDS = [
    { rInner: HOLE_EDGE_BASE_RADIUS, rOuter: HOLE_RADIUS + 0.72, peak: 0.42, edge: 0.18, ringletFreq: 9, ringletContrast: 0.22, innerPinch: HOLE_EDGE_PINCH, narrowWiden: HOLE_EDGE_WIDEN },
    { rInner: HOLE_RADIUS + 0.42, rOuter: HOLE_RADIUS + 2.30, peak: 1.00, edge: 0.22, ringletFreq: 9, ringletContrast: 0.3, innerPinch: 0.3, narrowWiden: 0.2 },
    { rInner: HOLE_RADIUS + 2.55, rOuter: HOLE_RADIUS + 3.35, peak: 0.62, edge: 0.18, ringletFreq: 9, ringletContrast: 0.22 }
];

const CORE_RING_OUTER_MAX = CORE_RING_BANDS[CORE_RING_BANDS.length - 1].rOuter;

// More generated rings than before (was 3) so dragging the mouse
// to the right on the Ascendant view reveals a noticeably fuller
// set of new bands, the same "more rings" bump made to the Sun's
// dust streams.
const GENERATED_RING_COUNT = 6;
const GENERATED_RING_GAP = 0.6;
const GENERATED_RING_WIDTH = 0.55;
const GENERATED_RING_SPACING = 0.85;

const GENERATED_RING_BANDS = [];
for (let g = 0; g < GENERATED_RING_COUNT; g++) {
    const rInner = CORE_RING_OUTER_MAX + GENERATED_RING_GAP + g * (GENERATED_RING_WIDTH + GENERATED_RING_SPACING);
    const rOuter = rInner + GENERATED_RING_WIDTH;
    GENERATED_RING_BANDS.push({
        rInner,
        rOuter,
        peak: 0.55,
        edge: 0.14,
        ringletFreq: 9,
        ringletContrast: 0.26
    });
}

// The full list every piece of band-iteration code below loops
// over: the always-visible core bands, then the extra generated
// ones. Index into this array IS a particle's bandIndex.
const RING_BANDS = [...CORE_RING_BANDS, ...GENERATED_RING_BANDS];

const RING_OUTER_MAX = RING_BANDS[RING_BANDS.length - 1].rOuter;

// Fallback fine sub-ring frequency for any band that doesn't
// specify its own `ringletFreq`.
const RINGLET_FREQ = 26;

// ============================================================
// SECTION: MOUSE INTERACTION SETTINGS
// ------------------------------------------------------------
// MOUSE_SMOOTHING is how quickly the tracked mouse position eases
// toward the raw pointer position each frame (0-1, higher = snappier).
//
// Mouse X (0 = far left, 1 = far right of the window) is mapped to
// a visible-band COUNT, from MIN_VISIBLE_RING_BANDS (the core bands
// only — CORE_RING_BANDS.length, i.e. the default look, always
// fully visible) up to MAX_VISIBLE_RING_BANDS (every core band plus
// every generated band). Only the RIGHT half of the mouse range
// (mouseX > 0, past dead centre) advances this count beyond the
// core bands — see the rightMouseFraction clamp in animate() below
// — so moving the mouse LEFT of centre never removes or thins the
// core bands; it just stays clamped at the untouched default look.
// Moving the mouse right of centre gradually generates the three
// extra GENERATED_RING_BANDS beyond it, one at a time.
//
// Mouse Y (0 = bottom, 1 = top of the window) is mapped to both
// BRIGHTNESS_MULT_MIN..MAX (dim at bottom, modestly brighter at
// top) and MOVEMENT_MULT_MIN..MAX (barely-there at bottom, fast and
// far-ranging at top). Above a movement multiplier of 1.0, the base
// sway's own frequency speeds up (not just its amplitude) and an
// extra per-particle wander term kicks in on top, so particles
// visibly leave their original position rather than just jittering
// around it. This is applied to every reactive field, including
// the background starfield (which now has its own small nonzero
// base movement/drift to actually respond to it — see
// STAR_FIELD_CONFIG below).
// ------------------------------------------------------------
const MOUSE_SMOOTHING = 0.05;

const MIN_VISIBLE_RING_BANDS = CORE_RING_BANDS.length;
const MAX_VISIBLE_RING_BANDS = RING_BANDS.length;

const BRIGHTNESS_MULT_MIN = 0.35;
const BRIGHTNESS_MULT_MAX = 1.2;

const MOVEMENT_MULT_MIN = 0.15;
const MOVEMENT_MULT_MAX = 4.5;

// ============================================================
// SECTION: RING_CONFIG
// ------------------------------------------------------------
// Shared per-particle look for the ring system itself: a cool,
// near-white dust colour (rather than a warm Saturn tan), an
// extremely thin vertical spread (real rings are razor-flat),
// and only a light twinkle since these are reflective ring
// particles, not stars.
// ============================================================
const RING_CONFIG = {

    name: "RING_SYSTEM",

    count: 190000,

    thicknessBase: 0.014,

    color: [1.0, 1.0, 1.0],

    sizeSmall: 0.4,
    sizeMedium: 0.9,
    sizeBig: 1.7,
    smallChance: 0.78,
    mediumChance: 0.18,

    brightnessMin: 0.18,
    brightnessMax: 1.0,

    uSize: 0.27,
    alphaMult: 0.55,
    sizeScale: 20,

    movementAmount: 0.0006,
    driftSpeed: 0.004,

    twinkleAmount: 0.14,
    twinkleSpeed: 0.35
};

// ============================================================
// SECTION: GLOW_CONFIG
// ------------------------------------------------------------
// A soft, elongated cluster of bright white particles sitting
// at the centre of the hole, like a galaxy nucleus or a star
// shining through the gap. `stretch` scales the sphere per axis
// ([x, y, z]) rather than sampling a plain sphere, so it reads
// as an oval bulge rather than a round dot — stretched wide
// along local X (which lands along the ring ellipse's long axis
// once the shared tilt is applied) and flattened along local Y
// (the rings' normal), the same way a real galactic bulge is
// wide and flat rather than a perfect sphere. `radius` is scaled
// up to match the now-larger central hole so the glow still
// fills it proportionally instead of looking like a tiny dot
// lost in a big gap.
// ============================================================
const GLOW_CONFIG = {

    name: "CENTER_GLOW",

    count: 6000,

    radius: 1.1,
    stretch: [1.8, 0.32, 0.65],

    offset: [0.1, -0.03, -0.04],

    color: [1.0, 1.0, 1.0],

    sizeSmall: 0.5,
    sizeMedium: 1.1,
    sizeBig: 2.0,
    smallChance: 0.68,
    mediumChance: 0.22,

    brightnessMin: 0.3,
    brightnessMax: 0.95,

    uSize: 0.24,
    alphaMult: 0.55,
    sizeScale: 20,

    movementAmount: 0.0008,
    driftSpeed: 0.0,

    twinkleAmount: 0.25,
    twinkleSpeed: 0.6
};

// ============================================================
// SECTION: CORE_SWIRL_CONFIG
// ------------------------------------------------------------
// Fills the space between the very centre and the innermost ring
// band with a multi-arm spiral, styled after a tilted galaxy
// like Andromeda: two broad, tightly-wound, wide arms plus a
// `baseDensity` floor so the disc stays continuously filled
// between them (dust-lane shading, not empty wedges), rather
// than a couple of bold, sparse spokes. `twist` is pushed high so
// the arms wind hard around the centre, giving the tight,
// hurricane/typhoon-eye look rather than a lazy pinwheel.
//
// `baseOuterRadius` is deliberately the exact same
// HOLE_EDGE_BASE_RADIUS used by RING_BANDS[0], and
// buildCoreSwirl() shifts it by the exact same
// ringEdgeShift(theta, HOLE_EDGE_PINCH, HOLE_EDGE_WIDEN) as that
// band's inner edge — so the swirl's outer boundary and the
// band's inner boundary are mathematically identical at every
// angle. Density fades in from the very centre (blending into
// CENTER_GLOW) and fades back out right at that shared boundary.
// ============================================================
const CORE_SWIRL_CONFIG = {

    name: "CORE_SWIRL",

    count: 90000,

    innerRadius: 0.0,
    baseOuterRadius: HOLE_RADIUS + 0.85,

    arms: 0,
    twist: 0,
    armWidth: 1.3,
    baseDensity: 1.0,

    thicknessBase: 0.05,

    color: [1.0, 1.0, 1.0],

    sizeSmall: 0.3,
    sizeMedium: 0.75,
    sizeBig: 1.6,
    smallChance: 0.75,
    mediumChance: 0.18,

    brightnessMin: 0.12,
    brightnessMax: 1.0,

    uSize: 0.26,
    alphaMult: 0.55,
    sizeScale: 20,

    movementAmount: 0.0008,
    driftSpeed: 0.01,

    twinkleAmount: 0.25,
    twinkleSpeed: 0.4
};

// ============================================================
// SECTION: STRAY_CONFIG
// ------------------------------------------------------------
// The stray particle field: a sparse, flattened halo sitting
// beyond the outer edge of the rings and thinning out with
// distance — the same "stray corona drifting past the surface"
// idea as the Sun's DUST_CONFIG (innerRadiusMult/outerRadiusMult/
// falloffPower), just without the mouse-reactive streams.
// ============================================================
const STRAY_CONFIG = {

    name: "STRAY_FIELD",

    count: 30000,

    innerRadius: RING_OUTER_MAX * 1.05,
    outerRadius: RING_OUTER_MAX * 3.2,
    falloffPower: 2.4,
    flatten: 0.5,

    color: [1.0, 1.0, 1.0],

    sizeSmall: 0.7,
    sizeMedium: 1.0,
    sizeBig: 2.0,
    smallChance: 0.82,
    mediumChance: 0.14,

    brightnessMin: 0.06,
    brightnessMax: 0.5,

    uSize: 1.5,
    alphaMult: 1.0,
    sizeScale: 20,

    movementAmount: 0.001,
    driftSpeed: 0.006,

    twinkleAmount: 0.45,
    twinkleSpeed: 0.4
};

// ============================================================
// SECTION: STAR_FIELD_CONFIG
// ------------------------------------------------------------
// A sparse shell of background stars surrounding the whole
// scene, added directly to the scene (not the tilted ring group)
// so it doesn't spin along with it. It IS still tagged reactive
// (see the assembly section below) so it responds to mouse-Y
// brightness/movement like everything else — only the ring
// group's own rotation is skipped for this field, not the mouse
// interaction. movementAmount/driftSpeed are deliberately given a
// small nonzero base value (rather than 0) so that "reactive"
// actually does something visible here: with a zero base amount,
// multiplying by uMovementMult on mouse-up would still yield zero
// and the whole field would stay frozen no matter how far up the
// mouse goes. These values are kept small since it's a sparse,
// far background layer, not a foreground focal point.
// ============================================================
const STAR_FIELD_CONFIG = {

    name: "STAR_FIELD",

    count: 5200,

    innerRadius: 16,
    outerRadius: 34,

    color: [1.0, 1.0, 1.0],

    sizeSmall: 0.35,
    sizeMedium: 0.8,
    sizeBig: 1.9,
    smallChance: 0.86,
    mediumChance: 0.1,

    brightnessMin: 0.15,
    brightnessMax: 1.0,

    uSize: 0.30,
    alphaMult: 0.75,
    sizeScale: 20,

    movementAmount: 0.0009,
    driftSpeed: 0.004,

    twinkleAmount: 0.55,
    twinkleSpeed: 0.5
};

// ============================================================
// SECTION: CONTAINER / SCENE / CAMERA / RENDERER / CONTROLS
// ------------------------------------------------------------
// Own, independent Three.js scene mounted into the Ascendant
// tab's container, mirroring the Sun's setup (alpha-enabled
// renderer, damped OrbitControls with a slow constant
// auto-rotate, no pan/zoom-out-of-bounds).
// ============================================================
const container = document.getElementById("ascendant-container");
const isUniversePreview = document.body.classList.contains("flow-page");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    55,
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
controls.minDistance = 1;
controls.maxDistance = 60;
controls.autoRotate = false;

let baseCameraDistance = camera.position.length();

window.addEventListener("visual-zoom", (event) => {
    if (event.detail.planet !== "ascendant") return;
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).add(direction.multiplyScalar(baseCameraDistance / event.detail.zoom));
    controls.update();
});

// ------------------------------------------------------------
// Mouse tracking: raw pointer position is normalised to -1..1
// on each axis and smoothed toward each frame in the animation
// loop (see MOUSE_SMOOTHING) so the ring's reaction feels fluid
// rather than jittery.
// ------------------------------------------------------------
let mouseTargetX = 0;
let mouseTargetY = 0;
let mouseX = 0;
let mouseY = 0;

window.addEventListener("pointermove", (event) => {
    if (isUniversePreview) return;
    mouseTargetX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseTargetY = -((event.clientY / window.innerHeight) * 2 - 1);
});

// ============================================================
// SECTION: BLOOM (POST-PROCESSING)
// ------------------------------------------------------------
const composer = new EffectComposer(renderer);

composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    BLOOM_STRENGTH,
    0.4,
    0.6
);

if (!isUniversePreview) composer.addPass(bloomPass);
if (!isUniversePreview) composer.addPass(new OutputPass());

// ============================================================
// SECTION: SHARED HELPERS
// ------------------------------------------------------------
// FUNCTION: gaussianRandom()
// ------------------------------------------------------------
// Box-Muller transform: turns two uniform randoms into one
// standard-normal-distributed value, used for the rings' thin
// vertical spread and the glow cluster's soft-edged sphere.
// ------------------------------------------------------------
function gaussianRandom() {
    const u = Math.random() || 1e-6;
    const v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ------------------------------------------------------------
// FUNCTION: smoothstepJS(edge0, edge1, x)
// ------------------------------------------------------------
// Plain-JS port of GLSL's smoothstep, used on the CPU to soften
// each ring band's inner/outer boundary instead of cutting it
// off hard.
// ------------------------------------------------------------
function smoothstepJS(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------
// FUNCTION: pickBaseSize(config)
// ------------------------------------------------------------
// Rolls a discrete small/medium/big size tier the same way the
// Sun's builders do, so particle sizes read as a varied field
// rather than a uniform haze.
// ------------------------------------------------------------
function pickBaseSize(config) {
    const roll = Math.random();
    if (roll < config.smallChance) return config.sizeSmall;
    if (roll < config.smallChance + config.mediumChance) return config.sizeMedium;
    return config.sizeBig;
}

// ------------------------------------------------------------
// FUNCTION: buildStarMaterial(config)
// ------------------------------------------------------------
// One shared ShaderMaterial builder used by every particle field
// below (rings, glow, stray field, starfield): perspective-scaled
// point size, a soft round sprite, per-particle brightness, a
// gentle organic drift, and a bucketed flicker/twinkle — the same
// additive-blended "point cloud star" recipe as the Sun's dust
// field, just without the mouse-reactive wave/stream logic.
//
// Extra uniforms/attributes drive the mouse interaction:
//   - uBrightnessMult: scales overall particle brightness.
//   - uMovementMult: scales BOTH the frequency and amplitude of the
//     base sway/drift (so motion actually reads as quicker, not just
//     wider), and above 1.0 also fades in an extra two-harmonic
//     wander term with its own frequency/phase derived from `rand`,
//     large enough that particles visibly leave their original
//     position rather than just jittering around it.
//   - bandIndex + uVisibleBandCount: for ring particles, bandIndex
//     is which RING_BANDS entry a particle belongs to; bandReveal
//     fades a particle in/out as uVisibleBandCount crosses its
//     index, so a whole band appears/disappears together — reading
//     as a new ring being generated or removed, not a smooth
//     radial fade. uVisibleBandCount defaults very high (so
//     bandReveal is always 1) and bandIndex defaults to 0 for every
//     field except the main ring system, so nothing else is
//     affected by this mechanism.
// ------------------------------------------------------------
function buildStarMaterial(config) {

    return new THREE.ShaderMaterial({

        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,

        uniforms: {
            uTime: { value: 0 },
            uSize: { value: config.uSize },
            uColor: { value: new THREE.Vector3(...config.color) },
            uBrightnessMult: { value: 1.0 },
            uMovementMult: { value: 1.0 },
            uVisibleBandCount: { value: 999.0 }
        },

        vertexShader: `

            uniform float uTime;
            uniform float uSize;
            uniform float uBrightnessMult;
            uniform float uMovementMult;
            uniform float uVisibleBandCount;

            attribute vec3 originalPosition;
            attribute float phase;
            attribute float speed;
            attribute float rand;
            attribute float baseSize;
            attribute float brightness;
            attribute float bandIndex;

            varying float vIntensity;

            void main() {

                vec3 pos = originalPosition;

                // Base sway: uMovementMult scales BOTH the oscillation
                // frequency (uTime * ... * uMovementMult) and the
                // amplitude, so at high values motion genuinely reads
                // as quicker, not just bigger.
                float swaySpeed = uMovementMult;
                pos.x += sin(uTime * 0.5 * speed * swaySpeed + phase) * ${config.movementAmount.toFixed(4)} * uMovementMult;
                pos.y += cos(uTime * 0.4 * speed * swaySpeed + phase) * ${config.movementAmount.toFixed(4)} * uMovementMult;
                pos.z += sin(uTime * 0.6 * speed * swaySpeed + phase) * ${config.movementAmount.toFixed(4)} * uMovementMult;

                // Extra per-particle wander, two summed harmonics with
                // frequencies/phases derived from "rand" so they don't
                // stay in lockstep with each other or with the base
                // sway above. Amplitude only kicks in above the neutral
                // uMovementMult of 1.0 and grows large enough that a
                // particle visibly drifts away from originalPosition,
                // rather than just jittering around it. Mouse-down
                // leaves zero wander and a calm, scaled-down base sway.
                float wanderStrength = ${config.movementAmount.toFixed(4)} * 6.5 * max(uMovementMult - 1.0, 0.0);
                float freqA = 0.9 + rand * 2.2;
                float freqB = 1.7 + rand * 3.1;
                float phaseA = rand * 6.2831;
                float phaseB = rand * 6.2831 + 2.1;
                vec3 wander;
                wander.x = sin(uTime * freqA + phaseA) + sin(uTime * freqB * 0.6 + phaseB) * 0.6;
                wander.y = cos(uTime * freqA * 1.3 + phaseA) + cos(uTime * freqB * 0.5 + phaseB) * 0.6;
                wander.z = sin(uTime * freqA * 0.8 + phaseB) + sin(uTime * freqB * 0.7 + phaseA) * 0.6;
                pos += wander * wanderStrength;

                float driftAngle = uTime * ${config.driftSpeed.toFixed(4)} * uMovementMult;
                float cd = cos(driftAngle);
                float sd = sin(driftAngle);
                pos = vec3(
                    pos.x * cd - pos.z * sd,
                    pos.y,
                    pos.x * sd + pos.z * cd
                );

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

                float perspectiveSize = uSize * baseSize * (${config.sizeScale.toFixed(1)} / -mvPosition.z);
                float size = clamp(perspectiveSize, 0.015, 8.0);

                // Ring-band generation: a particle fades in/out as
                // uVisibleBandCount crosses its own bandIndex, so an
                // entire band (a whole ring) appears or disappears
                // together rather than the reveal reading as a smooth
                // radial gradient. Fields that don't use this keep
                // bandIndex at 0 and uVisibleBandCount defaults far
                // above any real index, so bandReveal is always 1 for
                // them.
                float bandReveal = smoothstep(0.0, 1.0, clamp(uVisibleBandCount - bandIndex, 0.0, 1.0));
                size *= bandReveal;

                float bucket = floor(uTime * ${config.twinkleSpeed.toFixed(3)});
                float flickerNoise = fract(sin(rand * 43758.5453 + bucket * 12.9898) * 43758.5453);
                float twinkle = 1.0 - ${config.twinkleAmount.toFixed(3)} * step(0.85, flickerNoise);

                vIntensity = brightness * twinkle * uBrightnessMult * bandReveal;

                gl_PointSize = size;
                gl_Position = projectionMatrix * mvPosition;
            }

        `,

        fragmentShader: `

            uniform vec3 uColor;

            varying float vIntensity;

            void main() {

                vec2 uv = gl_PointCoord - vec2(0.5);
                float distanceFromCenter = length(uv);

                float circle = 1.0 - smoothstep(0.32, 0.5, distanceFromCenter);
                if (circle < 0.01) discard;

                gl_FragColor = vec4(
                    uColor * vIntensity,
                    circle * vIntensity * ${config.alphaMult.toFixed(3)}
                );

            }

        `

    });

}

// ------------------------------------------------------------
// FUNCTION: makePoints(positions, phases, speeds, randoms,
//                       baseSizes, brightnesses, bandIndices,
//                       config, offset)
// ------------------------------------------------------------
// Packs the per-particle arrays into a BufferGeometry, attaches
// the shared star material, and returns the finished THREE.Points
// object (optionally shifted by `offset`, used for the centre
// glow cluster).
// ------------------------------------------------------------
function makePoints(positions, phases, speeds, randoms, baseSizes, brightnesses, bandIndices, config, offset) {

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("originalPosition", new THREE.BufferAttribute(positions.slice(), 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute("rand", new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSizes, 1));
    geometry.setAttribute("brightness", new THREE.BufferAttribute(brightnesses, 1));
    geometry.setAttribute("bandIndex", new THREE.BufferAttribute(bandIndices, 1));

    const material = buildStarMaterial(config);

    const points = new THREE.Points(geometry, material);
    points.userData.material = material;
    points.name = config.name;

    if (offset) points.position.set(offset[0], offset[1], offset[2]);

    return points;

}

// ============================================================
// SECTION: RING SYSTEM BUILDER
// ------------------------------------------------------------
// FUNCTION: buildRingSystem(config)
// ------------------------------------------------------------
// Samples particles via rejection sampling against a radial
// density profile built from RING_BANDS: for each candidate
// radius/angle pair, checks which band (if any) it falls in,
// softens that band's edges with smoothstepJS, multiplies in a
// fast sine wave to carve the fine sub-ring texture visible
// inside each broad band, and keeps the particle with probability
// equal to that combined density.
//
// The band's INNER edge is additionally shifted by angle via
// ringEdgeShift() (see RING_INNER_PINCH_AMOUNT /
// RING_NARROW_WIDEN_AMOUNT above): pulled inward at the
// wide/ansae side (theta ~ 0/PI) and pushed outward at the
// narrow top/bottom side (theta ~ PI/2) — this is what makes
// each band's inner boundary trace its own rounder shape instead
// of staying a uniform-width ring, and (for band 0 specifically)
// it's what lets the innermost band's edge land exactly on the
// CORE_SWIRL field's outer boundary, since both reuse
// HOLE_EDGE_PINCH/HOLE_EDGE_WIDEN. The OUTER edge is never
// shifted by this, so the ring system's outer silhouette stays a
// perfectly smooth, unwobbled ellipse exactly as before.
//
// The ringlet sine's phase includes a `theta * SPIRAL_TWIST` term
// alongside the radial term, so the fine brightness texture winds
// around with angle instead of staying perfectly radial — giving
// a dust-lane/swirl look inside each band. This never touches a
// band's inner/outer boundary either (that's tested against the
// plain radius / pinched inner radius only), so the fine texture
// never disturbs the smooth edges.
//
// Height above the mid-plane is Gaussian and kept extremely
// thin, like real planetary rings.
//
// Each particle also gets a `bandIndex` — the index (into
// RING_BANDS) of whichever band contributed the largest share of
// its acceptance envelope. This is what the shader compares
// against uVisibleBandCount to fade a whole band in/out together
// as the mouse moves, so new rings appear/disappear as distinct
// bands rather than a smooth radial gradient.
// ------------------------------------------------------------
function buildRingSystem(config) {

    const count = config.count;
    const maxAttempts = count * 60;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const bandIndices = new Float32Array(count);

    let i = 0;
    let attempts = 0;

    while (i < count && attempts < maxAttempts) {

        attempts++;

        const r = HOLE_RADIUS + Math.random() * (RING_OUTER_MAX - HOLE_RADIUS);
        const theta = Math.random() * Math.PI * 2;

        let envelopeSum = 0;
        let dominantBandIndex = 0;
        let dominantShape = -1;

        for (let bandIdx = 0; bandIdx < RING_BANDS.length; bandIdx++) {

            const band = RING_BANDS[bandIdx];

            // The inner edge is pulled inward at the wide "ansae"
            // side of the ellipse (theta ~ 0/PI, the un-squished
            // x-axis) and pushed outward at the narrow top/bottom
            // side (theta ~ PI/2), via ringEdgeShift(). The outer
            // edge is untouched — tested against the plain
            // band.rOuter exactly as before — so the outer
            // silhouette of every band stays the same smooth
            // ellipse it always was.
            const pinchAmount = band.innerPinch !== undefined ? band.innerPinch : RING_INNER_PINCH_AMOUNT;
            const widenAmount = band.narrowWiden !== undefined ? band.narrowWiden : RING_NARROW_WIDEN_AMOUNT;
            const effectiveRInner = band.rInner + ringEdgeShift(theta, pinchAmount, widenAmount);

            if (r < effectiveRInner - band.edge || r > band.rOuter + band.edge) continue;

            const inSoft = smoothstepJS(effectiveRInner - band.edge, effectiveRInner, r);
            const outSoft = 1 - smoothstepJS(band.rOuter, band.rOuter + band.edge, r);
            const bandShape = Math.min(inSoft, 1) * Math.max(outSoft, 0);

            const freq = band.ringletFreq !== undefined ? band.ringletFreq : RINGLET_FREQ;
            const contrast = band.ringletContrast !== undefined ? band.ringletContrast : 0.8;
            const twist = band.spiralTwist !== undefined ? band.spiralTwist : SPIRAL_TWIST;
            // Only the fine ringlet texture's phase winds with
            // angle (theta) — this paints a swirled brightness
            // pattern inside the band without ever moving the
            // band's own edge, so the silhouette stays smooth.
            const ringlet = 0.5 + 0.5 * Math.sin(r * freq + theta * twist + band.rInner * 3.1);
            const modulated = (1 - contrast) + contrast * ringlet;

            envelopeSum += bandShape * band.peak * modulated;

            // Track whichever band contributes the strongest shape at
            // this radius — that's the band this particle "belongs
            // to" for the purposes of mouse-driven generation.
            if (bandShape > dominantShape) {
                dominantShape = bandShape;
                dominantBandIndex = bandIdx;
            }

        }

        // Bands are summed rather than maxed, so wherever two
        // neighbouring bands' soft edges overlap, the shared zone
        // reads a little brighter/denser instead of the bands
        // looking like separate, cleanly divided circles.
        const envelope = Math.min(envelopeSum, 1.0);

        if (envelope <= 0) continue;
        if (Math.random() > envelope) continue;

        // Placement uses the plain radius r for both x and z, with
        // z additionally scaled by RING_ELLIPSE_RATIO so the whole
        // system is a baked-in, perfectly smooth ellipse rather
        // than relying on camera tilt (which stays available on
        // top, for the diagonal raking-angle framing).
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta) * RING_ELLIPSE_RATIO;
        const y = gaussianRandom() * config.thicknessBase;

        const index = i * 3;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.5 + Math.random() * 1.0;
        randoms[i] = Math.random();

        baseSizes[i] = pickBaseSize(config);
        brightnesses[i] = THREE.MathUtils.lerp(config.brightnessMin, config.brightnessMax, envelope * (0.6 + Math.random() * 0.4));
        bandIndices[i] = dominantBandIndex;

        i++;

    }

    const used = i;

    return makePoints(
        positions.subarray(0, used * 3),
        phases.subarray(0, used),
        speeds.subarray(0, used),
        randoms.subarray(0, used),
        baseSizes.subarray(0, used),
        brightnesses.subarray(0, used),
        bandIndices.subarray(0, used),
        config
    );

}

// ============================================================
// SECTION: GLOW CLUSTER BUILDER
// ------------------------------------------------------------
// FUNCTION: buildGlowSphere(config)
// ------------------------------------------------------------
// A soft-edged, per-axis-stretched blob of bright particles —
// used for the centre glow "nucleus" seen through the hole.
// `config.stretch` ([x, y, z]) turns the base sphere into an
// oval bulge; being a child of the same tilted ring group, the
// stretch axis lines up with the ring ellipse's own orientation
// automatically.
// ------------------------------------------------------------
function buildGlowSphere(config) {

    const count = config.count;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const bandIndices = new Float32Array(count);

    for (let i = 0; i < count; i++) {

        const r = Math.abs(gaussianRandom()) * config.radius * 0.5;

        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const sinPhi = Math.sqrt(1 - u * u);

        const x = r * sinPhi * Math.cos(theta) * config.stretch[0];
        const y = r * u * config.stretch[1];
        const z = r * sinPhi * Math.sin(theta) * config.stretch[2];

        const index = i * 3;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.5 + Math.random() * 1.0;
        randoms[i] = Math.random();

        baseSizes[i] = pickBaseSize(config);

        const distNorm = Math.min(r / config.radius, 1);
        brightnesses[i] = THREE.MathUtils.lerp(config.brightnessMax, config.brightnessMin, distNorm);
        bandIndices[i] = 0;

    }

    return makePoints(positions, phases, speeds, randoms, baseSizes, brightnesses, bandIndices, config, config.offset);

}

// ============================================================
// SECTION: CORE SWIRL BUILDER
// ------------------------------------------------------------
// FUNCTION: buildCoreSwirl(config)
// ------------------------------------------------------------
// Fills the hole with `config.arms` spiral arms instead of
// leaving it empty, styled after a tilted galaxy like Andromeda:
// a continuously-filled, dust-lane-textured disc rather than a
// couple of bold, sparse spokes.
//
// The outer boundary at each angle — `outerRadiusAtTheta` — is
// config.baseOuterRadius shifted by ringEdgeShift(theta,
// HOLE_EDGE_PINCH, HOLE_EDGE_WIDEN): the EXACT same base radius
// and shift used for RING_BANDS[0]'s inner edge, so the swirl's
// outer edge and that band's inner edge are the same curve at
// every angle — no gap at the wide side no matter how hard it's
// pinched, no overlap at the narrow side no matter how far it's
// widened.
//
// `t` is how far out a particle sits between innerRadius and
// that angle's outer boundary (0 = centre, 1 = outer edge);
// `twist * (1 - t)` rotates the arm pattern more the closer you
// get to the centre, which is what makes the arms actually
// spiral rather than sit as straight wedges. `armWidth` controls
// how wide/soft each arm reads, and `baseDensity` sets a density
// floor so the space between arms stays filled (like Andromeda's
// dust lanes) instead of reading as empty gaps. Density fades in
// from the very centre (`fadeIn`, blending into CENTER_GLOW) and
// fades back out approaching the shared outer boundary
// (`fadeOut`). Vertical thickness grows a little toward the
// centre so it reads as a soft swirling bulge rather than a
// perfectly flat disc, still tying into the same ellipse squish
// as the rings.
// ------------------------------------------------------------
function buildCoreSwirl(config) {

    const count = config.count;
    const maxAttempts = count * 60;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const bandIndices = new Float32Array(count);

    let i = 0;
    let attempts = 0;

    while (i < count && attempts < maxAttempts) {

        attempts++;

        const theta = Math.random() * Math.PI * 2;

        // Same base radius and shift as RING_BANDS[0]'s inner
        // edge — this is what guarantees the two boundaries
        // always coincide exactly, at every angle.
        const outerRadiusAtTheta = config.baseOuterRadius + ringEdgeShift(theta, HOLE_EDGE_PINCH, HOLE_EDGE_WIDEN);

        const r = config.innerRadius + Math.pow(Math.random(), 1.35) * (outerRadiusAtTheta - config.innerRadius);
        const t = (r - config.innerRadius) / (outerRadiusAtTheta - config.innerRadius);

        // Rotating the arm phase by twist * (1 - t) is what turns
        // a plain radial wedge into an actual spiral: particles
        // close to the centre (t near 0) get rotated further than
        // particles near the outer edge (t near 1).
        const armPhase = theta * config.arms + config.twist * (1 - t);
        const armCos = 0.5 + 0.5 * Math.cos(armPhase);
        const armShape = Math.pow(armCos, 1 / Math.max(config.armWidth, 0.05));
        // baseDensity keeps the disc filled between arms — like
        // Andromeda's continuous, dust-laned disc — instead of
        // leaving empty gaps between distinct spokes.
        const armDensity = config.baseDensity + (1 - config.baseDensity) * armShape;

        const fadeIn = 1;
        const fadeOut = 1;
        const envelope = armDensity * fadeIn * fadeOut;

        if (envelope <= 0) continue;
        if (Math.random() > envelope) continue;

        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta) * RING_ELLIPSE_RATIO;
        // Thicker near the centre (soft bulge), thinning out to
        // match the rings' razor-flat plane by the outer edge.
        const y = gaussianRandom() * config.thicknessBase * (1 + (1 - t) * 2.5);

        const index = i * 3;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.5 + Math.random() * 1.0;
        randoms[i] = Math.random();

        baseSizes[i] = pickBaseSize(config);
        brightnesses[i] = THREE.MathUtils.lerp(config.brightnessMax, config.brightnessMin, t * 0.7);
        bandIndices[i] = 0;

        i++;

    }

    const used = i;

    return makePoints(
        positions.subarray(0, used * 3),
        phases.subarray(0, used),
        speeds.subarray(0, used),
        randoms.subarray(0, used),
        baseSizes.subarray(0, used),
        brightnesses.subarray(0, used),
        bandIndices.subarray(0, used),
        config
    );

}

// ============================================================
// SECTION: STRAY FIELD BUILDER
// ------------------------------------------------------------
// FUNCTION: buildStrayField(config)
// ------------------------------------------------------------
// Scatters a sparse halo of particles starting just beyond the
// outer edge of the rings and thinning out with distance
// (falloffPower), flattened toward the ring plane — the same
// "stray corona drifting past the surface" idea as the Sun's
// DUST_CONFIG halo particles.
// ------------------------------------------------------------
function buildStrayField(config) {

    const count = config.count;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const bandIndices = new Float32Array(count);

    for (let i = 0; i < count; i++) {

        const u = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const sinPhi = Math.sqrt(1 - u * u);

        const dx = sinPhi * Math.cos(theta);
        const dy = u * config.flatten;
        const dz = sinPhi * Math.sin(theta);

        const rf = Math.pow(Math.random(), config.falloffPower);
        const r = config.innerRadius + rf * (config.outerRadius - config.innerRadius);

        // Same baked-in ellipse squish as the ring system itself
        // (RING_ELLIPSE_RATIO), so the stray halo matches the
        // rings' oval shape instead of scattering in a circle
        // around an oval.
        const x = dx * r;
        const y = dy * r;
        const z = dz * r * RING_ELLIPSE_RATIO;

        const index = i * 3;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.5 + Math.random() * 1.0;
        randoms[i] = Math.random();

        baseSizes[i] = pickBaseSize(config);

        const distNorm = Math.min((r - config.innerRadius) / (config.outerRadius - config.innerRadius), 1);
        brightnesses[i] = THREE.MathUtils.lerp(config.brightnessMax, config.brightnessMin, distNorm);
        bandIndices[i] = 0;

    }

    return makePoints(positions, phases, speeds, randoms, baseSizes, brightnesses, bandIndices, config);

}

// ============================================================
// SECTION: BACKGROUND STAR FIELD BUILDER
// ------------------------------------------------------------
// FUNCTION: buildStarField(config)
// ------------------------------------------------------------
// Scatters particles across a spherical shell surrounding the
// whole scene, giving the deep, star-flecked black background
// seen in the reference image. Added directly to the scene, not
// the tilted ring group, so it doesn't spin along with it (the
// ring group's own rotation is skipped for this field, but it is
// still tagged reactive in the assembly section below, so it does
// pick up the mouse-Y brightness/movement response).
// ------------------------------------------------------------
function buildStarField(config) {

    const count = config.count;

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const bandIndices = new Float32Array(count);

    for (let i = 0; i < count; i++) {

        const r = config.innerRadius + Math.random() * (config.outerRadius - config.innerRadius);

        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const sinPhi = Math.sqrt(1 - u * u);

        const x = r * sinPhi * Math.cos(theta);
        const y = r * u;
        const z = r * sinPhi * Math.sin(theta);

        const index = i * 3;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.5 + Math.random() * 1.0;
        randoms[i] = Math.random();

        baseSizes[i] = pickBaseSize(config);
        brightnesses[i] = config.brightnessMin + Math.random() * (config.brightnessMax - config.brightnessMin);
        bandIndices[i] = 0;

    }

    return makePoints(positions, phases, speeds, randoms, baseSizes, brightnesses, bandIndices, config);

}

// ============================================================
// SECTION: BUILD THE RING SYSTEM
// ------------------------------------------------------------
// Assembles the rings, centre glow, and core swirl into one
// tilted group (so they all share the diagonal, raking-angle
// composition), fits the camera to the ring system's full
// potential extent (including the hidden generated bands, so
// there's room on screen for them to appear without the camera
// needing to move), then adds the stray field to the same group
// afterwards and the untilted background starfield straight to
// the scene.
//
// userData.reactive flags a field's material as one that should
// respond to mouse Y (brightness + movement) — now every field,
// including the background starfield. userData.isRing
// additionally flags a field's material as one that should
// respond to mouse X (band generation) — only the main ring
// system itself, so the hole/swirl/glow don't thin out along
// with it.
// ============================================================
const ringGroup = new THREE.Group();

const ringPoints = buildRingSystem(RING_CONFIG);
const glowPoints = buildGlowSphere(GLOW_CONFIG);
const coreSwirlPoints = buildCoreSwirl(CORE_SWIRL_CONFIG);

ringPoints.userData.isRing = true;
[ringPoints, glowPoints, coreSwirlPoints].forEach((p) => { p.userData.reactive = true; });

ringGroup.add(ringPoints);
ringGroup.add(glowPoints);
ringGroup.add(coreSwirlPoints);

scene.add(ringGroup);

// ------------------------------------------------------------
// FUNCTION: fitCamera(object)
// ------------------------------------------------------------
// Same approach as the Sun's fitCamera(): measure the given
// object's bounding box and position the camera far enough back
// on Z to fit it within the field of view, then point
// OrbitControls at the origin. Deliberately fit to the ring
// system alone (not the much wider stray field beyond it), the
// same way the Sun fits to its own body before its dust field is
// considered.
//
// Because ringPoints' geometry now includes the hidden generated
// bands too (they exist as real positions, just with zero point
// size until revealed), this naturally frames the camera a little
// wider than the default 3-band view alone — leaving room for the
// generated rings to actually be visible on screen once the mouse
// reveals them, rather than the camera needing to move.
// ------------------------------------------------------------
function fitCamera(object) {

    const boundingBox = new THREE.Box3().setFromObject(object);
    const size = boundingBox.getSize(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);

    const cameraDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

    camera.position.set(0, 0, cameraDistance * 1.15);
    baseCameraDistance = camera.position.length();

    camera.near = maxSize * 0.001;
    camera.far = maxSize * 100;
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update();

}

fitCamera(ringPoints);

const strayPoints = buildStrayField(STRAY_CONFIG);
strayPoints.userData.reactive = true;
if (!isUniversePreview) ringGroup.add(strayPoints);

const starFieldPoints = buildStarField(STAR_FIELD_CONFIG);
starFieldPoints.userData.reactive = true;
if (!isUniversePreview) scene.add(starFieldPoints);

ringGroup.rotation.x = RING_TILT_X;
ringGroup.rotation.z = RING_TILT_Z;

// ============================================================
// SECTION: ANIMATION LOOP
// ------------------------------------------------------------
// Runs continuously (mirroring the Sun's always-on loop): pushes
// elapsed time into every particle material's uTime uniform,
// updates OrbitControls (auto-rotate + damping), and renders
// through the bloom composer.
//
// Each frame, the smoothed mouse position (see MOUSE_SMOOTHING)
// is mapped to three derived values:
//   - visibleBandCount (mouse X, right half only) -> uVisibleBandCount on the ring-only material
//   - brightnessMult   (mouse Y) -> uBrightnessMult on every reactive material
//   - movementMult     (mouse Y) -> uMovementMult on every reactive material
// ------------------------------------------------------------
const timer = new THREE.Timer();

function animate() {

    requestAnimationFrame(animate);

    timer.update();
    const time = timer.getElapsed();

    ringGroup.rotation.y += RING_ROTATION_SPEED;

    mouseX += (mouseTargetX - mouseX) * MOUSE_SMOOTHING;
    mouseY += (mouseTargetY - mouseY) * MOUSE_SMOOTHING;

    // Only the right half of the mouse's horizontal range advances
    // the visible band count past the core bands. Clamping the
    // left half to 0 here means moving the mouse left of centre
    // never subtracts from MIN_VISIBLE_RING_BANDS (the core bands),
    // so they stay fully visible no matter how far left the mouse
    // goes — only moving right actually reveals the generated
    // bands beyond them.
    const rightMouseFraction = Math.max(mouseX, 0);
    const visibleBandCount = THREE.MathUtils.lerp(MIN_VISIBLE_RING_BANDS, MAX_VISIBLE_RING_BANDS, rightMouseFraction);
    const brightnessMult = THREE.MathUtils.lerp(BRIGHTNESS_MULT_MIN, BRIGHTNESS_MULT_MAX, (mouseY + 1) / 2)
        * (isUniversePreview ? 0.42 : 1);
    const movementMult = THREE.MathUtils.lerp(MOVEMENT_MULT_MIN, MOVEMENT_MULT_MAX, (mouseY + 1) / 2);

    scene.traverse((object) => {

        if (!object.userData.material) return;

        const uniforms = object.userData.material.uniforms;
        uniforms.uTime.value = time;

        if (object.userData.reactive) {
            uniforms.uBrightnessMult.value = brightnessMult;
            uniforms.uMovementMult.value = movementMult;
        }

        if (object.userData.isRing) {
            uniforms.uVisibleBandCount.value = visibleBandCount;
        }

    });

    controls.update();

    window.dispatchEvent(new CustomEvent("canvas-zoom", {
        detail: { planet: "ascendant", zoom: baseCameraDistance / camera.position.distanceTo(controls.target) }
    }));

    window.dispatchEvent(new CustomEvent("visual-coordinates", {
        detail: { planet: "ascendant", x: camera.position.x, y: camera.position.y, z: camera.position.z }
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

    renderer.setSize(containerWidth, containerHeight);
    composer.setSize(containerWidth, containerHeight);

});