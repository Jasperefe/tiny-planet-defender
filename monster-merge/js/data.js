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
};
export const MAX_TIER = 10;
export const AURA_COLORS = { 9: 0xffc93c, 10: 0xff4df0 };

export function tierInfo(line, tier) {
  const list = LINES[line].tiers;
  const base = list[Math.min(tier, list.length) - 1];
  const extra = tier > list.length ? tier - list.length : 0;
  const name = extra ? `${['', 'Golden', 'Cosmic'][extra]} ${base.name}` : base.name;
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
  return { hp: Math.round(65 * k), dmg: Math.round(12 * k), interval: 1.25, range: 7.5, speed: 3.0 };
}

// Visual height of a unit by tier (world units, a board tile is 2 wide)
export function unitHeight(type, tier) {
  return (type === 'melee' ? 1.9 : 1.65) + 0.18 * (tier - 1);
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
  for (let L = 1; L <= 120; L++) {
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

// Difficulty multiplier: gentle start, fair middle, tougher late game.
function difficulty(level) {
  if (level <= 2) return 0.45;
  if (level <= 10) return 0.6 + (level - 3) * 0.04;
  if (level <= 30) return 0.88 + (level - 10) * 0.004;
  return Math.min(1.12, 0.96 + (level - 30) * 0.0025);
}

// Seeded random so a level always has the same army
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Build an enemy army: up to 15 units on a 5x3 grid.
export function buildLevel(level) {
  const r = rng(level * 7 + 3);
  const isBoss = level % 10 === 0;
  // Army before this level, plus what the player could buy with the previous win
  let budget = Math.max(2, Math.round(expected[Math.min(level + 1, 120)] * difficulty(level)));
  if (level === 1) budget = 2;
  if (level === 2) budget = 4;
  const units = [];
  let boss = null;
  if (isBoss) {
    const b = BOSSES[(level / 10 - 1) % BOSSES.length];
    const bossBudget = Math.round(budget * 0.65);
    boss = { ...b, budget: bossBudget };
    budget -= bossBudget;
  }
  // Binary split of the budget into tiers, then merge down to fit the grid
  let tiers = [];
  let rem = budget;
  for (let t = 10; t >= 1; t--) {
    const v = 1 << (t - 1);
    while (rem >= v && tiers.length < 40) { tiers.push(t); rem -= v; }
  }
  // Spread out: split the strongest units while there is room and it adds variety
  const maxCells = isBoss ? 9 : 15;
  const wanted = Math.min(maxCells, 2 + Math.floor(level / 3) + Math.floor(r() * 3));
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
  // Place: melee in front rows, ranged at the back
  const cells = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) cells.push({ row, col });
  const rangedShare = level < 4 ? 0 : 0.35;
  for (const t of tiers) {
    const type = r() < rangedShare ? 'ranged' : 'melee';
    units.push({ type, tier: Math.min(t, MAX_TIER), seed: Math.floor(r() * 100) });
  }
  // Order: front row (row 0 = closest to player) gets melee first
  units.sort((a, b) => (a.type === b.type ? b.tier - a.tier : a.type === 'melee' ? -1 : 1));
  const order = [2, 1, 3, 0, 4];
  const slots = [];
  for (let row = 0; row < 3; row++) for (const col of order) slots.push({ row, col });
  if (isBoss) {
    // Boss takes the center of the front rows
    const taken = new Set(['0,2', '1,2', '0,1', '0,3', '1,1', '1,3']);
    const free = slots.filter((s) => !taken.has(`${s.row},${s.col}`));
    units.forEach((u, i) => Object.assign(u, free[i]));
  } else {
    units.forEach((u, i) => Object.assign(u, slots[i]));
  }
  return { level, units, boss };
}

// Boss stats from its budget (in tier-1 melee units)
export function bossStats(budget) {
  const base = unitStats('melee', 1);
  // Merging power grows faster than linear; give the boss lots of HP and a slam
  const k = Math.pow(budget, 1.08);
  return { hp: Math.round(base.hp * k * 1.15), dmg: Math.round(base.dmg * k * 0.5), interval: 1.6, range: 2.6, speed: 2.0, splash: 2.6 };
}
