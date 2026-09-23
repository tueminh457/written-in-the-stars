// ============================================================
// MAIN.JS
// ------------------------------------------------------------


// ------------------------------------------------------------
// IMPORTS
// ------------------------------------------------------------

import * as THREE from "https://unpkg.com/three@0.185.1/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.185.1/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://unpkg.com/three@0.185.1/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/OutputPass.js";

console.log("Three.js is working!");


// ============================================================
// SECTION: GLOBAL SETTINGS
// ------------------------------------------------------------
// Top-level constants shared across the whole scene: how many
// particles make up the sun, how strong the bloom glow is, and
// a fixed tilt applied to the whole particle group so it matches
// the reference image's diagonal composition.
// ============================================================

const PARTICLE_COUNT = 320000;

const BLOOM_STRENGTH = 0.15;

const GROUP_TILT_Z = THREE.MathUtils.degToRad(-14);

// ============================================================
// SECTION: SUN_CONFIG
// ------------------------------------------------------------
// Every tunable value for the sun's own particle body: how
// particles are sampled across the mesh, their size tiers,
// how much of the sphere's interior gets filled, the "stray
// corona" particles that drift beyond the surface, and the
// granulation/flare animation that gives the surface its
// mottled, erupting look. The mouse* fields at the end control
// how pointer position nudges flare intensity in real time.
// ============================================================
const SUN_CONFIG = {

    name: "SUN",

    offsetX: 0,

    flareBias: 0.0,

    noiseType: "none",
    noiseFreq: 0.0,
    noiseAmp: 0.0,

    color: [1.0, 1.0, 1.0],

    brightnessBase: 1,
    glowMult: 0.0,
    alphaMult: 0.9,

    uSize: 0.32,

    sizeSmall: 0.18,
    sizeMedium: 0.75,
    sizeBig: 1.0,
    smallChance: 0.72,
    mediumChance: 0.23,

    sizeSmallInterior: 0.4,
    sizeMediumInterior: 1.0,
    sizeBigInterior: 1.3,
    sizeScale: 18,

    breathAmount: 0.015,
    breathSpeed: 0.5,
    movementAmount: 0.006,

    flickerAmount: 0.0,

    fillInterior: true,
    interiorRatio: 0.96,
    interiorRadiusScale: 1,

    strayRatio: 0.05,
    strayDistanceMin: 1.15,
    strayDistanceMax: 2.6,

    // Limb brightening ("shining edge"), same idea as the Moon's rim
    // term: particles are compared against the camera's view direction,
    // and the ones sitting edge-on to the camera (the silhouette limb)
    // are made brighter and bigger, while the face-on core is left
    // closer to its normal brightness. This is what turns the flat,
    // evenly-lit ball of particles into a glowing sphere with a
    // clearly brighter rim, instead of looking like a uniform sparse
    // cloud everywhere.
    rimBrightness: 1.6,
    rimStart: 0.25,
    rimEnd: 0.95,
    rimPower: 1.5,
    rimSizeBoost: 0.6,
    coreBrightness: 0.85,

    granulationScale: 2.2,
    granulationSpeed: 0.05,
    darkPatchIntensity: 0.45,

    flareScale: 3.2,
    flareSpeed: 0.35,
    flareThreshold: 0.35,
    flareBoost: 0,
    flareTravel: 0,
    flareSizeBoost: 0,

    mouseFlareTravelMin: 0.0,
    mouseFlareTravelMax: 0.05,
    mouseFlareBoostMin: 0.0,
    mouseFlareBoostMax: 1.9,
    mouseThresholdShiftMin: 0.0,
    mouseThresholdShiftMax: 0.28,
    mouseCoreBrightnessMin: 0.75,
    mouseCoreBrightnessMax: 0.82,
    mouseFlareEasing: 0.05
};

// ============================================================
// SECTION: DUST_CONFIG
// ------------------------------------------------------------
// Settings for the loose particle cloud surrounding the sun.
// Most particles sit in a flattened, tilted halo that thins out
// with distance; a portion instead ride precomputed elliptical
// "stream" paths, producing the thin looping arcs seen in the
// reference photo. The mouse-reactive fields near the end let
// pointer position bring whole streams in/out of view and widen
// their ripple.
// ============================================================
const DUST_CONFIG = {

    name: "SUN_DUST",

    count: 52000,

    color: [1.0, 1.0, 1.0],

    innerRadiusMult: 1.05,
    outerRadiusMult: 14.0,
    falloffPower: 2.6,
    flatten: 0.55,
    tiltAngle: 0.5,

    // More rings than before (was 7) so dragging the mouse to the
    // right reveals a noticeably fuller set of loops rather than
    // just a few extra ones. streamRatio is bumped alongside it so
    // each ring still gets enough particles to read clearly instead
    // of thinning out as more of them get added.
    streamRatio: 0.45,
    streamCount: 13,
    streamEccMin: 0.55,
    streamEccMax: 0.88,
    streamSemiMajorMin: 2.0,
    streamSemiMajorMax: 7.5,
    streamInclination: 0.9,
    streamWidthMult: 0.05,

    sizeSmall: 1.75,
    sizeMedium: 2.5,
    sizeBig: 5,
    smallChance: 0.5,
    mediumChance: 0.45,

    brightnessMin: 0.18,
    brightnessMax: 1.0,

    uSize: 0.30,
    alphaMult: 0.5,

    sizeScale: 20,

    movementAmount: 0.0025,
    driftSpeed: 0.015,

    twinkleAmount: 0.5,
    twinkleSpeed: 0.5,

    waveFreqMin: 1.0,
    waveFreqMax: 10.0,
    waveAmpMin: 0.03,
    waveAmpMax: 0.32,
    radialStretchMin: 0.85,
    radialStretchMax: 1.7,
    waveEasing: 0.06,

    activeStreamsMin: 0.2,
    activeStreamsMax: 1.05,
    streamFadeBand: 0.15
};

// ============================================================
// SECTION: AXIS_TRAIL_CONFIG
// ------------------------------------------------------------
// Settings for the single straight line of dust that runs
// through the sun's center along its local X axis, with a thin
// perpendicular jitter so it reads as a hairline trail rather
// than a mathematically perfect line.
// ============================================================
const AXIS_TRAIL_CONFIG = {

    name: "AXIS_TRAIL",

    count: 2200,

    color: [1.0, 1.0, 1.0],

    lengthMult: 1.4,
    jitter: 0.02,

    sizeSmall: 0.2,
    sizeMedium: 0.8,
    sizeBig: 1.9,
    smallChance: 0.72,
    mediumChance: 0.23,

    brightnessMin: 0.25,
    brightnessMax: 1.0,

    uSize: 0.28,
    alphaMult: 0.9,

    sizeScale: 18,

    twinkleAmount: 0.4,
    twinkleSpeed: 0.4
};

// ============================================================
// SECTION: CONTAINER / SCENE / CAMERA / RENDERER / CONTROLS
// ------------------------------------------------------------
// One-time setup of the Three.js scene graph: the DOM container
// the canvas renders into, the perspective camera, the WebGL
// renderer (alpha-enabled so the page background shows through),
// and OrbitControls for drag-to-orbit plus a slow constant
// auto-rotate.
// ============================================================
const container = document.getElementById("three-container");
const isUniversePreview = document.body.classList.contains("flow-page");

const scene = new THREE.Scene();

const threeCamera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.01,
    1000
);

threeCamera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
});

renderer.setClearColor(0x000000, 0);

// ------------------------------------------------------------
// RENDER RESOLUTION
// ------------------------------------------------------------
// On the universe screen css/style.css blows this canvas up with
// `transform: scale(2.7)` so the tiny picker Sun reads large. That
// stretched a canvas only ~380px wide, which is what made the Sun's
// particles look chunky and glitchy. Instead, render the canvas
// at the size it is actually shown at: multiply the pixel ratio by
// whatever CSS scale is applied, and tell the shaders (uPointScale)
// so every particle keeps the same on-screen size as before.
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

// Smallest a particle is ever drawn on the universe screen, in canvas
// pixels (0 = no floor, used on the normal display page). Sun particles
// are far smaller than a pixel at this zoom. The GPU draws such points as
// one pixel, and the round-sprite mask in the fragment shader keeps or
// discards that pixel depending on where inside it the particle sits, so
// particles pop on and off as the sun turns. Never drawing them below one
// old (pre-scale) pixel keeps the look and removes the popping.
function getMinDrawSize() {
    return isUniversePreview ? Math.max(pointScale, 2.0) : 0.0;
}

renderer.setPixelRatio(renderPixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(threeCamera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.enableRotate = !isUniversePreview;
controls.enableZoom = !isUniversePreview;
controls.minDistance = 1;
controls.maxDistance = 30;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

let baseCameraDistance = threeCamera.position.length();

window.addEventListener("visual-zoom", (event) => {
    if (event.detail.planet !== "sun") return;
    const direction = threeCamera.position.clone().sub(controls.target).normalize();
    threeCamera.position.copy(controls.target).add(direction.multiplyScalar(baseCameraDistance / event.detail.zoom));
    controls.update();
});

// ============================================================
// SECTION: BLOOM (POST-PROCESSING)
// ------------------------------------------------------------
// Sets up the render pipeline: a base render pass, an
// UnrealBloomPass that blooms only the very brightest pixels
// (BLOOM_STRENGTH is currently turned down low), and a final
// output pass. Left fully wired up so the glow can be restored
// with a single constant change.
// ============================================================
const composer = new EffectComposer(renderer);

composer.addPass(new RenderPass(scene, threeCamera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    BLOOM_STRENGTH,
    0.02,
    0.6
);

if (!isUniversePreview) composer.addPass(bloomPass);
if (!isUniversePreview) composer.addPass(new OutputPass());

// ============================================================
// SECTION: CPU-SIDE VALUE NOISE
// ------------------------------------------------------------
// A small hash-based 3D value noise implementation used only
// for one-time triangle sampling / static displacement on the
// CPU. The animated surface effects (granulation, flares) run
// on the GPU instead, via a separate simplex noise function
// inside the shaders below.
// ============================================================

// ------------------------------------------------------------
// FUNCTION: hash3(x, y, z)
// ------------------------------------------------------------
// Turns three numbers into a pseudo-random value between 0 and 1
// using a sine-based hash. Building block for valueNoise3D.
// ------------------------------------------------------------
function hash3(x, y, z) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return s - Math.floor(s);
}

// ------------------------------------------------------------
// FUNCTION: valueNoise3D(x, y, z)
// ------------------------------------------------------------
// Smoothly interpolates between the 8 hash3() corners of the
// grid cell containing (x, y, z), producing continuous 3D noise
// instead of hash3's harsh per-integer jumps. Used to displace
// sampled points when a config's noiseType is "spikes" or
// "craters".
// ------------------------------------------------------------
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
// SECTION: MESH PARSING
// ------------------------------------------------------------
// FUNCTION: parseTriangles(meshes)
// ------------------------------------------------------------
// Walks every mesh in the loaded model and flattens their
// geometry into one plain array of world-space triangles (each
// with its area, face normal and centroid). Also works out the
// model's bounding-box center and the furthest any triangle
// centroid sits from that center (maxDist). This triangle list
// and maxDist are what the particle builders below sample from.
// ============================================================
function parseTriangles(meshes) {

    const triangles = [];

    let totalArea = 0;

    const bbox = new THREE.Box3();

    meshes.forEach((mesh) => {

        const geometry = mesh.geometry.index
            ? mesh.geometry.toNonIndexed()
            : mesh.geometry;

        const positionAttribute = geometry.attributes.position;
        const matrix = mesh.matrixWorld;

        for (let i = 0; i < positionAttribute.count; i += 3) {

            const A = new THREE.Vector3().fromBufferAttribute(positionAttribute, i).applyMatrix4(matrix);
            const B = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 1).applyMatrix4(matrix);
            const C = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 2).applyMatrix4(matrix);

            bbox.expandByPoint(A);
            bbox.expandByPoint(B);
            bbox.expandByPoint(C);

            const AB = new THREE.Vector3().subVectors(B, A);
            const AC = new THREE.Vector3().subVectors(C, A);
            const crossProduct = new THREE.Vector3().crossVectors(AB, AC);

            const area = crossProduct.length() * 0.5;

            if (area <= 0) continue;

            totalArea += area;

            const faceNormal = crossProduct.clone().normalize();

            const centroid = new THREE.Vector3()
                .add(A).add(B).add(C)
                .multiplyScalar(1 / 3);

            triangles.push({ A, B, C, area, faceNormal, centroid });

        }

    });

    const center = bbox.getCenter(new THREE.Vector3());

    let maxDist = 0;

    triangles.forEach((t) => {
        const d = t.centroid.distanceTo(center);
        if (d > maxDist) maxDist = d;
    });

    console.log("Triangles:", triangles.length, " Surface area:", totalArea);

    return { triangles, totalArea, center, maxDist };
}

// ============================================================
// SECTION: PARTICLE BODY BUILDER
// ------------------------------------------------------------
// FUNCTION: buildPointCloud(parsed, config)
// ------------------------------------------------------------
// Builds the sun's own particle body from the parsed triangle
// list. For each of PARTICLE_COUNT particles it: picks a
// triangle weighted by area, samples a random point on it,
// optionally displaces that point with CPU noise, optionally
// pulls it inward to fill the sphere's interior, and optionally
// pushes a small fraction ("stray corona") back out beyond the
// surface. Every particle also gets a discrete size tier
// (small/medium/big) and per-particle animation attributes
// (phase, speed, random seed).
//
// All positions are stored relative to the mesh's own center
// (not absolute world coordinates), which is what keeps
// group.rotation.z pivoting on the sun itself.
//
// The GPU vertex/fragment shaders below animate breathing,
// organic drift, granulation, and flare eruptions every frame,
// reading the attributes built here.
// ============================================================
function buildPointCloud(parsed, config) {

    const { triangles, center, maxDist } = parsed;

    const weights = new Array(triangles.length);
    const cumulative = new Array(triangles.length);

    let running = 0;

    for (let i = 0; i < triangles.length; i++) {

        const t = triangles[i];

        const outwardness = maxDist > 0
            ? t.centroid.distanceTo(center) / maxDist
            : 0;

        const weight = t.area * (1 + config.flareBias * outwardness);

        weights[i] = weight;

        running += weight;

        cumulative[i] = running;

    }

    const totalWeight = running;

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const originals = new Float32Array(PARTICLE_COUNT * 3);
    const dirs = new Float32Array(PARTICLE_COUNT * 3);
    const phases = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const randoms = new Float32Array(PARTICLE_COUNT);
    const baseSizes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {

        const r = Math.random() * totalWeight;

        let low = 0, high = cumulative.length - 1;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (cumulative[mid] < r) low = mid + 1;
            else high = mid;
        }

        const triangleData = triangles[low];

        let u = Math.random();
        let v = Math.random();

        if (u + v > 1) {
            u = 1 - u;
            v = 1 - v;
        }

        const shellPoint = new THREE.Vector3().copy(triangleData.A);
        shellPoint.add(triangleData.B.clone().sub(triangleData.A).multiplyScalar(u));
        shellPoint.add(triangleData.C.clone().sub(triangleData.A).multiplyScalar(v));

        if (config.noiseType !== "none" && config.noiseAmp > 0) {

            const n = valueNoise3D(
                shellPoint.x * config.noiseFreq,
                shellPoint.y * config.noiseFreq,
                shellPoint.z * config.noiseFreq
            );

            const signed = n * 2 - 1;

            let displacement = 0;

            if (config.noiseType === "spikes") {
                displacement = Math.max(0, signed) * config.noiseAmp;
            } else if (config.noiseType === "craters") {
                displacement = Math.min(0, signed) * config.noiseAmp;
            }

            shellPoint.addScaledVector(triangleData.faceNormal, displacement);

        }

        const particlePosition = shellPoint;

        let wasInterior = false;

        if (config.fillInterior && Math.random() < config.interiorRatio) {

            const f = Math.cbrt(Math.random()) * config.interiorRadiusScale;

            particlePosition.copy(center).addScaledVector(
                shellPoint.clone().sub(center),
                f
            );

            wasInterior = true;

        }

        const dir = particlePosition.clone().sub(center);

        if (dir.lengthSq() < 1e-10) {
            dir.set(0, 1, 0);
        } else {
            dir.normalize();
        }

        if (config.strayRatio && Math.random() < config.strayRatio) {

            const currentDist = particlePosition.distanceTo(center);
            const strayMult = config.strayDistanceMin
                + Math.random() * (config.strayDistanceMax - config.strayDistanceMin);

            particlePosition.copy(center).addScaledVector(dir, currentDist * strayMult);

        }

        const index = i * 3;

        const relX = particlePosition.x - center.x;
        const relY = particlePosition.y - center.y;
        const relZ = particlePosition.z - center.z;

        positions[index] = relX;
        positions[index + 1] = relY;
        positions[index + 2] = relZ;

        originals[index] = relX;
        originals[index + 1] = relY;
        originals[index + 2] = relZ;

        dirs[index] = dir.x;
        dirs[index + 1] = dir.y;
        dirs[index + 2] = dir.z;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.7 + Math.random() * 0.6;
        randoms[i] = Math.random();

        const isStray = config.strayRatio
            && particlePosition.distanceTo(center) > maxDist * 1.05;

                if (isStray) {
            baseSizes[i] = config.sizeSmall;
        } else if (wasInterior) {
            const sizeRoll = Math.random();
            if (sizeRoll < config.smallChance) {
                baseSizes[i] = config.sizeSmallInterior;
            } else if (sizeRoll < config.smallChance + config.mediumChance) {
                baseSizes[i] = config.sizeMediumInterior;
            } else {
                baseSizes[i] = config.sizeBigInterior;
            }
        } else {
            const sizeRoll = Math.random();
            if (sizeRoll < config.smallChance) {
                baseSizes[i] = config.sizeSmall;
            } else if (sizeRoll < config.smallChance + config.mediumChance) {
                baseSizes[i] = config.sizeMedium;
            } else {
                baseSizes[i] = config.sizeBig;
            }
        }

    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("originalPosition", new THREE.BufferAttribute(originals, 3));
    geometry.setAttribute("dir", new THREE.BufferAttribute(dirs, 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute("rand", new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSizes, 1));

    const material = new THREE.ShaderMaterial({

        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,

        uniforms: {
        uTime: { value: 0 },
        uSize: { value: config.uSize },
        uPointScale: { value: pointScale },
        uMinDrawSize: { value: getMinDrawSize() },
        uColor: { value: new THREE.Vector3(...config.color) },
        uMouseFlareTravel: { value: (config.mouseFlareTravelMin + config.mouseFlareTravelMax) / 2 },
        uMouseFlareBoost: { value: (config.mouseFlareBoostMin + config.mouseFlareBoostMax) / 2 },
        uMouseFlareThreshold: { value: (config.mouseThresholdShiftMin + config.mouseThresholdShiftMax) / 2 },
        uMouseCoreBrightness: { value: (config.mouseCoreBrightnessMin + config.mouseCoreBrightnessMax) / 2 }
    },

        vertexShader: `

            uniform float uTime;
            uniform float uSize;
            uniform float uPointScale;
            uniform float uMinDrawSize;
            uniform float uMouseFlareTravel;
            uniform float uMouseFlareBoost;
            uniform float uMouseFlareThreshold;

            attribute vec3 originalPosition;
            attribute vec3 dir;
            attribute float phase;
            attribute float speed;
            attribute float rand;
            attribute float baseSize;

            varying float vIntensity;
            varying float vEnergy;

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

                float breath = sin(uTime * speed * ${config.breathSpeed.toFixed(2)} + phase);
                float scale = 1.0 + breath * ${config.breathAmount.toFixed(4)};
                pos *= scale;

                float mouseMovement = 1.0 + uMouseFlareBoost * 2.5;
                pos.x += sin(uTime * 0.7 + pos.y * 3.0 + phase) * ${config.movementAmount.toFixed(4)} * mouseMovement;
                pos.y += cos(uTime * 0.6 + pos.x * 2.0 + phase) * ${config.movementAmount.toFixed(4)} * mouseMovement;
                pos.z += sin(uTime * 0.8 + pos.x * 2.0 + phase) * ${config.movementAmount.toFixed(4)} * mouseMovement;

                float granField = snoise(
                    originalPosition * ${config.granulationScale.toFixed(3)}
                    + vec3(uTime * ${config.granulationSpeed.toFixed(4)}, 0.0, uTime * ${(config.granulationSpeed * 0.6).toFixed(4)})
                );
                float granulation = granField * 0.5 + 0.5;
                float surfaceIntensity = mix(${config.darkPatchIntensity.toFixed(3)}, 1.0, granulation);

                float flareField = snoise(
                    originalPosition * ${config.flareScale.toFixed(3)}
                    + vec3(0.0, 0.0, uTime * ${config.flareSpeed.toFixed(4)})
                );

                float dynamicThreshold = clamp(${config.flareThreshold.toFixed(3)} - uMouseFlareThreshold, 0.05, 0.95);
                float flareRegion = smoothstep(dynamicThreshold, 1.0, flareField);

                float eruption = flareRegion;

                pos += dir * eruption * (${config.flareTravel.toFixed(4)} + uMouseFlareTravel + uMouseFlareBoost * 0.025);

                float flareGlow = eruption * (${config.flareBoost.toFixed(3)} + uMouseFlareBoost);

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

                // Limb brightening: how edge-on this particle sits versus
                // the camera. Uses the STABLE originalPosition (not the
                // jittered "pos" above) so the rim doesn't flicker as
                // particles breathe/drift — same approach the Moon uses.
                vec4 mvOriginal = modelViewMatrix * vec4(originalPosition, 1.0);
                vec3 centerView = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                vec3 radialDir = normalize(mvOriginal.xyz - centerView);
                vec3 viewDirRim = normalize(-mvOriginal.xyz);
                float facingRim = dot(radialDir, viewDirRim);
                float limbRim = 1.0 - max(facingRim, 0.0);
                float edgeFactor = pow(
                    smoothstep(${config.rimStart.toFixed(3)}, ${config.rimEnd.toFixed(3)}, limbRim),
                    ${config.rimPower.toFixed(3)}
                );

                vIntensity = mix(${config.coreBrightness.toFixed(3)}, 1.0 + ${config.rimBrightness.toFixed(3)}, edgeFactor);

                float perspectiveSize = uSize * baseSize * (${config.sizeScale.toFixed(1)} / -mvPosition.z);

                float size = clamp(perspectiveSize, 0.04, 16.0);
                size *= 1.0 + eruption * (${config.flareSizeBoost.toFixed(3)} + uMouseFlareBoost * 0.4);
                size *= 1.0 + ${config.rimSizeBoost.toFixed(3)} * edgeFactor;
                float rawSize = size * uPointScale;
                size = max(rawSize, uMinDrawSize);

                // Particles lifted up to the minimum size are dimmed a little
                // so the sun's overall brightness matches how it looked
                // before (when those particles were blurred by the upscale).
                vEnergy = uMinDrawSize > 0.0
                    ? mix(0.45, 1.0, clamp(rawSize / uMinDrawSize, 0.0, 1.0))
                    : 1.0;

                float bucket = floor(uTime * ${config.flickerSpeed ? config.flickerSpeed.toFixed(2) : "1.0"});
                float flickerNoise = fract(sin(rand * 43758.5453 + bucket * 12.9898) * 43758.5453);
                float visible = step(${(config.flickerAmount || 0).toFixed(3)}, flickerNoise);

                gl_PointSize = size * visible;

                gl_Position = projectionMatrix * mvPosition;
            }

        `,

        fragmentShader: `

            uniform vec3 uColor;
            uniform float uMouseCoreBrightness;

            varying float vIntensity;
            varying float vEnergy;

            void main() {

                vec2 uv = gl_PointCoord - vec2(0.5);
                float distanceFromCenter = length(uv);

                float circle = 1.0 - smoothstep(0.32, 0.48, distanceFromCenter);
                float glow = 1.0 - smoothstep(0.0, 0.50, distanceFromCenter);

                if (circle < 0.01) discard;

                float brightness = (${config.brightnessBase.toFixed(3)} + glow * ${config.glowMult.toFixed(3)}) * vIntensity * uMouseCoreBrightness;

                gl_FragColor = vec4(
                    uColor * brightness,
                    circle * ${config.alphaMult.toFixed(3)} * vEnergy
                );

            }

        `

    });

    const points = new THREE.Points(geometry, material);

    points.userData.material = material;
    points.position.x = config.offsetX;

    points.name = config.name;

    sunMaterial = material;

    return points;

}

let sunMaterial = null;
let dustMaterial = null;
let dustMaxDist = 1;

// ============================================================
// SECTION: DUST FIELD BUILDER
// ------------------------------------------------------------
// FUNCTION: buildDustField(center, maxDist, config)
// ------------------------------------------------------------
// Builds the separate, procedurally-placed dust cloud around the
// sun — it does not sample the mesh at all. A fraction of
// particles ("stream" particles) are placed along a handful of
// precomputed elliptical orbits with random eccentricity,
// inclination and orientation; the rest ("halo" particles) are
// scattered in a flattened, distance-weighted sphere so the
// field is dense near the sun and thins out further away. The
// whole halo is then tilted for a diagonal composition.
//
// Like buildPointCloud, everything is stored relative to
// `center` so the field is naturally centered at local (0,0,0).
// The vertex shader below reads the stream/orbit attributes
// built here to drive mouse-reactive ring visibility and wave
// ripples.
// ============================================================
function buildDustField(center, maxDist, config) {

    dustMaxDist = maxDist;

    const count = config.count;

    const positions = new Float32Array(count * 3);
    const originals = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);
    const isStreamFlags = new Float32Array(count);
    const orbitRadii = new Float32Array(count);
    const orbitAngles = new Float32Array(count);
    const streamIds = new Float32Array(count);

    const streams = [];
    for (let s = 0; s < config.streamCount; s++) {
        streams.push({
            e: config.streamEccMin + Math.random() * (config.streamEccMax - config.streamEccMin),
            a: maxDist * (config.streamSemiMajorMin + Math.random() * (config.streamSemiMajorMax - config.streamSemiMajorMin)),
            inclination: (Math.random() * 2 - 1) * config.streamInclination,
            node: Math.random() * Math.PI * 2,
            dir: Math.random() < 0.5 ? 1 : -1
        });
    }

    const streamParticleCount = Math.floor(count * config.streamRatio);
    const minRadius = maxDist * config.innerRadiusMult;
    const maxRadius = maxDist * config.outerRadiusMult;

    const cosTilt = Math.cos(config.tiltAngle);
    const sinTilt = Math.sin(config.tiltAngle);

    for (let i = 0; i < count; i++) {

        let x, y, z;

        if (i < streamParticleCount) {

            const streamIdx = i % streams.length;
            const s = streams[streamIdx];

            streamIds[i] = streamIdx / streams.length;

            const theta = Math.random() * Math.PI * 2 * s.dir;
            let r = (s.a * (1 - s.e * s.e)) / (1 + s.e * Math.cos(theta));
            r = Math.min(Math.max(r, minRadius), maxRadius);

            let px = r * Math.cos(theta);
            let pz = r * Math.sin(theta);
            let py = 0;

            const cosI = Math.cos(s.inclination), sinI = Math.sin(s.inclination);
            const py2 = -pz * sinI;
            const pz2 = pz * cosI;

            const cosN = Math.cos(s.node), sinN = Math.sin(s.node);
            const px3 = px * cosN + pz2 * sinN;
            const pz3 = -px * sinN + pz2 * cosN;

            const jitter = r * config.streamWidthMult;
            x = px3 + (Math.random() * 2 - 1) * jitter;
            y = py2 + (Math.random() * 2 - 1) * jitter;
            z = pz3 + (Math.random() * 2 - 1) * jitter;

        } else {

            const u = Math.random() * 2 - 1;
            const theta = Math.random() * Math.PI * 2;
            const sinPhi = Math.sqrt(1 - u * u);

            let dx = sinPhi * Math.cos(theta);
            let dy = u * config.flatten;
            let dz = sinPhi * Math.sin(theta);

            const rf = Math.pow(Math.random(), config.falloffPower);
            const r = minRadius + rf * (maxRadius - minRadius);

            x = dx * r;
            y = dy * r;
            z = dz * r;

            const ty = y * cosTilt - z * sinTilt;
            const tz = y * sinTilt + z * cosTilt;
            y = ty;
            z = tz;
        }

        const index = i * 3;

        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        originals[index] = x;
        originals[index + 1] = y;
        originals[index + 2] = z;

        isStreamFlags[i] = i < streamParticleCount ? 1.0 : 0.0;
        orbitRadii[i] = Math.sqrt(x * x + z * z);
        orbitAngles[i] = Math.atan2(z, x);

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.5 + Math.random() * 1.0;
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
    geometry.setAttribute("originalPosition", new THREE.BufferAttribute(originals, 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute("rand", new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSizes, 1));
    geometry.setAttribute("brightness", new THREE.BufferAttribute(brightnesses, 1));
    geometry.setAttribute("isStream", new THREE.BufferAttribute(isStreamFlags, 1));
    geometry.setAttribute("orbitRadius", new THREE.BufferAttribute(orbitRadii, 1));
    geometry.setAttribute("orbitAngle", new THREE.BufferAttribute(orbitAngles, 1));
    geometry.setAttribute("streamId", new THREE.BufferAttribute(streamIds, 1));

    const material = new THREE.ShaderMaterial({

        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,

        uniforms: {
        uTime: { value: 0 },
        uSize: { value: config.uSize },
        uPointScale: { value: pointScale },
        uMinDrawSize: { value: getMinDrawSize() },
        uColor: { value: new THREE.Vector3(...config.color) },
        uMouseFlareTravel: { value: (config.mouseFlareTravelMin + config.mouseFlareTravelMax) / 2 },
        uMouseFlareBoost: { value: (config.mouseFlareBoostMin + config.mouseFlareBoostMax) / 2 },
        uMouseFlareThreshold: { value: (config.mouseThresholdShiftMin + config.mouseThresholdShiftMax) / 2 },

            uWaveFreq: { value: (config.waveFreqMin + config.waveFreqMax) / 2 },
            uWaveAmp: { value: ((config.waveAmpMin + config.waveAmpMax) / 2) * maxDist },
            uRadialStretch: { value: (config.radialStretchMin + config.radialStretchMax) / 2 },
            uMaxRadius: { value: maxRadius },
            uActiveStreams: { value: (config.activeStreamsMin + config.activeStreamsMax) / 2 },
            uStreamFadeBand: { value: config.streamFadeBand }
        },

        vertexShader: `

            uniform float uTime;
            uniform float uSize;
            uniform float uPointScale;
            uniform float uMinDrawSize;
            uniform float uMouseFlareTravel;
            uniform float uMouseFlareBoost;
            uniform float uMouseFlareThreshold;
            uniform float uWaveFreq;
            uniform float uWaveAmp;
            uniform float uRadialStretch;
            uniform float uMaxRadius;
            uniform float uActiveStreams;
            uniform float uStreamFadeBand;

            attribute vec3 originalPosition;
            attribute float phase;
            attribute float speed;
            attribute float rand;
            attribute float baseSize;
            attribute float brightness;
            attribute float isStream;
            attribute float orbitRadius;
            attribute float orbitAngle;
            attribute float streamId;

            varying float vIntensity;

            void main() {

                vec3 pos = originalPosition;

                float driftAngle = uTime * ${config.driftSpeed.toFixed(4)};
                float cd = cos(driftAngle);
                float sd = sin(driftAngle);
                pos = vec3(
                    pos.x * cd - pos.z * sd,
                    pos.y,
                    pos.x * sd + pos.z * cd
                );

                float streamVisible = 1.0 - smoothstep(
                    uActiveStreams - uStreamFadeBand,
                    uActiveStreams,
                    streamId
                );
                float visibility = mix(1.0, streamVisible, isStream);

                float angleNow = orbitAngle + driftAngle;
                float waveEnvelope = clamp(orbitRadius / uMaxRadius, 0.0, 1.0);
                float wave = sin(angleNow * uWaveFreq + phase) * uWaveAmp * waveEnvelope * isStream;
                pos.y += wave;

                float stretch = mix(1.0, uRadialStretch, isStream);
                pos.x *= stretch;
                pos.z *= stretch;

                pos.x += sin(uTime * 0.5 * speed + phase) * ${config.movementAmount.toFixed(4)};
                pos.y += cos(uTime * 0.4 * speed + phase) * ${config.movementAmount.toFixed(4)};
                pos.z += sin(uTime * 0.6 * speed + phase) * ${config.movementAmount.toFixed(4)};

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

                if (mvPosition.z > -0.05) {
                    gl_PointSize = 0.0;
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    return;
                }

                float perspectiveSize = uSize * baseSize * (${config.sizeScale.toFixed(1)} / -mvPosition.z);
                float size = clamp(perspectiveSize, 0.015, 6.5);
                size *= visibility;
                size = max(size * uPointScale, uMinDrawSize * step(0.001, visibility));

                float bucket = floor(uTime * ${config.twinkleSpeed.toFixed(3)});
                float flickerNoise = fract(sin(rand * 43758.5453 + bucket * 12.9898) * 43758.5453);
                float twinkle = 1.0 - ${config.twinkleAmount.toFixed(3)} * step(0.85, flickerNoise);

                vIntensity = brightness * twinkle * visibility;

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

    const dust = new THREE.Points(geometry, material);

    dust.userData.material = material;
    dust.name = config.name;

    dustMaterial = material;

    return dust;

}

// ============================================================
// SECTION: AXIS TRAIL BUILDER
// ------------------------------------------------------------
// FUNCTION: buildAxisTrail(maxDist, config)
// ------------------------------------------------------------
// Builds the single straight line of dust running through the
// sun's center along its local X axis. Particles are spread
// evenly along the line (with a touch of randomness so spacing
// doesn't look mechanical) and given a small perpendicular
// jitter so the trail reads as a hairline rather than a perfect
// geometric line. Already centered at (0,0,0) by construction,
// so it tilts correctly along with the rest of the group.
// ============================================================
function buildAxisTrail(maxDist, config) {

    const count = config.count;

    const positions = new Float32Array(count * 3);
    const originals = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const randoms = new Float32Array(count);
    const baseSizes = new Float32Array(count);
    const brightnesses = new Float32Array(count);

    const halfLength = maxDist * config.lengthMult;
    const jitterScale = maxDist * config.jitter;

    for (let i = 0; i < count; i++) {

        const t = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
        const alongAxis = t * halfLength + (Math.random() - 0.5) * (halfLength / count) * 2;

        const perpY = (Math.random() * 2 - 1) * jitterScale;
        const perpZ = (Math.random() * 2 - 1) * jitterScale;

        const index = i * 3;

        positions[index] = alongAxis;
        positions[index + 1] = perpY;
        positions[index + 2] = perpZ;

        originals[index] = alongAxis;
        originals[index + 1] = perpY;
        originals[index + 2] = perpZ;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.5 + Math.random() * 1.0;
        randoms[i] = Math.random();

        const sizeRoll = Math.random();
        let size;
        if (sizeRoll < config.smallChance) {
            size = config.sizeSmall;
        } else if (sizeRoll < config.smallChance + config.mediumChance) {
            size = config.sizeMedium;
        } else {
            size = config.sizeBig;
        }
        baseSizes[i] = size;

        brightnesses[i] = config.brightnessMin + Math.random() * (config.brightnessMax - config.brightnessMin);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("originalPosition", new THREE.BufferAttribute(originals, 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
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

            attribute vec3 originalPosition;
            attribute float phase;
            attribute float speed;
            attribute float rand;
            attribute float baseSize;
            attribute float brightness;

            varying float vIntensity;

            void main() {

                vec3 pos = originalPosition;

                pos.y += sin(uTime * 0.3 * speed + phase) * ${(config.jitter * 0.4).toFixed(4)};
                pos.z += cos(uTime * 0.25 * speed + phase) * ${(config.jitter * 0.4).toFixed(4)};

                float bucket = floor(uTime * ${config.twinkleSpeed.toFixed(3)});
                float flickerNoise = fract(sin(rand * 43758.5453 + bucket * 12.9898) * 43758.5453);
                float twinkle = 1.0 - ${config.twinkleAmount.toFixed(3)} * step(0.85, flickerNoise);

                vIntensity = brightness * twinkle;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float perspectiveSize = uSize * baseSize * (${config.sizeScale.toFixed(1)} / -mvPosition.z);
                gl_PointSize = clamp(perspectiveSize, 0.015, 6.0);
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

    const trail = new THREE.Points(geometry, material);

    trail.userData.material = material;
    trail.name = config.name;

    return trail;

}

// ============================================================
// SECTION: MOUSE-DRIVEN WAVE / RING CONTROL
// ------------------------------------------------------------
// Tracks the pointer's normalized position (-1..1 on each axis)
// on plain move, with no click or drag needed, so it runs
// alongside OrbitControls' drag-to-orbit without conflicting
// with it. Each frame, updateDustWave() and updateSunFlare()
// ease the relevant shader uniforms toward a target derived from
// this position, giving smooth rather than jumpy reactions.
// ============================================================
const mouseTarget = { x: 0, y: 0 };

window.addEventListener("pointermove", (event) => {
    if (isUniversePreview) return;
    mouseTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseTarget.y = -((event.clientY / window.innerHeight) * 2 - 1);
});

const dustWaveCurrent = {
    freq: (DUST_CONFIG.waveFreqMin + DUST_CONFIG.waveFreqMax) / 2,
    ampMult: (DUST_CONFIG.waveAmpMin + DUST_CONFIG.waveAmpMax) / 2,
    stretch: (DUST_CONFIG.radialStretchMin + DUST_CONFIG.radialStretchMax) / 2,
    activeStreams: (DUST_CONFIG.activeStreamsMin + DUST_CONFIG.activeStreamsMax) / 2
};

const sunFlareCurrent = {
    travel: (SUN_CONFIG.mouseFlareTravelMin + SUN_CONFIG.mouseFlareTravelMax) / 2,
    boost: (SUN_CONFIG.mouseFlareBoostMin + SUN_CONFIG.mouseFlareBoostMax) / 2,
    thresholdShift: (SUN_CONFIG.mouseThresholdShiftMin + SUN_CONFIG.mouseThresholdShiftMax) / 2,
    coreBrightness: (SUN_CONFIG.mouseCoreBrightnessMin + SUN_CONFIG.mouseCoreBrightnessMax) / 2
};

// ------------------------------------------------------------
// FUNCTION: updateDustWave()
// ------------------------------------------------------------
// Runs every animation frame. Maps the current mouse position to
// target wave frequency, wave amplitude, radial stretch and
// visible-stream-count values (each interpolated between the
// min/max pair in DUST_CONFIG), eases the current values toward
// those targets, then pushes the results into the dust
// material's shader uniforms.
// ------------------------------------------------------------
function updateDustWave() {

    if (!dustMaterial) return;

    const xt = (mouseTarget.x + 1) / 2;
    const yt = (mouseTarget.y + 1) / 2;

    const targetFreq = THREE.MathUtils.lerp(DUST_CONFIG.waveFreqMin, DUST_CONFIG.waveFreqMax, xt);
    const targetAmpMult = THREE.MathUtils.lerp(DUST_CONFIG.waveAmpMin, DUST_CONFIG.waveAmpMax, yt);
    const targetStretch = THREE.MathUtils.lerp(DUST_CONFIG.radialStretchMin, DUST_CONFIG.radialStretchMax, yt);
    const targetActiveStreams = THREE.MathUtils.lerp(DUST_CONFIG.activeStreamsMin, DUST_CONFIG.activeStreamsMax, xt);

    const ease = DUST_CONFIG.waveEasing;

    dustWaveCurrent.freq += (targetFreq - dustWaveCurrent.freq) * ease;
    dustWaveCurrent.ampMult += (targetAmpMult - dustWaveCurrent.ampMult) * ease;
    dustWaveCurrent.stretch += (targetStretch - dustWaveCurrent.stretch) * ease;
    dustWaveCurrent.activeStreams += (targetActiveStreams - dustWaveCurrent.activeStreams) * ease;

    dustMaterial.uniforms.uWaveFreq.value = dustWaveCurrent.freq;
    dustMaterial.uniforms.uWaveAmp.value = dustWaveCurrent.ampMult * dustMaxDist;
    dustMaterial.uniforms.uRadialStretch.value = dustWaveCurrent.stretch;
    dustMaterial.uniforms.uActiveStreams.value = dustWaveCurrent.activeStreams;

}

// ------------------------------------------------------------
// FUNCTION: updateSunFlare()
// ------------------------------------------------------------
// Runs every animation frame. Same easing approach as
// updateDustWave(), but for the sun's own surface: maps mouse
// position to target flare travel distance, flare glow boost,
// hot-region threshold shift and core brightness (each from
// SUN_CONFIG's mouse* min/max pairs), then pushes the eased
// results into the sun material's shader uniforms.
// ------------------------------------------------------------
function updateSunFlare() {

    if (!sunMaterial) return;

    const xt = (mouseTarget.x + 1) / 2;
    const yt = (mouseTarget.y + 1) / 2;

    const targetTravel = THREE.MathUtils.lerp(SUN_CONFIG.mouseFlareTravelMin, SUN_CONFIG.mouseFlareTravelMax, xt);
    const targetBoost = THREE.MathUtils.lerp(SUN_CONFIG.mouseFlareBoostMin, SUN_CONFIG.mouseFlareBoostMax, yt);
    const targetThresholdShift = THREE.MathUtils.lerp(SUN_CONFIG.mouseThresholdShiftMin, SUN_CONFIG.mouseThresholdShiftMax, yt);
    const targetCoreBrightness = THREE.MathUtils.lerp(SUN_CONFIG.mouseCoreBrightnessMin, SUN_CONFIG.mouseCoreBrightnessMax, yt);

    const ease = SUN_CONFIG.mouseFlareEasing;

    sunFlareCurrent.travel += (targetTravel - sunFlareCurrent.travel) * ease;
    sunFlareCurrent.boost += (targetBoost - sunFlareCurrent.boost) * ease;
    sunFlareCurrent.thresholdShift += (targetThresholdShift - sunFlareCurrent.thresholdShift) * ease;
    sunFlareCurrent.coreBrightness += (targetCoreBrightness - sunFlareCurrent.coreBrightness) * ease;

    sunMaterial.uniforms.uMouseFlareTravel.value = sunFlareCurrent.travel;
    sunMaterial.uniforms.uMouseFlareBoost.value = sunFlareCurrent.boost;
    sunMaterial.uniforms.uMouseFlareThreshold.value = sunFlareCurrent.thresholdShift;
    sunMaterial.uniforms.uMouseCoreBrightness.value = sunFlareCurrent.coreBrightness;

}

// ============================================================
// SECTION: LOAD MODEL, BUILD THE SUN
// ------------------------------------------------------------
// Loads the sun.glb model, collects every mesh it contains, and
// hands them to parseTriangles(). The resulting triangle data
// feeds all three particle builders (sun body, dust field, axis
// trail), which are added to one group. The camera is then
// fitted to the sun's size and the whole group gets its fixed
// diagonal tilt.
// ============================================================
const loader = new GLTFLoader();

const group = new THREE.Group();

loader.load(

    "./assets/models/sun.glb",

    (gltf) => {

        console.log("MODEL LOADED!");

        const meshes = [];

        gltf.scene.traverse((object) => {
            if (object.isMesh) meshes.push(object);
        });

        console.log("Meshes found:", meshes.length);

        const parsed = parseTriangles(meshes);

        const sunConfig = isUniversePreview
            ? { ...SUN_CONFIG, strayRatio: 0.04 }
            : SUN_CONFIG;
        const points = buildPointCloud(parsed, sunConfig);

        group.add(points);

        if (!isUniversePreview) {
            group.add(buildDustField(parsed.center, parsed.maxDist, DUST_CONFIG));
            group.add(buildAxisTrail(parsed.maxDist, AXIS_TRAIL_CONFIG));
        } else {
            group.add(buildDustField(parsed.center, parsed.maxDist, {
                ...DUST_CONFIG,
                count: 16000,
                outerRadiusMult: 3.6,
                streamRatio: 0.7,
                streamCount: 5,
                streamSemiMajorMin: 1.3,
                streamSemiMajorMax: 3.4,
                streamWidthMult: 0.025,
                alphaMult: 0.24
            }));
        }

        scene.add(group);

        fitCamera(isUniversePreview ? group : points);

        group.rotation.z = GROUP_TILT_Z;

    },

    undefined,

    (error) => {
        console.error("MODEL FAILED:", error);
    }

);

// ------------------------------------------------------------
// FUNCTION: fitCamera(object)
// ------------------------------------------------------------
// Measures the given object's bounding box and positions the
// camera far enough back on the Z axis that the object fits
// within the camera's field of view, then updates the near/far
// clip planes to match the object's scale and points
// OrbitControls' target at the origin.
// ------------------------------------------------------------
function fitCamera(object) {

    const boundingBox = new THREE.Box3().setFromObject(object);
    const size = boundingBox.getSize(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);

    const cameraDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(threeCamera.fov) / 2));

    threeCamera.position.set(0, 0, cameraDistance * 1.4);
    baseCameraDistance = cameraDistance * 1.4;

    threeCamera.near = maxSize * 0.001;
    threeCamera.far = maxSize * 100;
    threeCamera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update();

    window.dispatchEvent(new CustomEvent("visual-coordinates", {
        detail: { planet: "sun", x: threeCamera.position.x, y: threeCamera.position.y, z: threeCamera.position.z }
    }));

}

// ============================================================
// SECTION: ANIMATION LOOP
// ------------------------------------------------------------
// FUNCTION: animate()
// ------------------------------------------------------------
// The main render loop, called once per frame via
// requestAnimationFrame. Advances the shared timer, pushes the
// elapsed time into every particle material's uTime uniform,
// eases the mouse-driven dust/flare uniforms, updates
// OrbitControls' damping, and renders the scene through the
// bloom composer.
// ------------------------------------------------------------
const timer = new THREE.Timer();

function animate() {

    requestAnimationFrame(animate);

    timer.update();
    const time = timer.getElapsed();

    scene.traverse((object) => {
        if (object.userData.material) {
            object.userData.material.uniforms.uTime.value = time;
        }
    });

    updateDustWave();
    updateSunFlare();

    controls.update();

    window.dispatchEvent(new CustomEvent("canvas-zoom", {
        detail: { planet: "sun", zoom: baseCameraDistance / threeCamera.position.distanceTo(controls.target) }
    }));

    window.dispatchEvent(new CustomEvent("visual-coordinates", {
        detail: { planet: "sun", x: threeCamera.position.x, y: threeCamera.position.y, z: threeCamera.position.z }
    }));

    composer.render();

}

animate();

// ============================================================
// SECTION: RESIZE HANDLING
// ------------------------------------------------------------
// Keeps the camera aspect ratio, renderer size and bloom
// composer size in sync with the container's current dimensions
// whenever the window is resized.
// ============================================================
window.addEventListener("resize", () => {

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    threeCamera.aspect = containerWidth / containerHeight;
    threeCamera.updateProjectionMatrix();

    // The container's CSS scale can change (the universe screen only gets
    // its final size after it is revealed), so re-measure it every resize.
    renderPixelRatio = getRenderPixelRatio();
    pointScale = renderPixelRatio / Math.min(window.devicePixelRatio, 2);

    [sunMaterial, dustMaterial].forEach((material) => {
        if (!material) return;
        material.uniforms.uPointScale.value = pointScale;
        material.uniforms.uMinDrawSize.value = getMinDrawSize();
    });

    renderer.setPixelRatio(renderPixelRatio);
    composer.setPixelRatio(renderPixelRatio);

    renderer.setSize(containerWidth, containerHeight);
    composer.setSize(containerWidth, containerHeight);

});