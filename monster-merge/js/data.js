// Game data: monster lines, enemy roster, unit stats, economy and level generation.

// ---------------------------------------------------------------- Player merge lines
// Each line evolves through these monsters as you merge. Tiers above the list length
// reuse the last model with a bigger size and a colored aura.
export const LINES = {
  melee: {
    name: 'Brawlers',
    tiers: [
      { model: 'Blob_PinkBlob', name: 'Pinkie' },
      { model: 'Blob_GreenBlob', name: 'Glob' },
      { model: 'Blob_GreenSpikyBlob', name: 'Spikeball' },
      { model: 'Blob_Mushnub_Evolved', name: 'Shroom Chomper' },
      { model: 'Big_Frog', name: 'Toad Brute' },
      { model: 'Big_Orc', name: 'Orc Smasher' },
      { model: 'Big_Yeti', name: 'Frost Yeti' },
      { model: 'Big_Demon', name: 'Inferno Demon' },
    ],
  },
  ranged: {
    name: 'Flyers',
    tiers: [
      { model: 'Flying_Pigeon', name: 'Pidge' },
      { model: 'Flying_Glub', name: 'Glub' },
      { model: 'Flying_Glub_Evolved', name: 'Glub Lord' },
      { model: 'Flying_Armabee', name: 'Buzz' },
      { model: 'Flying_Armabee_Evolved', name: 'Buzz Knight' },
      { model: 'Flying_Ghost', name: 'Phantom' },
      { model: 'Flying_Dragon', name: 'Drake' },
      { model: 'Flying_Dragon_Evolved', name: 'Elder Dragon' },
    ],
  },
  mage: {
    name: 'Mages',
    tiers: [
      { model: 'P_Mage_Sprite', name: 'Spark Sprite' },
      { model: 'P_Mage_Imp', name: 'Crystal Imp' },
      { model: 'P_Mage_Witch', name: 'Flame Witch' },
      { model: 'P_Mage_Sage', name: 'Frost Sage' },
      { model: 'P_Mage_Storm', name: 'Storm Wizard' },
      { model: 'P_Mage_Oracle', name: 'Shadow Oracle' },
      { model: 'P_Mage_Arcane', name: 'Arcane Golem' },
      { model: 'P_Mage_Star', name: 'Star Archmage' },
    ],
  },
};
export const LINE_KEYS = ['melee', 'ranged', 'mage'];
export const MAGE_UNLOCK = 10; // level that unlocks the Mage line
export const MAX_TIER = 15;
// Levels 9+ reuse the top model with a title, an aura and (from 11) an accessory
export const TIER_TITLES = { 9: 'Golden', 10: 'Cosmic', 11: 'Mythic', 12: 'Legendary', 13: 'Divine', 14: 'Titan', 15: 'Eternal' };
export const AURA_COLORS = { 9: 0xffc93c, 10: 0xff4df0, 11: 0x3dff8a, 12: 0xff8a1a, 13: 0xfff2b0, 14: 0xff2a3a, 15: 0x8a6aff };
export const TIER_ACCESSORY = { 11: 'crown', 12: 'wings', 13: 'halo', 14: 'spikes', 15: 'stars' };
// Monster levels 11-15 unlock with your progress, so the book lasts well past level 100
export const TIER_UNLOCK = { 11: 40, 12: 60, 13: 80, 14: 100, 15: 120 };
export function tierCap(level) {
  let cap = 10;
  for (let t = 11; t <= MAX_TIER; t++) if (level >= TIER_UNLOCK[t]) cap = t;
  return cap;
}

export function tierInfo(line, tier) {
  const list = LINES[line].tiers;
  const base = list[Math.min(tier, list.length) - 1];
  const extra = tier > list.length ? tier - list.length : 0;
  const name = extra ? `${TIER_TITLES[tier]} ${base.name}` : base.name;
  return { model: base.model, name, extra };
}

// ---------------------------------------------------------------- Enemy roster by tier
export const ENEMIES = {
  1: { melee: ['Blob_Chicken', 'Blob_Cat', 'Blob_Dog'], ranged: ['Blob_Wizard'] },
  2: { melee: ['Blob_Fish', 'Blob_Birb', 'Blob_Orc'], ranged: ['Flying_Hywirl'] },
  3: { melee: ['Blob_Alien', 'Blob_Ninja'], ranged: ['Flying_Squidle'] },
  4: { melee: ['Blob_Yeti', 'Blob_Cactoro'], ranged: ['Flying_Goleling'] },
  5: { melee: ['Big_Bunny', 'Big_Birb', 'Big_Fish'], ranged: ['Flying_Goleling_Evolved'] },
  6: { melee: ['Big_Alien', 'Big_Monkroose', 'Big_Cactoro'], ranged: ['Flying_Alpaking'] },
  7: { melee: ['Big_BlueDemon', 'Big_Ninja', 'Big_Tribal'], ranged: ['Flying_Ghost_Skull', 'Flying_Tribal'] },
  8: { melee: ['Big_Dino', 'Big_Orc_Skull'], ranged: ['Flying_Alpaking_Evolved'] },
};
export const BOSSES = [
  { model: 'Big_MushroomKing', name: 'MUSHROOM KING' },
  { model: 'Big_Dino', name: 'DINO TYRANT' },
  { model: 'Big_Orc_Skull', name: 'SKULL WARLORD' },
  { model: 'Big_Tribal', name: 'TIKI TITAN' },
  { model: 'Flying_Alpaking_Evolved', name: 'SKY EMPEROR', flying: true },
];

export function enemyModel(type, tier, seed) {
  const t = Math.min(tier, 8);
  const list = ENEMIES[t][type];
  return list[seed % list.length];
}

// ---------------------------------------------------------------- Unit stats
const GROW = 2.15;
export function unitStats(type, tier) {
  const k = Math.pow(GROW, tier - 1);
  if (type === 'melee') {
    return { hp: Math.round(100 * k), dmg: Math.round(14 * k), interval: 1.0, range: 1.7, speed: 3.4 };
  }
  if (type === 'mage') {
    // Support caster: heals hurt neighbours, otherwise casts an area spell (stuns from level 5)
    return { hp: Math.round(60 * k), dmg: Math.round(9 * k), heal: Math.round(16 * k), interval: 1.6, range: 6, speed: 2.8, healRadius: 3.0, spellSplash: 1.8, stun: tier >= 5 ? 0.6 : 0 };
  }
  return { hp: Math.round(65 * k), dmg: Math.round(12 * k), interval: 1.25, range: 7.5, speed: 3.0 };
}

// Visual height of a unit by tier (world units, a board tile is 2 wide)
export function unitHeight(type, tier) {
  // Grows up to level 10, then only a little so giants still fit on a square
  const t = Math.min(tier, 8) - 1 + Math.min(2, Math.max(0, tier - 8)) * 0.1; // levels 11-15 don't grow any more
  return (type === 'melee' ? 1.9 : type === 'mage' ? 1.75 : 1.65) + 0.18 * t;
}

// ---------------------------------------------------------------- Economy
export function buyPrice(buys) {
  return Math.round(6 * Math.pow(1.055, buys));
}
export function winCoins(level) {
  return Math.round(18 * Math.pow(1.06, level - 1)) + (level % 10 === 0 ? Math.round(40 * Math.pow(1.06, level - 1)) : 0);
}
export const START_COINS = 30;

// Expected army size (in tier-1 units) of a typical player after each level,
// simulated with the same prices so difficulty tracks the economy.
export const expected = [];
(function simulate() {
  let bal = START_COINS, nm = 0, nr = 0, units = 2;
  for (let L = 1; L <= 1001; L++) {
    expected[L] = units; // army before fighting level L
    bal += winCoins(L);
    for (;;) {
      const line = nm <= nr * 1.6 ? 'm' : 'r';
      const p = buyPrice(line === 'm' ? nm : nr);
      if (bal < p) break;
      bal -= p; units++;
      if (line === 'm') nm++; else nr++;
    }
  }
})();

// ---------------------------------------------------------------- Arenas & elements
// Every 10 levels the arena changes. Each arena has its own creatures, an element twist and a boss.
export const ELEMENTS = {
  poison: { name: 'POISON', icon: 'poison', color: 0x6dff4a, css: '#5fd83a', desc: 'POISON enemies leave toxic damage over time!', short: 'Damage over time', tip: 'Kill them fast: poison stacks up to 3 times!' },
  swift: { name: 'SWIFT', icon: 'swift', color: 0xffd23a, css: '#f0b400', desc: 'SWIFT enemies run and strike much faster!', short: 'Super fast', tip: 'Strong Brawlers in front stop them reaching your Flyers.' },
  ice: { name: 'ICE', icon: 'ice', color: 0x8ad8ff, css: '#3aa8f0', desc: 'ICE enemies are tough and freeze your monsters!', short: 'Tough + freezes you', tip: 'Ice armor blocks part of every hit. Bring more damage!' },
  fire: { name: 'FIRE', icon: 'fire', color: 0xff6a1f, css: '#ff6a1f', desc: 'FIRE enemies set your monsters ablaze!', short: 'Burns you', tip: 'Burning keeps hurting for 2 seconds. Bigger monsters survive it.' },
  shadow: { name: 'SHADOW', icon: 'shadow', color: 0xb070ff, css: '#9a5aff', desc: 'SHADOW enemies hit harder and steal life!', short: 'Steals life', tip: 'They heal by hitting you. Gang up on them first!' },
};
export const ELEMENT_KEYS = Object.keys(ELEMENTS);
export const ARENAS = [
  { element: 'poison', melee: ['P_Slime_Green', 'P_Golem_Moss'], ranged: ['P_Bat_Eye'], boss: { model: 'Big_MushroomKing', name: 'MUSHROOM KING', element: 'poison' } },
  { element: 'swift', melee: ['P_Cactus', 'P_Golem_Sand'], ranged: ['P_Bat_Sand'], boss: { model: 'P_Golem_Sand', name: 'SANDSTONE COLOSSUS', element: 'swift' } },
  { element: 'ice', melee: ['P_Snowman', 'P_Golem_Ice'], ranged: ['P_Bat_Frost'], boss: { model: 'Big_Dino', name: 'FROST TYRANT', element: 'ice' } },
  { element: 'fire', melee: ['P_Golem_Lava', 'P_Slime_Lava'], ranged: ['P_Wisp_Fire'], boss: { model: 'P_Golem_Lava', name: 'MAGMA TITAN', element: 'fire' } },
  { element: 'shadow', melee: ['P_Slime_Shadow'], ranged: ['P_Pumpkin', 'P_Bat_Eye'], boss: { model: 'Big_Orc_Skull', name: 'SKULL WARLORD', element: 'shadow' } },
  { element: 'cosmic', melee: ['P_Golem_Crystal'], ranged: ['P_Wisp_Crystal'], boss: { model: 'Flying_Alpaking_Evolved', name: 'SKY EMPEROR', flying: true, element: 'cosmic' } },
];
export const arenaIndex = (level) => Math.floor((level - 1) / 10) % ARENAS.length;
export function arenaTwist(level) {
  const a = ARENAS[arenaIndex(level)];
  if (a.element === 'cosmic') return 'COSMIC enemies wield EVERY element!';
  return ELEMENTS[a.element].desc;
}

// How strong a board is, in tier-1 units
export const unitValue = (tier) => Math.pow(2, tier - 1);
export function coinUnits(coins, buys) {
  // How many tier-1 monsters these coins could buy (alternating lines)
  let n = 0, c = coins;
  const b = { melee: buys.melee || 0, ranged: buys.ranged || 0, mage: buys.mage || 0 };
  for (let i = 0; i < 400; i++) {
    const line = Object.keys(b).reduce((x, y) => (buyPrice(b[y]) < buyPrice(b[x]) ? y : x));
    const p = buyPrice(b[line]);
    if (c < p) break;
    c -= p; n++; b[line]++;
  }
  return n;
}

// Enemy army size: it grows with YOUR army, so maxing out never makes it easy.
// Level 1 is a fair fight, from level 3 the enemy is a little stronger than you.
// Final boss mode (Playgama build): hell from level 100, Voidlord Eternus at level 150.
export const HELL_FROM = 100;
export const FINAL_LEVEL = 150;
export const FINAL_K = 0.8; // sizes the Royal Guard and Eternus before the fight
// At FIGHT, Eternus and his guard are scaled to this multiple of YOUR army power, so the odds
// (about 1 win in 10 tries) are the same whatever monsters you bring.
export const FINAL_RATIO = 0.63;
export const hellK = (level) => Math.min(1.42, 1.3 + (level - HELL_FROM) * 0.0025);
export function enemyBudget(level, armyUnits, spareCoinUnits, hell = false) {
  const curve = expected[Math.min(level + 1, 1001)];
  let k = [0, 0.8, 0.95, 1.0, 1.04][level] || Math.min(1.26, 1.06 + level * 0.004);
  if (hell && level >= HELL_FROM) k = level === FINAL_LEVEL ? (globalThis.__finalK ?? FINAL_K) : hellK(level);
  const potential = armyUnits + spareCoinUnits * 0.75;
  return Math.max(2, Math.round(Math.max(curve * (level <= 3 ? 0.55 : 0.8), potential * k)));
}
// After each lost try the same enemy gets a bit weaker, so every level is passable
// Hell mode: retries help much less (5%); Eternus only gets 1% weaker per try
export const mercy = (losses, level = 1, hell = false) => {
  if (hell && level === FINAL_LEVEL) return Math.pow(0.99, Math.min(losses, 40));
  if (hell && level >= HELL_FROM) return Math.pow(0.95, Math.min(losses, 16)); // slow, but never a wall
  return Math.pow(0.92, Math.min(losses, 8));
};

// Seeded random so a level always has the same army
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Build an enemy army: up to 15 units on a 5x3 grid.
export function buildLevel(level, budgetIn, opts = {}) {
  if (opts.final && level === FINAL_LEVEL) return buildFinal(budgetIn);
  const hell = opts.final && level >= HELL_FROM;
  const r = rng(level * 7 + 3);
  const isBoss = level % 10 === 0;
  const arena = ARENAS[arenaIndex(level)];
  const cycle = Math.floor((level - 1) / (10 * ARENAS.length));
  const inArena = (level - 1) % 10;
  // Share of enemies with an element (none in the first 3 levels)
  const elemShare = hell ? 1 : level <= 3 ? 0 : Math.min(0.8, 0.25 + inArena * 0.06 + cycle * 0.2);
  // Elemental enemies are stronger, so the raw budget is trimmed a little
  let budget = Math.max(2, Math.round((budgetIn || 2) / (1 + 0.06 * elemShare)));
  const units = [];
  let boss = null;
  if (isBoss) {
    const b = arena.boss;
    const bossBudget = Math.round(budget * 0.6);
    let element = b.element;
    if (element === 'cosmic') element = ELEMENT_KEYS[Math.floor(r() * ELEMENT_KEYS.length)];
    boss = { ...b, element, budget: bossBudget };
    budget -= bossBudget;
  }
  // Binary split of the budget into tiers, then merge down to fit the grid
  let tiers = [];
  let rem = budget;
  for (let t = tierCap(level); t >= 1; t--) {
    const v = 1 << (t - 1);
    while (rem >= v && tiers.length < 40) { tiers.push(t); rem -= v; }
  }
  const maxCells = isBoss ? 9 : 15;
  const wanted = Math.min(maxCells, 3 + Math.floor(level / 3) + Math.floor(r() * 3));
  tiers.sort((a, b) => b - a);
  while (tiers.length < wanted && tiers[0] > 1) {
    const t = tiers.shift();
    tiers.push(t - 1, t - 1);
    tiers.sort((a, b) => b - a);
  }
  while (tiers.length > maxCells) {
    tiers.sort((a, b) => a - b);
    const a = tiers.shift(); const b = tiers.shift();
    tiers.push(Math.max(a, b) + (a === b ? 1 : 0));
  }
  tiers.sort((a, b) => b - a);
  const rangedShare = level < 3 ? 0.15 : 0.4;
  const hideChance = level < 6 ? 0 : Math.min(0.55, 0.2 + (level - 6) * 0.012);
  for (const t of tiers) {
    const type = r() < rangedShare ? 'ranged' : 'melee';
    const tier = Math.min(t, tierCap(level));
    const seed = Math.floor(r() * 100);
    // Arena creatures mixed with the classic enemy roster
    const roster = arena[type];
    const model = level > 1 && r() < 0.6 ? roster[seed % roster.length] : enemyModel(type, tier, seed);
    let element = null;
    if (r() < elemShare) element = arena.element === 'cosmic' ? ELEMENT_KEYS[Math.floor(r() * ELEMENT_KEYS.length)] : arena.element;
    units.push({ type, tier, seed, model, element, hidden: r() < hideChance });
  }
  // Order: front row (row 0 = closest to player) gets melee first
  units.sort((a, b) => (a.type === b.type ? b.tier - a.tier : a.type === 'melee' ? -1 : 1));
  const order = [2, 1, 3, 0, 4];
  const slots = [];
  for (let row = 0; row < 3; row++) for (const col of order) slots.push({ row, col });
  if (isBoss) {
    const taken = new Set(['0,2', '1,2', '0,1', '0,3', '1,1', '1,3']);
    const free = slots.filter((s) => !taken.has(`${s.row},${s.col}`));
    units.forEach((u, i) => Object.assign(u, free[i]));
  } else {
    units.forEach((u, i) => Object.assign(u, slots[i]));
  }
  // From level 15 the enemy's total power is sometimes a mystery, from 30 always
  const hidePower = level >= 30 || (level >= 15 && r() < 0.5);
  if (hell) for (const u of units) u.hidden = r() < 0.75;
  return { level, units, boss, hidePower, hell };
}

// Level 150: Voidlord Eternus and his Royal Guard of 4 Void Knights
export const ETERNUS = { model: 'P_Eternus', name: 'VOIDLORD ETERNUS', final: true };
export const GUARD_MODEL = 'P_VoidKnight';
function buildFinal(budgetIn) {
  const budget = Math.max(8, Math.round(budgetIn || 8));
  const bossBudget = Math.round(budget * 0.72);
  const each = (budget - bossBudget) / 4;
  const tier = Math.max(1, Math.min(MAX_TIER, Math.round(Math.log2(Math.max(1, each))) + 1));
  const units = [0, 1, 3, 4].map((col, i) => ({ type: 'melee', tier, seed: i, model: GUARD_MODEL, element: 'shadow', guard: true, hidden: true, row: 0, col }));
  return { level: FINAL_LEVEL, units, boss: { ...ETERNUS, element: null, budget: bossBudget }, hidePower: true, hell: true, final: true };
}

// Boss stats from its budget (in tier-1 melee units)
export function bossStats(budget) {
  const base = unitStats('melee', 1);
  // Merging power grows faster than linear; give the boss lots of HP and a slam
  const k = Math.pow(budget, 1.08);
  return { hp: Math.round(base.hp * k * 1.15), dmg: Math.round(base.dmg * k * 0.5), interval: 1.6, range: 2.6, speed: 2.0, splash: 2.6 };
}

// Coins you get back when selling a monster: 40% of what its tier-1 parts would cost now
export function sellValue(type, tier, buys) {
  return Math.max(2, Math.round(buyPrice(Math.max(0, buys - 1)) * Math.pow(2, tier - 1) * 0.4));
}
