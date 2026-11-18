// VOIDLORD ETERNUS, the Last Monarch: final boss of level 150.
// Built entirely in code: black void-crystal body with glowing cracks, a living
// eye in his chest, horned helm with a floating star crown, a space cape,
// a giant scythe, two floating spectral hands, a rune ring and orbiting shards.
// Faces +Z, floats above y = 0. Clips: Idle, Run, Punch, HitReact, Death, Dance.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const rnd = (() => { let s = 150; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

// ---------------------------------------------------------------- Textures
let crackTex = null, starTex = null;
function cracks() {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.lineCap = 'round';
  const branch = (x, y, a, len, w, depth) => {
    for (let i = 0; i < len; i++) {
      const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny; a += (rnd() - 0.5) * 0.9; w = Math.max(0.8, w * 0.96);
      if (depth < 3 && rnd() < 0.09) branch(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), len * 0.5, w * 0.7, depth + 1);
    }
  };
  g.shadowColor = '#fff'; g.shadowBlur = 10; g.strokeStyle = '#fff';
  for (let i = 0; i < 16; i++) branch(rnd() * 512, rnd() * 512, rnd() * TAU, 18 + rnd() * 24, 4, 0);
  crackTex = new THREE.CanvasTexture(c);
  crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping;
  crackTex.colorSpace = THREE.SRGBColorSpace;
  return crackTex;
}
function starfield() {
  if (starTex) return starTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#2a0f5a'); gr.addColorStop(0.5, '#140838'); gr.addColorStop(1, '#3a0a4a');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
  // Nebula clouds
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 256, y = rnd() * 512, r = 40 + rnd() * 70;
    const n = g.createRadialGradient(x, y, 0, x, y, r);
    const col = ['255,60,200', '120,80,255', '60,160,255'][i % 3];
    n.addColorStop(0, `rgba(${col},0.35)`); n.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = n; g.fillRect(0, 0, 256, 512);
  }
  for (let i = 0; i < 260; i++) {
    const s = rnd() < 0.08 ? 2.4 : 1;
    g.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`;
    g.beginPath(); g.arc(rnd() * 256, rnd() * 512, s * (0.6 + rnd()), 0, TAU); g.fill();
  }
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

// ---------------------------------------------------------------- Materials
function mats() {
  const crack = cracks();
  const out = {
    obsidian: new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: 0.3, metalness: 0.25, emissive: 0xb04cff, emissiveMap: crack, emissiveIntensity: 1.6, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1230, roughness: 0.35, metalness: 0.2, flatShading: true }),
    robe: new THREE.MeshStandardMaterial({ color: 0x2a1648, roughness: 0.55, emissive: 0x8a2cff, emissiveMap: crack, emissiveIntensity: 1.1, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc8c0ec, roughness: 0.22, metalness: 0.6, emissive: 0x6a3cff, emissiveMap: crack, emissiveIntensity: 1.2, flatShading: true }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf2b640, roughness: 0.28, metalness: 0.75, emissive: 0x6a3a00, emissiveIntensity: 0.35 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xd88aff, emissive: 0xc35cff, emissiveIntensity: 2.4, roughness: 0.3 }),
    hot: new THREE.MeshStandardMaterial({ color: 0xff6ad8, emissive: 0xff2ad0, emissiveIntensity: 2.6, roughness: 0.3 }),
    crown: new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffb020, emissiveIntensity: 1.8, roughness: 0.3 }),
    spectral: new THREE.MeshStandardMaterial({ color: 0x8a5cff, emissive: 0x6a3cff, emissiveIntensity: 1.5, roughness: 0.35, transparent: true, opacity: 0.82 }),
    cape: new THREE.MeshStandardMaterial({ map: starfield(), emissive: 0xffffff, emissiveMap: starfield(), emissiveIntensity: 0.55, roughness: 0.8, side: THREE.DoubleSide }),
  };
  out.robe.userData.keepSide = true; out.cape.userData.keepSide = true;
  // Crack glow strength, used when his phase changes the crack color
  out.obsidian.userData.crack = 1.6; out.robe.userData.crack = 1.1; out.steel.userData.crack = 1.2;
  return out;
}

// ---------------------------------------------------------------- Geometry helpers
function M(g, m, o = {}) {
  const mesh = new THREE.Mesh(g, m);
  if (o.p) mesh.position.set(...o.p);
  if (o.r) mesh.rotation.set(...o.r);
  if (o.s !== undefined) Array.isArray(o.s) ? mesh.scale.set(...o.s) : mesh.scale.setScalar(o.s);
  mesh.castShadow = true;
  return mesh;
}
function G(name, p = [0, 0, 0], r = [0, 0, 0]) {
  const g = new THREE.Group(); g.name = name; g.position.set(...p); g.rotation.set(...r); return g;
}
// A tube that narrows to a point: horns, claws, scythe tip
function taper(points, r0, seg = 24, rad = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((v) => new THREE.Vector3(...v)));
  const g = new THREE.TubeGeometry(curve, seg, r0, rad, false);
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let j = 0; j <= seg; j++) {
    curve.getPointAt(j / seg, c);
    const k = Math.max(0.02, 1 - j / seg);
    for (let i = 0; i <= rad; i++) {
      const idx = j * (rad + 1) + i;
      v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c);
      p.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
function star5() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.42 : 1;
    i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  g.center(); return g;
}
// Crescent scythe blade in the XY plane, pointing -X from the shaft
function bladeGeo(scale = 1, depth = 0.08) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-0.6, 0.55, -1.6, 0.45, -2.3, -0.35);
  s.bezierCurveTo(-1.55, 0.05, -0.7, -0.05, 0, -0.32);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 18 });
  g.translate(0, 0, -depth / 2); g.scale(scale, scale, 1);
  return g;
}
// Robe skirt: flares out and ends in jagged crystal shards (no legs, he floats)
function skirtGeo() {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.55 + Math.pow(t, 1.6) * 0.75, 1.6 - t * 1.6)); }
  const g = new THREE.LatheGeometry(pts, 48);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), t = 1 - v.y / 1.6;
    const fold = 1 + 0.06 * Math.sin(a * 11) * t;
    const jag = t > 0.92 ? (Math.abs(Math.sin(a * 7.5)) * 0.45 + 0.1 * Math.sin(a * 23)) : 0;
    p.setXYZ(i, v.x * fold, v.y - jag, v.z * fold);
  }
  g.computeVertexNormals();
  return g;
}
// Space cape: hangs from the shoulders, curls back, tattered bottom
function capeGeo() {
  const w = 2.3, h = 3.1, g = new THREE.PlaneGeometry(w, h, 16, 20);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (h / 2 - v.y) / h; // 0 top, 1 bottom
    const x = v.x * (0.62 + t * 0.55);
    const z = -0.15 - t * t * 0.9 - 0.18 * Math.cos((v.x / w) * Math.PI) + 0.1 * Math.sin(v.x * 5) * t;
    const tear = t > 0.86 ? (Math.abs(Math.sin(v.x * 6.5)) * 0.4) : 0;
    p.setXYZ(i, x, -t * h + tear, z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- Builder
export function buildEternus() {
  const m = mats();
  const root = new THREE.Group();
  const rig = G('rig', [0, 0.35, 0]);
  root.add(rig);

  // Orbiting void shards around the waist
  const shards = G('shards', [0, 1.1, 0]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, r = 1.75 + (i % 2) * 0.25;
    shards.add(M(new THREE.OctahedronGeometry(1, 0), i % 3 ? m.glow : m.hot, { p: [Math.cos(a) * r, (i % 3) * 0.35, Math.sin(a) * r], r: [rnd(), rnd(), rnd()], s: [0.11, 0.26, 0.11] }));
  }
  rig.add(shards);

  // Skirt with jagged crystal hem, gold belt with a skull-gem
  const body = G('body', [0, 0, 0]);
  rig.add(body);
  body.add(M(skirtGeo(), m.robe, { p: [0, 0, 0] }));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    body.add(M(new THREE.ConeGeometry(1, 1, 5), m.obsidian, { p: [Math.cos(a) * 1.18, -0.05, Math.sin(a) * 1.18], r: [Math.PI + Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], s: [0.12, 0.55 + (i % 3) * 0.2, 0.12] }));
  }
  body.add(M(new THREE.TorusGeometry(0.62, 0.09, 10, 36), m.gold, { p: [0, 1.62, 0], r: [Math.PI / 2, 0, 0] }));
  body.add(M(new THREE.OctahedronGeometry(1, 0), m.hot, { p: [0, 1.6, 0.68], s: [0.13, 0.17, 0.08] }));

  // Torso: faceted void crystal, broad and V-shaped
  const torso = G('torso', [0, 2.25, 0]);
  body.add(torso);
  torso.add(M(new THREE.IcosahedronGeometry(1, 1), m.obsidian, { s: [1.0, 0.82, 0.68] }));
  torso.add(M(new THREE.IcosahedronGeometry(1, 0), m.dark, { p: [0, -0.48, 0.05], s: [0.62, 0.45, 0.5] }));
  // Gold ribs framing the chest eye
  for (const x of [-1, 1]) torso.add(M(new THREE.TorusGeometry(0.62, 0.045, 6, 20, Math.PI * 0.75), m.gold, { p: [x * 0.06, 0, 0.42], r: [0, x * 0.35, x > 0 ? -0.4 : Math.PI + 0.4], s: 1 }));

  // The living chest eye (changes color with his element)
  const eye = G('chestEye', [0, 0.02, 0.6]);
  torso.add(eye);
  eye.add(M(new THREE.TorusGeometry(0.34, 0.08, 10, 30), m.gold));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; eye.add(M(new THREE.ConeGeometry(1, 1, 4), m.gold, { p: [Math.cos(a) * 0.46, Math.sin(a) * 0.46, -0.02], r: [0, 0, a - Math.PI / 2], s: [0.05, 0.16, 0.05] })); }
  const eyeBall = new THREE.MeshStandardMaterial({ color: 0xff7af0, emissive: 0xff2ad0, emissiveIntensity: 2.2, roughness: 0.15 });
  eyeBall.name = 'eternusEye';
  eye.add(M(new THREE.SphereGeometry(0.3, 24, 18), eyeBall, { s: [1, 1, 0.55] }));
  const iris = G('eyeIris', [0, 0, 0.14]);
  iris.add(M(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffd040, emissiveIntensity: 2.2 }), { s: [1, 1, 0.4] }));
  iris.add(M(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0x050008, roughness: 0.2 }), { p: [0, 0, 0.05], s: [0.22, 0.85, 0.3] }));
  eye.add(iris);
  const lid = G('eyeLid', [0, 0, 0.05]);
  lid.scale.set(1, 0.05, 1);
  lid.add(M(new THREE.SphereGeometry(0.32, 20, 12), m.obsidian, { s: [1, 1, 0.6] }));
  eye.add(lid);

  // Shoulders: crystal pauldrons with gold rims and spikes
  for (const x of [-1, 1]) {
    const sh = G(x < 0 ? 'padL' : 'padR', [x * 1.0, 0.55, -0.05]);
    torso.add(sh);
    sh.add(M(new THREE.IcosahedronGeometry(1, 1), m.obsidian, { s: [0.5, 0.36, 0.46] }));
    sh.add(M(new THREE.TorusGeometry(0.44, 0.05, 8, 26), m.gold, { p: [0, -0.08, 0], r: [Math.PI / 2, 0, 0], s: [1, 1.05, 1] }));
    for (let i = 0; i < 3; i++) sh.add(M(new THREE.ConeGeometry(1, 1, 5), i === 1 ? m.glow : m.obsidian, { p: [x * (0.1 + i * 0.13), 0.32 + (i === 1 ? 0.1 : 0), -0.1 + i * 0.08], r: [-0.2, 0, -x * (0.25 + i * 0.25)], s: [0.09, 0.55 - i * 0.1, 0.09] }));
  }

  // Head: horned helm, slit eyes, floating star crown
  const head = G('head', [0, 1.02, 0.05]);
  head.scale.setScalar(1.18);
  torso.add(head);
  head.add(M(new THREE.IcosahedronGeometry(1, 1), m.obsidian, { s: [0.42, 0.5, 0.44] }));
  head.add(M(new THREE.ConeGeometry(1, 1, 6), m.dark, { p: [0, -0.32, 0.18], r: [Math.PI + 0.35, 0, 0], s: [0.24, 0.42, 0.18] }));
  head.add(M(new THREE.BoxGeometry(1, 1, 1), m.gold, { p: [0, 0.2, 0.38], r: [0.2, 0, 0], s: [0.06, 0.3, 0.06] }));
  const eyes = G('eyes', [0, 0.04, 0.38]);
  head.add(eyes);
  for (const x of [-1, 1]) {
    eyes.add(M(new THREE.BoxGeometry(1, 1, 1), m.hot, { p: [x * 0.15, 0, 0], r: [0, x * 0.25, x * 0.32], s: [0.2, 0.05, 0.05] }));
    eyes.add(M(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7ae8, transparent: true, opacity: 0.35, depthWrite: false }), { p: [x * 0.15, 0, 0.02], s: [0.2, 0.08, 0.04] }));
  }
  for (const x of [-1, 1]) {
    head.add(M(taper([[0, 0, 0], [x * 0.35, 0.22, -0.05], [x * 0.55, 0.65, -0.2], [x * 0.42, 1.05, -0.45], [x * 0.18, 1.2, -0.6]], 0.12), m.obsidian, { p: [x * 0.32, 0.18, -0.02] }));
    head.add(M(taper([[0, 0, 0], [x * 0.2, 0.05, -0.1], [x * 0.38, 0.25, -0.35]], 0.06, 12, 6), m.gold, { p: [x * 0.36, -0.05, -0.05] }));
  }
  const crown = G('crown', [0, 0.78, -0.08], [-0.15, 0, 0]);
  head.add(crown);
  crown.add(M(new THREE.TorusGeometry(0.46, 0.035, 8, 40), m.crown, { r: [Math.PI / 2, 0, 0] }));
  const st = star5();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    crown.add(M(st, m.crown, { p: [Math.cos(a) * 0.46, 0.14 + (i % 2) * 0.08, Math.sin(a) * 0.46], r: [0, -a + Math.PI / 2, 0], s: i % 2 ? 0.1 : 0.14 }));
  }

  // Cape of living space, hung from the shoulders
  const cape = G('cape', [0, 0.62, -0.38], [0.08, 0, 0]);
  torso.add(cape);
  cape.add(M(capeGeo(), m.cape));
  cape.add(M(new THREE.TorusGeometry(0.75, 0.06, 6, 20, Math.PI), m.gold, { p: [0, 0.02, 0.05], r: [Math.PI / 2 + 0.2, 0, Math.PI], s: [1, 0.55, 1] }));

  // Rune ring floating behind him
  const ring = G('runeRing', [0, 2.45, -1.15], [0.05, 0, 0]);
  body.add(ring);
  ring.add(M(new THREE.TorusGeometry(1.75, 0.035, 8, 80), m.glow));
  ring.add(M(new THREE.TorusGeometry(1.95, 0.02, 6, 80), m.crown));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ring.add(M(new THREE.OctahedronGeometry(1, 0), i % 3 ? m.glow : m.crown, { p: [Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0], r: [0, 0, a], s: [0.06, 0.15, 0.04] }));
  }

  // Arms (2 attached): right holds the scythe, left is a clawed casting hand
  const claw = (side, mat) => {
    const h = new THREE.Group();
    h.add(M(new THREE.IcosahedronGeometry(1, 0), m.obsidian, { s: [0.2, 0.17, 0.16] }));
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.08;
      h.add(M(taper([[0, 0, 0], [0, -0.14, 0.06], [0, -0.26, 0.02], [0, -0.32, -0.06]], 0.045, 10, 6), mat, { p: [x, -0.1, 0.06] }));
    }
    h.add(M(taper([[0, 0, 0], [side * 0.12, -0.05, 0.08], [side * 0.16, -0.15, 0.12]], 0.05, 8, 6), mat, { p: [side * 0.14, -0.02, 0.04] }));
    return h;
  };
  const arm = (x) => {
    const a = G(x < 0 ? 'armL' : 'armR', [x * 1.2, 0.4, 0], [0, 0, x * 0.32]);
    torso.add(a);
    a.add(M(new THREE.CapsuleGeometry(0.2, 0.55, 4, 10), m.dark, { p: [0, -0.35, 0] }));
    a.add(M(new THREE.TorusGeometry(0.22, 0.05, 6, 16), m.gold, { p: [0, -0.68, 0], r: [Math.PI / 2, 0, 0] }));
    const fore = G(x < 0 ? 'foreL' : 'foreR', [0, -0.72, 0], [-0.5, 0, 0]);
    a.add(fore);
    fore.add(M(new THREE.CylinderGeometry(0.17, 0.25, 0.7, 7), m.obsidian, { p: [0, -0.35, 0] }));
    for (let i = 0; i < 2; i++) fore.add(M(new THREE.ConeGeometry(1, 1, 4), m.glow, { p: [x * 0.2, -0.2 - i * 0.25, -0.05], r: [0, 0, -x * 1.2], s: [0.05, 0.25, 0.05] }));
    const hand = G(x < 0 ? 'handL' : 'handR', [0, -0.78, 0]);
    hand.add(claw(x, m.obsidian));
    fore.add(hand);
    return { a, fore, hand };
  };
  arm(-1);
  const R = arm(1);
  // Left hand holds a crackling void flame
  const flame = G('flame', [0, -0.42, 0.12]);
  root.getObjectByName('handL').add(flame);
  flame.add(M(new THREE.SphereGeometry(0.17, 16, 12), m.hot));
  flame.add(M(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5ae0, transparent: true, opacity: 0.3, depthWrite: false })));

  // The scythe: twisted shaft, gold bands, crescent blade with a hot edge
  const scythe = G('scythe', [0, 0.95, 0.05], [0.3, 0, -0.1]);
  R.hand.add(scythe);
  scythe.add(M(taper([[0, -1.6, 0], [0.04, -0.6, 0.03], [-0.03, 0.6, -0.02], [0, 1.9, 0]].reverse(), 0.07, 30, 8), m.dark, {}));
  scythe.add(M(new THREE.CylinderGeometry(0.06, 0.06, 3.5, 8), m.dark, { p: [0, 0.15, 0] }));
  for (const y of [-1.4, -0.2, 1.2, 1.75]) scythe.add(M(new THREE.TorusGeometry(0.08, 0.03, 6, 14), m.gold, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }));
  const head2 = G('bladeHead', [0, 1.85, 0], [0, Math.PI - 0.5, 0.15]);
  scythe.add(head2);
  head2.add(M(new THREE.IcosahedronGeometry(1, 0), m.gold, { s: [0.16, 0.2, 0.16] }));
  head2.add(M(new THREE.OctahedronGeometry(1, 0), m.hot, { p: [0, 0, 0.14], s: [0.08, 0.11, 0.05] }));
  head2.add(M(bladeGeo(1.25, 0.07), m.steel, { p: [-0.05, 0.05, 0] }));
  const edge = M(bladeGeo(1.3, 0.03), m.hot, { p: [-0.02, -0.02, 0] });
  edge.scale.set(1.0, 1.0, 1); head2.add(edge);
  head2.add(M(taper([[0, 0, 0], [0.25, 0.35, 0], [0.2, 0.6, 0]], 0.06, 10, 6), m.gold, { p: [0.05, 0.1, 0] }));
  head2.add(M(taper([[0, 0, 0], [0.35, -0.15, 0], [0.55, -0.45, 0]], 0.05, 10, 6), m.obsidian, { p: [0.05, -0.1, 0] }));

  // Two floating spectral hands that cast spells
  for (const x of [-1, 1]) {
    const fh = G(x < 0 ? 'floatL' : 'floatR', [x * 2.15, 1.55, 0.55], [0.3, 0, x * 0.4]);
    body.add(fh);
    const h = claw(x, m.spectral);
    h.traverse((o) => { if (o.isMesh) o.material = m.spectral; });
    h.rotation.set(Math.PI, 0, 0);
    h.scale.setScalar(1.25);
    fh.add(h);
    const orb = G(x < 0 ? 'orbL' : 'orbR', [0, 0.32, 0.1]);
    fh.add(orb);
    const col = x < 0 ? 0x3dff8a : 0xff8a1a;
    orb.add(M(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.4, flatShading: true })));
    orb.add(M(new THREE.TorusGeometry(0.25, 0.015, 6, 30), new THREE.MeshBasicMaterial({ color: col }), { r: [1.1, 0.4, 0] }));
    orb.add(M(new THREE.TorusGeometry(0.25, 0.015, 6, 30), new THREE.MeshBasicMaterial({ color: col }), { r: [-0.4, 1.2, 0] }));
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return { scene: root, animations: clips(root) };
}

// ---------------------------------------------------------------- Animations
class Anim {
  constructor(root) {
    this.rest = {};
    root.traverse((o) => { if (o.name) this.rest[o.name] = { p: o.position.toArray(), r: [o.rotation.x, o.rotation.y, o.rotation.z], s: o.scale.toArray() }; });
    this.clips = [];
  }
  P(n, t, offs) { const b = this.rest[n].p; return new THREE.VectorKeyframeTrack(`${n}.position`, t, offs.flatMap((o) => [b[0] + o[0], b[1] + o[1], b[2] + o[2]])); }
  R(n, t, offs) {
    const b = this.rest[n].r, q = new THREE.Quaternion(), e = new THREE.Euler(), out = [];
    for (const o of offs) { q.setFromEuler(e.set(b[0] + o[0], b[1] + o[1], b[2] + o[2])); out.push(q.x, q.y, q.z, q.w); }
    return new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, t, out);
  }
  S(n, t, ks) { const b = this.rest[n].s; return new THREE.VectorKeyframeTrack(`${n}.scale`, t, ks.flatMap((k) => (Array.isArray(k) ? [b[0] * k[0], b[1] * k[1], b[2] * k[2]] : [b[0] * k, b[1] * k, b[2] * k]))); }
  add(name, d, tracks) { this.clips.push(new THREE.AnimationClip(name, d, tracks)); }
}
const T = (d, n) => Array.from({ length: n }, (_, i) => (d * i) / (n - 1));
const spin = (A, n, d, axis, turns = 1) => A.R(n, T(d, 5), [0, 1, 2, 3, 4].map((i) => { const v = [0, 0, 0]; v[axis] = (i / 4) * TAU * turns; return v; }));

function clips(root) {
  const A = new Anim(root);
  // Idle (3.2 s): slow float, breathing, crown and rings turning, eye looking around and blinking, hands weaving spells
  A.add('Idle', 3.2, [
    A.P('rig', T(3.2, 5), [[0, 0, 0], [0, 0.18, 0], [0, 0, 0], [0, 0.18, 0], [0, 0, 0]]),
    A.S('torso', T(3.2, 3), [1, [1.03, 1.02, 1.03], 1]),
    A.R('head', [0, 0.8, 1.6, 2.4, 3.2], [[0, 0, 0], [0.08, 0.25, 0], [0, 0, 0], [0.08, -0.25, 0], [0, 0, 0]]),
    A.P('eyeIris', [0, 0.7, 1.4, 2.2, 3.2], [[0, 0, 0], [0.07, 0.03, 0], [0, 0, 0], [-0.07, -0.02, 0], [0, 0, 0]]),
    A.S('eyeLid', [0, 2.0, 2.1, 2.2, 3.2], [1, 1, [1, 20, 1], 1, 1]),
    spin(A, 'crown', 3.2, 1),
    spin(A, 'shards', 3.2, 1),
    spin(A, 'runeRing', 3.2, 2, -0.5),
    A.R('cape', T(3.2, 3), [[0, 0, 0], [-0.08, 0, 0.03], [0, 0, 0]]),
    A.R('armR', T(3.2, 3), [[0, 0, 0], [-0.08, 0, 0.04], [0, 0, 0]]),
    A.R('armL', T(3.2, 3), [[0, 0, 0], [-0.2, 0, -0.08], [0, 0, 0]]),
    A.P('floatL', T(3.2, 5), [[0, 0, 0], [0, 0.25, 0.1], [0, 0, 0], [0, -0.15, -0.05], [0, 0, 0]]),
    A.P('floatR', T(3.2, 5), [[0, 0, 0], [0, -0.15, -0.05], [0, 0, 0], [0, 0.25, 0.1], [0, 0, 0]]),
    spin(A, 'orbL', 3.2, 1, 2), spin(A, 'orbR', 3.2, 1, -2),
    A.S('flame', T(0.8, 3).concat([3.2]), [1, 1.3, 1, 1]),
  ]);
  // Run: he glides, leaning, cape streaming
  A.add('Run', 1.0, [
    A.P('rig', T(1.0, 3), [[0, 0, 0], [0, 0.2, 0], [0, 0, 0]]),
    A.R('rig', [0, 1.0], [[0.2, 0, 0], [0.2, 0, 0]]),
    A.R('cape', T(1.0, 3), [[-0.4, 0, 0], [-0.55, 0, 0], [-0.4, 0, 0]]),
    spin(A, 'shards', 1.0, 1), spin(A, 'crown', 1.0, 1),
    A.P('floatL', [0, 1.0], [[0, 0.1, -0.4], [0, 0.1, -0.4]]),
    A.P('floatR', [0, 1.0], [[0, 0.1, -0.4], [0, 0.1, -0.4]]),
  ]);
  // Punch = SCYTHE SWEEP (1.3 s): rise, scythe lifted overhead, eye flares, a huge sweep, spell hands slam
  const c = [0, 0.35, 0.6, 0.78, 1.3];
  A.add('Punch', 1.3, [
    A.P('rig', c, [[0, 0, 0], [0, 0.35, -0.2], [0, 0.45, -0.1], [0, 0.05, 0.35], [0, 0, 0]]),
    A.R('rig', c, [[0, 0, 0], [-0.18, 0.35, 0], [-0.15, 0.45, 0], [0.25, -0.55, 0], [0, 0, 0]]),
    A.R('armR', c, [[0, 0, 0], [-2.2, 0, 0.5], [-2.6, 0, 0.6], [-0.6, 0, -0.9], [0, 0, 0]]),
    A.R('foreR', c, [[0, 0, 0], [0.3, 0, 0], [0.4, 0, 0], [0.1, 0, 0], [0, 0, 0]]),
    A.R('armL', c, [[0, 0, 0], [-1.2, 0, -0.6], [-1.6, 0, -0.5], [-0.9, 0, 0.2], [0, 0, 0]]),
    A.S('chestEye', c, [1, 1.25, 1.4, 1.1, 1]),
    A.S('eyeLid', c, [1, 1, 1, [1, 6, 1], 1]),
    A.P('floatL', c, [[0, 0, 0], [0, 0.9, -0.2], [0, 1.0, -0.2], [0.5, -0.6, 0.9], [0, 0, 0]]),
    A.P('floatR', c, [[0, 0, 0], [0, 0.9, -0.2], [0, 1.0, -0.2], [-0.5, -0.6, 0.9], [0, 0, 0]]),
    A.S('orbL', c, [1, 1.6, 2, 2.6, 1]), A.S('orbR', c, [1, 1.6, 2, 2.6, 1]),
    A.R('cape', c, [[0, 0, 0], [0.2, 0, 0], [0.25, 0, 0], [-0.45, 0, 0], [0, 0, 0]]),
    A.R('head', c, [[0, 0, 0], [-0.2, 0, 0], [-0.25, 0, 0], [0.2, 0, 0], [0, 0, 0]]),
  ]);
  A.add('HitReact', 0.5, [
    A.R('rig', T(0.5, 4), [[0, 0, 0], [-0.25, 0, 0.1], [0.06, 0, -0.03], [0, 0, 0]]),
    A.P('rig', T(0.5, 3), [[0, 0, 0], [0, 0.05, -0.25], [0, 0, 0]]),
    A.S('eyeLid', T(0.5, 3), [1, [1, 20, 1], 1]),
    A.R('head', T(0.5, 3), [[0, 0, 0], [-0.3, 0.15, 0], [0, 0, 0]]),
  ]);
  // Death (3 s): the crown drops, he cracks, spins and implodes into the void
  A.add('Death', 3.0, [
    A.P('rig', [0, 0.6, 1.8, 2.6, 3.0], [[0, 0, 0], [0, 0.6, 0], [0, 1.4, 0], [0, 1.5, 0], [0, 1.5, 0]]),
    A.R('rig', [0, 0.6, 1.8, 2.6, 3.0], [[0, 0, 0], [-0.4, 0, 0.1], [0, 6, 0.2], [0, 14, 0.3], [0, 16, 0.3]]),
    A.S('rig', [0, 0.6, 1.8, 2.5, 3.0], [1, 1.08, 1.0, 0.25, 0.01]),
    A.P('crown', [0, 0.5, 1.5], [[0, 0, 0], [0, 0.5, 0], [0.4, -2.5, 0.4]]),
    A.S('chestEye', [0, 0.6, 1.4, 1.8], [1, 1.6, 2.2, 0.1]),
    A.S('eyeLid', [0, 1.5, 1.8], [1, 1, [1, 20, 1]]),
    A.S('runeRing', [0, 1.2, 2.0], [1, 1.4, 0.01]),
  ]);
  // Dance = VICTORY: arms wide, scythe raised, laughing shake
  A.add('Dance', 1.6, [
    A.P('rig', T(1.6, 5), [[0, 0, 0], [0, 0.3, 0], [0, 0.2, 0], [0, 0.3, 0], [0, 0, 0]]),
    A.R('armR', T(1.6, 3), [[-2.6, 0, 0.5], [-2.9, 0, 0.3], [-2.6, 0, 0.5]]),
    A.R('armL', T(1.6, 3), [[-1.8, 0, -0.9], [-2.2, 0, -0.7], [-1.8, 0, -0.9]]),
    A.R('head', T(1.6, 9), [[-0.3, 0, 0], [-0.2, 0, 0.08], [-0.3, 0, 0], [-0.2, 0, -0.08], [-0.3, 0, 0], [-0.2, 0, 0.08], [-0.3, 0, 0], [-0.2, 0, -0.08], [-0.3, 0, 0]]),
    A.S('torso', T(1.6, 9), [1, 1.04, 1, 1.04, 1, 1.04, 1, 1.04, 1]),
    spin(A, 'crown', 1.6, 1, 2),
    A.P('floatL', T(1.6, 3), [[0, 1.0, 0], [0, 1.3, 0], [0, 1.0, 0]]),
    A.P('floatR', T(1.6, 3), [[0, 1.0, 0], [0, 1.3, 0], [0, 1.0, 0]]),
  ]);
  return A.clips;
}

// Phase recolor: 0 King (magenta), 1 Summoner (cyan), 2 Devourer (blood red)
export const ETERNUS_PHASES = [
  { eye: 0xff2ad0, crack: 0xb04cff, name: 'THE KING' },
  { eye: 0x2ad8ff, crack: 0x3a8aff, name: 'THE SUMMONER' },
  { eye: 0xff2a2a, crack: 0xff3a1a, name: 'THE DEVOURER' },
];
export function setEternusPhase(root, phase) {
  const p = ETERNUS_PHASES[phase] || ETERNUS_PHASES[0];
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh || done.has(o.material)) return;
    const mt = o.material; done.add(mt);
    if (mt.name === 'eternusEye') { mt.emissive.setHex(p.eye); mt.color.setHex(p.eye).lerp(new THREE.Color(0xffffff), 0.25); }
    else if (mt.emissiveMap) mt.emissive.setHex(p.crack);
  });
}

// ================================================================ VOID KNIGHT (Eternus' Royal Guard)
// Tall armored knight of black void crystal: horned great-helm with a glowing visor,
// layered pauldrons, a tower shield with a burning rune and a long crystal halberd.
export function buildVoidKnight() {
  const m = mats();
  const root = new THREE.Group();
  const rig = G('rig', [0, 0, 0]);
  root.add(rig);
  const plate = new THREE.MeshStandardMaterial({ color: 0x2c2244, roughness: 0.3, metalness: 0.35, emissive: 0x8a3cff, emissiveMap: cracks(), emissiveIntensity: 0.9, flatShading: true });
  const visor = new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x3ad0ff, emissiveIntensity: 2.6 });
  // Legs
  for (const x of [-1, 1]) {
    const leg = G(x < 0 ? 'legL' : 'legR', [x * 0.28, 1.05, 0]);
    rig.add(leg);
    leg.add(M(new THREE.CylinderGeometry(0.17, 0.14, 0.6, 7), m.dark, { p: [0, -0.3, 0] }));
    leg.add(M(new THREE.IcosahedronGeometry(1, 0), plate, { p: [0, -0.6, 0.06], s: [0.17, 0.15, 0.17] }));
    leg.add(M(new THREE.CylinderGeometry(0.18, 0.15, 0.48, 7), plate, { p: [0, -0.85, 0] }));
    leg.add(M(new THREE.BoxGeometry(1, 1, 1), m.dark, { p: [0, -1.04, 0.08], s: [0.28, 0.14, 0.44] }));
    leg.add(M(new THREE.ConeGeometry(1, 1, 4), m.gold, { p: [0, -1.04, 0.33], r: [Math.PI / 2, 0, 0], s: [0.08, 0.16, 0.06] }));
  }
  // Hips, skirt of plates
  const body = G('body', [0, 1.05, 0]);
  rig.add(body);
  body.add(M(new THREE.CylinderGeometry(0.42, 0.36, 0.3, 8), m.dark, { p: [0, 0.05, 0] }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26;
    body.add(M(new THREE.BoxGeometry(1, 1, 1), plate, { p: [Math.sin(a) * 0.42, -0.12, Math.cos(a) * 0.42], r: [Math.cos(a) * 0.25, a, -Math.sin(a) * 0.25], s: [0.3, 0.42, 0.06] }));
  }
  // Chest: broad crystal cuirass with a gold rib and a core gem
  const chest = G('chest', [0, 0.62, 0]);
  body.add(chest);
  chest.add(M(new THREE.IcosahedronGeometry(1, 1), plate, { s: [0.62, 0.5, 0.42] }));
  chest.add(M(new THREE.TorusGeometry(0.42, 0.04, 6, 24, Math.PI), m.gold, { p: [0, -0.05, 0.22], r: [0, 0, Math.PI], s: [1, 0.7, 1] }));
  chest.add(M(new THREE.OctahedronGeometry(1, 0), visor, { p: [0, 0.05, 0.4], s: [0.09, 0.13, 0.05] }));
  // Pauldrons
  for (const x of [-1, 1]) {
    const p = G(x < 0 ? 'padL' : 'padR', [x * 0.62, 0.28, 0]);
    chest.add(p);
    p.add(M(new THREE.SphereGeometry(1, 10, 8, 0, TAU, 0, Math.PI / 2), plate, { s: [0.3, 0.26, 0.3], r: [0, 0, -x * 0.35] }));
    p.add(M(new THREE.SphereGeometry(1, 10, 8, 0, TAU, 0, Math.PI / 2), m.dark, { p: [x * 0.05, -0.08, 0], s: [0.33, 0.22, 0.32], r: [0, 0, -x * 0.5] }));
    p.add(M(new THREE.ConeGeometry(1, 1, 5), m.glow, { p: [x * 0.1, 0.24, 0], r: [0, 0, -x * 0.5], s: [0.06, 0.3, 0.06] }));
  }
  // Head: great-helm with a T visor and swept horns, small plume of void flame
  const head = G('head', [0, 0.62, 0.02]);
  chest.add(head);
  head.add(M(new THREE.CylinderGeometry(0.24, 0.27, 0.48, 8), plate, { p: [0, 0.05, 0] }));
  head.add(M(new THREE.SphereGeometry(0.24, 10, 8, 0, TAU, 0, Math.PI / 2), plate, { p: [0, 0.29, 0] }));
  head.add(M(new THREE.BoxGeometry(1, 1, 1), visor, { p: [0, 0.1, 0.25], s: [0.32, 0.05, 0.04] }));
  head.add(M(new THREE.BoxGeometry(1, 1, 1), visor, { p: [0, -0.02, 0.26], s: [0.05, 0.22, 0.04] }));
  head.add(M(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7ae0ff, transparent: true, opacity: 0.3, depthWrite: false }), { p: [0, 0.1, 0.26], s: [0.3, 0.08, 0.04] }));
  for (const x of [-1, 1]) head.add(M(taper([[0, 0, 0], [x * 0.22, 0.05, -0.05], [x * 0.38, 0.28, -0.15], [x * 0.36, 0.5, -0.3]], 0.065, 14, 6), m.obsidian, { p: [x * 0.2, 0.2, 0] }));
  const plume = G('plume', [0, 0.52, -0.05]);
  head.add(plume);
  for (let i = 0; i < 3; i++) plume.add(M(new THREE.ConeGeometry(1, 1, 6), i ? m.glow : m.hot, { p: [0, 0.1 + i * 0.05, -i * 0.12], r: [-0.5 - i * 0.3, 0, 0], s: [0.07 - i * 0.015, 0.32, 0.07 - i * 0.015] }));
  // Short cape
  const cape = G('cape', [0, 0.3, -0.3], [0.1, 0, 0]);
  chest.add(cape);
  const cg = new THREE.PlaneGeometry(1.0, 1.5, 6, 8);
  { const p = cg.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const t = (0.75 - v.y) / 1.5; p.setXYZ(i, v.x * (0.8 + t * 0.4), -t * 1.5 + (t > 0.85 ? Math.abs(Math.sin(v.x * 9)) * 0.22 : 0), -0.05 - t * t * 0.3); } cg.computeVertexNormals(); }
  cape.add(M(cg, m.cape));
  // Arms
  const arm = (x) => {
    const a = G(x < 0 ? 'armL' : 'armR', [x * 0.66, 0.15, 0], [0, 0, x * 0.15]);
    chest.add(a);
    a.add(M(new THREE.CylinderGeometry(0.12, 0.1, 0.45, 7), m.dark, { p: [0, -0.22, 0] }));
    const f = G(x < 0 ? 'foreL' : 'foreR', [0, -0.46, 0], [-0.6, 0, 0]);
    a.add(f);
    f.add(M(new THREE.CylinderGeometry(0.13, 0.16, 0.42, 7), plate, { p: [0, -0.2, 0] }));
    f.add(M(new THREE.BoxGeometry(1, 1, 1), m.dark, { p: [0, -0.46, 0.02], s: [0.16, 0.14, 0.17] }));
    return f;
  };
  // Shield on the left arm: tall kite shield, gold rim, glowing eye rune
  const fl = arm(-1);
  const shield = G('shield', [-0.12, -0.3, 0.22], [0.35, 0.15, 0]);
  fl.add(shield);
  const ks = new THREE.Shape();
  ks.moveTo(0, 0.75); ks.quadraticCurveTo(0.48, 0.7, 0.45, 0.2); ks.quadraticCurveTo(0.4, -0.45, 0, -0.85); ks.quadraticCurveTo(-0.4, -0.45, -0.45, 0.2); ks.quadraticCurveTo(-0.48, 0.7, 0, 0.75);
  const shG = new THREE.ExtrudeGeometry(ks, { depth: 0.08, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 2 });
  shG.translate(0, 0, -0.04);
  shield.add(M(shG, plate));
  const rimG = new THREE.ExtrudeGeometry(ks, { depth: 0.04, bevelEnabled: false }); rimG.scale(1.08, 1.06, 1); rimG.translate(0, 0, -0.06);
  shield.add(M(rimG, m.gold));
  const rune = G('rune', [0, 0.05, 0.08]);
  shield.add(rune);
  rune.add(M(new THREE.TorusGeometry(0.2, 0.035, 8, 26), m.gold));
  rune.add(M(new THREE.SphereGeometry(0.12, 16, 12), visor, { s: [1, 0.6, 0.4] }));
  rune.add(M(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0x050008 }), { p: [0, 0, 0.03], s: [0.2, 0.5, 0.2] }));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; rune.add(M(new THREE.ConeGeometry(1, 1, 4), m.glow, { p: [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0], r: [0, 0, a - Math.PI / 2], s: [0.04, 0.12, 0.03] })); }
  // Halberd in the right hand
  const fr = arm(1);
  const hal = G('weapon', [0, -0.46, 0.05], [Math.PI / 2 - 0.25, 0, 0]);
  fr.add(hal);
  hal.add(M(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), m.dark, { p: [0, 0.5, 0] }));
  for (const y of [-0.6, 0.3, 1.5]) hal.add(M(new THREE.TorusGeometry(0.05, 0.02, 6, 12), m.gold, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }));
  hal.add(M(new THREE.OctahedronGeometry(1, 0), m.steel, { p: [0, 2.0, 0], s: [0.09, 0.32, 0.05] }));
  const axe = new THREE.Shape(); axe.moveTo(0, 0.2); axe.quadraticCurveTo(0.45, 0.35, 0.5, -0.05); axe.quadraticCurveTo(0.42, -0.35, 0, -0.25); axe.lineTo(0, 0.2);
  const axG = new THREE.ExtrudeGeometry(axe, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 1 }); axG.translate(0.03, 0, -0.02);
  hal.add(M(axG, m.steel, { p: [0, 1.65, 0] }));
  hal.add(M(new THREE.TorusGeometry(0.08, 0.025, 6, 16), visor, { p: [0.02, 1.65, 0.04] }));
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { scene: root, animations: knightClips(root) };
}

function knightClips(root) {
  const A = new Anim(root);
  A.add('Idle', 2.4, [
    A.P('rig', T(2.4, 3), [[0, 0, 0], [0, -0.03, 0], [0, 0, 0]]),
    A.S('chest', T(2.4, 3), [1, [1.03, 1.02, 1.03], 1]),
    A.R('head', T(2.4, 5), [[0, 0, 0], [0, 0.2, 0], [0, 0, 0], [0, -0.2, 0], [0, 0, 0]]),
    A.R('armR', T(2.4, 3), [[0, 0, 0], [-0.08, 0, 0], [0, 0, 0]]),
    A.R('armL', T(2.4, 3), [[0, 0, 0], [0.05, 0, 0], [0, 0, 0]]),
    A.S('rune', T(1.2, 3).concat([2.4]), [1, 1.15, 1, 1]),
    A.R('plume', T(2.4, 3), [[0, 0, 0.15], [0.1, 0, -0.15], [0, 0, 0.15]]),
    A.R('cape', T(2.4, 3), [[0, 0, 0], [-0.08, 0, 0.04], [0, 0, 0]]),
  ]);
  // March: heavy stride, shield forward
  A.add('Run', 0.8, [
    A.R('legL', T(0.8, 3), [[0.55, 0, 0], [-0.55, 0, 0], [0.55, 0, 0]]),
    A.R('legR', T(0.8, 3), [[-0.55, 0, 0], [0.55, 0, 0], [-0.55, 0, 0]]),
    A.P('rig', T(0.8, 5), [[0, 0, 0], [0, 0.07, 0], [0, 0, 0], [0, 0.07, 0], [0, 0, 0]]),
    A.R('body', T(0.8, 3), [[0.12, 0.1, 0], [0.12, -0.1, 0], [0.12, 0.1, 0]]),
    A.R('armL', [0, 0.8], [[-0.5, 0, 0], [-0.5, 0, 0]]),
    A.R('cape', T(0.8, 3), [[-0.35, 0, 0], [-0.5, 0, 0], [-0.35, 0, 0]]),
  ]);
  // Halberd chop over the shield
  const c = [0, 0.25, 0.42, 0.55, 0.9];
  A.add('Punch', 0.9, [
    A.R('armR', c, [[0, 0, 0], [-2.4, 0, 0.3], [-2.6, 0, 0.3], [-0.6, 0, 0], [0, 0, 0]]),
    A.R('foreR', c, [[0, 0, 0], [0.5, 0, 0], [0.6, 0, 0], [-0.3, 0, 0], [0, 0, 0]]),
    A.R('armL', c, [[0, 0, 0], [-0.4, 0, -0.2], [-0.5, 0, -0.2], [-0.7, 0, 0.1], [0, 0, 0]]),
    A.R('body', c, [[0, 0, 0], [-0.15, 0.3, 0], [-0.2, 0.35, 0], [0.3, -0.25, 0], [0, 0, 0]]),
    A.P('rig', c, [[0, 0, 0], [0, 0.05, -0.1], [0, 0.08, -0.12], [0, -0.05, 0.25], [0, 0, 0]]),
    A.S('rune', c, [1, 1.2, 1.4, 1.8, 1]),
  ]);
  A.add('HitReact', 0.45, [
    A.R('body', T(0.45, 3), [[0, 0, 0], [-0.3, 0, 0.12], [0, 0, 0]]),
    A.R('armL', T(0.45, 3), [[0, 0, 0], [-0.7, 0, -0.2], [0, 0, 0]]),
    A.P('rig', T(0.45, 3), [[0, 0, 0], [0, 0, -0.2], [0, 0, 0]]),
  ]);
  A.add('Death', 1.4, [
    A.R('rig', [0, 0.4, 1.0, 1.4], [[0, 0, 0], [-0.2, 0, 0.1], [-1.45, 0, 0.1], [-1.5, 0, 0.1]]),
    A.P('rig', [0, 0.4, 1.0, 1.4], [[0, 0, 0], [0, 0.1, -0.1], [0, 0.25, -0.6], [0, 0.2, -0.65]]),
    A.R('armL', [0, 0.6], [[0, 0, 0], [-0.4, 0, -1.2]]),
    A.S('rune', [0, 0.8, 1.2], [1, 1.6, 0.05]),
  ]);
  A.add('Dance', 1.2, [
    A.R('armR', T(1.2, 3), [[-2.8, 0, 0.2], [-2.5, 0, 0.3], [-2.8, 0, 0.2]]),
    A.R('armL', T(1.2, 3), [[-1.2, 0, -0.3], [-1.5, 0, -0.3], [-1.2, 0, -0.3]]),
    A.P('rig', T(1.2, 5), [[0, 0, 0], [0, 0.2, 0], [0, 0, 0], [0, 0.2, 0], [0, 0, 0]]),
  ]);
  return A.clips;
}
