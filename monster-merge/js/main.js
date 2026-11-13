// Monster Merge Arena
// Buy monsters, merge identical ones to evolve them, then watch the 3D battle.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { platform, hooks } from './platform.js?v=20261113110444';
import { AudioManager } from './audio.js?v=20261113110444';
import {
  LINES, MAX_TIER, AURA_COLORS, tierInfo, enemyModel, unitStats, unitHeight,
  buyPrice, winCoins, START_COINS, buildLevel, bossStats, expected, sellValue,
} from './data.js?v=20261113110444';

// ============================================================ Helpers
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

// Simple tween system
const tweens = [];
function tween(duration, fn, done) {
  const t = { time: 0, duration, fn, done };
  tweens.push(t);
  return t;
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    t.time += dt;
    const k = Math.min(1, t.time / t.duration);
    t.fn(k);
    if (k >= 1) { tweens.splice(i, 1); if (t.done) t.done(); }
  }
}
const wait = (s) => new Promise((r) => tween(s, () => {}, r));

// ============================================================ Board layout
const TILE = 2;
const COLS = 5;
const ROWS = 3;
// Player rows at z = 3, 5, 7 (row 0 is the front). Enemy rows at z = -3, -5, -7.
function cellPos(team, row, col) {
  const x = (col - 2) * TILE;
  const z = team === 'player' ? 3 + row * TILE : -3 - row * TILE;
  return new THREE.Vector3(x, 0, z);
}
function posToCell(p) {
  const col = Math.round(p.x / TILE + 2);
  const row = Math.round((p.z - 3) / TILE);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { row, col };
}

const CAPTURE = new URLSearchParams(location.search).has('capture');
if (CAPTURE) document.documentElement.classList.add('capture');
let forcedDt = null;

// ============================================================ State
const save = {
  level: 1, coins: START_COINS, buys: { melee: 0, ranged: 0 },
  board: [{ type: 'melee', tier: 1, row: 0, col: 2 }, { type: 'melee', tier: 1, row: 0, col: 1 }],
  discovered: { melee: 1, ranged: 0 },
  sfx: true, music: true, lastDaily: '', streak: 0, levelsSinceAd: 0, freeUsedLevel: 0,
};
let state = 'loading'; // loading | prep | battle | result | chest
let paused = false;
let adActive = false;
let timeScale = 1;
let slowMoTimer = 0;
let shake = 0;
let battleTime = 0;
let currentLevel = null;
let hintShown = false;

// ============================================================ Renderer
const canvas = $('game');
const isMobile = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe8ff, 60, 150);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const camTarget = new THREE.Vector3(0, 0, 0.6);
const camBase = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camZoom = null; // { pos, look, k }

// Sky dome
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3fa9ff) }, mid: { value: new THREE.Color(0xa8e2ff) }, bottom: { value: new THREE.Color(0xe9f8ff) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.7)) : mix(mid, bottom, pow(-h, 0.6)); gl_FragColor = vec4(c, 1.0); }`,
    })
  );
  scene.add(sky);
}

// Lights
scene.add(new THREE.HemisphereLight(0xe4f4ff, 0x7a8f4c, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.position.set(-14, 28, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
const sc = sun.shadow.camera;
sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

// Fit the board on screen for any aspect ratio (phone portrait to wide desktop)
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 48 : 40;
  camera.updateProjectionMatrix();
  const dir = new THREE.Vector3(0, 0.82, 0.57).normalize();
  const corners = [];
  for (const x of [-5.2, 5.2]) for (const z of [-8, 8]) for (const y of [0, 2]) corners.push(new THREE.Vector3(x, y, z));
  const topLimit = camera.aspect < 0.8 ? 0.6 : 0.66;
  const bottomLimit = camera.aspect < 0.8 ? -0.5 : -0.52;
  let d = 10;
  for (; d < 120; d += 0.5) {
    camera.position.copy(camTarget).addScaledVector(dir, d);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
    let ok = true;
    for (const c of corners) {
      tmp.copy(c).project(camera);
      if (Math.abs(tmp.x) > 0.96 || tmp.y > topLimit || tmp.y < bottomLimit) { ok = false; break; }
    }
    if (ok) break;
  }
  camBase.copy(camera.position);
  camLook.copy(camTarget);
}

// ============================================================ Asset loading
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const templates = new Map(); // name -> Promise<{ scene, animations, info }>

function loadModel(path) {
  if (templates.has(path)) return templates.get(path);
  const p = loader.loadAsync(path).then((g) => {
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.side = THREE.FrontSide;
          // Color-palette atlases must not be mip-mapped, or neighboring swatches bleed together
          const map = o.material.map;
          if (map && path.includes('/monsters/')) {
            map.generateMipmaps = false;
            map.minFilter = THREE.NearestFilter;
            map.magFilter = THREE.NearestFilter;
            map.needsUpdate = true;
            o.material.color.multiplyScalar(1.45); // the palette is muted; brighten for a cartoon look
            o.material.roughness = 0.75;
          }
        }
      }
    });
    // Measure in the first idle frame
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return { scene: g.scene, animations: g.animations, size, center, minY: box.min.y };
  });
  templates.set(path, p);
  return p;
}
const monsterPath = (name) => `assets/models/monsters/${name}.glb`;
const envPath = (name) => `assets/models/env/${name}.glb`;

async function envObject(name, height, opts = {}) {
  const t = await loadModel(envPath(name));
  const obj = t.scene.clone(true);
  const s = height / t.size.y;
  const g = new THREE.Group();
  obj.scale.setScalar(s);
  obj.position.set(-t.center.x * s, -t.minY * s, -t.center.z * s);
  g.add(obj);
  if (opts.noShadow) g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}

// ============================================================ Arena
const arena = new THREE.Group();
scene.add(arena);
const cellMarkers = { player: [], enemy: [] };
const clouds = [];
const tileMaterials = [];

async function buildArena() {
  const cube = await loadModel(envPath('pf_Cube_Grass_Center'));
  // Prepare two tints for a checkerboard look
  const baseMats = [];
  cube.scene.traverse((o) => { if (o.isMesh) baseMats.push(o.material); });
  const tintA = new Map(), tintB = new Map();
  for (const m of baseMats) {
    const a = m.clone(); const b = m.clone();
    b.color.multiplyScalar(0.9);
    tintA.set(m, a); tintB.set(m, b);
    tileMaterials.push(a, b);
  }
  const s = TILE / cube.size.x;
  const addCube = (x, z, alt, y = -1, receiveOnly = false) => {
    const o = cube.scene.clone(true);
    o.scale.setScalar(s);
    o.position.set(x - cube.center.x * s, y - cube.center.y * s, z - cube.center.z * s);
    o.traverse((m) => {
      if (m.isMesh) {
        m.material = (alt ? tintB : tintA).get(m.material) || m.material;
        m.castShadow = !receiveOnly;
        m.receiveShadow = true;
      }
    });
    arena.add(o);
  };
  // Main field 7 x 10 tiles (board + one ring)
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -5; cz <= 4; cz++) {
      const x = cx * TILE, z = cz * TILE + 1;
      addCube(x, z, (cx + cz) % 2 !== 0, -1, true);
    }
  }
  // Second layer below, slightly smaller, for thickness
  for (let cx = -2; cx <= 2; cx++) for (let cz = -4; cz <= 3; cz++) addCube(cx * TILE, cz * TILE + 1, false, -3, true);

  // Floating rock underneath
  const rockT = await loadModel(envPath('pf_RockPlatforms_Large'));
  const rock = rockT.scene.clone(true);
  const rs = 2.3;
  rock.scale.set(rs, rs * 1.4, rs * 2.0);
  rock.rotation.x = Math.PI;
  rock.position.set(-rockT.center.x * rs, -3.6, -rockT.center.z * rs * 2.0 + 0.5);
  arena.add(rock);

  // Cell markers: rounded squares on each grid cell
  const markerGeo = new THREE.PlaneGeometry(TILE * 0.88, TILE * 0.88);
  markerGeo.rotateX(-Math.PI / 2);
  for (const team of ['player', 'enemy']) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const mat = new THREE.MeshBasicMaterial({
          color: team === 'player' ? 0x4fb8ff : 0xff6b6b, transparent: true, opacity: team === 'player' ? 0.22 : 0.16,
          depthWrite: false, map: markerTexture,
        });
        const m = new THREE.Mesh(markerGeo, mat);
        m.position.copy(cellPos(team, row, col));
        m.position.y = 0.02;
        m.renderOrder = 1;
        arena.add(m);
        cellMarkers[team].push({ row, col, mesh: m });
      }
    }
  }

  // Decorations
  const deco = async (name, h, x, z, rotY = rand(0, TAU), opts) => {
    const o = await envObject(name, h, opts);
    o.position.set(x, 0, z);
    o.rotation.y = rotY;
    arena.add(o);
    return o;
  };
  const jobs = [];
  // Trees on the back corners and sides
  jobs.push(deco('pf_Tree_Fruit', 5.2, -6.4, -9.2));
  jobs.push(deco('pf_Tree', 4.6, 6.3, -9.0));
  jobs.push(deco('n_Pine_1', 5.6, -6.8, -4.5));
  jobs.push(deco('n_CommonTree_1', 5.0, 6.8, -5.2));
  jobs.push(deco('pf_Tree', 3.6, -6.7, 6.8));
  jobs.push(deco('n_Pine_1', 4.2, 6.7, 7.4));
  // Banners: red for the enemy, blue for you
  jobs.push(deco('p_Banner_1', 2.6, -3.6, -9.4, 0));
  jobs.push(deco('p_Banner_1', 2.6, 3.6, -9.4, 0));
  jobs.push(deco('p_Banner_2', 2.4, -6.4, 2.2, Math.PI / 2));
  jobs.push(deco('p_Banner_2', 2.4, 6.4, 2.2, -Math.PI / 2));
  // Props
  jobs.push(deco('p_Barrel', 1.0, -6.2, -1.4));
  jobs.push(deco('p_Barrel', 0.9, -6.6, -0.4));
  jobs.push(deco('p_Crate_Wooden', 1.0, 6.3, -1.0, 0.3));
  jobs.push(deco('p_WeaponStand', 1.3, 6.4, 4.6, -Math.PI / 2));
  jobs.push(deco('p_Torch_Metal', 1.2, -6.2, 4.4));
  jobs.push(deco('p_Torch_Metal', 1.2, 6.2, 0.9));
  // Plants and rocks
  jobs.push(deco('n_Rock_Medium_1', 1.4, -6.3, -6.8));
  jobs.push(deco('n_Rock_Medium_3', 1.2, 6.5, 2.6));
  jobs.push(deco('n_Bush_Common_Flowers', 1.3, -6.4, 8.6, 0, { noShadow: true }));
  jobs.push(deco('n_Bush_Common_Flowers', 1.2, 6.6, -7.2, 0, { noShadow: true }));
  jobs.push(deco('n_Flower_3_Group', 1.0, -6.0, 0.8, 0, { noShadow: true }));
  jobs.push(deco('n_Flower_4_Group', 1.1, 6.0, 6.0, 0, { noShadow: true }));
  jobs.push(deco('n_Flower_4_Group', 1.0, -2.0, -9.4, 0, { noShadow: true }));
  jobs.push(deco('n_Flower_3_Group', 0.9, 1.8, -9.5, 0, { noShadow: true }));
  jobs.push(deco('n_Grass_Wispy_Tall', 0.9, -5.6, -3.0, 0, { noShadow: true }));
  jobs.push(deco('n_Grass_Wispy_Tall', 0.9, 5.7, 3.6, 0, { noShadow: true }));
  jobs.push(deco('n_Mushroom_Common', 0.6, -5.8, 6.2, 0, { noShadow: true }));
  jobs.push(deco('n_Mushroom_Common', 0.5, 5.9, -3.4, 0, { noShadow: true }));
  // Fence along the back edge
  for (const x of [-4, 0, 4]) jobs.push(deco('pf_Fence_Middle', 1.1, x, -9.6, 0));
  await Promise.all(jobs);

  // Enemy castle on its own floating island behind the arena
  const castleIsland = new THREE.Group();
  const isl = rockT.scene.clone(true);
  isl.scale.set(1.1, 1.3, 1.1);
  isl.rotation.x = Math.PI;
  isl.position.set(-rockT.center.x * 1.1, -0.2, -rockT.center.z * 1.1);
  castleIsland.add(isl);
  const tower = await envObject('pf_Tower', 9);
  tower.position.y = 0.2;
  castleIsland.add(tower);
  castleIsland.position.set(0, -2, -22);
  scene.add(castleIsland);

  // Distant floating islands with trees
  const addIsland = async (x, y, z, s2, tree) => {
    const g = new THREE.Group();
    const r = rockT.scene.clone(true);
    r.scale.setScalar(s2);
    r.rotation.x = Math.PI;
    r.position.set(-rockT.center.x * s2, 0, -rockT.center.z * s2);
    g.add(r);
    if (tree) { const t = await envObject(tree, 4 * s2 * 0.6); t.position.y = 0.1; g.add(t); }
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push({ obj: g, base: y, speed: 0, bob: rand(0, TAU) });
  };
  await Promise.all([
    addIsland(-26, -5, -18, 0.9, 'pf_Tree_Fruit'),
    addIsland(28, -8, -6, 0.7, 'n_Pine_1'),
    addIsland(-22, -12, 14, 0.6, null),
    addIsland(20, -3, -34, 0.8, 'pf_Tree'),
  ]);

  // Clouds drifting around and below the island
  const cloudNames = ['pf_Cloud_1', 'pf_Cloud_2', 'pf_Cloud_3'];
  for (let i = 0; i < 12; i++) {
    const c = await envObject(pick(cloudNames), rand(1.6, 3), { noShadow: true });
    c.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setRGB(1, 1, 1); o.receiveShadow = false; } });
    const below = i < 7;
    c.position.set(rand(-45, 45), below ? rand(-18, -9) : rand(4, 10), below ? rand(-40, 10) : rand(-60, -30));
    if (below && Math.abs(c.position.x) < 12) c.position.x += Math.sign(c.position.x || 1) * 14;
    c.scale.multiplyScalar(rand(1, 1.8));
    scene.add(c);
    clouds.push({ obj: c, base: c.position.y, speed: rand(0.4, 1.1), bob: rand(0, TAU) });
  }
}

// Soft rounded-square texture for cell markers
const markerTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  const r = 26;
  g.beginPath();
  g.moveTo(r + 6, 6); g.arcTo(122, 6, 122, 122, r); g.arcTo(122, 122, 6, 122, r); g.arcTo(6, 122, 6, 6, r); g.arcTo(6, 6, 122, 6, r);
  g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(r + 16, 16); g.arcTo(112, 16, 112, 112, r - 8); g.arcTo(112, 112, 16, 112, r - 8); g.arcTo(16, 112, 16, 16, r - 8); g.arcTo(16, 16, 112, 16, r - 8);
  g.closePath();
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

// ============================================================ Particles
class Particles {
  constructor(max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 * pixelRatio } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
        varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / -mv.z; vC = aColor; vA = aAlpha; }`,
      fragmentShader: additive
        ? `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d)*vA; gl_FragColor = vec4(vC*a, a); }`
        : `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d > 0.5) discard; float a = smoothstep(0.5,0.35,d)*vA; gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  spawn(p, v, color, size, life, grav = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.base[i] = size; this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life; this.alpha[i] = 1; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i]) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = 1 - 2.2 * dt;
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 1.6);
      this.size[i] = this.base[i] * (0.5 + 0.5 * t);
    }
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[n].needsUpdate = true;
  }
}
const glow = new Particles(1500, true);
const puff = new Particles(600, false);
scene.add(glow.points, puff.points);
const C = {
  spark: new THREE.Color(1.6, 1.4, 0.8),
  gold: new THREE.Color(1.8, 1.3, 0.3),
  blue: new THREE.Color(0.5, 1.2, 2.0),
  red: new THREE.Color(2.0, 0.5, 0.4),
  purple: new THREE.Color(1.3, 0.6, 2.0),
  green: new THREE.Color(0.6, 1.8, 0.6),
  white: new THREE.Color(1, 1, 1),
  smoke: new THREE.Color(0.95, 0.95, 0.95),
  dust: new THREE.Color(0.85, 0.78, 0.62),
};
function burst(p, color, n = 20, speed = 5, size = 0.5, life = 0.6, up = 2) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = Math.random();
    glow.spawn(p, tmp2.set(Math.cos(a) * speed * e, rand(0.5, 1) * up + Math.random() * speed * 0.5, Math.sin(a) * speed * e), color, size * rand(0.6, 1.2), life * rand(0.6, 1.2), 4);
  }
}
function smoke(p, n = 10, color = C.smoke, size = 0.9) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    puff.spawn(tmp.set(p.x + rand(-0.3, 0.3), p.y + rand(0, 0.4), p.z + rand(-0.3, 0.3)), tmp2.set(Math.cos(a) * 2, rand(0.5, 2), Math.sin(a) * 2), color, size * rand(0.7, 1.3), rand(0.5, 0.9), -1);
  }
}

// Expanding rings on the ground
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
ringGeo.rotateX(-Math.PI / 2);
const rings = [];
function groundRing(p, color, size, life = 0.5) {
  let r = rings.find((x) => x.t <= 0);
  if (!r) {
    r = { mesh: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), t: 0 };
    r.mesh.renderOrder = 4;
    scene.add(r.mesh);
    rings.push(r);
  }
  r.mesh.position.set(p.x, 0.06, p.z);
  r.mesh.material.color.copy(color);
  r.mesh.visible = true;
  r.t = life; r.life = life; r.size = size;
}
function updateRings(dt) {
  for (const r of rings) {
    if (r.t <= 0) continue;
    r.t -= dt;
    const k = 1 - Math.max(0, r.t) / r.life;
    r.mesh.scale.setScalar(0.2 + easeOutCubic(k) * r.size);
    r.mesh.material.opacity = (1 - k);
    if (r.t <= 0) r.mesh.visible = false;
  }
}

// Light beam for merges and spawns
const beamGeo = new THREE.CylinderGeometry(0.5, 0.9, 8, 24, 1, true);
beamGeo.translate(0, 4, 0);
function beam(p, color, life = 0.7) {
  const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(p.x, 0, p.z);
  m.renderOrder = 6;
  scene.add(m);
  tween(life, (k) => { m.material.opacity = 0.7 * (1 - k); m.scale.set(1 - k * 0.6, 1 + k * 0.4, 1 - k * 0.6); }, () => { scene.remove(m); m.material.dispose(); });
}

// ============================================================ Floating texts (damage numbers) & flying coins
const fx = $('fx');
const floaters = [];
function floatText(worldPos, text, cls) {
  const el = document.createElement('div');
  el.className = 'dmg ' + (cls || '');
  el.textContent = text;
  fx.appendChild(el);
  floaters.push({ el, pos: worldPos.clone(), t: 0, life: 0.9, dx: rand(-20, 20) });
}
function updateFloaters(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) { f.el.remove(); floaters.splice(i, 1); continue; }
    tmp.copy(f.pos).project(camera);
    const x = (tmp.x * 0.5 + 0.5) * w + f.dx * k;
    const y = (-tmp.y * 0.5 + 0.5) * h - 50 * easeOutCubic(k);
    const sc2 = k < 0.15 ? 0.6 + k / 0.15 * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 1.2);
    f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${sc2})`;
    f.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
  }
}
function flyCoins(worldPos, count) {
  const target = document.querySelector('.coins').getBoundingClientRect();
  tmp.copy(worldPos).project(camera);
  const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'fly-coin coin-icon';
    fx.appendChild(el);
    const ox = rand(-50, 50), oy = rand(-60, 10);
    const tx = target.left + 20, ty = target.top + 18;
    const delay = i * 0.05;
    tween(0.75 + delay, (k) => {
      const kk = clamp((k * (0.75 + delay) - delay) / 0.75, 0, 1);
      const a = easeOutCubic(Math.min(1, kk * 2.5));
      const b = kk < 0.35 ? 0 : (kk - 0.35) / 0.65;
      const bx = sx + ox * a, by = sy + oy * a;
      const x = lerp(bx, tx, b * b), y = lerp(by, ty, b * b);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - b * 0.3})`;
      el.style.opacity = kk === 0 ? 0 : 1;
    }, () => { el.remove(); bumpCoins(); });
  }
}

// ============================================================ Units
const units = []; // all units on the field
const ANIMS = {
  idle: ['Idle', 'Flying_Idle'],
  move: ['Run', 'Walk', 'Fast_Flying'],
  attackMelee: ['Punch', 'Bite_Front', 'Headbutt'],
  attackRanged: ['Punch', 'Headbutt', 'Bite_Front'],
  hit: ['HitReact', 'HitRecieve'],
  death: ['Death'],
  win: ['Dance', 'Yes'],
};
function findClip(anims, names) {
  for (const n of names) { const c = anims.find((a) => a.name === n); if (c) return c; }
  return null;
}

// Number badge texture per tier and team
const badgeCache = new Map();
function badgeTexture(tier, team) {
  const key = tier + team;
  if (badgeCache.has(key)) return badgeCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 28, 0, TAU);
  g.fillStyle = team === 'player' ? (tier >= 9 ? '#ffb400' : '#2a86e8') : '#e0344a';
  g.fill();
  g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(tier), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  badgeCache.set(key, t);
  return t;
}

const hpGeo = new THREE.PlaneGeometry(1.3, 0.2);
class Unit {
  constructor(opts) {
    Object.assign(this, opts); // team, type, tier, row, col, model, isBoss, flying
    this.alive = true;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.cooldown = rand(0.1, 0.5);
    this.pendingHit = -1;
    this.retarget = 0;
    this.flash = 0;
    this.bob = rand(0, TAU);
    this.stun = 0;
    this.knock = new THREE.Vector3();
  }

  async init() {
    const t = await loadModel(monsterPath(this.model));
    const obj = cloneSkinned(t.scene);
    const height = this.height * (this.model.startsWith('Big_') ? 1.3 : 1);
    this.height = height;
    const s = height / Math.max(t.size.y, t.size.x * 0.72);
    obj.scale.setScalar(s);
    obj.position.set(-t.center.x * s, -t.minY * s, -t.center.z * s);
    this.inner.add(obj);
    this.radius = Math.max(0.45, Math.min(t.size.x, t.size.z) * s * 0.42);
    // Own materials so hits can flash one unit
    this.mats = [];
    obj.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.frustumCulled = false;
        this.mats.push(o.material);
      }
    });
    if (this.aura) {
      for (const m of this.mats) { m.emissive = new THREE.Color(this.aura); m.emissiveIntensity = 0.35; }
      this.baseEmissive = 0.35;
    } else this.baseEmissive = 0;
    // Animations
    this.mixer = new THREE.AnimationMixer(obj);
    const A = t.animations;
    this.clips = {
      idle: findClip(A, ANIMS.idle),
      move: findClip(A, ANIMS.move),
      attack: findClip(A, this.type === 'ranged' ? ANIMS.attackRanged : ANIMS.attackMelee),
      hit: findClip(A, ANIMS.hit),
      death: findClip(A, ANIMS.death),
      win: findClip(A, ANIMS.win),
    };
    this.actions = {};
    for (const [k, c] of Object.entries(this.clips)) if (c) this.actions[k] = this.mixer.clipAction(c);
    if (this.actions.death) { this.actions.death.setLoop(THREE.LoopOnce); this.actions.death.clampWhenFinished = true; }
    if (this.actions.attack) this.actions.attack.setLoop(THREE.LoopOnce);
    if (this.actions.hit) this.actions.hit.setLoop(THREE.LoopOnce);
    this.play('idle', 0);
    this.mixer.update(rand(0, 1));

    // HP bar (shown in battle)
    this.hpBar = new THREE.Group();
    const bg = new THREE.Mesh(hpGeo, new THREE.MeshBasicMaterial({ color: 0x1a1030, depthTest: false, transparent: true, opacity: 0.8 }));
    this.hpFill = new THREE.Mesh(hpGeo, new THREE.MeshBasicMaterial({ color: this.team === 'player' ? 0x5fe03a : 0xff4848, depthTest: false }));
    bg.scale.set(this.isBoss ? 2.4 : 1.05, this.isBoss ? 1.6 : 1, 1);
    this.hpFill.scale.copy(bg.scale).multiply(new THREE.Vector3(0.94, 0.7, 1));
    this.hpFill.position.z = 0.001;
    bg.renderOrder = 20; this.hpFill.renderOrder = 21;
    this.hpBar.add(bg, this.hpFill);
    this.hpBar.position.y = height + (this.flying ? 1.0 : 0.35);
    this.hpBar.visible = false;
    this.group.add(this.hpBar);
    // Tier badge (shown while preparing)
    if (!this.isBoss) {
      this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(this.tier, this.team), depthTest: false }));
      this.badge.scale.setScalar(0.62);
      this.badge.position.y = height + (this.flying ? 1.05 : 0.45);
      this.badge.renderOrder = 22;
      this.group.add(this.badge);
    }
    return this;
  }

  play(name, fade = 0.2) {
    const a = this.actions[name] || (name === 'move' ? this.actions.idle : null);
    if (!a || this.current === a) return a;
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    return a;
  }

  setHp(v) {
    this.hp = clamp(v, 0, this.maxHp);
    const k = this.hp / this.maxHp;
    this.hpFill.scale.x = Math.max(0.0001, 0.94 * k * (this.isBoss ? 2.4 : 1.05));
    this.hpFill.position.x = -(1 - k) * 0.5 * 0.94 * (this.isBoss ? 2.4 : 1.05);
  }
}

async function createUnit(opts) {
  const isPlayer = opts.team === 'player';
  let model, aura = null, flying = false;
  if (opts.isBoss) {
    model = opts.model;
    flying = !!opts.flying;
  } else if (isPlayer) {
    const info = tierInfo(opts.type, opts.tier);
    model = info.model;
    aura = AURA_COLORS[opts.tier] || null;
    flying = opts.type === 'ranged';
  } else {
    model = enemyModel(opts.type, opts.tier, opts.seed || 0);
    flying = model.startsWith('Flying');
  }
  const stats = opts.isBoss ? bossStats(opts.budget) : unitStats(opts.type, opts.tier);
  const height = opts.isBoss ? 4.4 : unitHeight(opts.type, opts.tier) * (opts.tier > 8 ? 1 + (opts.tier - 8) * 0.12 : 1);
  const u = new Unit({ ...opts, model, aura, flying, stats, height, maxHp: stats.hp, hp: stats.hp });
  await u.init();
  u.home = cellPos(u.team, u.row, u.col);
  if (u.isBoss) u.home = new THREE.Vector3(0, 0, -4);
  u.group.position.copy(u.home);
  u.group.rotation.y = isPlayer && state === 'battle' ? Math.PI : 0;
  scene.add(u.group);
  units.push(u);
  return u;
}

function removeUnit(u) {
  scene.remove(u.group);
  const i = units.indexOf(u);
  if (i >= 0) units.splice(i, 1);
  u.mixer && u.mixer.stopAllAction();
}

const playerUnits = () => units.filter((u) => u.team === 'player');
const enemyUnits = () => units.filter((u) => u.team === 'enemy');
const unitAt = (team, row, col) => units.find((u) => u.team === team && u.row === row && u.col === col && u.alive);

// Pop-in animation for a new or merged unit
function popIn(u, from = 0.2) {
  u.group.scale.setScalar(from);
  tween(0.45, (k) => u.group.scale.setScalar(lerp(from, 1, easeOutBack(k))));
}
function dropIn(u) {
  const y0 = 7;
  u.group.position.y = y0;
  tween(0.45, (k) => { u.group.position.y = y0 * (1 - k * k); }, () => {
    u.group.position.y = 0;
    smoke(u.group.position, 8, C.dust, 0.7);
    groundRing(u.group.position, C.white, 1.6, 0.35);
    audio.play('place', { volume: 0.5 });
    tween(0.25, (k) => { const s = 1 + Math.sin(k * Math.PI) * 0.18; u.group.scale.set(s, 2 - s, s); }, () => u.group.scale.setScalar(1));
  });
}

// ============================================================ Army helpers
function savedBoard() {
  return playerUnits().filter((u) => u.alive).map((u) => ({ type: u.type, tier: u.tier, row: u.row, col: u.col }));
}
function armyPower(list) {
  // Lanchester-style strength: sqrt(total HP x total DPS)
  let hp = 0, dps = 0;
  for (const u of list) { hp += u.stats.hp; dps += u.stats.dmg / u.stats.interval; }
  return Math.round(Math.sqrt(hp * dps) / 4);
}
function updatePower() {
  $('powerYou').textContent = formatNum(armyPower(playerUnits()));
  $('powerFoe').textContent = formatNum(armyPower(enemyUnits()));
}
function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function emptyPlayerCells() {
  const out = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) if (!unitAt('player', row, col)) out.push({ row, col });
  return out;
}

// Preload the models a player is likely to need soon
function preloadPlayerTiers() {
  for (const line of ['melee', 'ranged']) {
    const top = Math.max(1, save.discovered[line] || 1);
    for (let t = 1; t <= Math.min(MAX_TIER, top + 1); t++) loadModel(monsterPath(tierInfo(line, t).model));
  }
}

// ============================================================ Level flow
async function setupLevel() {
  state = 'loading-level';
  // Clear enemies
  for (const u of enemyUnits()) removeUnit(u);
  const L = buildLevel(save.level);
  currentLevel = L;
  const jobs = L.units.map((e) => createUnit({ team: 'enemy', type: e.type, tier: e.tier, row: e.row, col: e.col, seed: e.seed }));
  let boss = null;
  if (L.boss) jobs.push(createUnit({ team: 'enemy', type: 'melee', tier: 1, row: 1, col: 2, isBoss: true, model: L.boss.model, flying: L.boss.flying, budget: L.boss.budget }).then((b) => { boss = b; b.bossName = L.boss.name; }));
  const created = await Promise.all(jobs);
  for (const u of created) { if (u && !u.isBoss) popIn(u, 0.01); }
  updateLevelUI();
  updatePower();
  state = 'prep';
  updateShopUI();
  setMusic();
  showBottom(true);
  if (L.boss) await bossIntro(boss);
  else showBanner(`LEVEL ${save.level}`);
  maybeHint();
  preloadPlayerTiers();
}

async function bossIntro(boss) {
  audio.play('bell', { volume: 0.9, vary: 0 });
  camZoom = { pos: new THREE.Vector3(0, 6, 4), look: new THREE.Vector3(0, 2, -4), k: 0 };
  tween(0.6, (k) => { camZoom.k = easeOutCubic(k); });
  boss.group.scale.setScalar(0.2);
  tween(0.6, (k) => boss.group.scale.setScalar(lerp(0.2, 1, easeOutBack(k))));
  shake = 0.5;
  const el = $('bossName');
  el.textContent = boss.bossName;
  el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  await wait(1.8);
  tween(0.6, (k) => { camZoom.k = 1 - easeOutCubic(k); }, () => { camZoom = null; });
  setTimeout(() => el.classList.add('hidden'), 700);
}

function maybeHint() {
  const hint = $('hint');
  if (save.level === 1 && !hintShown) {
    hint.textContent = '👆 Drag a monster onto the SAME monster to MERGE!';
    hint.classList.remove('hidden');
  } else if (save.level === 2 && !hintShown) {
    hint.textContent = 'Buy more monsters, merge them, then tap FIGHT!';
    hint.classList.remove('hidden');
  } else hint.classList.add('hidden');
}

function updateLevelUI() {
  $('levelNum').textContent = save.level;
  const road = $('road');
  road.innerHTML = '';
  const start = Math.floor((save.level - 1) / 10) * 10 + 1;
  for (let l = start; l < start + 10; l++) {
    const i = document.createElement('i');
    if (l % 10 === 0) { i.className = 'boss'; i.textContent = '💀'; }
    else if (l % 5 === 0) i.className = 'chest';
    if (l < save.level) i.classList.add('done');
    if (l === save.level) i.classList.add('now');
    road.appendChild(i);
  }
  updateShopUI();
}

function updateShopUI() {
  $('coinNum').textContent = formatNum(save.coins);
  const pm = buyPrice(save.buys.melee), pr = buyPrice(save.buys.ranged);
  $('priceMelee').textContent = formatNum(pm);
  $('priceRanged').textContent = formatNum(pr);
  const full = emptyPlayerCells().length === 0;
  $('buyMelee').classList.toggle('poor', save.coins < pm || full);
  $('buyRanged').classList.toggle('poor', save.coins < pr || full);
  $('freeBtn').classList.toggle('hidden', !platform.hasRewarded || full || save.freeUsedLevel === save.level || state !== 'prep');
}

function showBottom(on) {
  $('bottom').classList.toggle('hidden', !on);
  $('powerBar').classList.toggle('hidden', !on);
}

function setMusic() {
  if (state === 'battle') audio.playMusic(currentLevel && currentLevel.boss ? 'music_battle' : 'music_battle', 0.4);
  else audio.playMusic('music_prep', 0.28);
}

// ============================================================ Buying & merging
async function buy(type, free = false, tierOverride = 1) {
  if (state !== 'prep') return;
  const cells = emptyPlayerCells();
  if (!cells.length) { audio.play('denied'); flashFull(); return; }
  const price = buyPrice(save.buys[type]);
  if (!free) {
    if (save.coins < price) { audio.play('denied'); shakeButton(type === 'melee' ? 'buyMelee' : 'buyRanged'); return; }
    save.coins -= price;
    save.buys[type]++;
  }
  // Brawlers prefer the front, flyers the back
  cells.sort((a, b) => (type === 'melee' ? a.row - b.row : b.row - a.row) || Math.abs(a.col - 2) - Math.abs(b.col - 2));
  const cell = cells[0];
  audio.play('coins', { volume: 0.6 });
  const u = await createUnit({ team: 'player', type, tier: tierOverride, row: cell.row, col: cell.col });
  dropIn(u);
  discover(type, tierOverride, u, false);
  updateShopUI();
  updatePower();
  persist();
}

function flashFull() {
  showBanner('BOARD FULL! MERGE!', 'red');
}
function shakeButton(id) {
  const el = $(id);
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 250 });
}

async function merge(a, b) {
  // a is dragged onto b
  const type = b.type, tier = b.tier + 1, row = b.row, col = b.col;
  const pos = b.group.position.clone();
  a.alive = false; b.alive = false;
  // Suck both into the cell center
  const aStart = a.group.position.clone();
  tween(0.18, (k) => { a.group.position.lerpVectors(aStart, pos, k); a.group.scale.setScalar(1 - k * 0.6); b.group.scale.setScalar(1 - k * 0.6); });
  await wait(0.18);
  removeUnit(a); removeUnit(b);
  audio.play('merge', { volume: 0.8, vary: 0 });
  audio.play('bell', { volume: 0.25, rate: 1 + tier * 0.05, vary: 0 });
  burst(pos.clone().setY(1), tier >= 5 ? C.gold : C.blue, 30 + tier * 4, 6, 0.6, 0.7, 4);
  groundRing(pos, C.gold, 2.4);
  beam(pos, tier >= 5 ? 0xffd040 : 0x7fd0ff);
  shake = Math.max(shake, 0.15 + tier * 0.03);
  const u = await createUnit({ team: 'player', type, tier, row, col });
  popIn(u, 0.3);
  hintShown = true;
  $('hint').classList.add('hidden');
  updatePower();
  updateShopUI();
  persist();
  discover(type, tier, u, true);
}

// First time a tier is reached: celebration card with a 3D portrait
async function discover(type, tier, unit, celebrate) {
  if ((save.discovered[type] || 0) >= tier) return;
  save.discovered[type] = tier;
  persist();
  preloadPlayerTiers();
  if (!celebrate || tier < 2) return;
  timeScale = 0.3;
  camZoom = { pos: unit.group.position.clone().add(new THREE.Vector3(0, 6.5, 8.5)), look: unit.group.position.clone().setY(1), k: 0 };
  tween(0.35, (k) => { camZoom.k = easeOutCubic(k); });
  const info = tierInfo(type, tier);
  $('newMonImg').src = await thumbnail(info.model, AURA_COLORS[tier]);
  $('newMonName').textContent = info.name;
  $('newMonTier').textContent = `${LINES[type].name} · Level ${tier}`;
  audio.play('levelup', { volume: 0.8, vary: 0 });
  setTimeout(() => showScreen('newMon', true), 450);
}

// ============================================================ Dragging
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
let drag = null; // { unit, offset }
let highlight = null;

function groundPoint(e, out) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, out);
}
function pickUnit(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // Ray against each player unit's bounding sphere, then fall back to the cell under the finger
  let best = null, bestD = Infinity;
  for (const u of playerUnits()) {
    if (!u.alive) continue;
    tmp.copy(u.group.position).setY(u.height * 0.5 + (u.flying ? 0.6 : 0));
    const d = raycaster.ray.distanceSqToPoint(tmp);
    const r = Math.max(0.9, u.height * 0.55);
    if (d < r * r) {
      const dc = raycaster.ray.origin.distanceTo(tmp);
      if (dc < bestD) { bestD = dc; best = u; }
    }
  }
  if (best) return best;
  if (groundPoint(e, tmp)) { const c = posToCell(tmp); if (c) return unitAt('player', c.row, c.col); }
  return null;
}
function setHighlight(cell, ok) {
  for (const m of cellMarkers.player) {
    const on = cell && m.row === cell.row && m.col === cell.col;
    m.mesh.material.opacity = on ? 0.75 : 0.22;
    m.mesh.material.color.setHex(on ? (ok ? 0x7dff6a : 0xffd84a) : 0x4fb8ff);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (state === 'chest') { tapChest(e); return; }
  if (state !== 'prep' || paused) return;
  const u = pickUnit(e);
  if (!u) return;
  drag = { unit: u, start: u.group.position.clone(), moved: false, pointerId: e.pointerId };
  const bin = $('sellBin');
  $('sellValue').textContent = formatNum(sellValue(u.type, u.tier, save.buys[u.type]));
  bin.classList.toggle('locked', playerUnits().filter((o) => o.alive).length <= 1);
  bin.classList.remove('hidden', 'hot');
  $('bottom').classList.add('hidden');
  canvas.setPointerCapture(e.pointerId);
  u.play('move');
  tween(0.12, (k) => u.group.scale.setScalar(1 + 0.15 * k));
  audio.play('pickup', { volume: 0.5 });
  // Show which monsters can merge with it
  for (const o of playerUnits()) if (o !== u && o.type === u.type && o.tier === u.tier && u.tier < MAX_TIER) o.mergeGlow = true;
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  $('sellBin').classList.toggle('hot', overBin(e));
  if (!groundPoint(e, tmp)) return;
  const u = drag.unit;
  tmp.z += 0.6; // keep the monster visible above the finger
  u.group.position.set(clamp(tmp.x, -6, 6), 1.1, clamp(tmp.z, -1, 9.5));
  drag.moved = true;
  const c = posToCell(u.group.position);
  const other = c && unitAt('player', c.row, c.col);
  const mergeable = other && other !== u && other.type === u.type && other.tier === u.tier && u.tier < MAX_TIER;
  setHighlight(c, mergeable || !other || other === u);
});
function endDrag(e) {
  if (!drag) return;
  const u = drag.unit;
  drag = null;
  for (const o of playerUnits()) o.mergeGlow = false;
  setHighlight(null);
  const droppedOnBin = overBin(e);
  $('sellBin').classList.add('hidden');
  if (state === 'prep') $('bottom').classList.remove('hidden');
  if (droppedOnBin) {
    if (playerUnits().filter((o) => o.alive).length <= 1) { audio.play('denied'); showBanner('KEEP AT LEAST ONE!', 'red'); }
    else { try { canvas.releasePointerCapture(e.pointerId); } catch {} sellUnit(u); return; }
  }
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
  u.play('idle');
  const c = posToCell(u.group.position);
  const back = () => {
    const from = u.group.position.clone();
    const to = cellPos('player', u.row, u.col);
    tween(0.18, (k) => { u.group.position.lerpVectors(from, to, k); u.group.scale.setScalar(1.15 - 0.15 * k); });
  };
  if (!c) { back(); return; }
  const other = unitAt('player', c.row, c.col);
  if (other === u || (!other && c.row === u.row && c.col === u.col)) { back(); return; }
  if (other && other.type === u.type && other.tier === u.tier && u.tier < MAX_TIER) { merge(u, other); return; }
  if (other) {
    // Swap places
    other.row = u.row; other.col = u.col;
    const of = other.group.position.clone(), ot = cellPos('player', other.row, other.col);
    tween(0.2, (k) => other.group.position.lerpVectors(of, ot, easeOutCubic(k)));
  }
  u.row = c.row; u.col = c.col;
  const from = u.group.position.clone(), to = cellPos('player', c.row, c.col);
  tween(0.15, (k) => { u.group.position.lerpVectors(from, to, k); u.group.scale.setScalar(1.15 - 0.15 * k); }, () => {
    smoke(to, 5, C.dust, 0.5);
    audio.play('drop', { volume: 0.5 });
  });
  persist();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function overBin(e) {
  const r = $('sellBin').getBoundingClientRect();
  const pad = 30;
  return e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
}

// Sell a monster for coins to free its square
function sellUnit(u) {
  const value = sellValue(u.type, u.tier, save.buys[u.type]);
  u.alive = false;
  const p = u.group.position.clone();
  audio.play('coins2', { volume: 0.8 });
  smoke(p.clone().setY(0.6), 12);
  burst(p.clone().setY(1), C.gold, 18, 4, 0.5, 0.5, 3);
  const s0 = u.group.scale.x;
  tween(0.25, (k) => u.group.scale.setScalar(s0 * (1 - k)), () => removeUnit(u));
  flyCoins(p.clone().setY(1), Math.min(8, 2 + u.tier));
  floatText(p.clone().setY(2), '+' + formatNum(value), 'crit');
  save.coins += value;
  setTimeout(() => { updateShopUI(); updatePower(); persist(); }, 300);
}

// ============================================================ Battle
function startBattle() {
  if (state !== 'prep') return;
  if (!playerUnits().length) { showBanner('BUY A MONSTER!', 'red'); return; }
  state = 'battle';
  battleTime = 0;
  hintShown = true;
  $('hint').classList.add('hidden');
  showBottom(false);
  audio.play('fight', { volume: 0.9, vary: 0 });
  audio.play('bell', { volume: 0.4, vary: 0 });
  showBanner('FIGHT!', 'gold');
  setMusic();
  platform.gameplayStart();
  for (const u of units) {
    if (u.team === 'player') { const r0 = u.group.rotation.y; tween(0.3, (k) => { u.group.rotation.y = lerp(r0, Math.PI, k); }); }
    u.hpBar.visible = true;
    if (u.badge) u.badge.visible = false;
    u.setHp(u.maxHp);
    u.cooldown = rand(0.2, 0.6);
    u.target = null;
  }
}

function nearestFoe(u) {
  let best = null, bd = Infinity;
  for (const o of units) {
    if (!o.alive || o.team === u.team) continue;
    const d = o.group.position.distanceToSquared(u.group.position);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function dealDamage(attacker, target, base, isSplash = false) {
  if (!target.alive) return;
  const crit = !isSplash && Math.random() < 0.12;
  const dmg = Math.round(base * (crit ? 2 : 1) * rand(0.9, 1.1));
  target.setHp(target.hp - dmg);
  target.flash = 1;
  const p = target.group.position.clone().setY(target.height * 0.8 + (target.flying ? 0.6 : 0));
  floatText(p, formatNum(dmg), crit ? 'crit' : target.team === 'player' ? 'enemy' : '');
  burst(p, crit ? C.gold : C.spark, crit ? 14 : 6, crit ? 5 : 3, 0.35, 0.35, 2);
  if (crit) { audio.play('crit', { volume: 0.5 }); shake = Math.max(shake, 0.18); }
  if (target.current !== target.actions.attack && target.actions.hit && Math.random() < 0.5) {
    target.play('hit', 0.08);
    target.hitTimer = 0.35;
  }
  // Knockback from big hits
  if (base > target.maxHp * 0.15 || crit) {
    tmp.subVectors(target.group.position, attacker.group.position).setY(0).normalize().multiplyScalar(crit ? 1.2 : 0.7);
    target.knock.add(tmp);
  }
  if (target.hp <= 0) killUnit(target);
}

function killUnit(u) {
  u.alive = false;
  u.hpBar.visible = false;
  u.play('death', 0.1);
  audio.play('die', { volume: 0.6 });
  const p = u.group.position.clone();
  tween(0.9, () => {}, () => {
    if (!u.group.parent) return;
    smoke(p.clone().setY(0.5 + (u.flying ? 0.5 : 0)), 12);
    burst(p.clone().setY(0.8), u.team === 'player' ? C.blue : C.purple, 16, 4, 0.5, 0.5, 3);
    const sx = u.group.scale.x;
    tween(0.25, (k) => u.group.scale.setScalar(sx * (1 - k)), () => { if (u.team === 'enemy') removeUnit(u); else u.group.visible = false; });
    if (u.team === 'enemy') flyCoins(p.clone().setY(1), u.isBoss ? 12 : Math.min(5, 1 + Math.floor(u.tier / 2)));
  });
  if (u.isBoss) { slowMo(1.2); shake = 1; audio.play('slam', { volume: 1 }); }
}

function slowMo(seconds) {
  timeScale = 0.3;
  slowMoTimer = seconds;
}

// Projectiles for flyers
const projectiles = [];
const orbGeo = new THREE.SphereGeometry(0.22, 12, 8);
function shoot(from, to, dmg, team, tier, splash) {
  const color = team === 'player' ? new THREE.Color(0.6, 1.8, 2.6) : new THREE.Color(2.6, 0.8, 1.6);
  const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color }));
  m.scale.setScalar(0.8 + tier * 0.12);
  m.position.copy(from.group.position).setY(from.height * 0.6 + 0.6);
  scene.add(m);
  projectiles.push({ mesh: m, from, to, dmg, color, splash, speed: 13 });
  audio.play('shoot', { volume: 0.35, gap: 0.05 });
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const target = p.to;
    tmp.copy(target.group.position).setY(target.height * 0.6 + (target.flying ? 0.6 : 0));
    const d = tmp.distanceTo(p.mesh.position);
    if (!target.alive && d > 0.5) { // target died: fizzle
      burst(p.mesh.position, p.color, 4, 2, 0.3, 0.25, 1);
      scene.remove(p.mesh); projectiles.splice(i, 1); continue;
    }
    if (d < 0.4) {
      dealDamage(p.from, target, p.dmg);
      if (p.splash) {
        for (const o of units) if (o.alive && o.team === target.team && o !== target && o.group.position.distanceTo(target.group.position) < p.splash) dealDamage(p.from, o, p.dmg * 0.5, true);
        groundRing(target.group.position, p.color, p.splash * 1.2, 0.35);
      }
      audio.play('orb_hit', { volume: 0.4, gap: 0.05 });
      scene.remove(p.mesh); projectiles.splice(i, 1); continue;
    }
    p.mesh.position.addScaledVector(tmp.sub(p.mesh.position).normalize(), Math.min(d, p.speed * dt));
    glow.spawn(p.mesh.position, tmp2.set(0, 0, 0), p.color, 0.45, 0.25);
  }
}

function updateBattle(dt) {
  battleTime += dt;
  for (const u of units) {
    if (!u.alive) continue;
    if (u.hitTimer > 0) { u.hitTimer -= dt; if (u.hitTimer <= 0) u.play('idle', 0.1); }
    // Knockback slide
    if (u.knock.lengthSq() > 0.0001) {
      u.group.position.addScaledVector(u.knock, dt * 6);
      u.knock.multiplyScalar(1 - dt * 6);
    }
    u.retarget -= dt;
    if (!u.target || !u.target.alive || u.retarget <= 0) { u.target = nearestFoe(u); u.retarget = 0.6; }
    const t = u.target;
    if (!t) { u.play('idle'); continue; }
    const dx = t.group.position.x - u.group.position.x;
    const dz = t.group.position.z - u.group.position.z;
    const dist = Math.hypot(dx, dz);
    const reach = u.stats.range + t.radius + u.radius * 0.5;
    // Face the target smoothly
    const ang = Math.atan2(dx, dz);
    let da = ang - u.group.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    u.group.rotation.y += da * Math.min(1, dt * 10);
    if (u.pendingHit >= 0) {
      u.pendingHit -= dt;
      if (u.pendingHit < 0) {
        if (u.type === 'ranged' && !u.isBoss) shoot(u, t, u.stats.dmg, u.team, u.tier, u.tier >= 5 ? 1.8 : 0);
        else if (t.alive && dist < reach + 0.8) {
          dealDamage(u, t, u.stats.dmg);
          audio.play(u.tier >= 5 || u.isBoss ? 'hit_heavy' : pick(['hit1', 'hit2']), { volume: 0.45, gap: 0.03 });
          if (u.stats.splash) {
            for (const o of units) if (o.alive && o.team !== u.team && o !== t && o.group.position.distanceTo(t.group.position) < u.stats.splash) dealDamage(u, o, u.stats.dmg * 0.6, true);
            groundRing(t.group.position, C.red, u.stats.splash * 1.3, 0.4);
            smoke(t.group.position, 10, C.dust, 1);
            shake = Math.max(shake, 0.35);
            audio.play('slam', { volume: 0.6 });
          }
        }
      }
    }
    if (dist > reach) {
      // Move toward the target
      const sp = u.stats.speed * dt;
      u.group.position.x += (dx / dist) * sp;
      u.group.position.z += (dz / dist) * sp;
      if (u.current !== u.actions.attack || !u.current.isRunning()) u.play('move', 0.15);
      if (!u.flying && Math.random() < dt * 4) puff.spawn(tmp.copy(u.group.position).setY(0.1), tmp2.set(rand(-0.5, 0.5), 0.6, rand(-0.5, 0.5)), C.dust, 0.4, 0.4, 0);
    } else {
      u.cooldown -= dt;
      if (u.cooldown <= 0) {
        u.cooldown = u.stats.interval * rand(0.92, 1.08);
        const a = u.actions.attack;
        if (a) {
          a.reset(); a.setEffectiveTimeScale(Math.max(1, a.getClip().duration / (u.stats.interval * 0.85)));
          if (u.current && u.current !== a) a.crossFadeFrom(u.current, 0.08, false);
          a.play(); u.current = a;
        }
        u.pendingHit = u.stats.interval * 0.32;
      } else if (u.current !== u.actions.attack || !u.current.isRunning()) u.play('idle', 0.15);
    }
  }
  // Keep units from overlapping
  const alive = units.filter((u) => u.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      if (a.flying !== b.flying) continue;
      const dx = b.group.position.x - a.group.position.x, dz = b.group.position.z - a.group.position.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const min = (a.radius + b.radius) * 0.9;
      if (d < min) {
        const push = (min - d) * 0.5;
        const wa = a.isBoss ? 0.1 : 1, wb = b.isBoss ? 0.1 : 1;
        a.group.position.x -= (dx / d) * push * wa; a.group.position.z -= (dz / d) * push * wa;
        b.group.position.x += (dx / d) * push * wb; b.group.position.z += (dz / d) * push * wb;
      }
    }
  }
  for (const u of alive) {
    u.group.position.x = clamp(u.group.position.x, -6.5, 6.5);
    u.group.position.z = clamp(u.group.position.z, -9.5, 9.5);
  }
  const pAlive = units.some((u) => u.alive && u.team === 'player');
  const eAlive = units.some((u) => u.alive && u.team === 'enemy');
  if (!eAlive) endBattle(true);
  else if (!pAlive) endBattle(false);
  else if (battleTime > 90) endBattle(false);
}

async function endBattle(won) {
  state = 'result';
  platform.gameplayStop();
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  if (won) {
    slowMo(0.9);
    showBanner('VICTORY!', 'gold');
    audio.play('win', { volume: 0.9, vary: 0 });
    for (const u of playerUnits()) if (u.alive) { u.play('win', 0.2); u.hpBar.visible = false; }
    confetti();
    await wait(2.0);
    const coins = winCoins(save.level);
    $('winCoins').textContent = formatNum(coins);
    $('tripleBtn').classList.toggle('hidden', !platform.hasRewarded);
    pendingReward = coins;
    showScreen('win', true);
    platform.happyTime();
  } else {
    showBanner('DEFEAT', 'red');
    audio.play('lose', { volume: 0.9, vary: 0 });
    for (const u of enemyUnits()) if (u.alive) { u.play('win', 0.2); u.hpBar.visible = false; }
    await wait(1.8);
    const coins = Math.max(5, Math.round(winCoins(save.level) * 0.3));
    $('loseCoins').textContent = formatNum(coins);
    $('loseTip').textContent = pick([
      'Merge monsters to make them much stronger!',
      'Put Brawlers in front to protect your Flyers!',
      'Compare YOUR power with the ENEMY power before you fight.',
      'Flyers at level 5+ hit several enemies at once!',
    ]);
    pendingReward = coins;
    showScreen('lose', true);
  }
}
let pendingReward = 0;

function confetti() {
  const colors = [C.gold, C.blue, C.red, C.green, C.purple];
  for (let i = 0; i < 90; i++) {
    glow.spawn(tmp.set(rand(-6, 6), rand(6, 10), rand(-4, 8)), tmp2.set(rand(-2, 2), rand(-1, 3), rand(-2, 2)), pick(colors), rand(0.25, 0.45), rand(1.2, 2.2), 3);
  }
}

// Reset the player's army after a battle (monsters return to their cells)
async function restoreArmy(board) {
  for (const u of playerUnits()) removeUnit(u);
  const list = await Promise.all(board.map((b) => createUnit({ team: 'player', ...b })));
  list.forEach((u, i) => { tween(0.01, () => {}, () => popIn(u, 0.1)); });
  updatePower();
}

async function afterResult(won, coins) {
  showScreen('win', false); showScreen('lose', false);
  save.coins += coins;
  bumpCoins();
  const prevLevel = save.level;
  if (won) save.level++;
  save.levelsSinceAd++;
  persist();
  if (won) platform.sendScore(prevLevel);
  await restoreArmy(battleBoard);
  // Treasure chest every 5 levels
  if (won && prevLevel % 5 === 0) {
    await chestSequence(prevLevel);
  }
  if (save.levelsSinceAd >= 3) {
    save.levelsSinceAd = 0;
    await platform.midgameAd();
  }
  await setupLevel();
}

// ============================================================ Treasure chest
let chest = null;
async function chestSequence(level) {
  state = 'chest';
  showBottom(false);
  for (const u of enemyUnits()) removeUnit(u);
  const closed = await envObject('p_Chest_Wood', 1.6);
  closed.position.set(0, 9, 0);
  closed.rotation.y = 0;
  scene.add(closed);
  chest = { obj: closed, level, opened: false, taps: 0 };
  tween(0.5, (k) => { closed.position.y = 9 * (1 - k * k); }, () => {
    smoke(closed.position, 14, C.dust, 1);
    groundRing(closed.position, C.gold, 3);
    shake = 0.3;
    audio.play('place', { volume: 0.8 });
    $('chestHint').classList.remove('hidden');
  });
  camZoom = { pos: new THREE.Vector3(0, 7, 8), look: new THREE.Vector3(0, 0.8, 0), k: 0 };
  tween(0.6, (k) => { camZoom.k = easeOutCubic(k); });
  await new Promise((r) => { chest.resolve = r; });
}

async function tapChest() {
  if (!chest || chest.opened) return;
  chest.taps++;
  audio.play('chest_latch', { volume: 0.7 });
  const o = chest.obj;
  tween(0.2, (k) => { o.rotation.z = Math.sin(k * Math.PI * 3) * 0.15; o.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.12); });
  burst(o.position.clone().setY(1), C.gold, 8, 3, 0.4, 0.4, 2);
  if (chest.taps < 3) return;
  chest.opened = true;
  $('chestHint').classList.add('hidden');
  await wait(0.25);
  scene.remove(o);
  const open = await envObject('pf_Chest', 1.7);
  open.position.copy(o.position);
  scene.add(open);
  popIn({ group: open }, 0.6);
  audio.play('chest_open', { volume: 0.8 });
  audio.play('coins2', { volume: 0.8 });
  burst(open.position.clone().setY(1.2), C.gold, 60, 7, 0.6, 1, 6);
  beam(open.position, 0xffd040, 1.2);
  shake = 0.4;
  const coins = winCoins(chest.level) * 3;
  flyCoins(open.position.clone().setY(1.2), 14);
  const freeTier = Math.max(1, Math.max(save.discovered.melee || 1, save.discovered.ranged || 1) - 2);
  const cells = emptyPlayerCells();
  const freeType = Math.random() < 0.6 ? 'melee' : 'ranged';
  $('chestCoins').textContent = formatNum(coins);
  $('chestExtra').textContent = cells.length ? `+ FREE ${tierInfo(freeType, freeTier).name.toUpperCase()}!` : '';
  await wait(1.0);
  showScreen('chestWin', true);
  chest.reward = { coins, freeTier, freeType, cells: cells.length };
  chest.open = open;
}

async function collectChest() {
  showScreen('chestWin', false);
  const r = chest.reward;
  save.coins += r.coins;
  bumpCoins();
  scene.remove(chest.open);
  smoke(chest.open.position, 12);
  camZoom = null;
  state = 'prep';
  if (r.cells) await buy(r.freeType, true, r.freeTier);
  persist();
  const done = chest.resolve;
  chest = null;
  done();
}

// ============================================================ UI helpers
function showScreen(id, on) { $(id).classList.toggle('show', on); }
function showBanner(text, cls = '') {
  const el = $('banner');
  el.textContent = text;
  el.className = 'banner';
  void el.offsetWidth;
  el.className = 'banner show ' + cls;
}
function bumpCoins() {
  $('coinNum').textContent = formatNum(save.coins);
  const el = document.querySelector('.coins');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  audio.play('coins', { volume: 0.25, gap: 0.08 });
  updateShopUI();
}

// 3D portraits for the monster book and "new monster" card
let thumbRenderer = null, thumbScene, thumbCam;
const thumbCache = new Map();
async function thumbnail(model, aura) {
  const key = model + (aura || '');
  if (thumbCache.has(key)) return thumbCache.get(key);
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(256, 256);
    thumbRenderer.toneMapping = THREE.NeutralToneMapping;
    thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 5); thumbScene.add(d);
    thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  }
  const t = await loadModel(monsterPath(model));
  const obj = cloneSkinned(t.scene);
  const mixer = new THREE.AnimationMixer(obj);
  const idle = findClip(t.animations, ANIMS.idle);
  if (idle) { mixer.clipAction(idle).play(); mixer.update(0.4); }
  if (aura) obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(aura); o.material.emissiveIntensity = 0.35; } });
  const s = 2 / t.size.y;
  obj.scale.setScalar(s);
  obj.position.set(-t.center.x * s, -t.center.y * s, -t.center.z * s);
  obj.rotation.y = -0.35;
  thumbScene.add(obj);
  thumbCam.position.set(0, 0.5, 5.2);
  thumbCam.lookAt(0, 0, 0);
  thumbRenderer.render(thumbScene, thumbCam);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  thumbScene.remove(obj);
  thumbCache.set(key, url);
  return url;
}

async function openBook() {
  showScreen('book', true);
  let found = 0;
  for (const line of ['melee', 'ranged']) {
    const grid = $(line === 'melee' ? 'bookMelee' : 'bookRanged');
    grid.innerHTML = '';
    for (let t = 1; t <= MAX_TIER; t++) {
      const card = document.createElement('div');
      const known = (save.discovered[line] || 0) >= t;
      card.className = 'book-card' + (known ? '' : ' locked');
      if (known) {
        found++;
        const info = tierInfo(line, t);
        card.innerHTML = `<img alt=""><div>${info.name}</div><div class="t">Lv ${t}</div>`;
        thumbnail(info.model, AURA_COLORS[t]).then((url) => { card.querySelector('img').src = url; });
      } else card.innerHTML = `<div class="q">?</div><div class="t">Lv ${t}</div>`;
      grid.appendChild(card);
    }
  }
  $('bookProgress').textContent = `${found} / ${MAX_TIER * 2} discovered`;
  audio.play('book', { volume: 0.7 });
}

// ============================================================ Save / load
let battleBoard = [];
function persist() {
  if (state !== 'battle' && state !== 'result') save.board = savedBoard();
  platform.saveData(save);
}
function applySettings() {
  audio.setSfx(save.sfx);
  audio.setMusic(save.music);
  $('sfxBtn').textContent = 'SOUND: ' + (save.sfx ? 'ON' : 'OFF');
  $('musicBtn').textContent = 'MUSIC: ' + (save.music ? 'ON' : 'OFF');
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ============================================================ Buttons
const audio = new AudioManager();
const click = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); audio.play('click', { volume: 0.6 }); fn(); });
click('buyMelee', () => buy('melee'));
click('buyRanged', () => buy('ranged'));
click('fightBtn', () => { battleBoard = savedBoard(); save.board = battleBoard; persist(); startBattle(); });
click('freeBtn', async () => {
  const ok = await platform.rewardedAd('free_monster');
  if (!ok) return;
  save.freeUsedLevel = save.level;
  const tier = Math.max(1, Math.max(save.discovered.melee || 1, save.discovered.ranged || 1) - 2);
  await buy(Math.random() < 0.5 ? 'melee' : 'ranged', true, tier);
  updateShopUI();
});
click('tripleBtn', async () => {
  const ok = await platform.rewardedAd('triple_coins');
  if (!ok) return;
  afterResult(true, pendingReward * 3);
});
click('claimBtn', () => afterResult(true, pendingReward));
click('retryBtn', () => afterResult(false, pendingReward));
click('newMonBtn', () => {
  showScreen('newMon', false);
  timeScale = 1;
  if (camZoom) tween(0.4, (k) => { camZoom.k = 1 - k; }, () => { camZoom = null; });
});
click('chestBtn', () => collectChest());
click('dailyBtn', () => {
  showScreen('daily', false);
  save.coins += dailyAmount;
  save.lastDaily = today();
  persist();
  flyCoins(new THREE.Vector3(0, 1, 2), 10);
});
click('bookBtn', () => openBook());
click('bookClose', () => showScreen('book', false));
click('settingsBtn', () => { showScreen('settings', true); setPaused(true); });
click('settingsClose', () => { showScreen('settings', false); setPaused(false); });
click('sfxBtn', () => { save.sfx = !save.sfx; applySettings(); persist(); });
click('musicBtn', () => { save.music = !save.music; applySettings(); persist(); });
click('creditsBtn', () => { showScreen('settings', false); showScreen('credits', true); });
click('creditsClose', () => { showScreen('credits', false); showScreen('settings', true); });
click('restartLevelBtn', () => { showScreen('settings', false); setPaused(false); restartLevel(); });
click('newGameBtn', () => { showScreen('settings', false); showScreen('confirmReset', true); });
click('resetNo', () => { showScreen('confirmReset', false); setPaused(false); });
click('resetYes', () => { showScreen('confirmReset', false); setPaused(false); newGame(); });

// Start the current level again: your army returns to its squares, the enemy army is rebuilt
async function restartLevel() {
  if (state === 'loading-level' || state === 'chest') return;
  const wasBattle = state === 'battle' || state === 'result';
  if (wasBattle) platform.gameplayStop();
  state = 'loading-level';
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  showScreen('win', false); showScreen('lose', false);
  timeScale = 1; slowMoTimer = 0; camZoom = null;
  await restoreArmy(wasBattle ? battleBoard : savedBoard());
  persist();
  await setupLevel();
}

// Wipe all progress and begin again from level 1
async function newGame() {
  if (state === 'loading-level' || state === 'chest') return;
  if (state === 'battle') platform.gameplayStop();
  state = 'loading-level';
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  showScreen('win', false); showScreen('lose', false);
  timeScale = 1; slowMoTimer = 0; camZoom = null;
  Object.assign(save, {
    level: 1, coins: START_COINS, buys: { melee: 0, ranged: 0 },
    board: [{ type: 'melee', tier: 1, row: 0, col: 2 }, { type: 'melee', tier: 1, row: 0, col: 1 }],
    discovered: { melee: 1, ranged: 0 }, levelsSinceAd: 0, freeUsedLevel: 0,
  });
  hintShown = false;
  battleBoard = save.board.slice();
  await restoreArmy(save.board);
  persist();
  bumpCoins();
  await setupLevel();
}

function setPaused(p) {
  paused = p;
  if (state === 'battle') { if (p) platform.gameplayStop(); else platform.gameplayStart(); }
}
hooks.onAdStart = () => { adActive = true; audio.setBlocked(true); };
hooks.onAdEnd = () => { adActive = false; audio.setBlocked(!platform.isAudioEnabled()); };
hooks.onPause = () => { paused = true; audio.setPaused(true); };
hooks.onResume = () => { paused = false; audio.setPaused(false); };
hooks.onAudioChange = (on) => audio.setBlocked(!on || adActive);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.setPaused(true);
  else if (!adActive) audio.setPaused(false);
});
window.addEventListener('resize', resize);
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================ Main loop
let last = performance.now();
let lowQuality = false;
let capFocus = null;
let capZoom = CAPTURE ? 0.66 : 1;
let slowFrames = 0;
let elapsed = 0;
function frame() {
  if (!CAPTURE) requestAnimationFrame(frame);
  const now = performance.now();
  const raw = forcedDt !== null ? forcedDt : Math.min((now - last) / 1000, 0.05);
  last = now;
  if (paused || adActive) { renderer.render(scene, camera); return; }
  if (slowMoTimer > 0) { slowMoTimer -= raw; if (slowMoTimer <= 0) timeScale = 1; }
  const dt = raw * timeScale;
  elapsed += raw;

  if (state === 'battle') updateBattle(dt);
  // Auto quality: drop shadows and resolution if the device struggles
  if (!lowQuality && (state === 'battle' || state === 'prep')) {
    slowFrames = raw > 1 / 30 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 120) {
      lowQuality = true;
      renderer.shadowMap.enabled = false;
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      pixelRatio = Math.min(pixelRatio, 1.25);
      renderer.setPixelRatio(pixelRatio);
      resize();
    }
  }
  updateProjectiles(dt);
  for (const u of units) {
    u.mixer.update(dt);
    // Hit flash and merge highlight
    if (u.flash > 0 || u.mergeGlow || u.wasGlow) {
      u.flash = Math.max(0, u.flash - dt * 6);
      const g = u.mergeGlow ? 0.35 + Math.sin(elapsed * 10) * 0.25 : 0;
      for (const m of u.mats) {
        if (!m.emissive) m.emissive = new THREE.Color();
        const v = u.flash * 0.55 + g;
        m.emissive.setRGB(v + (u.aura ? 0.3 : 0), v + (u.aura ? 0.25 : 0), v * (u.mergeGlow ? 0.4 : 1));
        m.emissiveIntensity = 1;
      }
      u.wasGlow = u.mergeGlow || u.flash > 0;
    }
    // Flyers hover
    if (u.flying) u.inner.position.y = 0.7 + Math.sin(elapsed * 2.5 + u.bob) * 0.15;
    // Bars face the camera
    if (u.hpBar.visible) u.hpBar.quaternion.copy(u.group.quaternion).invert().multiply(camera.quaternion);
  }
  glow.update(dt);
  puff.update(dt);
  updateRings(dt);
  updateTweens(raw);
  updateFloaters(raw);
  for (const c of clouds) {
    c.obj.position.y = c.base + Math.sin(elapsed * 0.4 + c.bob) * 0.6;
    if (c.speed) { c.obj.position.x += c.speed * raw; if (c.obj.position.x > 50) c.obj.position.x = -50; }
  }
  // Camera: base framing, optional zoom, shake
  shake = Math.max(0, shake - raw * 1.8);
  const s = shake * shake * 0.5;
  if (camZoom) {
    camera.position.lerpVectors(camBase, camZoom.pos, camZoom.k);
    tmp.lerpVectors(camLook, camZoom.look, camZoom.k);
  } else { camera.position.copy(camBase); tmp.copy(camLook); }
  camera.position.x += rand(-s, s); camera.position.y += rand(-s, s);
  if (CAPTURE && !camZoom) {
    // Trailer camera: closer, slowly orbiting, and following the fight
    const alive = units.filter((u) => u.alive);
    const focus = new THREE.Vector3(0, 0.8, 2.5);
    if (state === 'battle' || state === 'result') {
      const c = new THREE.Vector3();
      for (const u of alive) c.add(u.group.position);
      if (alive.length) c.multiplyScalar(1 / alive.length);
      focus.set(c.x * 0.6, 1, c.z);
    }
    capFocus = capFocus ? capFocus.lerp(focus, Math.min(1, raw * 2)) : focus.clone();
    const a = Math.sin(elapsed * 0.3) * 0.22;
    const off = new THREE.Vector3().subVectors(camBase, camLook).multiplyScalar(capZoom).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.position.copy(capFocus).add(off);
    tmp.copy(capFocus);
  }
  camera.lookAt(tmp);
  renderer.render(scene, camera);
}

// ============================================================ Boot
let dailyAmount = 0;
async function boot() {
  resize();
  platform.firstFrameReady();
  const sdk = platform.init();
  let done = 0;
  const total = 12;
  const tick = () => { done++; $('loadBar').style.width = Math.min(100, (100 * done) / total) + '%'; };

  const sfx = ['hit1', 'hit2', 'hit_heavy', 'die', 'orb_hit', 'bell', 'slam', 'crit', 'place', 'coins', 'coins2', 'fight', 'shoot', 'chest_latch', 'chest_open', 'book', 'pickup', 'click', 'merge', 'levelup', 'denied', 'lose', 'win', 'drop'];
  const sfxJob = Promise.all(sfx.map((n) => audio.load(n, `assets/audio/${n}.mp3`))).then(tick);
  const saveJob = sdk.then(async () => {
    const data = await platform.loadData();
    if (data && data.level) {
      Object.assign(save, data);
      save.buys = Object.assign({ melee: 0, ranged: 0 }, data.buys || {});
      save.discovered = Object.assign({ melee: 1, ranged: 0 }, data.discovered || {});
    }
    tick();
  });
  const arenaJob = buildArena().then(tick);
  await saveJob;
  // Monsters needed for the first screen
  const firstModels = new Set();
  for (const b of save.board) firstModels.add(tierInfo(b.type, b.tier).model);
  const L = buildLevel(save.level);
  for (const e of L.units) firstModels.add(enemyModel(e.type, e.tier, e.seed));
  if (L.boss) firstModels.add(L.boss.model);
  const modelJobs = [...firstModels].map((m) => loadModel(monsterPath(m)).then(tick));
  await Promise.all([arenaJob, sfxJob, ...modelJobs]);

  // Place the saved army
  await Promise.all(save.board.map((b) => createUnit({ team: 'player', ...b })));
  renderer.compile(scene, camera);
  $('loading').classList.remove('show');
  $('top').classList.remove('hidden');
  applySettings();
  audio.setBlocked(!platform.isAudioEnabled());
  platform.gameReady();
  await setupLevel();

  // Daily gift
  if (save.lastDaily !== today()) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    save.streak = save.lastDaily === yesterday ? (save.streak || 0) + 1 : 1;
    dailyAmount = Math.round((40 + save.level * 6) * Math.min(3, 1 + (save.streak - 1) * 0.25));
    if (save.level > 1 || save.lastDaily) {
      $('dailyDay').textContent = `Day ${save.streak}`;
      $('dailyCoins').textContent = formatNum(dailyAmount);
      showScreen('daily', true);
    } else save.lastDaily = today();
  }
  // Music after the game is playable
  audio.load('music_prep', 'assets/audio/music_prep.mp3').then(() => setMusic());
  audio.load('music_battle', 'assets/audio/music_battle.mp3');
}

if (platform.name === 'local') {
  window.__mma = {
    save, units, get state() { return state; }, buy, startBattle, merge, playerUnits, enemyUnits,
    sim(sec) { for (let t = 0; t < sec; t += 1 / 30) { if (state === 'battle') updateBattle(1 / 30); updateProjectiles(1 / 30); for (const u of units) u.mixer.update(1 / 30); updateTweens(1 / 30); } },
    setLevel: async (l) => { save.level = l; await setupLevel(); },
    // Balance test: give the player an army of `count` tier-1 units, merged like a real player, then fight
    async testLevel(level, count, meleeShare = 0.6, fight = true) {
      for (const u of [...units]) removeUnit(u);
      save.level = level;
      const board = [];
      const split = (n) => { const t = []; for (let k = 10; k >= 1; k--) { const v = 1 << (k - 1); while (n >= v) { t.push(k); n -= v; } } return t; };
      const nm = Math.round(count * meleeShare), nr = count - nm;
      const tm = split(nm), tr = split(nr);
      while (tm.length + tr.length > 15) { const l = tm.length >= tr.length ? tm : tr; l.sort((a, b) => a - b); const a = l.shift(), b2 = l.shift(); l.push(Math.max(a, b2) + 1); }
      tm.sort((a, b) => b - a).forEach((t, i) => board.push({ type: 'melee', tier: Math.min(10, t), row: Math.floor(i / 5), col: i % 5 }));
      tr.sort((a, b) => b - a).forEach((t, i) => { const j = 14 - i; board.push({ type: 'ranged', tier: Math.min(10, t), row: Math.floor(j / 5), col: j % 5 }); });
      await Promise.all(board.map((b) => createUnit({ team: 'player', ...b })));
      await setupLevel();
      battleBoard = board;
      if (!fight) return 'ready';
      startBattle();
      let t = 0;
      while (state === 'battle' && t < 95) { this.sim(1); t += 1; }
      const pl = units.filter((u) => u.team === 'player' && u.alive).length;
      const en = units.filter((u) => u.team === 'enemy' && u.alive).length;
      showScreen('win', false); showScreen('lose', false);
      return { level, count, won: en === 0 && pl > 0, time: t, playerLeft: pl, enemyLeft: en, you: armyPower(board.map((b) => ({ stats: unitStats(b.type, b.tier) }))), foe: armyPower(enemyUnits()) };
    },
    camera, scene, expected,
    step(dt) { forcedDt = dt; frame(); forcedDt = null; },
    async setupDemo(board, level, opts = {}) {
      for (const u of [...units]) removeUnit(u);
      save.level = level;
      save.discovered = { melee: 10, ranged: 10 };
      save.coins = opts.coins || 2400;
      hintShown = true;
      await Promise.all(board.map((b) => createUnit({ team: 'player', ...b })));
      battleBoard = board;
      if (!opts.deferLevel) await setupLevel();
      $('hint').classList.add('hidden');
    },
    setupLevel: () => setupLevel(),
    demoMerge(type, tier) {
      const list = playerUnits().filter((u) => u.alive && u.type === type && u.tier === tier);
      const [a, b] = list;
      if (!a || !b) return 'no pair';
      const hand = document.createElement('div');
      hand.className = 'demo-hand'; hand.textContent = '👆';
      document.body.appendChild(hand);
      const start = a.group.position.clone();
      const end = b.group.position.clone();
      a.play('move');
      for (const o of playerUnits()) if (o !== a && o.type === type && o.tier === tier) o.mergeGlow = true;
      tween(0.12, (k) => a.group.scale.setScalar(1 + 0.15 * k));
      tween(0.75, (k) => {
        const e = easeOutCubic(Math.min(1, k * 1.15));
        a.group.position.lerpVectors(start, end, e);
        a.group.position.y = Math.sin(Math.min(1, k * 1.15) * Math.PI) * 1.2 + (k > 0.1 ? 0.6 : 0);
        tmp.copy(a.group.position).setY(a.height * 0.4).project(camera);
        hand.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`;
      }, () => {
        for (const o of playerUnits()) o.mergeGlow = false;
        hand.remove();
        merge(a, b);
      });
      return 'ok';
    },
    clickFight() { battleBoard = savedBoard(); startBattle(); },
    hero(px, py, pz, lx, ly, lz) { camZoom = { pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(lx, ly, lz), k: 1 }; },
    heroOff() { camZoom = null; },
    setCapZoom(z) { capZoom = z; },
    cleanUnits() { for (const u of units) { u.flash = 0; u.hpBar.visible = false; if (u.badge) u.badge.visible = false; for (const m of u.mats) { m.emissive && m.emissive.setRGB(u.aura ? 0.3 : 0, u.aura ? 0.25 : 0, 0); } } },
    get battleOver() { return state === 'result'; }, restartLevel: () => restartLevel(), newGame: () => newGame(), screenOf(u) { const v = u.group.position.clone().setY(u.height * 0.5); v.project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; },
  };
}

if (!CAPTURE) requestAnimationFrame(frame);
boot().catch((e) => {
  console.error(e);
  $('loading').innerHTML = '<div class="logo"><b>Oops!</b><span style="font-size:16px">Could not load the game. Please refresh.</span></div>';
});
