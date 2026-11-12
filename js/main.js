// Tiny Planet Defender
// Three.js browser game. Platform SDK calls live in platform.js.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { platform, hooks } from './platform.js';
import { AudioManager } from './audio.js';

// ============================================================ Helpers
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

// ============================================================ Config
const PLANET_R = 3;
const ORBIT_R = 4.4;
const VIEW_R = 9.2; // radius of the play area that always stays on screen

const UPGRADES = [
  { id: 'rate',   ico: '⚡',       name: 'Rapid Fire',     desc: '+25% fire rate',                     max: 8, base: 12, growth: 1.5 },
  { id: 'damage', ico: '💥', name: 'Heavy Rounds',   desc: '+1 damage per shot',                 max: 8, base: 15, growth: 1.55 },
  { id: 'twin',   ico: '✦',       name: 'Twin Cannon',    desc: 'Fire two shots at once',             max: 1, base: 55, growth: 1 },
  { id: 'spread', ico: '🌠', name: 'Spread Shot',    desc: '+2 angled shots',                    max: 2, base: 90, growth: 2.2 },
  { id: 'magnet', ico: '🧲', name: 'Crystal Magnet', desc: 'Bigger crystal pickup range',        max: 5, base: 10, growth: 1.5 },
  { id: 'shield', ico: '🛡️', name: 'Energy Shield', desc: 'Blocks 1 hit per level. Recharges every wave', max: 4, base: 25, growth: 1.7 },
  { id: 'hull',   ico: '🌍', name: 'Planet Armor',   desc: '+3 max HP and full heal',            max: 6, base: 20, growth: 1.5 },
  { id: 'repair', ico: '➕',       name: 'Repair',         desc: 'Restore 4 HP',                       max: Infinity, base: 8, growth: 1 },
];

// Each background with its brightness (lower = darker, keeps gameplay readable)
const BACKGROUNDS = [['bg_nebula_planet.jpg', 0.085], ['bg_blue.jpg', 0.22], ['bg_purple.jpg', 0.22], ['bg_green.jpg', 0.22]];

// ============================================================ State
const save = { best: 0, runs: 0, sfx: true, music: true };

const run = {
  wave: 0,
  hp: 10,
  crystals: 0,
  kills: 0,
  waveKills: 0,
  waveTotal: 0,
  waveCrystals: 0,
  shield: 0,
  levels: {},
  revived: false,
};

let state = 'loading'; // loading | play | shop | over
let paused = false;
let adActive = false;
let timeScale = 1;
let spawnQueue = [];
let spawnTimer = 0;
let spawnInterval = 1.4;
let waveClearTimer = -1;
let fireCooldown = 0;
let shake = 0;
let hintVisible = true;
let bossRef = null;
let shopBonusUsed = false;

const lvl = (id) => run.levels[id] || 0;
const stats = () => ({
  fireRate: 4 * Math.pow(1.22, lvl('rate')),
  damage: 1 + lvl('damage'),
  twin: lvl('twin') > 0,
  spread: lvl('spread'),
  magnet: 2.0 + 0.55 * lvl('magnet'),
  shieldMax: lvl('shield'),
  maxHp: 15 + 3 * lvl('hull'),
});

// ============================================================ Renderer & scene
const canvas = $('game');
const isMobile = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
const camBase = new THREE.Vector3();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.45, 0.75);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = true;

// Lights
scene.add(new THREE.HemisphereLight(0xbfe4ff, 0x1a0d26, 1.3));
const sun = new THREE.DirectionalLight(0xfff0dd, 2.8);
sun.position.set(-7, 8, 10);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x6ad8ff, 1.4);
rim.position.set(8, -5, -6);
scene.add(rim);

// Play-area size, updated on resize
const view = { halfW: 10, halfH: 10 };

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  composer.setPixelRatio(pixelRatio);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const viewR = camera.aspect < 0.8 ? VIEW_R * 0.88 : VIEW_R; // portrait phones: zoom in a little
  const dist = viewR / Math.tan(Math.min(vHalf, hHalf));
  camBase.set(0, -dist * 0.14, dist);
  camera.position.copy(camBase);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  view.halfH = Math.tan(vHalf) * dist;
  view.halfW = view.halfH * camera.aspect;
  layoutBackground();
}

// ============================================================ Background (painted image + twinkling stars)
const bgGroup = new THREE.Group();
scene.add(bgGroup);
const BG_Z = -90;
const bgPlanes = [];
let bgIndex = -1;
const texLoader = new THREE.TextureLoader();
const bgTextures = {};

function makeBgPlane() {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  mat.color.setScalar(0.2); // darken so gameplay stays readable
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.position.z = BG_Z;
  mesh.renderOrder = -10;
  bgGroup.add(mesh);
  return mesh;
}
bgPlanes.push(makeBgPlane(), makeBgPlane());

function layoutBackground() {
  const d = camBase.z - BG_Z;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d * 1.18;
  const halfW = halfH * camera.aspect;
  for (const p of bgPlanes) {
    const tex = p.material.map;
    const ta = tex && tex.image ? tex.image.width / tex.image.height : 1;
    let w = halfW * 2, h = w / ta;
    if (h < halfH * 2) { h = halfH * 2; w = h * ta; }
    p.scale.set(w, h, 1);
  }
}

function loadBgTexture(name) {
  if (bgTextures[name]) return Promise.resolve(bgTextures[name]);
  return new Promise((resolve) => {
    texLoader.load('assets/bg/' + name, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      bgTextures[name] = t;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

let bgFade = 1;
async function setBackground(i) {
  i = i % BACKGROUNDS.length;
  if (i === bgIndex) return;
  const [file, dim] = BACKGROUNDS[i];
  const tex = await loadBgTexture(file);
  if (!tex) return;
  bgIndex = i;
  const [front, back] = bgPlanes;
  back.material.map = front.material.map;
  back.material.opacity = front.material.opacity;
  back.material.color.copy(front.material.color);
  front.material.color.setScalar(dim);
  back.material.needsUpdate = true;
  front.material.map = tex;
  front.material.opacity = 0;
  front.material.needsUpdate = true;
  front.renderOrder = -9;
  back.renderOrder = -10;
  bgFade = 0;
  layoutBackground();
}

// Twinkling star layer for depth
const starMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPR: { value: pixelRatio } },
  vertexShader: `
    attribute float aSize; attribute float aPhase; attribute vec3 aColor;
    uniform float uTime; uniform float uPR;
    varying float vAlpha; varying vec3 vColor;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uPR * (60.0 / -mv.z);
      vAlpha = 0.45 + 0.55 * sin(uTime * (0.8 + fract(aPhase * 7.3) * 2.2) + aPhase * 6.2831);
      vColor = aColor;
    }`,
  fragmentShader: `
    varying float vAlpha; varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      float core = smoothstep(0.5, 0.0, d);
      float cross = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2)
                  + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2);
      float a = (core * core + cross * 0.35) * vAlpha;
      gl_FragColor = vec4(vColor * a, a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
{
  const N = 700;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), col = new Float32Array(N * 3);
  const palette = [new THREE.Color(0xffffff), new THREE.Color(0x9fdcff), new THREE.Color(0xffe2b8), new THREE.Color(0xc9b8ff)];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(-70, 70);
    pos[i * 3 + 1] = rand(-50, 50);
    pos[i * 3 + 2] = rand(-70, -12);
    size[i] = Math.random() < 0.06 ? rand(5, 8) : rand(1.5, 3.5);
    phase[i] = Math.random();
    const c = pick(palette);
    col[i * 3] = c.r * 1.3; col[i * 3 + 1] = c.g * 1.3; col[i * 3 + 2] = c.b * 1.3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, starMat);
  stars.renderOrder = -8;
  scene.add(stars);
}

// ============================================================ Fresnel glow material (atmosphere + shield)
function glowMaterial(color, power, strength) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uStrength: { value: strength },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uPower; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), uPower) * uStrength;
        gl_FragColor = vec4(uColor * f, f);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ============================================================ World objects
const world = new THREE.Group();
scene.add(world);

const planetGroup = new THREE.Group();
planetGroup.rotation.x = 0.35;
world.add(planetGroup);
const planetSpin = new THREE.Group();
planetGroup.add(planetSpin);

const atmoMat = glowMaterial(0x58d8ff, 2.6, 1.6);
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.1, 48, 32), atmoMat);
world.add(atmosphere);
const atmoBase = new THREE.Color(0x58d8ff);
const atmoHurt = new THREE.Color(0xff3050);
let planetHurt = 0;

const shieldMat = glowMaterial(0x7fd0ff, 1.8, 0);
const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.32, 48, 32), shieldMat);
world.add(shieldMesh);
let shieldFlash = 0;

const orbitRing = new THREE.Mesh(
  new THREE.TorusGeometry(ORBIT_R, 0.02, 6, 180),
  new THREE.MeshBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
);
world.add(orbitRing);

// Turret: pivot rotates around the planet; the mount sits on the orbit ring.
const turretPivot = new THREE.Group();
world.add(turretPivot);
const turretMount = new THREE.Group();
turretMount.position.set(ORBIT_R, 0, 0);
turretPivot.add(turretMount);
let turretModelSingle = null;
let turretModelDouble = null;
let turretAngle = Math.PI / 2;
let aimAngle = Math.PI / 2;
const TURRET_TIP = 1.2;

const pickupRing = new THREE.Mesh(
  new THREE.RingGeometry(0.97, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0x6dffb0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
turretMount.add(pickupRing);

const turretBase = new THREE.Mesh(
  new THREE.CircleGeometry(0.7, 40),
  new THREE.MeshBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
);
turretBase.position.z = -0.3;
turretMount.add(turretBase);

function radialGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(160,240,255,0.8)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = radialGlowTexture();
const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xaef8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
muzzle.position.set(TURRET_TIP + 0.05, 0, 0.15);
muzzle.scale.setScalar(0.9);
muzzle.visible = false;
turretMount.add(muzzle);
let muzzleTime = 0;

// ============================================================ Model loading
const gltfLoader = new GLTFLoader();
const templates = {};

// Models load from assets/models. A build can also embed them as base64 (window.EMBEDDED_MODELS).
function loadModel(file) {
  const embedded = window.EMBEDDED_MODELS && window.EMBEDDED_MODELS[file];
  if (embedded) {
    const bytes = Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0));
    return gltfLoader.parseAsync(bytes.buffer, '');
  }
  return gltfLoader.loadAsync('assets/models/' + file);
}

// Center a model and scale it so its largest side is 1 unit.
function makeTemplate(gltfScene) {
  const box = new THREE.Box3().setFromObject(gltfScene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  gltfScene.position.sub(center);
  const inner = new THREE.Group();
  inner.add(gltfScene);
  inner.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}

function instance(name, size, cloneMaterials = false) {
  const obj = templates[name].clone(true);
  obj.scale.setScalar(size);
  const mats = [];
  if (cloneMaterials) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (!o.material.emissive) o.material.emissive = new THREE.Color(0, 0, 0);
        mats.push(o.material);
      }
    });
  }
  return { obj, mats };
}

// Kenney turret: base is local +Y, barrel is local +Z.
// We want the barrel pointing outward (+X of the mount) and the top facing the camera (+Z).
function orientTurret(obj) {
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0)
  );
  const holder = new THREE.Group();
  obj.quaternion.setFromRotationMatrix(m);
  holder.add(obj);
  return holder;
}

// Long cannon barrels so the turret reads clearly from the top-down camera
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 0.8, roughness: 0.3 });
const barrelTipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.2, 2.6) });
function addBarrels(holder, offsets) {
  for (const off of offsets) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.85, 12), barrelMat);
    barrel.rotation.z = -Math.PI / 2;
    barrel.position.set(0.75, off, 0.15);
    holder.add(barrel);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.08, 12), barrelTipMat);
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(1.17, off, 0.15);
    holder.add(tip);
  }
}

// ============================================================ Particles
class Particles {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: pixelRatio }, uScale: { value: 1 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        uniform float uPR; uniform float uScale;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPR * uScale / -mv.z;
          vColor = aColor; vAlpha = aAlpha;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vAlpha;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  spawn(x, y, z, vx, vy, vz, color, size, life, drag = 2) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.alpha[i] = 1;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] *= k; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
const particles = new Particles(2400);
particles.mat.uniforms.uScale.value = 30;
world.add(particles.points);

const COL = {
  fire: new THREE.Color(2.4, 1.2, 0.35),
  ember: new THREE.Color(1.6, 0.55, 0.15),
  spark: new THREE.Color(1.4, 2.2, 2.6),
  green: new THREE.Color(0.5, 2.4, 1.2),
  purple: new THREE.Color(1.6, 0.6, 2.4),
  steel: new THREE.Color(1.2, 1.5, 2.0),
  red: new THREE.Color(2.6, 0.5, 0.6),
  shield: new THREE.Color(0.8, 1.8, 2.8),
};

// Expanding shock rings
const rings = [];
const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
function shockRing(pos, color, size, life = 0.45) {
  let r = rings.find((x) => x.t <= 0);
  if (!r) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    world.add(mesh);
    r = { mesh, t: 0, life: 0, size: 1 };
    rings.push(r);
  }
  r.mesh.position.copy(pos);
  r.mesh.material.color.copy(color).multiplyScalar(0.6);
  r.mesh.visible = true;
  r.t = life; r.life = life; r.size = size;
}
function updateRings(dt) {
  for (const r of rings) {
    if (r.t <= 0) continue;
    r.t -= dt;
    const k = 1 - Math.max(0, r.t) / r.life;
    r.mesh.scale.setScalar(0.2 + k * r.size);
    r.mesh.material.opacity = (1 - k) * 0.9;
    if (r.t <= 0) r.mesh.visible = false;
  }
}

function explode(pos, color, scale = 1, count = 26) {
  const n = Math.round(count * scale);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = rand(2, 7) * scale;
    particles.spawn(pos.x, pos.y, pos.z + rand(-0.2, 0.4), Math.cos(a) * sp, Math.sin(a) * sp, rand(-1, 2), i % 3 === 0 ? COL.ember : color, rand(18, 34) * scale, rand(0.35, 0.8), 3);
  }
  for (let i = 0; i < n / 2; i++) {
    const a = Math.random() * TAU;
    const sp = rand(5, 11) * scale;
    particles.spawn(pos.x, pos.y, pos.z, Math.cos(a) * sp, Math.sin(a) * sp, 0, COL.spark, rand(6, 10), rand(0.2, 0.45), 4);
  }
  shockRing(pos, color, 1.6 * scale);
}

// ============================================================ Entities
const meteors = [];
const bullets = [];
const crystals = [];

const bulletGeo = new THREE.CapsuleGeometry(0.075, 0.5, 2, 8);
bulletGeo.rotateZ(Math.PI / 2); // length along X
const bulletMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.0) });
const bulletPool = [];

function fireBullet(x, y, angle, damage) {
  let b = bulletPool.pop();
  if (!b) {
    b = { mesh: new THREE.Mesh(bulletGeo, bulletMat) };
  }
  b.mesh.position.set(x, y, 0);
  b.mesh.rotation.set(0, 0, angle);
  b.vx = Math.cos(angle) * BULLET_SPEED;
  b.vy = Math.sin(angle) * BULLET_SPEED;
  b.life = 1.2;
  b.damage = damage;
  world.add(b.mesh);
  bullets.push(b);
}

const crystalGeo = new THREE.OctahedronGeometry(0.17, 0);
const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6dffb0, emissive: new THREE.Color(0.2, 1.4, 0.7), roughness: 0.25, metalness: 0.3 });
const crystalPool = [];

function dropCrystals(pos, count) {
  for (let i = 0; i < count; i++) {
    let c = crystalPool.pop();
    if (!c) c = { mesh: new THREE.Mesh(crystalGeo, crystalMat) };
    c.mesh.position.set(pos.x, pos.y, 0.2);
    c.mesh.scale.setScalar(1);
    c.mesh.visible = true;
    const a = Math.random() * TAU;
    const sp = rand(1.5, 3.5);
    c.vx = Math.cos(a) * sp;
    c.vy = Math.sin(a) * sp;
    c.life = 9;
    c.homing = false;
    c.spin = rand(2, 5);
    world.add(c.mesh);
    crystals.push(c);
  }
}

const METEOR_TYPES = {
  rock:   { models: ['rock_a', 'rock_b', 'rock_c'], hp: 1,  speed: [1.0, 1.4], size: [0.9, 1.25], dmg: 1, reward: 2 },
  fast:   { models: ['rock_c'],                    hp: 1,  speed: [2.6, 3.0], size: [0.6, 0.7],   dmg: 1, reward: 2 },
  split:  { models: ['meteor_split'],              hp: 3,  speed: [0.9, 1.15], size: [1.2, 1.35],  dmg: 2, reward: 3 },
  shard:  { models: ['rock_a', 'rock_b'],          hp: 1,  speed: [1.6, 2.0], size: [0.5, 0.6],   dmg: 1, reward: 1 },
  armor:  { models: ['rock_large'],                hp: 6,  speed: [0.75, 0.9], size: [1.2, 1.35],  dmg: 2, reward: 5 },
  boss:   { models: ['rock_large'],                hp: 40, speed: [0.4, 0.45], size: [2.6, 2.6],  dmg: 5, reward: 30 },
};

function spawnMeteor(type, from = null) {
  const def = METEOR_TYPES[type];
  const w = run.wave;
  const hpScale = 1 + (w - 1) * 0.12;
  const size = rand(def.size[0], def.size[1]);
  const { obj, mats } = instance(pick(def.models), size, true);

  // Base glow per type so meteors stand out against the dark background
  const glow = type === 'fast' ? [0.9, 0.35, 0.05] : type === 'boss' ? [0.22, 0.06, 0.01] : type === 'split' ? [0.18, 0.05, 0.25] : [0.12, 0.06, 0.03];
  for (const m of mats) { m.emissive.setRGB(glow[0], glow[1], glow[2]); m.emissiveIntensity = 1; }
  if (type === 'armor') for (const m of mats) { m.color.multiply(new THREE.Color(0.55, 0.62, 0.78)); m.metalness = 0.75; m.roughness = 0.35; }
  if (type === 'split') for (const m of mats) { m.color.multiply(new THREE.Color(0.85, 0.6, 1.25)); }

  let x, y;
  if (from) {
    x = from.x; y = from.y;
  } else {
    // Random point just outside the visible rectangle
    const hw = view.halfW + 1.6, hh = view.halfH + 1.6;
    const per = 2 * (hw + hh);
    let p = Math.random() * per * 2;
    if (p < 2 * hw) { x = -hw + p; y = hh; }
    else if ((p -= 2 * hw) < 2 * hh) { x = hw; y = hh - p; }
    else if ((p -= 2 * hh) < 2 * hw) { x = hw - p; y = -hh; }
    else { p -= 2 * hw; x = -hw; y = -hh + p; }
  }
  const target = new THREE.Vector2(rand(-1.2, 1.2), rand(-1.2, 1.2));
  const dir = new THREE.Vector2(target.x - x, target.y - y).normalize();
  const speed = rand(def.speed[0], def.speed[1]) * (type === 'boss' ? 1 : 1 + w * 0.015);
  obj.position.set(x, y, 0);
  obj.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
  world.add(obj);
  const m = {
    type, obj, mats,
    hp: Math.max(1, Math.round(def.hp * hpScale)),
    vx: dir.x * speed, vy: dir.y * speed,
    radius: size * 0.48,
    dmg: def.dmg,
    reward: def.reward,
    spin: new THREE.Vector3(rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1.5, 1.5)),
    flash: 0,
    glow,
    spawnTimer: 3,
  };
  m.maxHp = m.hp;
  if (from) { m.vx += rand(-1.5, 1.5); m.vy += rand(-1.5, 1.5); }
  meteors.push(m);
  if (type === 'boss') {
    bossRef = m;
    $('bossWrap').classList.remove('hidden');
  }
  return m;
}

function removeMeteor(i) {
  const m = meteors[i];
  world.remove(m.obj);
  meteors[i] = meteors[meteors.length - 1];
  meteors.pop();
  if (m === bossRef) { bossRef = null; $('bossWrap').classList.add('hidden'); }
}

function killMeteor(i) {
  const m = meteors[i];
  const p = m.obj.position;
  const color = m.type === 'split' ? COL.purple : m.type === 'armor' ? COL.steel : COL.fire;
  explode(p, color, m.type === 'boss' ? 2.4 : clamp(m.radius * 1.6, 0.6, 1.3));
  audio.play(pick(['boom1', 'boom2', 'boom3']), { volume: m.type === 'boss' ? 1 : 0.55, rate: rand(0.9, 1.1), gap: 0.05 });
  if (m.type === 'boss') { audio.play('planet_hit', { volume: 0.8 }); shake = 0.8; platform.happyTime(); }
  dropCrystals(p, m.reward);
  if (m.type === 'split') for (let k = 0; k < 3; k++) spawnMeteor('shard', p);
  run.kills++;
  if (m.type !== 'shard') run.waveKills++;
  removeMeteor(i);
}

// ============================================================ Waves
function buildWave(n) {
  const q = [];
  const total = 5 + Math.floor(n * 1.6);
  const isBoss = n % 5 === 0;
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    const pFast = n >= 4 ? Math.min(0.25, 0.06 + n * 0.012) : 0;
    const pSplit = n >= 5 ? Math.min(0.2, 0.04 + n * 0.01) : 0;
    const pArmor = n >= 7 ? Math.min(0.18, 0.03 + n * 0.008) : 0;
    if (r < pFast) q.push('fast');
    else if (r < pFast + pSplit) q.push('split');
    else if (r < pFast + pSplit + pArmor) q.push('armor');
    else q.push('rock');
  }
  if (isBoss) q.splice(Math.floor(q.length / 3), 0, 'boss');
  return q;
}

function startWave(n) {
  run.wave = n;
  spawnQueue = buildWave(n);
  run.waveTotal = spawnQueue.length;
  run.waveKills = 0;
  run.waveCrystals = 0;
  spawnInterval = Math.max(0.45, 1.9 - n * 0.06);
  spawnTimer = 1.2;
  waveClearTimer = -1;
  run.shield = stats().shieldMax;
  state = 'play';
  timeScale = 1;
  setBackground(Math.floor((n - 1) / 5));
  const boss = n % 5 === 0;
  showBanner(boss ? 'BOSS WAVE' : 'WAVE ' + n, boss);
  audio.play(boss ? 'boss' : 'wave', { volume: 0.8 });
  platform.gameplayStart();
  updateHud(true);
}

function waveCleared() {
  // Pull every remaining crystal to the turret
  for (const c of crystals) c.homing = true;
  waveClearTimer = 1.4;
}

// ============================================================ Gameplay update
function getTurretTip(out) {
  return turretMount.localToWorld(out.set(TURRET_TIP, 0, 0));
}

const BULLET_SPEED = 28;
const ASSIST_CONE = 0.45; // radians (~25 degrees) either side of where you aim

// Aim assist: find the meteor nearest to the aim direction and lead the shot onto it.
function assistedAngle(tip) {
  let best = null;
  let bestScore = Infinity;
  for (const m of meteors) {
    const p = m.obj.position;
    const ang = Math.atan2(p.y - tip.y, p.x - tip.x);
    const diff = Math.abs(angleDiff(turretAngle, ang));
    if (diff > ASSIST_CONE) continue;
    const dist = Math.hypot(p.x - tip.x, p.y - tip.y);
    const score = diff * 6 + dist * 0.15; // prefer what you aim at, then what is closest
    if (score < bestScore) { bestScore = score; best = m; }
  }
  if (!best) return turretAngle;
  const p = best.obj.position;
  const t = Math.hypot(p.x - tip.x, p.y - tip.y) / BULLET_SPEED;
  return Math.atan2(p.y + best.vy * t - tip.y, p.x + best.vx * t - tip.x);
}

function update(dt) {
  const s = stats();

  // Turret rotation
  const turnSpeed = 10;
  if (keys.left) aimAngle += 3.2 * dt;
  if (keys.right) aimAngle -= 3.2 * dt;
  const diff = angleDiff(turretAngle, aimAngle);
  turretAngle += clamp(diff, -turnSpeed * dt, turnSpeed * dt);
  turretPivot.rotation.z = turretAngle;

  // Firing
  if (state === 'play') {
    fireCooldown -= dt;
    if (fireCooldown <= 0) {
      fireCooldown += 1 / s.fireRate;
      if (fireCooldown < -0.1) fireCooldown = 0;
      const tip = getTurretTip(tmpV);
      const a = assistedAngle(tip);
      const px = -Math.sin(a), py = Math.cos(a);
      if (s.twin) {
        fireBullet(tip.x + px * 0.17, tip.y + py * 0.17, a, s.damage);
        fireBullet(tip.x - px * 0.17, tip.y - py * 0.17, a, s.damage);
      } else {
        fireBullet(tip.x, tip.y, a, s.damage);
      }
      for (let k = 1; k <= s.spread; k++) {
        fireBullet(tip.x, tip.y, a + 0.2 * k, s.damage);
        fireBullet(tip.x, tip.y, a - 0.2 * k, s.damage);
      }
      muzzleTime = 0.06;
      audio.play(s.twin ? 'shoot_big' : 'shoot', { volume: 0.22, rate: rand(0.95, 1.08), gap: 0.06 });
    }
  }

  // Spawning
  if (state === 'play' && spawnQueue.length) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = spawnInterval * rand(0.7, 1.3);
      spawnMeteor(spawnQueue.shift());
      if (run.wave >= 10 && Math.random() < 0.2 && spawnQueue.length) spawnMeteor(spawnQueue.shift());
    }
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.y += b.vy * dt;
    let hit = false;
    for (let j = meteors.length - 1; j >= 0; j--) {
      const m = meteors[j];
      const dx = m.obj.position.x - b.mesh.position.x;
      const dy = m.obj.position.y - b.mesh.position.y;
      const r = m.radius + 0.3;
      if (dx * dx + dy * dy < r * r) {
        hit = true;
        m.hp -= b.damage;
        m.flash = 1;
        const p = b.mesh.position;
        for (let k = 0; k < 4; k++) particles.spawn(p.x, p.y, 0.3, rand(-3, 3) - b.vx * 0.08, rand(-3, 3) - b.vy * 0.08, rand(0, 2), COL.spark, rand(8, 14), 0.25, 5);
        if (m.type === 'armor' || m.type === 'boss') audio.play('armor', { volume: 0.25, rate: rand(0.9, 1.2), gap: 0.07 });
        if (m.hp <= 0) killMeteor(j);
        break;
      }
    }
    if (hit || b.life <= 0) {
      world.remove(b.mesh);
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
      bulletPool.push(b);
    }
  }

  // Meteors
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    const o = m.obj;
    o.position.x += m.vx * dt;
    o.position.y += m.vy * dt;
    o.rotation.x += m.spin.x * dt;
    o.rotation.y += m.spin.y * dt;
    o.rotation.z += m.spin.z * dt;
    if (m.flash > 0) {
      m.flash = Math.max(0, m.flash - dt * 8);
      const g = m.glow, f = m.flash * 1.5;
      for (const mat of m.mats) mat.emissive.setRGB(g[0] + f, g[1] + f, g[2] + f);
    }
    if (m.type === 'fast' && Math.random() < 0.7) {
      particles.spawn(o.position.x, o.position.y, 0, -m.vx * 0.2 + rand(-0.3, 0.3), -m.vy * 0.2 + rand(-0.3, 0.3), 0, COL.fire, rand(14, 22), 0.4, 1.5);
    }
    if (m.type === 'boss') {
      if (Math.random() < 0.5) particles.spawn(o.position.x + rand(-1, 1), o.position.y + rand(-1, 1), 0, -m.vx, -m.vy, 0, COL.ember, rand(20, 34), 0.6, 1);
      m.spawnTimer -= dt;
      if (m.spawnTimer <= 0) {
        m.spawnTimer = 3.2;
        spawnMeteor('shard', o.position);
        spawnMeteor('shard', o.position);
      }
    }
    const d = Math.hypot(o.position.x, o.position.y);
    if (d < PLANET_R + m.radius * 0.45) {
      impactPlanet(m);
      removeMeteor(i);
    }
  }

  // Crystals
  const mountPos = turretMount.getWorldPosition(tmpV2);
  for (let i = crystals.length - 1; i >= 0; i--) {
    const c = crystals[i];
    const p = c.mesh.position;
    c.life -= dt;
    const dx = mountPos.x - p.x, dy = mountPos.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (!c.homing && dist < s.magnet) c.homing = true;
    if (c.homing) {
      const sp = 14 * dt;
      p.x += (dx / (dist || 1)) * Math.min(sp, dist);
      p.y += (dy / (dist || 1)) * Math.min(sp, dist);
      if (dist < 0.35) {
        run.crystals++;
        run.waveCrystals++;
        audio.play('pickup', { volume: 0.35, rate: rand(1, 1.3), gap: 0.03 });
        bumpCrystals();
        world.remove(c.mesh);
        crystals[i] = crystals[crystals.length - 1];
        crystals.pop();
        crystalPool.push(c);
        continue;
      }
    } else {
      // Drift toward the orbit ring where the turret can sweep them up
      const r = Math.hypot(p.x, p.y) || 1;
      const pull = (ORBIT_R - r) * 1.2;
      c.vx += (p.x / r) * pull * dt;
      c.vy += (p.y / r) * pull * dt;
      c.vx *= 1 - 1.8 * dt;
      c.vy *= 1 - 1.8 * dt;
      p.x += c.vx * dt;
      p.y += c.vy * dt;
    }
    c.mesh.rotation.y += c.spin * dt;
    c.mesh.rotation.x += c.spin * 0.5 * dt;
    c.mesh.visible = c.life > 2.5 || Math.sin(c.life * 18) > 0;
    if (c.life <= 0 && !c.homing) {
      world.remove(c.mesh);
      crystals[i] = crystals[crystals.length - 1];
      crystals.pop();
      crystalPool.push(c);
    }
  }

  // Wave end
  if (state === 'play' && spawnQueue.length === 0 && meteors.length === 0 && waveClearTimer < 0) waveCleared();
  if (waveClearTimer >= 0 && state === 'play') {
    waveClearTimer -= dt;
    if (waveClearTimer < 0 && crystals.length === 0) openShop();
    else if (waveClearTimer < 0) waveClearTimer = 0.1;
  }
}

function impactPlanet(m) {
  const p = m.obj.position.clone();
  if (run.shield > 0) {
    run.shield--;
    shieldFlash = 1;
    explode(p, COL.shield, 1);
    audio.play('shield', { volume: 0.7 });
    shake = Math.max(shake, 0.25);
  } else {
    run.hp -= m.dmg;
    planetHurt = 1;
    explode(p, COL.red, m.type === 'boss' ? 2.2 : 1.2);
    audio.play('planet_hit', { volume: 0.9 });
    shake = Math.max(shake, m.type === 'boss' ? 1 : 0.5);
    if (navigator.vibrate) try { navigator.vibrate(60); } catch {}
    if (run.hp <= 0) {
      run.hp = 0;
      gameOver();
    }
  }
  updateHud();
}

// ============================================================ Visual update (runs even when paused for smooth UI)
function updateVisuals(dt, time) {
  starMat.uniforms.uTime.value = time;
  planetSpin.rotation.y += dt * 0.12;
  for (const d of decor) d.rotation.y += dt * 0.08;
  bgGroup.position.x = Math.sin(time * 0.05) * 2.5;
  bgGroup.position.y = Math.cos(time * 0.04) * 1.8;
  if (bgFade < 1) {
    bgFade = Math.min(1, bgFade + dt * 0.6);
    bgPlanes[0].material.opacity = bgFade;
    bgPlanes[1].material.opacity = 1 - bgFade;
  }

  planetHurt = Math.max(0, planetHurt - dt * 2.5);
  atmoMat.uniforms.uColor.value.copy(atmoBase).lerp(atmoHurt, planetHurt);
  atmoMat.uniforms.uStrength.value = 1.6 + planetHurt * 2;

  shieldFlash = Math.max(0, shieldFlash - dt * 3);
  const shieldOn = run.shield > 0 ? 0.55 + Math.sin(time * 3) * 0.12 : 0;
  shieldMat.uniforms.uStrength.value = shieldOn + shieldFlash * 2.5;
  shieldMesh.visible = shieldMat.uniforms.uStrength.value > 0.01;

  orbitRing.material.opacity = 0.18 + Math.sin(time * 2) * 0.05;
  pickupRing.scale.setScalar(stats().magnet);
  pickupRing.material.opacity = 0.12 + Math.sin(time * 4) * 0.04;
  turretBase.material.opacity = 0.3 + Math.sin(time * 5) * 0.08;

  muzzleTime -= dt;
  muzzle.visible = muzzleTime > 0;
  if (muzzle.visible) muzzle.material.rotation = Math.random() * TAU;

  // Camera shake
  shake = Math.max(0, shake - dt * 2.2);
  const s = shake * shake * 0.6;
  camera.position.set(camBase.x + rand(-s, s), camBase.y + rand(-s, s), camBase.z);
  camera.lookAt(0, 0, 0);

  if (bossRef) $('bossBar').style.width = (100 * bossRef.hp / bossRef.maxHp).toFixed(1) + '%';
}

// ============================================================ HUD & UI
const hudCache = {};
function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  $(id).textContent = v;
}
function updateHud() {
  const s = stats();
  setText('waveNum', String(run.wave));
  setText('crystalNum', String(run.crystals));
  setText('hpText', `${Math.max(0, run.hp)} / ${s.maxHp}`);
  const hpPct = clamp(run.hp / s.maxHp, 0, 1);
  $('hpBar').style.width = (hpPct * 100) + '%';
  $('hpBar').classList.toggle('low', hpPct <= 0.3);
  $('shieldBar').style.width = s.shieldMax ? (100 * run.shield / s.shieldMax) + '%' : '0%';
  $('waveBar').style.width = run.waveTotal ? (100 * Math.min(1, run.waveKills / run.waveTotal)) + '%' : '0%';
}
let bumpTimeout = 0;
function bumpCrystals() {
  setText('crystalNum', String(run.crystals));
  const el = document.querySelector('.crystals');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  clearTimeout(bumpTimeout);
}

function showBanner(text, boss = false) {
  const el = $('banner');
  el.textContent = text;
  el.className = 'banner';
  void el.offsetWidth;
  el.className = 'banner show' + (boss ? ' boss' : '');
}

function showScreen(id, on) {
  $(id).classList.toggle('show', on);
}

// ----- Shop
function upgradeCost(u) {
  if (u.id === 'repair') return u.base + Math.floor(run.wave * 1.5);
  return Math.round(u.base * Math.pow(u.growth, lvl(u.id)));
}

function openShop() {
  state = 'shop';
  platform.gameplayStop();
  shopBonusUsed = false;
  saveGame();
  $('shopWave').textContent = run.wave;
  renderShop();
  $('bonusBtn').classList.toggle('hidden', !platform.hasRewarded);
  showScreen('shop', true);
  audio.play('wave', { volume: 0.6, rate: 1.2 });
}

function renderShop() {
  $('shopCrystals').textContent = run.crystals;
  const s = stats();
  const box = $('cards');
  box.innerHTML = '';
  for (const u of UPGRADES) {
    const level = lvl(u.id);
    const maxed = level >= u.max || (u.id === 'repair' && run.hp >= s.maxHp);
    const cost = upgradeCost(u);
    const poor = !maxed && run.crystals < cost;
    const card = document.createElement('button');
    card.className = 'card' + (maxed ? ' maxed' : '') + (poor ? ' poor' : '');
    let pips = '';
    if (u.max !== Infinity) {
      pips = '<div class="lvl">' + Array.from({ length: u.max }, (_, k) => `<i class="${k < level ? 'on' : ''}"></i>`).join('') + '</div>';
    }
    const costText = maxed ? (u.id === 'repair' ? 'FULL HP' : 'MAX') : `<span class="gem"></span>${cost}`;
    card.innerHTML = `<span class="ico">${u.ico}</span><span class="name">${u.name}</span><span class="desc">${u.desc}</span>${pips}<span class="cost">${costText}</span>`;
    card.addEventListener('click', () => buyUpgrade(u));
    box.appendChild(card);
  }
}

function buyUpgrade(u) {
  const s = stats();
  const level = lvl(u.id);
  if (level >= u.max) return;
  if (u.id === 'repair' && run.hp >= s.maxHp) return;
  const cost = upgradeCost(u);
  if (run.crystals < cost) { audio.play('denied', { volume: 0.5 }); return; }
  run.crystals -= cost;
  if (u.id === 'repair') {
    run.hp = Math.min(s.maxHp, run.hp + 4);
  } else {
    run.levels[u.id] = level + 1;
    if (u.id === 'hull') run.hp = stats().maxHp;
    if (u.id === 'twin') setTurretModel();
  }
  audio.play('buy', { volume: 0.6 });
  renderShop();
  updateHud();
}

function setTurretModel() {
  const twin = stats().twin;
  if (turretModelSingle) turretModelSingle.visible = !twin;
  if (turretModelDouble) turretModelDouble.visible = twin;
}

// ----- Game over / revive
function gameOver() {
  state = 'over';
  timeScale = 0.25;
  platform.gameplayStop();
  explode(new THREE.Vector3(0, 0, 0), COL.red, 3, 40);
  shake = 1.2;
  const newBest = run.wave > save.best;
  if (newBest) save.best = run.wave;
  save.runs++;
  saveGame();
  platform.sendScore(save.best);
  setTimeout(() => {
    audio.play('gameover', { volume: 0.8 });
    $('overWave').textContent = run.wave;
    $('overBest').textContent = save.best;
    $('overKills').textContent = run.kills;
    $('newBest').classList.toggle('hidden', !newBest);
    $('reviveBtn').classList.toggle('hidden', run.revived || !platform.hasRewarded);
    showScreen('over', true);
  }, 1100);
}

async function revive() {
  const ok = await platform.rewardedAd('revive');
  if (!ok) return;
  run.revived = true;
  showScreen('over', false);
  run.hp = Math.ceil(stats().maxHp * 0.5);
  // Clear nearby threats so the player gets a fair restart
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    if (m.type === 'boss') continue;
    explode(m.obj.position, COL.shield, 0.8);
    removeMeteor(i);
  }
  shieldFlash = 1.5;
  timeScale = 1;
  state = 'play';
  platform.gameplayStart();
  updateHud();
}

function clearWorld() {
  for (let i = meteors.length - 1; i >= 0; i--) removeMeteor(i);
  for (const b of bullets) { world.remove(b.mesh); bulletPool.push(b); }
  bullets.length = 0;
  for (const c of crystals) { world.remove(c.mesh); crystalPool.push(c); }
  crystals.length = 0;
}

function newRun() {
  clearWorld();
  run.wave = 0;
  run.crystals = 0;
  run.kills = 0;
  run.levels = {};
  run.revived = false;
  run.hp = stats().maxHp;
  setTurretModel();
  startWave(1);
}

// ----- Pause
function setPaused(p) {
  if (state === 'loading') return;
  if (p && (state !== 'play' || paused)) return;
  paused = p;
  showScreen('pause', p);
  if (p) platform.gameplayStop(); else if (state === 'play') platform.gameplayStart();
}

// ----- Save
function saveGame() {
  platform.saveData({ v: 1, best: save.best, runs: save.runs, sfx: save.sfx, music: save.music });
}

function applySettings() {
  audio.setSfx(save.sfx);
  audio.setMusic(save.music);
  $('sfxBtn').textContent = 'SOUND: ' + (save.sfx ? 'ON' : 'OFF');
  $('musicBtn').textContent = 'MUSIC: ' + (save.music ? 'ON' : 'OFF');
}

// ============================================================ Input
const keys = { left: false, right: false };
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();
let pointerDown = false;

function aimAt(clientX, clientY) {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(aimPlane, tmpV)) aimAngle = Math.atan2(tmpV.y, tmpV.x);
}

function firstInteraction() {
  audio.unlock();
  if (hintVisible) {
    hintVisible = false;
    setTimeout(() => $('hint').classList.add('hidden'), 1500);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  pointerDown = true;
  firstInteraction();
  aimAt(e.clientX, e.clientY);
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || pointerDown) aimAt(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => { pointerDown = false; });
window.addEventListener('pointercancel', () => { pointerDown = false; });
window.addEventListener('keydown', (e) => {
  firstInteraction();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!paused);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { setPaused(true); audio.setPaused(true); }
  else if (!adActive) audio.setPaused(false);
});
window.addEventListener('resize', resize);

// Buttons
const click = (id, fn) => $(id).addEventListener('click', () => { audio.unlock(); audio.play('click', { volume: 0.5 }); fn(); });
click('pauseBtn', () => setPaused(true));
click('resumeBtn', () => setPaused(false));
click('sfxBtn', () => { save.sfx = !save.sfx; applySettings(); saveGame(); });
click('musicBtn', () => { save.music = !save.music; applySettings(); saveGame(); });
click('quitBtn', () => { setPaused(false); showScreen('pause', false); newRun(); });
let creditsReturn = null;
click('creditsBtn', () => { creditsReturn = 'pause'; showScreen('pause', false); showScreen('credits', true); });
click('overCreditsBtn', () => { creditsReturn = 'over'; showScreen('over', false); showScreen('credits', true); });
click('closeCreditsBtn', () => { showScreen('credits', false); if (creditsReturn) showScreen(creditsReturn, true); });
click('nextBtn', () => { showScreen('shop', false); startWave(run.wave + 1); });
click('bonusBtn', async () => {
  if (shopBonusUsed) return;
  const ok = await platform.rewardedAd('crystal_bonus');
  if (!ok) return;
  shopBonusUsed = true;
  run.crystals += Math.max(10, Math.ceil(run.waveCrystals * 0.5));
  $('bonusBtn').classList.add('hidden');
  audio.play('buy', { volume: 0.6 });
  renderShop();
  updateHud();
});
click('reviveBtn', () => revive());
click('againBtn', async () => {
  showScreen('over', false);
  await platform.midgameAd();
  newRun();
});

// Platform hooks: pause the game and mute during ads / when YouTube pauses us
hooks.onAdStart = () => { adActive = true; audio.setBlocked(true); };
hooks.onAdEnd = () => { adActive = false; audio.setBlocked(!platform.isAudioEnabled()); };
hooks.onPause = () => { setPaused(true); audio.setPaused(true); };
hooks.onResume = () => { audio.setPaused(false); };
hooks.onAudioChange = (on) => { audio.setBlocked(!on || adActive); };

// ============================================================ Main loop
let lastTime = performance.now();
let elapsed = 0;
let slowFrames = 0;
let frameCount = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const rawDt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  frameCount++;
  if (!paused && !adActive) {
    const dt = rawDt * timeScale;
    elapsed += rawDt;
    if (state === 'play' || state === 'over' || state === 'shop') update(dt);
    particles.update(dt);
    updateRings(dt);
    updateVisuals(dt, elapsed);
  }
  // Auto quality: drop bloom on slow devices
  if (useBloom && state === 'play' && !paused) {
    slowFrames = rawDt > 1 / 35 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 150) {
      useBloom = false;
      pixelRatio = Math.min(pixelRatio, 1);
      renderer.setPixelRatio(pixelRatio);
      starMat.uniforms.uPR.value = pixelRatio;
      particles.mat.uniforms.uPR.value = pixelRatio;
      resize();
    }
  }
  if (useBloom) composer.render(); else renderer.render(scene, camera);
}

// ============================================================ Boot
const audio = new AudioManager();

async function boot() {
  resize();
  platform.firstFrameReady(); // loading screen is visible

  const sdkPromise = platform.init();
  const modelFiles = {
    planet_terra: 'planet_terra.glb', planet_ringed: 'planet_ringed.glb',
    rock_a: 'rock_a.glb', rock_b: 'rock_b.glb', rock_c: 'rock_c.glb', rock_large: 'rock_large.glb',
    meteor_split: 'meteor_split.glb', turret_single: 'turret_single.glb', turret_double: 'turret_double.glb',
  };
  const sfx = ['shoot', 'shoot_big', 'boom1', 'boom2', 'boom3', 'planet_hit', 'shield', 'armor', 'boss', 'pickup', 'click', 'buy', 'denied', 'wave', 'gameover'];
  const total = Object.keys(modelFiles).length + sfx.length + 2;
  let done = 0;
  const tick = () => { done++; $('loadBar').style.width = (100 * done / total) + '%'; };

  const jobs = [];
  for (const [name, file] of Object.entries(modelFiles)) {
    jobs.push(loadModel(file).then((g) => { templates[name] = makeTemplate(g.scene); tick(); }));
  }
  for (const n of sfx) jobs.push(audio.load(n, 'assets/audio/' + n + '.mp3').then(tick));
  jobs.push(setBackground(0).then(tick));
  jobs.push(sdkPromise.then(async () => {
    const data = await platform.loadData();
    if (data) Object.assign(save, { best: data.best | 0, runs: data.runs | 0, sfx: data.sfx !== false, music: data.music !== false });
    tick();
  }));
  await Promise.all(jobs);

  // Build the scene from loaded models
  const planet = instance('planet_terra', PLANET_R * 2).obj;
  planetSpin.add(planet);

  const ringed = instance('planet_ringed', 7).obj;
  ringed.position.set(-46, 26, -62);
  ringed.rotation.set(0.5, 0.3, 0.2);
  scene.add(ringed);
  decor.push(ringed);

  turretModelSingle = orientTurret(instance('turret_single', 1.3).obj);
  turretModelDouble = orientTurret(instance('turret_double', 1.4).obj);
  addBarrels(turretModelSingle, [0]);
  addBarrels(turretModelDouble, [-0.17, 0.17]);
  turretMount.add(turretModelSingle, turretModelDouble);
  setTurretModel();

  // Warm up shaders so the first explosion does not stutter
  renderer.compile(scene, camera);

  $('loading').classList.remove('show');
  $('hud').classList.remove('hidden');
  $('hint').classList.remove('hidden');
  applySettings();
  audio.setBlocked(!platform.isAudioEnabled());

  platform.gameReady();
  run.hp = stats().maxHp;
  startWave(1);

  // Load music after the game is playable (keeps the initial download small)
  Promise.all([
    audio.load('music_title', 'assets/audio/music_title.mp3'),
    audio.load('music_space1', 'assets/audio/music_space1.mp3'),
    audio.load('music_space2', 'assets/audio/music_space2.mp3'),
  ]).then(() => audio.setMusicList(['music_title', 'music_space1', 'music_space2']));
  for (let i = 1; i < BACKGROUNDS.length; i++) loadBgTexture(BACKGROUNDS[i][0]);
}

const decor = [];
// Debug handle for local testing only
if (platform.name === 'local') window.__tpd = { run, get state() { return state; }, openShop: () => openShop(), gameOver: () => gameOver(), meteors, camBase, camera, turretMount, bgPlanes,
  sim: (sec, aim) => { for (let t = 0; t < sec; t += 1 / 60) { if (aim !== undefined) aimAngle = aim; else if (meteors.length) { const m = meteors[0].obj.position; aimAngle = Math.atan2(m.y, m.x); } update(1 / 60); particles.update(1 / 60); updateRings(1 / 60); } updateHud(); } };

requestAnimationFrame(frame);
boot().catch((e) => {
  console.error(e);
  $('loading').innerHTML = '<div class="logo"><b>Oops</b><span>Could not load the game. Please refresh.</span></div>';
});
