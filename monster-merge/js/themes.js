// Arena themes: sky, light, ground colors, decorations and ambient particles.
// The arena changes every 10 levels and cycles after the last theme.

import * as THREE from 'three';
import { buildPumpkinHead, snowmanProp } from './creatures.js?v=20261117170831';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- Theme definitions
// recolor: material name -> color (applies to every environment model using it)
export const THEMES = [
  {
    id: 'meadow', name: 'GREEN MEADOW',
    sky: [0x3fa9ff, 0xa8e2ff, 0xe9f8ff], stars: 0, fog: 0xbfe8ff,
    hemi: [0xe4f4ff, 0x7a8f4c, 1.5], sun: [0xfff0d6, 2.6], exposure: 1.05,
    cloud: 0xffffff, recolor: {},
    particles: 'pollen',
    decor: [
      ['pf_Tree_Fruit', 5.2, -6.4, -9.2], ['pf_Tree', 4.6, 6.3, -9.0], ['n_Pine_1', 5.6, -6.8, -4.5], ['n_CommonTree_1', 5.0, 6.8, -5.2],
      ['pf_Tree', 3.6, -6.7, 6.8], ['n_Pine_1', 4.2, 6.7, 7.4],
      ['p_Banner_1', 2.6, -3.6, -9.4, 0], ['p_Banner_1', 2.6, 3.6, -9.4, 0], ['p_Banner_2', 2.4, -6.4, 2.2, Math.PI / 2], ['p_Banner_2', 2.4, 6.4, 2.2, -Math.PI / 2],
      ['p_Barrel', 1.0, -6.2, -1.4], ['p_Barrel', 0.9, -6.6, -0.4], ['p_Crate_Wooden', 1.0, 6.3, -1.0, 0.3], ['p_WeaponStand', 1.3, 6.4, 4.6, -Math.PI / 2],
      ['p_Torch_Metal', 1.2, -6.2, 4.4], ['p_Torch_Metal', 1.2, 6.2, 0.9],
      ['n_Rock_Medium_1', 1.4, -6.3, -6.8], ['n_Rock_Medium_3', 1.2, 6.5, 2.6],
      ['n_Bush_Common_Flowers', 1.3, -6.4, 8.6, 0, 1], ['n_Bush_Common_Flowers', 1.2, 6.6, -7.2, 0, 1],
      ['n_Flower_3_Group', 1.0, -6.0, 0.8, 0, 1], ['n_Flower_4_Group', 1.1, 6.0, 6.0, 0, 1], ['n_Flower_4_Group', 1.0, -2.0, -9.4, 0, 1], ['n_Flower_3_Group', 0.9, 1.8, -9.5, 0, 1],
      ['n_Grass_Wispy_Tall', 0.9, -5.6, -3.0, 0, 1], ['n_Grass_Wispy_Tall', 0.9, 5.7, 3.6, 0, 1],
      ['n_Mushroom_Common', 0.6, -5.8, 6.2, 0, 1], ['n_Mushroom_Common', 0.5, 5.9, -3.4, 0, 1],
      ['pf_Fence_Middle', 1.1, -4, -9.6, 0], ['pf_Fence_Middle', 1.1, 0, -9.6, 0], ['pf_Fence_Middle', 1.1, 4, -9.6, 0],
    ],
  },
  {
    id: 'desert', name: 'SUNSET DUNES',
    sky: [0x4f9ee0, 0xffcf8a, 0xffe6c4], stars: 0, fog: 0xf3d2a0,
    hemi: [0xfff1d8, 0xc9a066, 1.55], sun: [0xffdcaa, 2.8], exposure: 1.05,
    cloud: 0xfff2de,
    recolor: { Green_Light: 0xe8c47e, Dirt_1: 0xb87a40, Rock: 0xb8743e, Green: 0x8a8a3c, Leaves_Pine: 0xa0a060 },
    particles: 'sand',
    decor: [
      ['@cactus', 3.4, -6.5, -8.8], ['@cactus', 2.6, 6.4, -8.6], ['n_DeadTree_1', 4.4, -6.9, -4.2], ['@cactus', 3.0, 6.8, -4.8],
      ['n_DeadTree_3', 3.8, 6.8, 7.2], ['@cactus', 2.4, -6.7, 7.0],
      ['n_Rock_Medium_2', 1.6, -6.3, -6.6], ['n_Rock_Medium_1', 1.3, 6.4, 2.6], ['n_Rock_Medium_3', 1.0, -6.4, 1.6], ['n_Rock_Medium_2', 1.1, 6.6, -1.6],
      ['@skull', 0.7, -6.1, -0.8, 0.6], ['@bones', 0.5, 6.1, 5.8], ['@bones', 0.5, -5.9, 4.6, 1.2],
      ['p_Barrel', 1.0, 6.3, 0.4], ['p_Crate_Wooden', 1.0, -6.2, 5.6, 0.4],
      ['@cactus', 1.6, -2.4, -9.4], ['@cactus', 1.8, 2.6, -9.5], ['n_Pebble_Round_1', 0.4, 0.2, -9.5, 0, 1],
      ['p_Banner_1', 2.6, -4.2, -9.6, 0], ['p_Banner_1', 2.6, 4.2, -9.6, 0],
      ['@pyramid', 9, -30, -40], ['@pyramid', 6, 34, -48],
    ],
  },
  {
    id: 'snow', name: 'FROZEN PEAKS',
    sky: [0x6aa6e0, 0xd2ebff, 0xffffff], stars: 0, fog: 0xe2f1ff,
    hemi: [0xeaf6ff, 0x9ab4cc, 1.6], sun: [0xf2f8ff, 2.5], exposure: 1.0,
    cloud: 0xffffff,
    recolor: { Green_Light: 0xf2f9ff, Dirt_1: 0x8fb0cc, Rock: 0x86a2bc, Green: 0xe6f2fa, Leaves_Pine: 0xd2ecf4, Bark_NormalTree: 0xb8a898 },
    particles: 'snow',
    decor: [
      ['n_Pine_1', 5.8, -6.4, -9.0], ['n_Pine_3', 5.0, 6.3, -9.0], ['n_Pine_1', 5.2, -6.9, -4.6], ['n_Pine_3', 5.4, 6.9, -5.0],
      ['n_Pine_1', 4.0, -6.8, 7.0], ['n_Pine_3', 4.2, 6.7, 7.3],
      ['@snowman', 1.6, -6.2, 1.0, 0.5], ['@snowman', 1.4, 6.3, 4.4, -0.5],
      ['@ice', 1.8, -6.3, -6.6], ['@ice', 1.4, 6.4, 2.0], ['@ice', 1.2, -6.4, 4.4], ['@ice', 1.6, 6.5, -2.0],
      ['n_Rock_Medium_2', 1.3, -6.2, -1.8], ['n_Rock_Medium_1', 1.1, 6.2, 0.4],
      ['p_Banner_2', 2.4, -6.4, -3.0, Math.PI / 2], ['p_Banner_2', 2.4, 6.4, -3.4, -Math.PI / 2],
      ['@ice', 1.0, -2.2, -9.4], ['@ice', 1.1, 2.0, -9.5],
      ['pf_Fence_Middle', 1.1, -4, -9.6, 0], ['pf_Fence_Middle', 1.1, 0, -9.7, 0], ['pf_Fence_Middle', 1.1, 4, -9.6, 0],
    ],
  },
  {
    id: 'lava', name: 'MAGMA CORE',
    sky: [0x1e0808, 0x7a2410, 0xff8a3a], stars: 0, fog: 0x5a2010,
    hemi: [0xffd2b0, 0x5a2414, 1.35], sun: [0xffb47a, 2.7], exposure: 1.08,
    cloud: 0x5a4846,
    recolor: { Green_Light: 0x5a4846, Dirt_1: 0x2e2224, Rock: 0x3a2c2a, Green: 0x3a2a26, Leaves_Pine: 0x4a3430, Bark_DeadTree: 0x6a5048, Bark_NormalTree: 0x5a4038 },
    particles: 'embers', lavaSea: true,
    decor: [
      ['n_DeadTree_1', 4.6, -6.6, -8.8], ['n_DeadTree_3', 4.2, 6.5, -8.8], ['@volcano', 3.4, -7.0, -4.4], ['n_DeadTree_1', 4.0, 6.9, -4.6],
      ['@volcano', 2.8, -6.9, 7.0], ['n_DeadTree_3', 3.6, 6.8, 7.4],
      ['@lava', 1.3, -6.3, -0.6], ['@lava', 1.1, 6.3, 3.4], ['@lava', 1.0, 6.2, -6.6], ['@lava', 1.2, -6.2, 4.6],
      ['n_Rock_Medium_2', 1.5, -6.3, -6.6], ['n_Rock_Medium_3', 1.3, 6.5, 0.6], ['n_Rock_Medium_1', 1.1, -6.4, 2.2],
      ['@skull', 0.8, 6.2, 5.6, -0.4], ['@bones', 0.5, -5.9, -2.6],
      ['p_Torch_Metal', 1.3, -3.6, -9.5], ['p_Torch_Metal', 1.3, 3.6, -9.5],
      ['@lava', 0.9, 0, -9.6],
    ],
  },
  {
    id: 'night', name: 'HAUNTED HOLLOW',
    sky: [0x10103a, 0x3a3088, 0x7a58b0], stars: 1, moon: 0xfff4d6, fog: 0x3c3478,
    hemi: [0xc0c0ff, 0x4a4070, 1.9], sun: [0xd8e0ff, 2.7], exposure: 1.2,
    cloud: 0x6a6a9c,
    recolor: { Green_Light: 0x5a8a5a, Dirt_1: 0x4a3c5c, Rock: 0x4a3e5c, Green: 0x2a4a48, Leaves_Pine: 0x2c4a4a, Leaves_TwistedTree: 0x6a4a8a, Bark_DeadTree: 0x8a8098 },
    particles: 'fireflies',
    decor: [
      ['n_TwistedTree_1', 5.4, -6.6, -8.8], ['n_DeadTree_3', 4.6, 6.4, -8.8], ['n_DeadTree_1', 4.6, -6.9, -4.6], ['n_TwistedTree_1', 4.8, 6.9, -5.0],
      ['n_DeadTree_1', 3.6, -6.8, 7.2], ['n_TwistedTree_1', 3.8, 6.8, 7.4],
      ['@grave', 1.1, -6.2, -1.6, 0.2], ['@grave', 1.0, -6.3, 0.4, -0.2], ['@grave', 1.1, 6.3, 1.6, 0.1], ['@cross', 1.2, 6.2, -1.2, -0.2],
      ['@pumpkin', 0.8, -6.0, 3.0, 0.4], ['@pumpkin', 0.7, 6.0, 4.6, -0.5], ['@pumpkin', 0.6, -1.8, -9.4, 0.1], ['@pumpkin', 0.7, 2.2, -9.4, -0.2],
      ['@lantern', 2.0, -6.4, -6.6], ['@lantern', 2.0, 6.4, -6.8], ['@lantern', 1.8, -6.4, 5.4], ['@lantern', 1.8, 6.5, 6.0],
      ['pf_Fence_Middle', 1.1, -4, -9.7, 0], ['pf_Fence_Middle', 1.1, 4, -9.7, 0],
      ['n_Mushroom_Laetiporus', 0.7, 5.9, -3.6, 0, 1],
    ],
  },
  {
    id: 'cosmos', name: 'CRYSTAL COSMOS',
    sky: [0x160842, 0x4a2290, 0xc86ad0], stars: 1, moon: 0xffc8f0, fog: 0x4a2a80,
    hemi: [0xe0c8ff, 0x4a2a7a, 1.55], sun: [0xffe0ff, 2.5], exposure: 1.1,
    cloud: 0xd8a8ff,
    recolor: { Green_Light: 0x9a86e0, Dirt_1: 0x4c3a8c, Rock: 0x5a4a9e, Green: 0xc04ad8, Leaves_Pine: 0x8a5ad8 },
    particles: 'sparkles',
    decor: [
      ['@crystal', 3.6, -6.6, -8.8], ['@crystal', 3.0, 6.5, -8.6], ['pf_RockPlatform_Tall', 3.6, -6.9, -4.6], ['@crystal', 3.2, 6.9, -4.8],
      ['@crystal', 2.6, -6.8, 7.0], ['pf_RockPlatform_Tall', 3.0, 6.8, 7.4],
      ['pf_Gem_Blue', 0.8, -6.2, -1.2, 0, 1], ['pf_Gem_Pink', 0.8, 6.2, 1.4, 0, 1], ['pf_Gem_Green', 0.7, -6.3, 4.4, 0, 1], ['pf_Gem_Pink', 0.7, 6.3, -2.4, 0, 1],
      ['@crystal', 1.4, -6.3, 1.6], ['@crystal', 1.2, 6.4, 4.4], ['@crystal', 1.0, -2.2, -9.4], ['@crystal', 1.1, 2.0, -9.5],
      ['pf_Star', 0.9, -6.3, -6.4, 0, 1], ['pf_Star', 0.8, 6.3, -6.6, 0, 1],
      ['@orb', 1, -9, -14], ['@orb', 1.4, 11, -20], ['@orb', 0.8, -14, 4],
    ],
  },
];

export const themeIndex = (level) => Math.floor((level - 1) / 10) % THEMES.length;

// ---------------------------------------------------------------- Procedural props
const cache = new Map();
const g1 = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
function mesh(geo, mat, p, s, r) {
  const m = new THREE.Mesh(geo, mat);
  if (p) m.position.set(...p);
  if (s !== undefined) Array.isArray(s) ? m.scale.set(...s) : m.scale.setScalar(s);
  if (r) m.rotation.set(...r);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
export const animatedUniforms = []; // { uTime } for lava pools and the lava sea

function cactus(h) {
  const g = new THREE.Group();
  const green = g1('cactusM', () => std(0x4caa48, { roughness: 0.7 }));
  const cap = g1('capG', () => new THREE.CapsuleGeometry(1, 1, 6, 12));
  g.add(mesh(cap, green, [0, 0.5, 0], [0.18, 0.32, 0.18]));
  g.add(mesh(cap, green, [0.24, 0.55, 0], [0.09, 0.08, 0.09], [0, 0, Math.PI / 2]));
  g.add(mesh(cap, green, [0.33, 0.68, 0], [0.085, 0.13, 0.085]));
  g.add(mesh(cap, green, [-0.22, 0.42, 0], [0.08, 0.07, 0.08], [0, 0, Math.PI / 2]));
  g.add(mesh(cap, green, [-0.3, 0.54, 0], [0.075, 0.11, 0.075]));
  g.add(mesh(g1('flowerG', () => new THREE.SphereGeometry(1, 8, 6)), g1('flowerM', () => std(0xff5aa8)), [0, 1.0, 0], [0.07, 0.04, 0.07]));
  g.scale.setScalar(h);
  return g;
}
function iceSpikes(h) {
  const g = new THREE.Group();
  const m = g1('iceM', () => std(0xbfeaff, { roughness: 0.1, metalness: 0.1, emissive: 0x4ab0ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.88, flatShading: true }));
  const c = g1('spikeG', () => new THREE.ConeGeometry(1, 1, 5));
  for (const [x, z, hh, s, tilt] of [[0, 0, 1, 0.22, 0], [0.22, 0.08, 0.7, 0.16, -0.3], [-0.2, 0.1, 0.6, 0.14, 0.35], [0.05, -0.2, 0.5, 0.13, 0.2]]) {
    g.add(mesh(c, m, [x, hh / 2, z], [s, hh, s], [tilt * 0.6, 0, tilt]));
  }
  g.scale.setScalar(h);
  return g;
}
function crystal(h) {
  const g = new THREE.Group();
  const colors = [[0x8af6ff, 0x3ad0ff], [0xff8af0, 0xff3ad8], [0xc8a8ff, 0x8a5aff]];
  const o = g1('octaG', () => new THREE.OctahedronGeometry(1, 0));
  const pick = colors[(Math.random() * colors.length) | 0];
  const m = std(pick[0], { emissive: pick[1], emissiveIntensity: 0.8, roughness: 0.15, flatShading: true });
  for (const [x, z, hh, s, tz, tx] of [[0, 0, 1, 0.2, 0, 0], [0.2, 0.05, 0.65, 0.13, -0.45, 0.1], [-0.18, 0.06, 0.55, 0.12, 0.5, 0], [0.04, -0.18, 0.45, 0.1, 0.1, -0.5]]) {
    g.add(mesh(o, m, [x, hh * 0.45, z], [s, hh * 0.55, s], [tx, 0, tz]));
  }
  g.scale.setScalar(h);
  return g;
}
function grave(h, cross) {
  const g = new THREE.Group();
  const stone = g1('stoneM', () => std(0x9a98a8, { roughness: 0.9, flatShading: true }));
  const box = g1('boxG', () => new THREE.BoxGeometry(1, 1, 1));
  if (cross) {
    g.add(mesh(box, stone, [0, 0.45, 0], [0.14, 0.9, 0.12]));
    g.add(mesh(box, stone, [0, 0.62, 0], [0.5, 0.13, 0.12]));
  } else {
    g.add(mesh(box, stone, [0, 0.32, 0], [0.55, 0.64, 0.14]));
    g.add(mesh(g1('cylG', () => new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI)), stone, [0, 0.64, 0], [0.275, 0.14, 0.275], [Math.PI / 2, Math.PI / 2, 0]));
    g.add(mesh(box, g1('stoneD', () => std(0x6a6878)), [0, 0.42, 0.075], [0.3, 0.06, 0.01]));
  }
  g.add(mesh(box, g1('dirtM', () => std(0x3a3040, { roughness: 1 })), [0, 0.02, 0.32], [0.6, 0.05, 0.6]));
  g.scale.setScalar(h);
  return g;
}
function lantern(h) {
  const g = new THREE.Group();
  const dark = g1('ironM', () => std(0x2a2630, { roughness: 0.5, metalness: 0.4 }));
  const cy = g1('cyl8', () => new THREE.CylinderGeometry(1, 1, 1, 8));
  g.add(mesh(cy, dark, [0, 0.45, 0], [0.04, 0.9, 0.04]));
  g.add(mesh(cy, dark, [0.1, 0.9, 0], [0.025, 0.22, 0.025], [0, 0, Math.PI / 2]));
  g.add(mesh(g1('lampG', () => new THREE.SphereGeometry(1, 12, 8)), g1('lampM', () => new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb84a, emissiveIntensity: 2.4 })), [0.2, 0.82, 0], 0.09));
  const glowS = new THREE.Sprite(g1('glowSM', () => new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb84a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })));
  glowS.position.set(0.2, 0.82, 0); glowS.scale.setScalar(0.7);
  g.add(glowS);
  g.scale.setScalar(h);
  return g;
}
function pumpkin(h) {
  const g = new THREE.Group();
  const p = buildPumpkinHead(0xffc23a);
  p.position.y = 0.5;
  g.add(p);
  const glowS = new THREE.Sprite(g1('pglowSM', () => new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 })));
  glowS.position.set(0, 0.45, 0.6); glowS.scale.setScalar(1.3);
  g.add(glowS);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.scale.setScalar(h);
  return g;
}
function lavaPool(r) {
  const g = new THREE.Group();
  const u = g1('lavaU', () => { const x = { uTime: { value: 0 } }; animatedUniforms.push(x); return x; });
  const m = g1('lavaM', () => lavaMaterial(u));
  const disc = new THREE.Mesh(g1('discG', () => new THREE.CircleGeometry(1, 28)), m);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; disc.scale.setScalar(0.9);
  g.add(disc);
  const rock = g1('lavaRockM', () => std(0x2a2020, { roughness: 0.9, flatShading: true }));
  const d = g1('dodG', () => new THREE.DodecahedronGeometry(1, 0));
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + rand(-0.2, 0.2); g.add(mesh(d, rock, [Math.cos(a) * 0.98, 0.05, Math.sin(a) * 0.98], [rand(0.16, 0.26), rand(0.1, 0.18), rand(0.16, 0.26)], [rand(0, 3), rand(0, 3), 0])); }
  g.scale.setScalar(r);
  return g;
}
function volcano(h) {
  const g = new THREE.Group();
  const rock = g1('volM', () => std(0x3a2a28, { roughness: 0.9, flatShading: true }));
  g.add(mesh(g1('volG', () => new THREE.CylinderGeometry(0.22, 0.75, 1, 9, 1)), rock, [0, 0.5, 0]));
  const glowM = g1('volGlow', () => new THREE.MeshStandardMaterial({ color: 0xff6a10, emissive: 0xff4a00, emissiveIntensity: 1.0 }));
  g.add(mesh(g1('volTop', () => new THREE.CylinderGeometry(0.2, 0.2, 0.04, 9)), glowM, [0, 1.0, 0]));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; g.add(mesh(g1('streakG', () => new THREE.BoxGeometry(1, 1, 1)), glowM, [Math.sin(a) * 0.36, 0.72, Math.cos(a) * 0.36], [0.05, 0.4, 0.05], [Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55])); }
  g.userData.ember = [0, 1.05, 0];
  g.scale.setScalar(h);
  return g;
}
function skull(h) {
  const g = new THREE.Group();
  const bone = g1('boneM', () => std(0xf0e6cc, { roughness: 0.7 }));
  const s = g1('sph12', () => new THREE.SphereGeometry(1, 14, 10));
  g.add(mesh(s, bone, [0, 0.42, 0], [0.4, 0.36, 0.42]));
  g.add(mesh(g1('box1', () => new THREE.BoxGeometry(1, 1, 1)), bone, [0, 0.18, 0.12], [0.36, 0.18, 0.3]));
  const dark = g1('holeM', () => std(0x1a1414));
  for (const x of [-0.14, 0.14]) g.add(mesh(s, dark, [x, 0.42, 0.33], [0.1, 0.11, 0.08]));
  g.add(mesh(s, dark, [0, 0.3, 0.38], [0.04, 0.05, 0.03]));
  g.scale.setScalar(h);
  return g;
}
function bones(h) {
  const g = new THREE.Group();
  const bone = g1('boneM', () => std(0xf0e6cc, { roughness: 0.7 }));
  const c = g1('boneC', () => new THREE.CylinderGeometry(1, 1, 1, 8));
  const s = g1('sph8', () => new THREE.SphereGeometry(1, 8, 6));
  for (const [x, z, ry] of [[0, 0, 0.3], [0.15, 0.2, -0.9]]) {
    const b = new THREE.Group();
    b.add(mesh(c, bone, [0, 0, 0], [0.05, 0.7, 0.05], [0, 0, Math.PI / 2]));
    for (const e of [-0.36, 0.36]) for (const o of [-0.05, 0.05]) b.add(mesh(s, bone, [e, 0, o], 0.07));
    b.position.set(x, 0.07, z); b.rotation.y = ry;
    g.add(b);
  }
  g.scale.setScalar(h);
  return g;
}
function pyramid(h) {
  const m = mesh(g1('pyrG', () => new THREE.ConeGeometry(1, 1, 4)), g1('pyrM', () => std(0xe0b070, { roughness: 0.9, flatShading: true })), [0, 0.5, 0], [1.3, 1, 1.3]);
  const g = new THREE.Group();
  g.add(m);
  g.scale.setScalar(h);
  g.position.y = -6;
  return g;
}
function orb(h) {
  const g = new THREE.Group();
  const m = std(0x8a5aff, { emissive: 0x6a2aff, emissiveIntensity: 0.5, roughness: 0.4, flatShading: true });
  g.add(mesh(g1('ico1', () => new THREE.IcosahedronGeometry(1, 1)), m, [0, 0, 0], 1.6));
  const ring = new THREE.Mesh(g1('ringG', () => new THREE.TorusGeometry(2.6, 0.12, 6, 48)), g1('ringM', () => new THREE.MeshBasicMaterial({ color: 0xffb0f0 })));
  ring.rotation.x = 1.2;
  g.add(ring);
  g.scale.setScalar(h);
  g.userData.float = true;
  return g;
}

const PROPS = {
  '@cactus': cactus, '@ice': iceSpikes, '@crystal': crystal, '@grave': (h) => grave(h, false), '@cross': (h) => grave(h, true),
  '@lantern': lantern, '@pumpkin': pumpkin, '@lava': lavaPool, '@volcano': volcano, '@skull': skull, '@bones': bones,
  '@pyramid': pyramid, '@orb': orb,
  '@snowman': (h) => { const g = new THREE.Group(); const s = snowmanProp(); const box = new THREE.Box3().setFromObject(s); s.scale.setScalar(h / box.getSize(new THREE.Vector3()).y); g.add(s); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; },
};
export const isProp = (name) => name in PROPS;
export const buildProp = (name, h) => PROPS[name](h);

// ---------------------------------------------------------------- Shaders & textures
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function lavaMaterial(u, sea = false) {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uSea: { value: sea ? 1 : 0 } }, fog: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform float uSea; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * mix(0.9, 0.035, uSea);
        float v = n(p + vec2(uTime*0.2, uTime*0.13)) * 0.65 + n(p*2.1 - vec2(uTime*0.17, -uTime*0.11)) * 0.35;
        // Glowing veins between dark cooled crust
        float vein = 1.0 - smoothstep(0.0, mix(0.16, 0.045, uSea), abs(v - 0.5));
        vec3 crust = mix(vec3(0.35,0.08,0.03), vec3(0.16,0.04,0.03), uSea);
        vec3 hot = mix(vec3(1.0,0.4,0.08), mix(vec3(1.0,0.85,0.3), vec3(1.0,0.5,0.1), uSea), vein) * mix(1.8, 0.85, uSea);
        vec3 c = mix(crust, hot, max(vein, (1.0 - uSea) * 0.35));
        // The sea fades into the smoky horizon
        float d = length(vW.xz) / 260.0;
        c = mix(c, vec3(0.35,0.1,0.05), clamp(d * uSea, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- Ambient particles
// spawn(theme, glow, puff, C, dt) called every frame
const acc = { v: 0 };
export function ambientParticles(theme, glow, puff, dt, extra) {
  const rates = { pollen: 7, sand: 16, snow: 34, embers: 22, fireflies: 7, sparkles: 14 };
  const rate = rates[theme.particles] || 0;
  acc.v += rate * dt;
  const v = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  while (acc.v >= 1) {
    acc.v -= 1;
    switch (theme.particles) {
      case 'pollen':
        p.set(rand(-14, 14), rand(0.5, 4), rand(-14, 10));
        glow.spawn(p, v.set(rand(-0.5, 0.5), rand(0, 0.3), rand(-0.5, 0.5)), col.setRGB(1.2, 1.4, 0.5), rand(0.12, 0.2), rand(2.5, 4), -0.2);
        break;
      case 'sand':
        p.set(-16, rand(0.1, 2.5), rand(-14, 12));
        puff.spawn(p, v.set(rand(9, 14), rand(-0.2, 0.4), rand(-1, 1)), col.setRGB(0.95, 0.82, 0.6), rand(0.25, 0.6), rand(2, 3), 0);
        break;
      case 'snow':
        p.set(rand(-18, 18), rand(10, 16), rand(-18, 12));
        puff.spawn(p, v.set(rand(-0.3, 0.6), 0, rand(-0.3, 0.3)), col.setRGB(1, 1, 1), rand(0.12, 0.26), rand(5, 8), 4);
        break;
      case 'embers': {
        const src = extra && extra.length && Math.random() < 0.5 ? extra[(Math.random() * extra.length) | 0] : null;
        if (src) p.copy(src).add(v.set(rand(-0.2, 0.2), 0, rand(-0.2, 0.2)));
        else p.set(rand(-16, 16), rand(-4, 1), rand(-14, 12));
        glow.spawn(p, v.set(rand(-0.4, 0.4), rand(1, 2.5), rand(-0.4, 0.4)), col.setRGB(2.4, rand(0.5, 1.0), 0.15), rand(0.12, 0.26), rand(1.6, 2.8), -3);
        break;
      }
      case 'fireflies':
        p.set(rand(-9, 9) * (Math.random() < 0.7 ? 1 : 0.4) + (Math.random() < 0.5 ? -1 : 1) * 0, rand(0.4, 3), rand(-12, 10));
        if (Math.abs(p.x) < 5.5 && Math.random() < 0.7) p.x = Math.sign(p.x || 1) * rand(5.5, 8);
        glow.spawn(p, v.set(rand(-0.6, 0.6), rand(-0.2, 0.4), rand(-0.6, 0.6)), col.setRGB(1.1, 2.0, 0.5), rand(0.22, 0.32), rand(2, 3.5), 0);
        break;
      case 'sparkles': {
        const pink = Math.random() < 0.5;
        p.set(rand(-20, 20), rand(-2, 10), rand(-20, 10));
        glow.spawn(p, v.set(0, rand(0.1, 0.5), 0), pink ? col.setRGB(2, 0.8, 1.8) : col.setRGB(0.7, 1.6, 2.2), rand(0.18, 0.34), rand(1, 2), 0);
        break;
      }
    }
  }
}
