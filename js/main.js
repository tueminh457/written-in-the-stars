// Loaded from a pinned CDN version instead of the local node_modules copy.
// three.module.js internally imports from a paired file (three.core.js) —
// if you deploy node_modules yourself, both files have to travel together,
// same version, no partial syncs. Pointing at unpkg for an exact version
// removes that failure mode entirely: the CDN always serves the matched,
// complete pair for 0.185.1, no deploy step required.
// (Note: import specifiers have to be plain string literals — a template
// literal with a variable in it is not valid here — so the version number
// is repeated below instead of pulled from one constant.)

import * as THREE from "https://unpkg.com/three@0.185.1/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.185.1/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://unpkg.com/three@0.185.1/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "https://unpkg.com/three@0.185.1/examples/jsm/postprocessing/OutputPass.js";

console.log("Three.js is working!");


// =====================================================
// GLOBAL SETTINGS
// =====================================================

const PARTICLE_COUNT = 130000;


// =====================================================
// SUN CONFIG (your sun.glb model)
// =====================================================

const SUN_CONFIG = {

    name: "SUN",

    offsetX: 0,

    // Sampling: uniform, area-weighted across the mesh.
    flareBias: 0.0,

    // No synthetic surface noise — your model's bumps are real
    // geometry now.
    noiseType: "none",
    noiseFreq: 0.0,
    noiseAmp: 0.0,

    // White, to match your site aesthetic. Depth/detail now comes
    // from brightness variation (granulation + flares) below,
    // not from color/hue — so it stays white but doesn't look flat.
    color: [1.0, 1.0, 1.0],

    brightnessBase: 0.75,
    glowMult: 0.0,
    alphaMult: 0.55,

    uSize: 0.32,

    // Per-particle size varies between uSize * sizeVariationMin and
    // uSize * sizeVariationMax (skewed toward the small end — see
    // buildPointCloud), instead of every particle being identical.
    sizeVariationMin: 0.12,
    sizeVariationMax: 3.2,

    breathAmount: 0.015,
    breathSpeed: 1.1,
    movementAmount: 0.006,

    flickerAmount: 0.0,

    // -------------------------------------------------
    // Volume fill
    // -------------------------------------------------
    fillInterior: true,
    interiorRatio: 0.5,
    interiorRadiusScale: 0.97,

    // -------------------------------------------------
    // Granulation — the slow-drifting light/dark mottled
    // patches you see across the sun's surface in your
    // reference image. Big, slow-moving noise cells that
    // multiply into each particle's brightness.
    // -------------------------------------------------
    granulationScale: 2.2,       // size of the patches (higher = smaller patches)
    granulationSpeed: 0.05,      // how fast the pattern drifts over time
    darkPatchIntensity: 0.45,    // brightness multiplier at the darkest patches (1.0 = no darkening)

    // -------------------------------------------------
    // Solar flares — faster noise defines "hot regions" on
    // the surface. Particles inside an active region pulse:
    // they erupt outward a little and brighten, then settle
    // back, so flares look like they ignite, travel, and fade
    // rather than being static bright spots.
    // -------------------------------------------------
    flareScale: 3.2,             // size of the hot regions
    flareSpeed: 0.15,            // how fast hot regions drift/evolve
    flareThreshold: 0.55,        // -1..1 noise cutoff; higher = rarer flares
    flareBoost: 1.4,             // extra brightness added at full eruption
    flareTravel: 0.035,          // how far particles push outward at full eruption
    flareSizeBoost: 0.8          // extra point-size multiplier at full eruption
};


// =====================================================
// CONTAINER / SCENE / CAMERA / RENDERER / CONTROLS
// =====================================================

const container = document.getElementById("three-container");

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
    alpha: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(threeCamera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.enableZoom = true;
controls.minDistance = 1;
controls.maxDistance = 30;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4; // slow ambient spin; controls.update() in animate() drives it


// =====================================================
// BLOOM (light emission)
// =====================================================
// This is what makes the sun actually look like it's emitting
// light, rather than just being a bright-colored object: bright
// particles bleed a soft glow into their surroundings.

const composer = new EffectComposer(renderer);

composer.addPass(new RenderPass(scene, threeCamera));

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.12,   // strength — pulled back further, was still washing out the field
    0.02,    // radius — tighter glow spread
    0.6    // threshold — only the very brightest (flare) pixels bloom now
);

composer.addPass(bloomPass);
composer.addPass(new OutputPass());


// =====================================================
// SIMPLE VALUE NOISE (CPU-side, used only for triangle
// sampling / static displacement, not for the animated
// surface effects below — those run on the GPU)
// =====================================================

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


// =====================================================
// PARSE MESH INTO A TRIANGLE LIST
// =====================================================

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


// =====================================================
// BUILD A POINT CLOUD FOR ONE BODY CONFIG
// =====================================================

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

        if (config.fillInterior && Math.random() < config.interiorRatio) {

            const f = Math.cbrt(Math.random()) * config.interiorRadiusScale;

            particlePosition.copy(center).addScaledVector(
                shellPoint.clone().sub(center),
                f
            );

        }

        // Outward direction from the mesh center — used on the GPU
        // so flare eruptions push particles outward along a direction
        // that actually matches your model's shape at that point.
        const dir = particlePosition.clone().sub(center);

        if (dir.lengthSq() < 1e-10) {
            dir.set(0, 1, 0);
        } else {
            dir.normalize();
        }

        const index = i * 3;

        positions[index] = particlePosition.x;
        positions[index + 1] = particlePosition.y;
        positions[index + 2] = particlePosition.z;

        originals[index] = particlePosition.x;
        originals[index + 1] = particlePosition.y;
        originals[index + 2] = particlePosition.z;

        dirs[index] = dir.x;
        dirs[index + 1] = dir.y;
        dirs[index + 2] = dir.z;

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.7 + Math.random() * 0.6;
        randoms[i] = Math.random();

        // Cubing the random value skews the distribution toward the
        // small end, with occasional bigger particles standing out —
        // reads as varied/detailed rather than a flat uniform size.
        const sizeT = Math.pow(Math.random(), 3);
        baseSizes[i] = config.sizeVariationMin
            + sizeT * (config.sizeVariationMax - config.sizeVariationMin);

    }

    // -------------------------------------------------
    // Geometry
    // -------------------------------------------------

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("originalPosition", new THREE.BufferAttribute(originals, 3));
    geometry.setAttribute("dir", new THREE.BufferAttribute(dirs, 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute("rand", new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute("baseSize", new THREE.BufferAttribute(baseSizes, 1));

    // -------------------------------------------------
    // Shader material
    // -------------------------------------------------

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
            attribute vec3 dir;
            attribute float phase;
            attribute float speed;
            attribute float rand;
            attribute float baseSize;

            varying float vIntensity;

            // ---------------------------------------------
            // Classic 3D simplex noise (Ashima Arts / Ian McEwan)
            // Used to animate the granulation and flare patterns.
            // ---------------------------------------------
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

                // BREATHING
                float breath = sin(uTime * speed * ${config.breathSpeed.toFixed(2)} + phase);
                float scale = 1.0 + breath * ${config.breathAmount.toFixed(4)};
                pos *= scale;

                // ORGANIC MOVEMENT
                pos.x += sin(uTime * 0.7 + pos.y * 3.0 + phase) * ${config.movementAmount.toFixed(4)};
                pos.y += cos(uTime * 0.6 + pos.x * 2.0 + phase) * ${config.movementAmount.toFixed(4)};
                pos.z += sin(uTime * 0.8 + pos.x * 2.0 + phase) * ${config.movementAmount.toFixed(4)};

                // ---------------------------------------------
                // GRANULATION — slow, large, drifting noise field
                // that darkens/brightens patches of the surface,
                // like the mottled look of your reference photo.
                // ---------------------------------------------
                float granField = snoise(
                    originalPosition * ${config.granulationScale.toFixed(3)}
                    + vec3(uTime * ${config.granulationSpeed.toFixed(4)}, 0.0, uTime * ${(config.granulationSpeed * 0.6).toFixed(4)})
                );
                float granulation = granField * 0.5 + 0.5; // 0..1
                float surfaceIntensity = mix(${config.darkPatchIntensity.toFixed(3)}, 1.0, granulation);

                // ---------------------------------------------
                // FLARES — faster noise defines "hot regions" that
                // drift across the surface over time. Particles
                // inside an active region pulse: erupt outward +
                // brighten, then settle, so flares look alive
                // instead of static.
                // ---------------------------------------------
                float flareField = snoise(
                    originalPosition * ${config.flareScale.toFixed(3)}
                    + vec3(0.0, 0.0, uTime * ${config.flareSpeed.toFixed(4)})
                );
                float flareRegion = smoothstep(${config.flareThreshold.toFixed(3)}, 1.0, flareField);

                float pulse = 0.5 + 0.5 * sin(uTime * ${(config.flareSpeed * 4.0).toFixed(4)} + phase * 6.2831 * speed);
                float eruption = flareRegion * pow(pulse, 3.0);

                pos += dir * eruption * ${config.flareTravel.toFixed(4)};

                float flareGlow = eruption * ${config.flareBoost.toFixed(3)};

                vIntensity = surfaceIntensity + flareGlow;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

                float perspectiveSize = uSize * baseSize * (300.0 / -mvPosition.z);

                float size = clamp(perspectiveSize, 0.04, 2.2);
                size *= 1.0 + eruption * ${config.flareSizeBoost.toFixed(3)};

                // FLICKER
                float bucket = floor(uTime * ${config.flickerSpeed ? config.flickerSpeed.toFixed(2) : "1.0"});
                float flickerNoise = fract(sin(rand * 43758.5453 + bucket * 12.9898) * 43758.5453);
                float visible = step(${(config.flickerAmount || 0).toFixed(3)}, flickerNoise);

                gl_PointSize = size * visible;

                gl_Position = projectionMatrix * mvPosition;
            }

        `,

        fragmentShader: `

            uniform vec3 uColor;

            varying float vIntensity;

            void main() {

                vec2 uv = gl_PointCoord - vec2(0.5);
                float distanceFromCenter = length(uv);

                float circle = 1.0 - smoothstep(0.32, 0.48, distanceFromCenter);
                float glow = 1.0 - smoothstep(0.0, 0.50, distanceFromCenter);

                if (circle < 0.01) discard;

                float brightness = (${config.brightnessBase.toFixed(3)} + glow * ${config.glowMult.toFixed(3)}) * vIntensity;

                gl_FragColor = vec4(
                    uColor * brightness,
                    circle * ${config.alphaMult.toFixed(3)}
                );

            }

        `

    });

    const points = new THREE.Points(geometry, material);

    points.userData.material = material;
    points.position.x = config.offsetX;

    points.name = config.name;

    return points;

}


// =====================================================
// LOAD MODEL, BUILD THE SUN
// =====================================================

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

        const points = buildPointCloud(parsed, SUN_CONFIG);

        group.add(points);

        scene.add(group);

        centerObject(group);
        fitCamera(group);

    },

    undefined,

    (error) => {
        console.error("MODEL FAILED:", error);
    }

);


// =====================================================
// CENTER OBJECT
// =====================================================

function centerObject(object) {

    const boundingBox = new THREE.Box3().setFromObject(object);
    const center = boundingBox.getCenter(new THREE.Vector3());

    object.position.sub(center);

}


// =====================================================
// FIT CAMERA
// =====================================================

function fitCamera(object) {

    const boundingBox = new THREE.Box3().setFromObject(object);
    const size = boundingBox.getSize(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);

    const cameraDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(threeCamera.fov) / 2));

    threeCamera.position.set(0, 0, cameraDistance * 1.4);

    threeCamera.near = maxSize * 0.001;
    threeCamera.far = maxSize * 100;
    threeCamera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update();

}


// =====================================================
// ANIMATION
// =====================================================

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

    controls.update();

    composer.render();

}

animate();


// =====================================================
// RESIZE
// =====================================================

window.addEventListener("resize", () => {

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    threeCamera.aspect = containerWidth / containerHeight;
    threeCamera.updateProjectionMatrix();

    renderer.setSize(containerWidth, containerHeight);
    composer.setSize(containerWidth, containerHeight);

});