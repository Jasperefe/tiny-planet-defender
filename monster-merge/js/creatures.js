// Procedural monsters built entirely in code: meshes plus keyframe animations
// (Idle, Run, Punch, HitReact, Death, Dance) so they plug into the same AnimationMixer
// as the glTF monsters. Every creature faces +Z and stands on y = 0.

import * as THREE from 'three';

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
  }
  throw new Error('No builder for ' + def.kind);
}

// Static props reuse some creature parts
export function snowmanProp() { return buildSnowman().scene; }
export function cactusProp() { return buildCactus().scene; }
