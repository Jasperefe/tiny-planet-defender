// Procedural monsters built entirely in code: meshes plus keyframe animations
// (Idle, Run, Punch, HitReact, Death, Dance) so they plug into the same AnimationMixer
// as the glTF monsters. Every creature faces +Z and stands on y = 0.

import * as THREE from 'three';
import { buildEternus, buildVoidKnight } from './eternus.js?v=20261118124927';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- Registry
// name -> { kind, variant, flying, big }
export const PROC = {
  P_Slime_Green: { kind: 'slime', variant: 'green' },
  P_Slime_Shadow: { kind: 'slime', variant: 'shadow' },
  P_Slime_Lava: { kind: 'slime', variant: 'lava' },
  P_Golem_Sand: { kind: 'golem', variant: 'sand', big: true },
  P_Golem_Ice: { kind: 'golem', variant: 'ice', big: true },
  P_Golem_Lava: { kind: 'golem', variant: 'lava', big: true },
  P_Golem_Crystal: { kind: 'golem', variant: 'crystal', big: true },
  P_Golem_Moss: { kind: 'golem', variant: 'moss', big: true },
  P_Snowman: { kind: 'snowman', variant: 'snow' },
  P_Cactus: { kind: 'cactus', variant: 'desert' },
  P_Bat_Eye: { kind: 'bat', variant: 'eye', flying: true },
  P_Bat_Frost: { kind: 'bat', variant: 'frost', flying: true },
  P_Bat_Sand: { kind: 'bat', variant: 'sand', flying: true },
  P_Wisp_Fire: { kind: 'wisp', variant: 'fire', flying: true },
  P_Wisp_Crystal: { kind: 'wisp', variant: 'crystal', flying: true },
  P_Pumpkin: { kind: 'pumpkin', variant: 'night', flying: true },
  // Player Mages line (support casters)
  P_Mage_Sprite: { kind: 'mage', variant: 'sprite' },
  P_Mage_Imp: { kind: 'mage', variant: 'imp' },
  P_Mage_Witch: { kind: 'mage', variant: 'witch' },
  P_Mage_Sage: { kind: 'mage', variant: 'sage' },
  P_Mage_Storm: { kind: 'mage', variant: 'storm' },
  P_Mage_Oracle: { kind: 'mage', variant: 'oracle' },
  P_Mage_Arcane: { kind: 'mage', variant: 'arcane' },
  P_Mage_Star: { kind: 'mage', variant: 'star' },
  // Final boss (level 150) and his Royal Guard
  P_Eternus: { kind: 'eternus', variant: 'void', big: true },
  P_VoidKnight: { kind: 'voidknight', variant: 'void' },
};
export const isProc = (name) => name in PROC;
export const procFlying = (name) => !!(PROC[name] && PROC[name].flying);
export const procBig = (name) => !!(PROC[name] && PROC[name].big);

// ---------------------------------------------------------------- Building helpers
const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const sphere = (seg = 20) => geo('s' + seg, () => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)));
const ico = (detail = 0) => geo('i' + detail, () => new THREE.IcosahedronGeometry(1, detail));
const dodeca = () => geo('d', () => new THREE.DodecahedronGeometry(1, 0));
const octa = () => geo('o', () => new THREE.OctahedronGeometry(1, 0));
const cone = (seg = 10) => geo('c' + seg, () => new THREE.ConeGeometry(1, 1, seg));
const cyl = (seg = 12) => geo('y' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg));
const capsule = () => geo('cap', () => new THREE.CapsuleGeometry(1, 1.4, 6, 14));
const torus = () => geo('t', () => new THREE.TorusGeometry(1, 0.32, 10, 24));

function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
}
function glowMat(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}
function M(g, m, opts = {}) {
  const mesh = new THREE.Mesh(g, m);
  if (opts.p) mesh.position.set(...opts.p);
  if (opts.r) mesh.rotation.set(...opts.r);
  if (opts.s !== undefined) Array.isArray(opts.s) ? mesh.scale.set(...opts.s) : mesh.scale.setScalar(opts.s);
  return mesh;
}
function G(name, p = [0, 0, 0], r = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...p);
  g.rotation.set(...r);
  return g;
}

function at(o, x, y, z) { o.position.set(x, y, z); return o; }

// Cartoon eye: white ball, colored iris, pupil, sparkle
function eye(size, iris = 0x222222, opts = {}) {
  const g = new THREE.Group();
  g.add(M(sphere(16), opts.white || mat(0xffffff, { roughness: 0.25 }), { s: size }));
  if (opts.iris !== false) g.add(M(sphere(12), mat(iris, { roughness: 0.3 }), { p: [0, 0, size * 0.62], s: [size * 0.58, size * 0.58, size * 0.45] }));
  g.add(M(sphere(10), mat(0x0a0a12, { roughness: 0.2 }), { p: [0, 0, size * 0.82], s: [size * 0.32, size * 0.32, size * 0.24] }));
  g.add(M(sphere(8), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }), { p: [size * 0.2, size * 0.22, size * 0.9], s: size * 0.13 }));
  return g;
}
function glowEye(size, color) {
  return M(sphere(10), glowMat(color, 2.2), { s: [size, size * 0.75, size * 0.6] });
}

// ---------------------------------------------------------------- Animation helpers
// Tracks are written relative to each node's rest pose (stored in `rest`).
class Anim {
  constructor(root) {
    this.rest = {};
    root.traverse((o) => {
      if (o.name) this.rest[o.name] = { p: o.position.toArray(), r: [o.rotation.x, o.rotation.y, o.rotation.z], s: o.scale.toArray() };
    });
    this.clips = [];
  }
  P(node, times, offs) {
    const b = this.rest[node].p;
    return new THREE.VectorKeyframeTrack(`${node}.position`, times, offs.flatMap((o) => [b[0] + o[0], b[1] + o[1], b[2] + o[2]]));
  }
  R(node, times, offs) {
    const b = this.rest[node].r;
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    const out = [];
    for (const o of offs) { q.setFromEuler(e.set(b[0] + o[0], b[1] + o[1], b[2] + o[2])); out.push(q.x, q.y, q.z, q.w); }
    return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, out);
  }
  S(node, times, ks) {
    const b = this.rest[node].s;
    return new THREE.VectorKeyframeTrack(`${node}.scale`, times, ks.flatMap((k) => (Array.isArray(k) ? [b[0] * k[0], b[1] * k[1], b[2] * k[2]] : [b[0] * k, b[1] * k, b[2] * k])));
  }
  add(name, duration, tracks) { this.clips.push(new THREE.AnimationClip(name, duration, tracks.filter(Boolean))); }
}
// Evenly spaced key times
const T = (dur, n) => Array.from({ length: n }, (_, i) => (dur * i) / (n - 1));

// ---------------------------------------------------------------- Slime
function buildSlime(variant) {
  const pal = {
    green: { body: 0x6fe05a, core: 0xb8ff7a, mouth: 0x2b5a1a },
    shadow: { body: 0x6a3ad0, core: 0xb48cff, mouth: 0x1e0e3e },
    lava: { body: 0xff6a1f, core: 0xffd25a, mouth: 0x5a1505 },
  }[variant];
  const root = G('root');
  const rig = G('rig');
  const body = G('body');
  root.add(rig); rig.add(body);
  const jelly = mat(pal.body, { roughness: 0.18, emissive: variant === 'lava' ? 0xff3a00 : 0x000000, emissiveIntensity: variant === 'lava' ? 0.45 : 0 });
  body.add(M(sphere(24), jelly, { p: [0, 0.82, 0], s: [1, 0.84, 1] }));
  // Inner glow core and highlight
  body.add(M(sphere(14), mat(pal.core, { roughness: 0.3, emissive: pal.core, emissiveIntensity: 0.35 }), { p: [0.05, 0.62, 0.05], s: 0.42 }));
  body.add(M(sphere(10), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.5 }), { p: [-0.48, 1.28, 0.42], s: [0.16, 0.1, 0.1] }));
  // Droplet on top
  body.add(M(sphere(14), jelly, { p: [0, 1.62, 0], s: [0.24, 0.3, 0.24] }));
  body.add(M(cone(12), jelly, { p: [0, 1.88, 0], s: [0.16, 0.3, 0.16] }));
  // Face
  const face = G('face', [0, 0.95, 0.74]);
  face.add(at(eye(0.24, pal.mouth), -0.3, 0.1, 0));
  face.add(at(eye(0.24, pal.mouth), 0.3, 0.1, 0));
  const mouth = M(torus(), mat(pal.mouth), { p: [0, -0.22, 0.04], r: [0, 0, Math.PI], s: [0.15, 0.12, 0.15] });
  face.add(mouth);
  if (variant === 'shadow') {
    // Little horns
    for (const x of [-0.42, 0.42]) body.add(M(cone(8), mat(0x2a1650), { p: [x, 1.48, 0.1], r: [0, 0, x > 0 ? -0.5 : 0.5], s: [0.12, 0.35, 0.12] }));
  }
  body.add(face);

  const A = new Anim(root);
  A.add('Idle', 1.2, [A.S('body', T(1.2, 3), [[1, 1, 1], [1.07, 0.92, 1.07], [1, 1, 1]])]);
  A.add('Run', 0.5, [
    A.P('body', T(0.5, 5), [[0, 0, 0], [0, 0.5, 0], [0, 0.65, 0], [0, 0.3, 0], [0, 0, 0]]),
    A.S('body', T(0.5, 5), [[1.15, 0.82, 1.15], [0.9, 1.15, 0.9], [0.95, 1.08, 0.95], [1, 1, 1], [1.15, 0.82, 1.15]]),
  ]);
  A.add('Punch', 0.6, [
    A.P('body', T(0.6, 4), [[0, 0, 0], [0, 0.1, -0.25], [0, 0.2, 0.75], [0, 0, 0]]),
    A.S('body', T(0.6, 4), [[1, 1, 1], [1.15, 0.85, 1.1], [0.85, 1.05, 1.4], [1, 1, 1]]),
  ]);
  A.add('HitReact', 0.35, [
    A.S('body', T(0.35, 3), [[1, 1, 1], [1.28, 0.7, 1.28], [1, 1, 1]]),
    A.P('body', T(0.35, 3), [[0, 0, 0], [0, 0, -0.3], [0, 0, 0]]),
  ]);
  A.add('Death', 0.9, [A.S('body', T(0.9, 3), [[1, 1, 1], [1.35, 0.55, 1.35], [1.7, 0.08, 1.7]])]);
  A.add('Dance', 0.8, [
    A.P('body', T(0.8, 5), [[0, 0, 0], [0, 0.6, 0], [0, 0, 0], [0, 0.6, 0], [0, 0, 0]]),
    A.R('rig', T(0.8, 5), [[0, 0, 0], [0, 1.57, 0], [0, 3.14, 0], [0, 4.71, 0], [0, 6.28, 0]]),
  ]);
  return { scene: root, animations: A.clips };
}

// ---------------------------------------------------------------- Golem
function buildGolem(variant) {
  const pal = {
    sand: { rock: 0xd9a35c, dark: 0xa8733c, eye: 0x4ae8ff, accent: 0x3cc6e0, rough: 0.9 },
    ice: { rock: 0xa8dcff, dark: 0x6aa8e0, eye: 0xffffff, accent: 0xd8f6ff, rough: 0.15 },
    lava: { rock: 0x3a2a28, dark: 0x22181a, eye: 0xffb020, accent: 0xff5a10, rough: 0.85 },
    crystal: { rock: 0x6a5aa8, dark: 0x463a7a, eye: 0xff6af0, accent: 0x7af0ff, rough: 0.6 },
    moss: { rock: 0x8a8a7a, dark: 0x5f5f52, eye: 0x9aff5a, accent: 0x5ab83a, rough: 0.9 },
  }[variant];
  const rockM = mat(pal.rock, { roughness: pal.rough, flatShading: true, metalness: variant === 'ice' ? 0.05 : 0 });
  const darkM = mat(pal.dark, { roughness: pal.rough, flatShading: true });
  const accentM = variant === 'lava' || variant === 'crystal' || variant === 'ice'
    ? glowMat(pal.accent, variant === 'ice' ? 0.5 : 1.8) : mat(pal.accent, { roughness: 0.8, flatShading: true });
  const root = G('root');
  const rig = G('rig');
  root.add(rig);
  const body = G('body', [0, 1.0, 0]);
  rig.add(body);
  // Torso, belly band and head
  body.add(M(dodeca(), rockM, { p: [0, 0.85, 0], s: [1.05, 0.95, 0.82] }));
  body.add(M(dodeca(), darkM, { p: [0, 0.45, 0.08], s: [0.78, 0.5, 0.7], r: [0.3, 0.4, 0] }));
  const head = G('head', [0, 1.85, 0.15]);
  body.add(head);
  head.add(M(dodeca(), rockM, { s: [0.48, 0.42, 0.44], r: [0.2, 0.5, 0] }));
  // Heavy brow and glowing eyes
  head.add(M(ico(0), darkM, { p: [0, 0.2, 0.28], s: [0.42, 0.1, 0.16] }));
  for (const x of [-0.17, 0.17]) head.add(at(glowEye(0.1, pal.eye), x, 0.06, 0.38));
  head.add(M(ico(0), darkM, { p: [0, -0.18, 0.36], s: [0.22, 0.06, 0.06] }));
  // Arms: shoulder, forearm, big fist
  for (const side of [-1, 1]) {
    const arm = G(side < 0 ? 'armL' : 'armR', [side * 1.12, 1.25, 0]);
    body.add(arm);
    arm.add(M(dodeca(), darkM, { s: 0.42 }));
    arm.add(M(ico(0), rockM, { p: [side * 0.08, -0.62, 0], s: [0.3, 0.42, 0.3] }));
    arm.add(M(dodeca(), rockM, { p: [side * 0.1, -1.18, 0.05], s: 0.48 }));
    if (variant === 'crystal' || variant === 'ice') arm.add(M(octa(), accentM, { p: [side * 0.12, 0.38, -0.05], r: [0, 0, side * -0.4], s: [0.14, 0.38, 0.14] }));
  }
  // Legs
  for (const side of [-1, 1]) {
    const leg = G(side < 0 ? 'legL' : 'legR', [side * 0.48, 1.0, 0]);
    rig.add(leg);
    leg.add(M(ico(0), darkM, { p: [0, -0.45, 0], s: [0.34, 0.5, 0.34] }));
    leg.add(M(dodeca(), rockM, { p: [0, -0.86, 0.1], s: [0.38, 0.2, 0.46] }));
  }
  // Variant decorations
  if (variant === 'lava') {
    for (const [x, y, z, s] of [[0.5, 1.1, 0.62, 0.12], [-0.4, 0.7, 0.66, 0.1], [0.1, 1.35, 0.6, 0.08], [-0.6, 1.2, 0.45, 0.09], [0.55, 0.55, 0.55, 0.08]]) body.add(M(ico(0), accentM, { p: [x, y, z], s }));
    for (const x of [-0.25, 0, 0.25]) head.add(M(cone(6), accentM, { p: [x, 0.42, -0.05], s: [0.08, 0.28, 0.08] }));
  } else if (variant === 'crystal' || variant === 'ice') {
    for (const [x, y, z, rz, s] of [[0, 1.6, -0.45, 0, 0.5], [-0.45, 1.45, -0.4, 0.4, 0.38], [0.45, 1.45, -0.4, -0.4, 0.38], [0.25, 1.75, -0.3, -0.2, 0.3]]) {
      body.add(M(octa(), accentM, { p: [x, y, z], r: [-0.3, 0, rz], s: [s * 0.32, s, s * 0.32] }));
    }
  } else if (variant === 'moss') {
    const mossM = mat(pal.accent, { roughness: 0.95, flatShading: true });
    body.add(M(dodeca(), mossM, { p: [0, 1.6, -0.1], s: [0.7, 0.18, 0.55] }));
    body.add(M(dodeca(), mossM, { p: [1.05, 1.55, 0], s: [0.32, 0.12, 0.3] }));
    head.add(M(sphere(8), mat(0xff6ab0), { p: [0.18, 0.4, 0], s: 0.08 }));
  } else if (variant === 'sand') {
    head.add(M(cyl(10), mat(0x3cc6e0, { roughness: 0.4 }), { p: [0, 0.34, 0], s: [0.2, 0.12, 0.2] }));
    body.add(M(cyl(14), mat(0x8a5a2c, { roughness: 0.9 }), { p: [0, 0.75, 0], s: [0.98, 0.12, 0.8] }));
  }

  const A = new Anim(root);
  const sway = (n, a) => A.R(n, T(1.6, 3), [[0, 0, 0], [a, 0, 0], [0, 0, 0]]);
  A.add('Idle', 1.6, [A.P('body', T(1.6, 3), [[0, 0, 0], [0, -0.06, 0], [0, 0, 0]]), sway('armL', -0.12), sway('armR', -0.12), A.R('head', T(1.6, 3), [[0, 0, 0], [0.06, 0.1, 0], [0, 0, 0]])]);
  const stride = (n, a) => A.R(n, T(0.8, 5), [[a, 0, 0], [0, 0, 0], [-a, 0, 0], [0, 0, 0], [a, 0, 0]]);
  A.add('Run', 0.8, [
    stride('legL', 0.6), stride('legR', -0.6), stride('armL', -0.5), stride('armR', 0.5),
    A.P('body', T(0.8, 5), [[0, 0, 0], [0, 0.12, 0], [0, 0, 0], [0, 0.12, 0], [0, 0, 0]]),
    A.R('body', T(0.8, 5), [[0.12, 0.08, 0], [0.12, 0, 0], [0.12, -0.08, 0], [0.12, 0, 0], [0.12, 0.08, 0]]),
  ]);
  A.add('Punch', 0.8, [
    A.R('armR', [0, 0.3, 0.45, 0.8], [[0, 0, 0], [-2.7, 0, -0.2], [-1.25, 0, 0], [0, 0, 0]]),
    A.R('armL', [0, 0.3, 0.45, 0.8], [[0, 0, 0], [0.4, 0, 0], [-0.3, 0, 0], [0, 0, 0]]),
    A.R('body', [0, 0.3, 0.45, 0.8], [[0, 0, 0], [-0.2, 0.25, 0], [0.35, -0.2, 0], [0, 0, 0]]),
  ]);
  A.add('HitReact', 0.4, [A.R('body', T(0.4, 3), [[0, 0, 0], [-0.35, 0, 0.1], [0, 0, 0]]), A.R('head', T(0.4, 3), [[0, 0, 0], [-0.3, 0, 0], [0, 0, 0]])]);
  A.add('Death', 1.2, [
    A.R('rig', [0, 0.25, 1.0, 1.2], [[0, 0, 0], [0.25, 0, 0], [-1.45, 0, 0.1], [-1.5, 0, 0.1]]),
    A.P('rig', [0, 0.25, 1.0, 1.2], [[0, 0, 0], [0, 0.1, 0], [0, -0.35, -0.4], [0, -0.4, -0.45]]),
    A.R('armL', [0, 1.2], [[0, 0, 0], [-2.2, 0, 0.6]]), A.R('armR', [0, 1.2], [[0, 0, 0], [-2.2, 0, -0.6]]),
  ]);
  A.add('Dance', 1.0, [
    A.R('armL', T(1, 5), [[-2.8, 0, 0.3], [0, 0, 0], [-2.8, 0, 0.3], [0, 0, 0], [-2.8, 0, 0.3]]),
    A.R('armR', T(1, 5), [[0, 0, 0], [-2.8, 0, -0.3], [0, 0, 0], [-2.8, 0, -0.3], [0, 0, 0]]),
    A.P('body', T(1, 5), [[0, 0, 0], [0, 0.2, 0], [0, 0, 0], [0, 0.2, 0], [0, 0, 0]]),
  ]);
  return { scene: root, animations: A.clips };
}

// ---------------------------------------------------------------- Snowman
function buildSnowman() {
  const snow = mat(0xf6fbff, { roughness: 0.7 });
  const coal = mat(0x1a1a22, { roughness: 0.6 });
  const wood = mat(0x6a4422, { roughness: 0.9 });
  const root = G('root');
  const rig = G('rig');
  root.add(rig);
  rig.add(M(sphere(22), snow, { p: [0, 0.82, 0], s: [0.92, 0.82, 0.92] }));
  const mid = G('mid', [0, 1.62, 0]);
  rig.add(mid);
  mid.add(M(sphere(20), snow, { p: [0, 0.35, 0], s: 0.66 }));
  for (const y of [0.55, 0.25, -0.05]) mid.add(M(sphere(8), coal, { p: [0, y, 0.64 - Math.abs(y - 0.25) * 0.1], s: 0.075 }));
  // Scarf
  const scarfM = mat(0xe8364a, { roughness: 0.8 });
  mid.add(M(torus(), scarfM, { p: [0, 0.92, 0], r: [Math.PI / 2, 0, 0], s: [0.46, 0.46, 0.5] }));
  mid.add(M(cyl(6), scarfM, { p: [0.28, 0.62, 0.38], r: [0.3, 0, 0.25], s: [0.09, 0.5, 0.04] }));
  const head = G('head', [0, 2.95, 0]);
  rig.add(head);
  head.add(M(sphere(20), snow, { s: 0.48 }));
  head.add(M(cone(10), mat(0xff8a1f, { roughness: 0.6 }), { p: [0, -0.02, 0.62], r: [Math.PI / 2, 0, 0], s: [0.08, 0.38, 0.08] }));
  for (const x of [-0.16, 0.16]) head.add(M(sphere(8), coal, { p: [x, 0.12, 0.41], s: 0.065 }));
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; head.add(M(sphere(6), coal, { p: [Math.sin(a) * 0.24, -0.2 - Math.cos(a * 1.2) * 0.04, 0.42], s: 0.04 })); }
  // Angry brows
  for (const x of [-1, 1]) head.add(M(cyl(6), coal, { p: [x * 0.16, 0.25, 0.42], r: [0, 0, x * 0.4 + Math.PI / 2], s: [0.03, 0.14, 0.03] }));
  // Top hat
  const hat = mat(0x22222c, { roughness: 0.5 });
  head.add(M(cyl(16), hat, { p: [0, 0.4, 0], s: [0.46, 0.05, 0.46] }));
  head.add(M(cyl(16), hat, { p: [0, 0.66, 0], s: [0.3, 0.5, 0.3] }));
  head.add(M(cyl(16), mat(0x3a8ae8), { p: [0, 0.48, 0], s: [0.31, 0.1, 0.31] }));
  // Stick arms
  for (const side of [-1, 1]) {
    const arm = G(side < 0 ? 'armL' : 'armR', [side * 0.55, 2.15, 0]);
    rig.add(arm);
    arm.add(M(cyl(6), wood, { p: [side * 0.45, 0.18, 0], r: [0, 0, side * -1.15], s: [0.05, 1.0, 0.05] }));
    arm.add(M(cyl(6), wood, { p: [side * 0.82, 0.48, 0], r: [0, 0, side * -0.3], s: [0.035, 0.32, 0.035] }));
    arm.add(M(cyl(6), wood, { p: [side * 0.92, 0.3, 0], r: [0, 0, side * -1.7], s: [0.035, 0.28, 0.035] }));
  }
  const A = new Anim(root);
  A.add('Idle', 1.4, [A.R('mid', T(1.4, 3), [[0, 0, 0.05], [0, 0, -0.05], [0, 0, 0.05]]), A.R('head', T(1.4, 3), [[0, 0.1, -0.05], [0, -0.1, 0.05], [0, 0.1, -0.05]])]);
  A.add('Run', 0.5, [
    A.P('rig', T(0.5, 3), [[0, 0, 0], [0, 0.35, 0], [0, 0, 0]]),
    A.R('rig', T(0.5, 3), [[0.12, 0, 0.08], [0.12, 0, -0.08], [0.12, 0, 0.08]]),
    A.R('armL', T(0.5, 3), [[0.3, 0, 0], [-0.3, 0, 0], [0.3, 0, 0]]), A.R('armR', T(0.5, 3), [[-0.3, 0, 0], [0.3, 0, 0], [-0.3, 0, 0]]),
  ]);
  A.add('Punch', 0.6, [
    A.R('armR', [0, 0.2, 0.35, 0.6], [[0, 0, 0], [0.6, -0.8, 0.4], [-0.8, 0.9, -0.2], [0, 0, 0]]),
    A.R('rig', [0, 0.2, 0.35, 0.6], [[0, 0, 0], [-0.1, 0.3, 0], [0.25, -0.3, 0], [0, 0, 0]]),
  ]);
  A.add('HitReact', 0.35, [A.R('rig', T(0.35, 3), [[0, 0, 0], [-0.3, 0, 0.15], [0, 0, 0]])]);
  A.add('Death', 1.0, [
    A.P('head', [0, 0.3, 0.7, 1.0], [[0, 0, 0], [0.3, 0.6, 0.2], [1.0, -1.9, 0.6], [1.1, -2.5, 0.65]]),
    A.R('head', [0, 1.0], [[0, 0, 0], [0.5, 2.5, 1.6]]),
    A.R('mid', [0, 1.0], [[0, 0, 0], [0, 0, -0.3]]),
    A.S('rig', [0, 0.6, 1.0], [1, 1, [1.15, 0.7, 1.15]]),
  ]);
  A.add('Dance', 0.9, [
    A.R('rig', T(0.9, 5), [[0, 0, 0], [0, 1.57, 0.1], [0, 3.14, 0], [0, 4.71, -0.1], [0, 6.28, 0]]),
    A.R('armL', T(0.9, 3), [[0, 0, -0.8], [0, 0, 0.2], [0, 0, -0.8]]), A.R('armR', T(0.9, 3), [[0, 0, 0.8], [0, 0, -0.2], [0, 0, 0.8]]),
  ]);
  return { scene: root, animations: A.clips };
}

// ---------------------------------------------------------------- Cactus brute
function buildCactus() {
  const green = mat(0x4fb04a, { roughness: 0.6 });
  const dark = mat(0x2f7a32, { roughness: 0.7 });
  const spikeM = mat(0xfff2c0, { roughness: 0.5 });
  const root = G('root');
  const rig = G('rig');
  root.add(rig);
  const body = G('body', [0, 0.55, 0]);
  rig.add(body);
  body.add(M(capsule(), green, { p: [0, 1.0, 0], s: [0.62, 0.55, 0.58] }));
  // Ribs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    body.add(M(capsule(), dark, { p: [Math.sin(a) * 0.5, 1.0, Math.cos(a) * 0.46], s: [0.08, 0.5, 0.08] }));
  }
  // Spikes
  for (let i = 0; i < 22; i++) {
    const a = (i * 2.4) % TAU, y = 0.45 + ((i * 0.37) % 1.2);
    const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const s = M(cone(5), spikeM, { s: [0.035, 0.16, 0.035] });
    s.position.set(n.x * 0.62, y, n.z * 0.58);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    body.add(s);
  }
  // Flower crown
  const petal = mat(0xff5aa8, { roughness: 0.5 });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; body.add(M(sphere(10), petal, { p: [Math.sin(a) * 0.16, 1.98, Math.cos(a) * 0.16], s: [0.13, 0.07, 0.13] })); }
  body.add(M(sphere(10), mat(0xffd23a), { p: [0, 2.0, 0], s: 0.08 }));
  // Face
  for (const x of [-0.2, 0.2]) {
    body.add(at(eye(0.14, 0x6a3a10), x, 1.38, 0.52));
    body.add(M(cyl(6), mat(0x1a3a1a), { p: [x, 1.56, 0.56], r: [0, 0, Math.PI / 2 + (x > 0 ? 0.45 : -0.45)], s: [0.035, 0.16, 0.035] }));
  }
  body.add(M(torus(), mat(0x6a1a1a), { p: [0, 1.12, 0.56], s: [0.12, 0.08, 0.1] }));
  for (const x of [-0.07, 0.07]) body.add(M(cone(4), spikeM, { p: [x, 1.07, 0.6], r: [Math.PI, 0, 0], s: [0.03, 0.07, 0.03] }));
  // Arms (classic cactus elbows)
  for (const side of [-1, 1]) {
    const arm = G(side < 0 ? 'armL' : 'armR', [side * 0.55, 1.05, 0]);
    body.add(arm);
    arm.add(M(capsule(), green, { p: [side * 0.32, 0, 0], r: [0, 0, Math.PI / 2], s: [0.18, 0.2, 0.18] }));
    arm.add(M(capsule(), green, { p: [side * 0.58, 0.35, 0], s: [0.19, 0.28, 0.19] }));
    arm.add(M(cone(5), spikeM, { p: [side * 0.58, 0.78, 0], s: [0.04, 0.15, 0.04] }));
  }
  // Stubby legs
  for (const side of [-1, 1]) {
    const leg = G(side < 0 ? 'legL' : 'legR', [side * 0.26, 0.55, 0]);
    rig.add(leg);
    leg.add(M(capsule(), dark, { p: [0, -0.28, 0], s: [0.17, 0.14, 0.17] }));
    leg.add(M(sphere(10), mat(0xc0703a), { p: [0, -0.5, 0.06], s: [0.2, 0.1, 0.26] }));
  }
  const A = new Anim(root);
  A.add('Idle', 1.2, [A.R('body', T(1.2, 3), [[0, 0, 0.05], [0, 0, -0.05], [0, 0, 0.05]]), A.R('armL', T(1.2, 3), [[0, 0, 0], [0, 0, 0.15], [0, 0, 0]]), A.R('armR', T(1.2, 3), [[0, 0, 0], [0, 0, -0.15], [0, 0, 0]])]);
  const stride = (n, a) => A.R(n, T(0.6, 5), [[a, 0, 0], [0, 0, 0], [-a, 0, 0], [0, 0, 0], [a, 0, 0]]);
  A.add('Run', 0.6, [stride('legL', 0.7), stride('legR', -0.7), A.P('body', T(0.6, 5), [[0, 0, 0], [0, 0.1, 0], [0, 0, 0], [0, 0.1, 0], [0, 0, 0]]), A.R('body', T(0.6, 3), [[0.15, 0, 0.08], [0.15, 0, -0.08], [0.15, 0, 0.08]])]);
  A.add('Punch', 0.6, [
    A.R('armR', [0, 0.2, 0.32, 0.6], [[0, 0, 0], [0, 0.8, 0.6], [-1.3, -0.4, -0.2], [0, 0, 0]]),
    A.R('body', [0, 0.2, 0.32, 0.6], [[0, 0, 0], [-0.1, 0.35, 0], [0.3, -0.25, 0], [0, 0, 0]]),
  ]);
  A.add('HitReact', 0.35, [A.R('body', T(0.35, 3), [[0, 0, 0], [-0.35, 0, -0.1], [0, 0, 0]])]);
  A.add('Death', 1.0, [
    A.R('rig', [0, 0.25, 0.85, 1.0], [[0, 0, 0], [0, 0, 0.2], [0, 0, -1.5], [0, 0, -1.55]]),
    A.P('rig', [0, 0.85, 1.0], [[0, 0, 0], [0.3, -0.1, 0], [0.32, -0.15, 0]]),
  ]);
  A.add('Dance', 0.8, [
    A.R('armL', T(0.8, 3), [[0, 0, 0.5], [0, 0, -0.4], [0, 0, 0.5]]), A.R('armR', T(0.8, 3), [[0, 0, 0.4], [0, 0, -0.5], [0, 0, 0.4]]),
    A.R('body', T(0.8, 3), [[0, 0.4, 0.15], [0, -0.4, -0.15], [0, 0.4, 0.15]]),
    A.P('rig', T(0.8, 5), [[0, 0, 0], [0, 0.3, 0], [0, 0, 0], [0, 0.3, 0], [0, 0, 0]]),
  ]);
  return { scene: root, animations: A.clips };
}

// ---------------------------------------------------------------- Bat (eyeball / frost / sand)
let wingGeo = null;
function batWingGeo() {
  if (wingGeo) return wingGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0.12);
  s.quadraticCurveTo(0.6, 0.55, 1.45, 0.42);
  s.lineTo(1.25, 0.05); s.quadraticCurveTo(1.1, -0.1, 0.95, 0.02);
  s.quadraticCurveTo(0.8, -0.2, 0.62, -0.06);
  s.quadraticCurveTo(0.45, -0.25, 0.28, -0.08);
  s.lineTo(0, -0.12);
  wingGeo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  return wingGeo;
}
function buildBat(variant) {
  const root = G('root');
  const rig = G('rig', [0, 0.85, 0]);
  root.add(rig);
  const body = G('body');
  rig.add(body);
  let wingM;
  if (variant === 'eye') {
    body.add(M(sphere(24), mat(0xfff4ec, { roughness: 0.3 }), { s: 0.72 }));
    // Veins as thin red rings
    const vein = geo('vein', () => new THREE.TorusGeometry(1, 0.012, 6, 40, 1.6));
    for (let i = 0; i < 4; i++) body.add(M(vein, mat(0xe04a4a), { r: [0.9 + i * 0.5, i * 1.4, i * 0.8], s: 0.725 }));
    body.add(M(sphere(18), mat(0x2ac8a0, { roughness: 0.3 }), { p: [0, 0.05, 0.5], s: [0.38, 0.38, 0.26] }));
    body.add(M(sphere(14), mat(0x0a0a10, { roughness: 0.2 }), { p: [0, 0.05, 0.66], s: [0.18, 0.22, 0.1] }));
    body.add(M(sphere(8), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.8 }), { p: [0.1, 0.18, 0.72], s: 0.06 }));
    // Eyelid and horns
    body.add(M(sphere(18), mat(0x7a2a8a, { roughness: 0.6 }), { p: [0, 0.38, 0.1], s: [0.74, 0.42, 0.74] }));
    for (const x of [-0.35, 0.35]) body.add(M(cone(8), mat(0x3a1240), { p: [x, 0.72, 0], r: [0, 0, x > 0 ? -0.5 : 0.5], s: [0.1, 0.32, 0.1] }));
    wingM = mat(0x7a2a8a, { side: THREE.DoubleSide, roughness: 0.6 });
  } else {
    const fur = variant === 'frost' ? 0x8ad0ff : 0xd8a868;
    const belly = variant === 'frost' ? 0xe6f6ff : 0xf6e2b8;
    body.add(M(sphere(22), mat(fur, { roughness: 0.75 }), { s: [0.66, 0.6, 0.6] }));
    body.add(M(sphere(16), mat(belly, { roughness: 0.75 }), { p: [0, -0.12, 0.32], s: [0.42, 0.38, 0.32] }));
    for (const x of [-0.24, 0.24]) {
      body.add(at(eye(0.17, variant === 'frost' ? 0x1a4ab0 : 0x8a3a10), x, 0.12, 0.46));
      body.add(M(cone(8), mat(fur), { p: [x * 1.3, 0.62, -0.05], r: [0, 0, x > 0 ? -0.35 : 0.35], s: [0.16, 0.38, 0.12] }));
      body.add(M(cone(4), mat(0xffffff), { p: [x * 0.35, -0.12, 0.55], r: [Math.PI, 0, 0], s: [0.04, 0.12, 0.04] }));
    }
    if (variant === 'frost') for (const [x, y] of [[0, 0.6], [-0.2, 0.55], [0.2, 0.55]]) body.add(M(octa(), glowMat(0xd8f6ff, 0.6), { p: [x, y, -0.25], s: [0.07, 0.2, 0.07] }));
    wingM = mat(variant === 'frost' ? 0x4a8ad0 : 0x9a6a3a, { side: THREE.DoubleSide, roughness: 0.6 });
  }
  for (const side of [-1, 1]) {
    const w = G(side < 0 ? 'wingL' : 'wingR', [side * 0.5, 0.08, -0.05]);
    body.add(w);
    const m = M(batWingGeo(), wingM, { s: [side, 1, 1] });
    w.add(m);
  }
  // Little feet
  for (const x of [-0.2, 0.2]) body.add(M(sphere(8), mat(0x3a2020), { p: [x, -0.64, 0.05], s: [0.09, 0.07, 0.12] }));
  const A = new Anim(root);
  const flap = (d) => [A.R('wingL', T(d, 3), [[0, 0, 0.75], [0, 0, -0.6], [0, 0, 0.75]]), A.R('wingR', T(d, 3), [[0, 0, -0.75], [0, 0, 0.6], [0, 0, -0.75]])];
  A.add('Idle', 0.5, [...flap(0.5), A.P('body', T(0.5, 3), [[0, 0, 0], [0, 0.12, 0], [0, 0, 0]])]);
  A.add('Fast_Flying', 0.32, [...flap(0.32), A.R('body', [0, 0.32], [[0.35, 0, 0], [0.35, 0, 0]])]);
  A.add('Punch', 0.6, [
    ...flap(0.3).map((t) => t),
    A.P('body', [0, 0.2, 0.32, 0.6], [[0, 0, 0], [0, 0.15, -0.35], [0, -0.05, 0.45], [0, 0, 0]]),
    A.S('body', [0, 0.2, 0.32, 0.6], [1, [0.9, 1.1, 0.9], [1.2, 0.9, 1.2], 1]),
  ]);
  A.add('HitReact', 0.35, [A.R('body', T(0.35, 3), [[0, 0, 0], [-0.5, 0, 0.3], [0, 0, 0]])]);
  A.add('Death', 1.0, [
    A.R('wingL', [0, 1], [[0, 0, 0.2], [0, 0, 1.4]]), A.R('wingR', [0, 1], [[0, 0, -0.2], [0, 0, -1.4]]),
    A.P('rig', [0, 0.3, 1.0], [[0, 0, 0], [0, 0.3, 0], [0, -0.75, 0]]),
    A.R('rig', [0, 1.0], [[0, 0, 0], [0.4, 0, 2.6]]),
  ]);
  A.add('Dance', 0.9, [...flap(0.3), A.R('rig', T(0.9, 5), [[0, 0, 0], [0, 1.57, 0], [0, 3.14, 0], [0, 4.71, 0], [0, 6.28, 0]]), A.P('rig', T(0.9, 3), [[0, 0, 0], [0, 0.4, 0], [0, 0, 0]])]);
  return { scene: root, animations: A.clips };
}

// ---------------------------------------------------------------- Wisp (fire / crystal)
function buildWisp(variant) {
  const root = G('root');
  const rig = G('rig', [0, 0.95, 0]);
  root.add(rig);
  const core = G('core');
  rig.add(core);
  const orbit = G('orbit');
  rig.add(orbit);
  if (variant === 'fire') {
    core.add(M(sphere(20), glowMat(0xffc23a, 1.4), { s: 0.62 }));
    core.add(M(sphere(16), mat(0xff6a1a, { emissive: 0xff4a10, emissiveIntensity: 1.2, transparent: true, opacity: 0.3, depthWrite: false }), { s: 0.7 }));
    const flames = G('flames', [0, 0.35, 0]);
    core.add(flames);
    for (const [x, z, h, s] of [[0, 0, 1.1, 0.4], [-0.3, 0.05, 0.75, 0.26], [0.3, 0.05, 0.75, 0.26], [0.05, -0.28, 0.85, 0.26], [-0.12, 0.25, 0.6, 0.2]]) {
      flames.add(M(cone(10), glowMat(h > 1 ? 0xffd25a : 0xff7a20, 1.5), { p: [x, h * 0.42, z], s: [s, h, s] }));
    }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; orbit.add(M(sphere(8), glowMat(0xffa030, 2), { p: [Math.cos(a) * 0.95, Math.sin(i) * 0.25, Math.sin(a) * 0.95], s: 0.1 })); }
  } else {
    core.add(M(octa(), mat(0x8af6ff, { emissive: 0x3ad0ff, emissiveIntensity: 0.9, roughness: 0.15, flatShading: true }), { s: [0.55, 0.85, 0.55] }));
    core.add(M(octa(), mat(0xffffff, { emissive: 0xc8f8ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.35, depthWrite: false, flatShading: true }), { s: [0.75, 1.1, 0.75] }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      orbit.add(M(octa(), mat(i % 2 ? 0xff7af0 : 0x8af6ff, { emissive: i % 2 ? 0xff3ae0 : 0x3ad0ff, emissiveIntensity: 1.1, flatShading: true }), { p: [Math.cos(a) * 1.0, (i % 2 ? 0.25 : -0.15), Math.sin(a) * 1.0], r: [0.3, a, 0.2], s: [0.12, 0.28, 0.12] }));
    }
  }
  // Face
  const fz = variant === 'fire' ? 0.6 : 0.5;
  for (const x of [-0.18, 0.18]) core.add(M(sphere(10), mat(0x1a0a0a, { roughness: 0.3 }), { p: [x, 0.08, fz], s: [0.07, 0.11, 0.05] }));
  core.add(M(torus(), mat(0x1a0a0a), { p: [0, -0.12, fz + 0.02], r: [0, 0, Math.PI], s: [0.08, 0.06, 0.06] }));

  const A = new Anim(root);
  const spin = (d) => A.R('orbit', T(d, 5), [[0, 0, 0], [0, 1.57, 0], [0, 3.14, 0], [0, 4.71, 0], [0, 6.28, 0]]);
  const flick = variant === 'fire' ? (d) => A.S('flames', T(d, 4), [[1, 1, 1], [1.1, 0.8, 1.1], [0.9, 1.2, 0.9], [1, 1, 1]]) : () => null;
  A.add('Idle', 1.6, [spin(1.6), flick(0.4 * 4), A.P('core', T(1.6, 3), [[0, 0, 0], [0, 0.15, 0], [0, 0, 0]])]);
  A.add('Fast_Flying', 0.8, [spin(0.8), flick(0.8), A.R('rig', [0, 0.8], [[0.3, 0, 0], [0.3, 0, 0]])]);
  A.add('Punch', 0.6, [spin(0.6), A.S('core', [0, 0.25, 0.35, 0.6], [1, 0.8, 1.35, 1]), A.P('core', [0, 0.25, 0.35, 0.6], [[0, 0, 0], [0, 0, -0.25], [0, 0, 0.3], [0, 0, 0]])]);
  A.add('HitReact', 0.35, [A.S('core', T(0.35, 3), [1, [1.3, 0.75, 1.3], 1])]);
  A.add('Death', 0.9, [A.S('rig', T(0.9, 3), [1, 1.3, 0.05]), A.R('rig', T(0.9, 3), [[0, 0, 0], [0, 3, 0], [0, 6.2, 0]])]);
  A.add('Dance', 0.8, [spin(0.4 * 2), A.P('rig', T(0.8, 3), [[0, 0, 0], [0, 0.45, 0], [0, 0, 0]]), A.S('core', T(0.8, 3), [1, 1.15, 1])]);
  return { scene: root, animations: A.clips };
}

// ---------------------------------------------------------------- Pumpkin ghost
let faceGeos = null;
function pumpkinFace() {
  if (faceGeos) return faceGeos;
  const tri = new THREE.Shape(); tri.moveTo(-0.5, -0.4); tri.lineTo(0.5, -0.4); tri.lineTo(0, 0.5); tri.closePath();
  const mouth = new THREE.Shape();
  mouth.moveTo(-1, 0.2);
  const teeth = [[-0.75, -0.15], [-0.5, 0.1], [-0.25, -0.25], [0, 0.05], [0.25, -0.25], [0.5, 0.1], [0.75, -0.15], [1, 0.2]];
  for (const [x, y] of teeth) mouth.lineTo(x, y);
  mouth.quadraticCurveTo(0, -0.95, -1, 0.2);
  faceGeos = { tri: new THREE.ShapeGeometry(tri), mouth: new THREE.ShapeGeometry(mouth) };
  return faceGeos;
}
export function buildPumpkinHead(glow = 0xffd23a) {
  const g = new THREE.Group();
  const orange = mat(0xff8a1f, { roughness: 0.55 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.add(M(sphere(16), orange, { p: [Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32], s: [0.36, 0.52, 0.36] }));
  }
  g.add(M(sphere(14), orange, { s: [0.5, 0.5, 0.5] }));
  g.add(M(cyl(6), mat(0x3a7a2a), { p: [0, 0.55, 0], r: [0.2, 0, 0.2], s: [0.07, 0.25, 0.07] }));
  const f = pumpkinFace();
  const fm = new THREE.MeshBasicMaterial({ color: glow, side: THREE.DoubleSide });
  for (const x of [-0.24, 0.24]) g.add(M(f.tri, fm, { p: [x, 0.14, 0.685], s: 0.16 }));
  g.add(M(f.mouth, fm, { p: [0, -0.16, 0.69], s: [0.3, 0.2, 1] }));
  return g;
}
function buildPumpkin() {
  const root = G('root');
  const rig = G('rig', [0, 0.8, 0]);
  root.add(rig);
  const head = G('head', [0, 0.75, 0]);
  rig.add(head);
  head.add(buildPumpkinHead());
  const cloakM = mat(0xf4f0ff, { roughness: 0.5, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const cloak = G('cloak', [0, 0.3, 0]);
  rig.add(cloak);
  // Ghost sheet: rounded shoulders flaring into a wavy hem
  cloak.add(M(sphere(18), cloakM, { p: [0, 0.05, 0], s: [0.5, 0.32, 0.5] }));
  cloak.add(M(geo('sheet', () => new THREE.CylinderGeometry(0.5, 0.72, 1, 18, 1, true)), cloakM, { p: [0, -0.45, 0], s: [1, 0.95, 1] }));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; cloak.add(M(sphere(8), cloakM, { p: [Math.sin(a) * 0.62, -0.95, Math.cos(a) * 0.62], s: [0.17, 0.2, 0.17] })); }
  for (const side of [-1, 1]) {
    const h = G(side < 0 ? 'handL' : 'handR', [side * 0.55, 0.15, 0.2]);
    rig.add(h);
    h.add(M(sphere(10), cloakM, { s: [0.14, 0.14, 0.16] }));
  }
  const A = new Anim(root);
  A.add('Idle', 1.6, [A.P('rig', T(1.6, 3), [[0, 0, 0], [0, 0.15, 0], [0, 0, 0]]), A.R('cloak', T(1.6, 3), [[0, 0, 0.08], [0, 0, -0.08], [0, 0, 0.08]]), A.R('head', T(1.6, 3), [[0, 0.15, 0], [0, -0.15, 0], [0, 0.15, 0]])]);
  A.add('Fast_Flying', 0.8, [A.R('rig', [0, 0.8], [[0.35, 0, 0], [0.35, 0, 0]]), A.R('cloak', T(0.8, 3), [[0.3, 0, 0.1], [0.3, 0, -0.1], [0.3, 0, 0.1]])]);
  A.add('Punch', 0.6, [
    A.P('head', [0, 0.2, 0.32, 0.6], [[0, 0, 0], [0, 0.1, -0.3], [0, 0, 0.35], [0, 0, 0]]),
    A.P('handL', [0, 0.2, 0.32, 0.6], [[0, 0, 0], [0, 0.3, -0.2], [0.2, 0, 0.5], [0, 0, 0]]),
    A.P('handR', [0, 0.2, 0.32, 0.6], [[0, 0, 0], [0, 0.3, -0.2], [-0.2, 0, 0.5], [0, 0, 0]]),
  ]);
  A.add('HitReact', 0.35, [A.R('head', T(0.35, 3), [[0, 0, 0], [-0.4, 0, 0.2], [0, 0, 0]])]);
  A.add('Death', 1.0, [A.S('rig', [0, 0.4, 1.0], [1, 1.15, 0.05]), A.R('rig', [0, 1.0], [[0, 0, 0], [0, 5, 0]]), A.P('rig', [0, 1.0], [[0, 0, 0], [0, 0.8, 0]])]);
  A.add('Dance', 1.0, [A.R('rig', T(1, 5), [[0, 0, 0], [0, 1.57, 0.2], [0, 3.14, 0], [0, 4.71, -0.2], [0, 6.28, 0]]), A.P('handL', T(1, 3), [[0, 0, 0], [0, 0.4, 0], [0, 0, 0]]), A.P('handR', T(1, 3), [[0, 0.4, 0], [0, 0, 0], [0, 0.4, 0]])]);
  return { scene: root, animations: A.clips };
}


// ---------------------------------------------------------------- Mages (player support line)
let starGeo = null;
function starShape() {
  if (starGeo) return starGeo;
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.45 : 1;
    i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2 });
  starGeo.center();
  return starGeo;
}
// Robe with soft vertical folds and a wavy hem
function robeGeo() {
  return geo('robe2', () => {
    const g = new THREE.CylinderGeometry(0.4, 0.84, 1.25, 40, 8, true);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const t = (0.625 - v.y) / 1.25; // 0 at top, 1 at hem
      const a = Math.atan2(v.z, v.x);
      const k = 1 + 0.07 * Math.sin(a * 9) * t * t;
      p.setXYZ(i, v.x * k, v.y - (t > 0.95 ? 0.04 * Math.sin(a * 9) : 0), v.z * k);
    }
    g.computeVertexNormals();
    return g;
  });
}
const sleeveGeo = () => geo('sleeve', () => {
  const pts = [[0.09, 0], [0.11, 0.1], [0.14, 0.3], [0.2, 0.48], [0.24, 0.55]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 20); g.rotateX(Math.PI); return g; // narrow at the shoulder, wide at the wrist
});
function hatGeoTip(tall) {
  // Three stacked, slightly bent cone segments so the hat tip can flop
  return [0.36, 0.25, 0.14].map((r, i) => ({ r, h: (0.42 - i * 0.06) * tall }));
}
function wizardHat(color, band, tall, starDeco) {
  const hat = G('hat');
  const m = mat(color, { roughness: 0.65 });
  hat.add(M(geo('brim', () => new THREE.CylinderGeometry(0.66, 0.7, 0.05, 32)), m));
  hat.add(M(geo('crown', () => new THREE.CylinderGeometry(0.36, 0.4, 0.22, 28)), m, { p: [0, 0.13, 0] }));
  if (band) hat.add(M(geo('band', () => new THREE.CylinderGeometry(0.405, 0.405, 0.07, 28)), mat(band, { roughness: 0.4, metalness: 0.3 }), { p: [0, 0.08, 0] }));
  let parent = hat, y = 0.24;
  hatGeoTip(tall).forEach(({ r, h }, i) => {
    const seg = G(i === 0 ? 'hatTip' : 'hatTip' + i, [0, y, 0], [i ? -0.22 : -0.1, 0, 0]);
    seg.add(M(geo('hatseg' + i + tall, () => new THREE.CylinderGeometry(i === 2 ? 0.01 : r * 0.62, r, h, 20)), m, { p: [0, h / 2, 0] }));
    parent.add(seg); parent = seg; y = i === 0 ? h : h; seg.userData.h = h;
    if (i === 0) y = h; 
  });
  if (starDeco) hat.add(M(starShape(), glowMat(0xffe066, 1.1), { p: [0.16, 0.42, 0.3], r: [0, 0.4, 0], s: 0.08 }));
  return hat;
}
function staff(orbColor, len, topper) {
  const g = G('staff');
  const wood = mat(0x7a4a22, { roughness: 0.75 });
  // Twisted wooden shaft
  const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0.04, len * 0.3, 0.02], [-0.03, len * 0.6, -0.02], [0.02, len * 0.88, 0]].map((v) => new THREE.Vector3(...v)));
  g.add(M(geo('shaft' + len, () => new THREE.TubeGeometry(curve, 24, 0.045, 8, false)), wood, { p: [0, -0.35, 0] }));
  // Claw holder and the glowing focus
  const top = G('orb', [0.02, len - 0.3, 0]);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; top.add(M(cone(6), wood, { p: [Math.cos(a) * 0.1, -0.06, Math.sin(a) * 0.1], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], s: [0.035, 0.22, 0.035] })); }
  if (topper === 'star') top.add(M(starShape(), glowMat(orbColor, 1.7), { p: [0, 0.12, 0], s: 0.22 }));
  else if (topper === 'crystal') top.add(M(octa(), mat(orbColor, { emissive: orbColor, emissiveIntensity: 1.2, roughness: 0.1, flatShading: true }), { p: [0, 0.12, 0], s: [0.12, 0.26, 0.12] }));
  else top.add(M(sphere(18), glowMat(orbColor, 1.9), { p: [0, 0.08, 0], s: 0.15 }));
  top.add(M(sphere(12), mat(orbColor, { emissive: orbColor, emissiveIntensity: 1, transparent: true, opacity: 0.28, depthWrite: false }), { p: [0, 0.1, 0], s: 0.27 }));
  g.add(top);
  return g;
}
function face(head, o) {
  const skinM = mat(o.skin, { roughness: 0.6 });
  head.add(M(sphere(24), skinM, { s: [0.42, 0.4, 0.4] }));
  for (const x of [-1, 1]) head.add(M(sphere(10), skinM, { p: [x * 0.4, 0, 0], s: [0.06, 0.1, 0.06] }));
  head.add(M(sphere(10), mat(o.skin, { roughness: 0.5, color: new THREE.Color(o.skin).multiplyScalar(0.92) }), { p: [0, -0.04, 0.4], s: [0.065, 0.06, 0.06] }));
  for (const x of [-0.15, 0.15]) head.add(at(eye(0.12, o.iris || 0x3a2a1a), x, 0.05, 0.3));
  // Eyelids for blinking (closed = scale 1 on y)
  const lids = G('lids', [0, 0.11, 0.32], [0, 0, 0]);
  lids.scale.set(1, 0.08, 1);
  for (const x of [-0.15, 0.15]) lids.add(M(sphere(12), skinM, { p: [x, -0.05, 0], s: [0.13, 0.13, 0.08] }));
  head.add(lids);
  const browM = mat(o.brow || 0x4a2a1a, { roughness: 0.9 });
  for (const x of [-1, 1]) head.add(M(capsule(), browM, { p: [x * 0.15, 0.2, 0.36], r: [0, 0, Math.PI / 2 + x * (o.angry ? 0.35 : -0.15)], s: [0.025, 0.05, 0.025] }));
  for (const x of [-1, 1]) head.add(M(sphere(8), mat(0xff9a8a, { transparent: true, opacity: 0.8 }), { p: [x * 0.27, -0.1, 0.3], s: [0.07, 0.04, 0.02] }));
  if (!o.beard) head.add(M(torus(), mat(0x6a2a2a), { p: [0, -0.15, 0.37], r: [0, 0, Math.PI], s: [0.06, 0.045, 0.04] }));
  else {
    const bm = mat(o.beard, { roughness: 0.95 });
    const beard = G('beard', [0, -0.2, 0.25]);
    head.add(beard);
    beard.add(M(sphere(16), bm, { p: [0, -0.1, 0.02], s: [0.3, 0.22, 0.17] }));
    beard.add(M(cone(14), bm, { p: [0, -0.42, 0.05], r: [Math.PI - 0.15, 0, 0], s: [0.24, 0.45, 0.14] }));
    for (const x of [-1, 1]) beard.add(M(sphere(10), bm, { p: [x * 0.11, 0.1, 0.14], r: [0, 0, x * 0.45], s: [0.12, 0.05, 0.05] }));
  }
}
function robedMage(o) {
  const root = G('root');
  const rig = G('rig', [0, 0.1, 0]);
  root.add(rig);
  const body = G('body');
  rig.add(body);
  const robeM = mat(o.robe, { roughness: 0.75, side: THREE.DoubleSide });
  const trimM = mat(o.trim, { roughness: 0.45, metalness: 0.25 });
  const hem = G('hem', [0, 0.62, 0]);
  body.add(hem);
  hem.add(M(robeGeo(), robeM));
  for (const x of [-0.18, 0.18]) body.add(M(sphere(12), mat(0x3a2414, { roughness: 0.7 }), { p: [x, 0.04, 0.55], s: [0.13, 0.08, 0.2] }));
  body.add(M(sphere(20), robeM, { p: [0, 1.28, 0], s: [0.48, 0.42, 0.43] }));
  body.add(M(geo('belt', () => new THREE.TorusGeometry(0.43, 0.05, 8, 32)), trimM, { p: [0, 1.03, 0], r: [Math.PI / 2, 0, 0] }));
  body.add(M(geo('buckle', () => new THREE.BoxGeometry(1, 1, 1)), mat(0xffd84a, { metalness: 0.6, roughness: 0.3 }), { p: [0, 1.03, 0.44], s: [0.12, 0.1, 0.04] }));
  body.add(M(geo('stole', () => new THREE.BoxGeometry(1, 1, 1)), trimM, { p: [0, 0.68, 0.53], r: [-0.3, 0, 0], s: [0.16, 0.9, 0.03] }));
  if (o.cape) {
    const capeM = mat(o.cape, { side: THREE.DoubleSide, roughness: 0.6 });
    const cape = G('cape', [0, 1.45, -0.1]);
    rig.add(cape);
    cape.add(M(geo('cape2', () => new THREE.CylinderGeometry(0.42, 0.9, 1.45, 24, 4, true, Math.PI * 0.55, Math.PI * 0.9)), capeM, { p: [0, -0.7, -0.05] }));
  }
  const head = G('head', [0, 1.85, 0]);
  rig.add(head);
  if (o.hat === 'hood') {
    const hoodM = mat(o.robe, { roughness: 0.75, side: THREE.DoubleSide });
    head.add(M(geo('hood', () => new THREE.SphereGeometry(1, 28, 18, 0, TAU, 0, Math.PI * 0.62)), hoodM, { r: [-0.35, 0, 0], s: [0.55, 0.6, 0.55] }));
    head.add(M(sphere(18), mat(0x0c0618, { roughness: 1 }), { p: [0, 0, 0.04], s: [0.4, 0.4, 0.4] }));
    head.add(M(cone(14), hoodM, { p: [0, 0.38, -0.32], r: [-1.1, 0, 0], s: [0.22, 0.6, 0.22] }));
    for (const x of [-0.13, 0.13]) head.add(at(glowEye(0.07, o.eyes || 0xc08aff), x, 0.02, 0.5));
  } else {
    face(head, o);
    if (o.hat === 'witch' || o.hat === 'wizard') { const h = wizardHat(o.hatColor, o.band, o.hat === 'wizard' ? 1.35 : 1.0, o.hat === 'wizard'); h.position.y = 0.28; h.rotation.z = -0.08; head.add(h); }
  }
  for (const side of [-1, 1]) {
    const arm = G(side < 0 ? 'armL' : 'armR', [side * 0.48, 1.42, 0.02]);
    rig.add(arm);
    arm.add(M(sleeveGeo(), robeM, { r: [0, 0, side * 0.35], p: [side * 0.02, 0, 0] }));
    arm.add(M(sphere(12), mat(o.hat === 'hood' ? 0x3a2a4a : o.skin), { p: [side * 0.2, -0.56, 0.02], s: [0.1, 0.11, 0.1] }));
    if (side > 0) { const st = staff(o.orb, 2.0, o.topper); st.position.set(0.22, -0.9, 0.08); arm.add(st); }
  }
  if (o.halo) rig.add(M(geo('halo', () => new THREE.TorusGeometry(0.34, 0.045, 10, 40)), glowMat(0xffd84a, 1.5), { p: [0, 2.62, -0.05], r: [Math.PI / 2 - 0.25, 0, 0] }));
  if (o.orbit) {
    const orbit = G('orbit', [0, 1.3, 0]);
    rig.add(orbit);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; orbit.add(M(sphere(12), glowMat(o.orbit, 2), { p: [Math.cos(a) * 0.95, Math.sin(i * 2) * 0.25, Math.sin(a) * 0.95], s: 0.1 })); }
  }
  return root;
}

function buildSprite() {
  const root = G('root');
  const rig = G('rig', [0, 0.95, 0]);
  root.add(rig);
  const body = G('body');
  rig.add(body);
  body.add(M(sphere(28), mat(0xffe27a, { roughness: 0.3, emissive: 0xffb820, emissiveIntensity: 0.3 }), { s: [0.62, 0.58, 0.58] }));
  body.add(M(sphere(16), mat(0xfff6c8, { roughness: 0.4 }), { p: [0, -0.18, 0.35], s: [0.36, 0.3, 0.2] }));
  for (const x of [-0.2, 0.2]) body.add(at(eye(0.17, 0x2a6ae0), x, 0.08, 0.44));
  const lids = G('lids', [0, 0.2, 0.47]); lids.scale.set(1, 0.08, 1);
  for (const x of [-0.2, 0.2]) lids.add(M(sphere(12), mat(0xffe27a), { p: [x, -0.05, 0], s: [0.18, 0.17, 0.08] }));
  body.add(lids);
  body.add(M(torus(), mat(0x8a4a10), { p: [0, -0.12, 0.54], r: [0, 0, Math.PI], s: [0.08, 0.06, 0.05] }));
  for (const x of [-1, 1]) body.add(M(sphere(8), mat(0xff9a6a, { transparent: true, opacity: 0.8 }), { p: [x * 0.36, -0.05, 0.42], s: [0.08, 0.05, 0.02] }));
  // Hair tuft and spark antenna
  for (let i = 0; i < 3; i++) body.add(M(cone(8), mat(0xffc83a), { p: [-0.1 + i * 0.1, 0.56, 0.05], r: [0.2, 0, -0.4 + i * 0.4], s: [0.06, 0.2, 0.06] }));
  const orb = G('orb', [0.08, 1.02, 0]);
  body.add(M(geo('ant', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0.1, 0.75, 0), new THREE.Vector3(0.08, 0.95, 0)]), 12, 0.02, 6)), mat(0xd8a020)));
  body.add(orb);
  orb.add(M(starShape(), glowMat(0xfff27a, 2.2), { s: 0.1 }));
  orb.add(M(sphere(10), mat(0xfff27a, { emissive: 0xfff27a, emissiveIntensity: 1, transparent: true, opacity: 0.3, depthWrite: false }), { s: 0.2 }));
  const wingM = mat(0xd8f6ff, { transparent: true, opacity: 0.7, side: THREE.DoubleSide, roughness: 0.15, emissive: 0x9ae6ff, emissiveIntensity: 0.35 });
  for (const side of [-1, 1]) {
    const w = G(side < 0 ? 'wingL' : 'wingR', [side * 0.3, 0.2, -0.3]);
    body.add(w);
    w.add(M(sphere(14), wingM, { p: [side * 0.4, 0.24, 0], r: [0, 0, side * -0.5], s: [0.44, 0.22, 0.02] }));
    w.add(M(sphere(14), wingM, { p: [side * 0.32, -0.12, 0], r: [0, 0, side * 0.5], s: [0.3, 0.16, 0.02] }));
  }
  for (const x of [-1, 1]) body.add(M(sphere(10), mat(0xffc83a), { p: [x * 0.2, -0.55, 0.05], s: [0.1, 0.08, 0.13] }));
  return root;
}
function buildImp() {
  const root = G('root');
  const rig = G('rig', [0, 0.12, 0]);
  root.add(rig);
  const body = G('body');
  rig.add(body);
  const skin = mat(0x9a5ae0, { roughness: 0.45 });
  body.add(M(sphere(24), skin, { p: [0, 0.75, 0], s: [0.5, 0.55, 0.45] }));
  body.add(M(sphere(16), mat(0xd8b8ff), { p: [0, 0.68, 0.3], s: [0.3, 0.32, 0.18] }));
  for (const x of [-0.22, 0.22]) { body.add(M(capsule(), skin, { p: [x, 0.2, 0], s: [0.12, 0.12, 0.12] })); body.add(M(sphere(10), skin, { p: [x, 0.04, 0.08], s: [0.14, 0.07, 0.18] })); }
  // Tail with a spade tip
  const tail = G('tail', [0, 0.45, -0.4]);
  body.add(tail);
  tail.add(M(geo('tailT', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, -0.3), new THREE.Vector3(0, 0.15, -0.55), new THREE.Vector3(0, 0.4, -0.6)]), 16, 0.04, 8)), skin));
  tail.add(M(octa(), mat(0x3a1a50), { p: [0, 0.45, -0.6], s: [0.1, 0.12, 0.03] }));
  const head = G('head', [0, 1.45, 0]);
  rig.add(head);
  head.add(M(sphere(22), skin, { s: [0.45, 0.4, 0.42] }));
  for (const x of [-1, 1]) head.add(M(cone(8), skin, { p: [x * 0.44, 0.05, 0], r: [0, 0, x * -1.3], s: [0.08, 0.2, 0.05] }));
  for (const x of [-0.16, 0.16]) head.add(at(eye(0.13, 0xd03a7a), x, 0.04, 0.33));
  const lids = G('lids', [0, 0.14, 0.36]); lids.scale.set(1, 0.08, 1);
  for (const x of [-0.16, 0.16]) lids.add(M(sphere(12), skin, { p: [x, -0.05, 0], s: [0.14, 0.14, 0.08] }));
  head.add(lids);
  head.add(M(torus(), mat(0x3a1050), { p: [0, -0.15, 0.37], r: [0, 0, Math.PI], s: [0.1, 0.06, 0.05] }));
  for (const x of [-0.06, 0.06]) head.add(M(cone(4), mat(0xffffff), { p: [x, -0.18, 0.39], r: [Math.PI, 0, 0], s: [0.025, 0.06, 0.025] }));
  for (const x of [-1, 1]) head.add(M(cone(10), mat(0x3a1a50, { roughness: 0.4 }), { p: [x * 0.27, 0.34, 0], r: [0, 0, x * -0.45], s: [0.08, 0.3, 0.08] }));
  head.add(M(octa(), mat(0x7af0ff, { emissive: 0x3ad0ff, emissiveIntensity: 1.1, roughness: 0.1, flatShading: true }), { p: [0, 0.45, 0.05], s: [0.12, 0.24, 0.12] }));
  for (const side of [-1, 1]) {
    const w = G(side < 0 ? 'wingL' : 'wingR', [side * 0.3, 1.0, -0.3]);
    rig.add(w);
    w.add(M(batWingGeo(), mat(0x5a2a8a, { side: THREE.DoubleSide }), { s: [side * 0.45, 0.45, 0.45] }));
  }
  for (const side of [-1, 1]) {
    const arm = G(side < 0 ? 'armL' : 'armR', [side * 0.45, 0.95, 0.05]);
    rig.add(arm);
    arm.add(M(capsule(), skin, { p: [side * 0.1, -0.15, 0], r: [0, 0, side * 0.6], s: [0.08, 0.13, 0.08] }));
    arm.add(M(sphere(10), skin, { p: [side * 0.2, -0.3, 0.03], s: 0.08 }));
  }
  const orb = G('orb', [0.62, 1.3, 0.35]);
  rig.add(orb);
  orb.add(M(octa(), mat(0x7af0ff, { emissive: 0x3ad0ff, emissiveIntensity: 1.4, roughness: 0.1, flatShading: true }), { s: [0.14, 0.26, 0.14] }));
  orb.add(M(sphere(10), mat(0x7af0ff, { emissive: 0x7af0ff, transparent: true, opacity: 0.18, depthWrite: false }), { s: 0.2 }));
  return root;
}
function buildArcane() {
  const root = G('root');
  const rig = G('rig', [0, 0.1, 0]);
  root.add(rig);
  const body = G('body', [0, 0.9, 0]);
  rig.add(body);
  const stone = mat(0x7a86a8, { roughness: 0.85, flatShading: true });
  const dark = mat(0x4a5470, { roughness: 0.9, flatShading: true });
  const rune = glowMat(0x5af0ff, 1.7);
  body.add(M(dodeca(), stone, { p: [0, 0.6, 0], s: [0.85, 0.8, 0.7] }));
  body.add(M(geo('runeBand', () => new THREE.TorusGeometry(0.8, 0.035, 6, 40)), rune, { p: [0, 0.55, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1] }));
  body.add(M(geo('runeBand', () => new THREE.TorusGeometry(0.8, 0.035, 6, 40)), rune, { p: [0, 0.88, 0], r: [Math.PI / 2, 0, 0], s: [0.9, 0.78, 1] }));
  body.add(M(starShape(), rune, { p: [0, 0.62, 0.62], s: 0.13 }));
  for (const [x, y, z] of [[0.45, 1.2, 0.3], [-0.5, 1.15, 0.25], [0.3, 0.2, 0.5]]) body.add(M(ico(0), dark, { p: [x, y, z], s: 0.16 }));
  const head = G('head', [0, 1.72, 0]);
  body.add(head);
  head.add(M(dodeca(), stone, { s: [0.42, 0.38, 0.4] }));
  head.add(M(geo('visor', () => new THREE.BoxGeometry(1, 1, 1)), rune, { p: [0, 0.03, 0.33], s: [0.42, 0.07, 0.05] }));
  head.add(M(octa(), rune, { p: [0, 0.45, 0], s: [0.1, 0.22, 0.1] }));
  for (const side of [-1, 1]) {
    const arm = G(side < 0 ? 'armL' : 'armR', [side * 0.95, 0.95, 0]);
    body.add(arm);
    arm.add(M(dodeca(), stone, { s: 0.32 }));
    arm.add(M(geo('armRune', () => new THREE.TorusGeometry(0.22, 0.03, 6, 24)), rune, { p: [side * 0.08, -0.3, 0.08], r: [Math.PI / 2, 0, 0] }));
    arm.add(M(dodeca(), stone, { p: [side * 0.08, -0.58, 0.08], s: 0.36 }));
  }
  for (const side of [-1, 1]) {
    const leg = G(side < 0 ? 'legL' : 'legR', [side * 0.35, -0.35, 0.05]);
    body.add(leg);
    leg.add(M(dodeca(), stone, { p: [0, -0.25, 0], s: [0.3, 0.32, 0.32] }));
    leg.add(M(dodeca(), dark, { p: [0, -0.55, 0.08], s: [0.32, 0.14, 0.38] }));
  }
  // Floating open spellbook
  const orb = G('orb', [0, 1.25, 1.05]);
  rig.add(orb);
  const cover = mat(0x6a2a8a, { roughness: 0.6 });
  for (const x of [-1, 1]) orb.add(M(geo('bookL', () => new THREE.BoxGeometry(1, 1, 1)), cover, { p: [x * 0.2, 0, 0], r: [0, 0, x * -0.25], s: [0.4, 0.05, 0.52] }));
  for (const x of [-1, 1]) orb.add(M(geo('bookL', () => new THREE.BoxGeometry(1, 1, 1)), mat(0xfff6e0, { emissive: 0xfff2c8, emissiveIntensity: 0.5 }), { p: [x * 0.19, 0.04, 0], r: [0, 0, x * -0.22], s: [0.36, 0.03, 0.46] }));
  orb.add(M(starShape(), glowMat(0x5af0ff, 2.2), { p: [0, 0.35, 0], s: 0.1 }));
  return root;
}

function buildMage(variant) {
  let root;
  switch (variant) {
    case 'sprite': root = buildSprite(); break;
    case 'imp': root = buildImp(); break;
    case 'arcane': root = buildArcane(); break;
    case 'witch': root = robedMage({ robe: 0xe8572a, trim: 0xffc83a, skin: 0xffd4b0, hat: 'witch', hatColor: 0x3a1a4a, band: 0xff8a2a, orb: 0xff7a1a, iris: 0x2a7a2a, brow: 0x6a2a10 }); break;
    case 'sage': root = robedMage({ robe: 0x3a8ae0, trim: 0xe6f6ff, skin: 0xffd8c0, hat: 'wizard', hatColor: 0x2a6ac0, band: 0xe6f6ff, orb: 0x9ae6ff, topper: 'crystal', beard: 0xffffff, iris: 0x2a5ab0, brow: 0xffffff }); break;
    case 'storm': root = robedMage({ robe: 0x24307a, trim: 0xffd84a, skin: 0xffd4b0, hat: 'wizard', hatColor: 0x1a2260, band: 0xffd84a, orb: 0xfff066, beard: 0xc8c8d8, iris: 0x2a2a6a, brow: 0xc8c8d8, angry: true }); break;
    case 'oracle': root = robedMage({ robe: 0x4a2a7a, trim: 0xb48cff, hat: 'hood', orb: 0xc08aff, orbit: 0xc08aff, eyes: 0xe0b0ff }); break;
    case 'star': root = robedMage({ robe: 0xf6f2ff, trim: 0xf0b830, skin: 0xffe0c8, hat: 'none', orb: 0xffe066, topper: 'star', beard: 0xffffff, halo: true, cape: 0x6a3ad0, iris: 0x3a5ad0, brow: 0xffffff }); break;
  }
  const A = new Anim(root);
  const has = (n) => !!A.rest[n];
  const opt = (n, fn) => (has(n) ? fn() : null);
  // Continuous wing flapping across a whole clip
  const flap = (n, dur, per, a, b) => {
    const times = [], vals = [];
    for (let t = 0, i = 0; t <= dur + 1e-6; t += per / 2, i++) { times.push(Math.min(t, dur)); vals.push(i % 2 ? b : a); }
    if (times[times.length - 1] < dur) { times.push(dur); vals.push(a); }
    return A.R(n, times, vals);
  };
  // Idle (2.4 s): float, breathe, robe sway, look around, blink, hat flop, orb pulse
  A.add('Idle', 2.4, [
    A.P('rig', T(2.4, 5), [[0, 0, 0], [0, 0.1, 0], [0, 0, 0], [0, 0.1, 0], [0, 0, 0]]),
    opt('body', () => A.S('body', T(2.4, 3), [1, [1.03, 0.98, 1.03], 1])),
    opt('hem', () => A.R('hem', T(2.4, 5), [[0, 0, 0.04], [0.02, 0, 0], [0, 0, -0.04], [-0.02, 0, 0], [0, 0, 0.04]])),
    opt('head', () => A.R('head', [0, 0.6, 1.2, 1.8, 2.4], [[0, 0, 0], [0.05, 0.3, 0.05], [0, 0, 0], [0.05, -0.3, -0.05], [0, 0, 0]])),
    opt('lids', () => A.S('lids', [0, 1.5, 1.58, 1.66, 2.4], [1, 1, [1, 12, 1], 1, 1])),
    opt('hatTip', () => A.R('hatTip', T(2.4, 3), [[0, 0, 0.08], [0, 0, -0.08], [0, 0, 0.08]])),
    opt('hatTip1', () => A.R('hatTip1', T(2.4, 3), [[0, 0, 0.12], [0, 0, -0.12], [0, 0, 0.12]])),
    opt('armR', () => A.R('armR', T(2.4, 3), [[0, 0, 0], [-0.12, 0, 0.04], [0, 0, 0]])),
    opt('armL', () => A.R('armL', T(2.4, 3), [[0, 0, 0], [0.08, 0, -0.04], [0, 0, 0]])),
    opt('orb', () => A.S('orb', T(1.2, 3).concat([2.4]), [1, 1.18, 1, 1])),
    opt('orbit', () => A.R('orbit', T(2.4, 5), [[0, 0, 0], [0, 1.57, 0], [0, 3.14, 0], [0, 4.71, 0], [0, 6.28, 0]])),
    opt('wingL', () => flap('wingL', 2.4, 0.3, [0, 0.6, 0], [0, -0.4, 0])),
    opt('wingR', () => flap('wingR', 2.4, 0.3, [0, -0.6, 0], [0, 0.4, 0])),
    opt('tail', () => A.R('tail', T(2.4, 3), [[0, 0.3, 0], [0, -0.3, 0], [0, 0.3, 0]])),
    opt('cape', () => A.R('cape', T(2.4, 3), [[0.05, 0, 0], [-0.03, 0, 0], [0.05, 0, 0]])),
  ]);
  // Run: glide with lean, robe and cape fluttering back
  A.add('Run', 0.7, [
    A.P('rig', T(0.7, 3), [[0, 0, 0], [0, 0.16, 0], [0, 0, 0]]),
    A.R('rig', [0, 0.7], [[0.22, 0, 0], [0.22, 0, 0]]),
    opt('hem', () => A.R('hem', T(0.7, 3), [[-0.15, 0, 0.04], [-0.22, 0, -0.04], [-0.15, 0, 0.04]])),
    opt('cape', () => A.R('cape', T(0.7, 3), [[-0.35, 0, 0], [-0.5, 0, 0], [-0.35, 0, 0]])),
    opt('armL', () => A.R('armL', [0, 0.7], [[0.5, 0, 0], [0.5, 0, 0]])),
    opt('hatTip', () => A.R('hatTip', [0, 0.7], [[0.3, 0, 0], [0.3, 0, 0]])),
    opt('wingL', () => flap('wingL', 0.7, 0.2, [0, 0.7, 0], [0, -0.5, 0])),
    opt('wingR', () => flap('wingR', 0.7, 0.2, [0, -0.7, 0], [0, 0.5, 0])),
  ]);
  // Cast (0.9 s): crouch, staff overhead with a full twirl, thrust, magic burst, recover
  const c = [0, 0.22, 0.42, 0.55, 0.9];
  A.add('Punch', 0.9, [
    A.P('rig', c, [[0, 0, 0], [0, -0.08, -0.05], [0, 0.12, 0], [0, 0.05, 0.1], [0, 0, 0]]),
    A.R('rig', c, [[0, 0, 0], [-0.15, 0, 0], [-0.1, 0, 0], [0.25, 0, 0], [0, 0, 0]]),
    opt('armR', () => A.R('armR', c, [[0, 0, 0], [-1.0, 0, 0.3], [-2.7, 0, 0.2], [-1.25, 0, -0.1], [0, 0, 0]])),
    opt('armL', () => A.R('armL', c, [[0, 0, 0], [0.3, 0, -0.2], [-0.8, 0, -0.5], [-1.4, 0, -0.2], [0, 0, 0]])),
    opt('staff', () => A.R('staff', c, [[0, 0, 0], [0.8, 1.57, 0], [2.7, 3.14, 0], [1.4, 6.28, 0], [0, 6.28, 0]])),
    opt('orb', () => A.S('orb', c, [1, 1.3, 1.7, 2.6, 1])),
    opt('head', () => A.R('head', c, [[0, 0, 0], [0.15, 0, 0], [-0.2, 0, 0], [0.1, 0, 0], [0, 0, 0]])),
    opt('hem', () => A.R('hem', c, [[0, 0, 0], [0.08, 0, 0], [-0.12, 0, 0], [-0.08, 0, 0], [0, 0, 0]])),
    opt('lids', () => A.S('lids', c, [1, 1, 1, [1, 6, 1], 1])),
  ]);
  A.add('HitReact', 0.45, [
    A.R('rig', T(0.45, 4), [[0, 0, 0], [-0.4, 0, 0.18], [0.1, 0, -0.05], [0, 0, 0]]),
    A.P('rig', T(0.45, 3), [[0, 0, 0], [0, 0.05, -0.25], [0, 0, 0]]),
    opt('head', () => A.R('head', T(0.45, 3), [[0, 0, 0], [-0.4, 0.2, 0], [0, 0, 0]])),
    opt('hatTip', () => A.R('hatTip', T(0.45, 3), [[0, 0, 0], [0.6, 0, 0.3], [0, 0, 0]])),
    opt('lids', () => A.S('lids', T(0.45, 3), [1, [1, 12, 1], 1])),
  ]);
  A.add('Death', 1.3, [
    A.R('rig', [0, 0.25, 0.9, 1.3], [[0, 0, 0], [-0.3, 0, 0.2], [0, 7, 0.3], [0, 9, 0.4]]),
    A.P('rig', [0, 0.25, 0.9, 1.3], [[0, 0, 0], [0, 0.2, -0.1], [0, 0.6, 0], [0, 0.2, 0]]),
    A.S('rig', [0, 0.9, 1.3], [1, 0.85, 0.02]),
    opt('lids', () => A.S('lids', [0, 0.2, 1.3], [1, [1, 12, 1], [1, 12, 1]])),
    opt('hat', () => A.P('hat', [0, 0.3, 0.8], [[0, 0, 0], [0.2, 0.7, 0], [0.5, 1.2, -0.2]])),
  ]);
  A.add('Dance', 1.2, [
    A.R('rig', T(1.2, 5), [[0, 0, 0], [0, 1.57, 0.08], [0, 3.14, 0], [0, 4.71, -0.08], [0, 6.28, 0]]),
    A.P('rig', T(1.2, 5), [[0, 0, 0], [0, 0.35, 0], [0, 0, 0], [0, 0.35, 0], [0, 0, 0]]),
    opt('armR', () => A.R('armR', T(1.2, 3), [[-2.7, 0, 0.2], [-2.3, 0, 0.4], [-2.7, 0, 0.2]])),
    opt('armL', () => A.R('armL', T(1.2, 3), [[-2.0, 0, -0.4], [-2.6, 0, -0.2], [-2.0, 0, -0.4]])),
    opt('orb', () => A.S('orb', T(0.6, 3).concat([1.2]), [1, 1.5, 1, 1])),
    opt('hatTip', () => A.R('hatTip', T(0.6, 3).concat([1.2]), [[0, 0, 0.3], [0, 0, -0.3], [0, 0, 0.3], [0, 0, 0.3]])),
  ]);
  return { scene: root, animations: A.clips };
}

// ---------------------------------------------------------------- Public builder
export function buildCreature(name) {
  const def = PROC[name];
  if (!def) throw new Error('Unknown creature ' + name);
  switch (def.kind) {
    case 'slime': return buildSlime(def.variant);
    case 'golem': return buildGolem(def.variant);
    case 'snowman': return buildSnowman();
    case 'cactus': return buildCactus();
    case 'bat': return buildBat(def.variant);
    case 'wisp': return buildWisp(def.variant);
    case 'pumpkin': return buildPumpkin();
    case 'mage': return buildMage(def.variant);
    case 'eternus': return buildEternus();
    case 'voidknight': return buildVoidKnight();
  }
  throw new Error('No builder for ' + def.kind);
}

// Static props reuse some creature parts
export function snowmanProp() { return buildSnowman().scene; }
export function cactusProp() { return buildCactus().scene; }
