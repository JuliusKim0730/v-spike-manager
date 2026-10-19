import type { Player, Position, PhysKey, TechKey, Team, Tactic } from './types.ts';
import { Rng } from './rng.ts';
import { CFG } from './config.ts';

export const PHYS_KEYS: PhysKey[] = ['jump', 'stamina', 'agility', 'flexibility'];
export const TECH_KEYS: TechKey[] = ['spike', 'backAttack', 'quick', 'block', 'serve', 'receive', 'dig', 'set', 'positioning'];

/** GDD 5.2 — each position's 4 technique stats */
export const TECH_SET: Record<Position, TechKey[]> = {
  OH: ['spike', 'receive', 'dig', 'serve'],
  OP: ['spike', 'backAttack', 'block', 'serve'],
  MB: ['quick', 'block', 'spike', 'serve'],
  S: ['set', 'serve', 'block', 'dig'],
  L: ['receive', 'dig', 'set', 'positioning'],
};

/** GDD 5.2 — physical / technique weight in OVR */
export const OVR_WEIGHT: Record<Position, [number, number]> = {
  OH: [0.4, 0.6], OP: [0.45, 0.55], MB: [0.5, 0.5], S: [0.3, 0.7], L: [0.35, 0.65],
};

const HEIGHT: Record<Position, [number, number]> = {
  OH: [180, 5], OP: [182, 5], MB: [186, 4], S: [175, 5], L: [168, 5],
};

/** Secondary techs a position still uses a bit even though they are off its set */
const SECONDARY: Partial<Record<Position, Partial<Record<TechKey, number>>>> = {
  OH: { backAttack: 0.85, block: 0.8 },
  OP: { dig: 0.7, receive: 0.6 },
  MB: { dig: 0.55 },
  S: { receive: 0.5 },
};

export function physScore(p: Player): number {
  return Math.floor(PHYS_KEYS.reduce((a, k) => a + p.phys[k], 0) / 4);
}

export function techScore(p: Player, pos: Position = p.position): number {
  return Math.floor(TECH_SET[pos].reduce((a, k) => a + p.tech[k], 0) / 4);
}

export function ovr(p: Player, pos: Position = p.position): number {
  const [wp, wt] = OVR_WEIGHT[pos];
  return Math.floor(physScore(p) * wp + techScore(p, pos) * wt);
}

export function grade(v: number): string {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  return 'F';
}

const clamp = (v: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

/** id counters live in one object so a save can restore them (web app) */
export const ID_SEQ = { player: 0, pro: 0 };
export function makePlayer(rng: Rng, position: Position, target: number, name?: string): Player {
  const phys = {} as Record<PhysKey, number>;
  const tech = {} as Record<TechKey, number>;
  for (const k of PHYS_KEYS) phys[k] = clamp(rng.normal(target, 6));
  const set = TECH_SET[position];
  const sec = SECONDARY[position] ?? {};
  for (const k of TECH_KEYS) {
    if (set.includes(k)) tech[k] = clamp(rng.normal(target, 6));
    else if (sec[k]) tech[k] = clamp(target * sec[k]! + rng.normal(0, 5));
    else tech[k] = clamp(target * (0.4 + rng.next() * 0.3));
  }
  const [hm, hs] = HEIGHT[position];
  const seq = ++ID_SEQ.player;
  return {
    id: `p${seq}`,
    name: name ?? `${position}${seq}`,
    position,
    height: Math.round(rng.normal(hm, hs)),
    phys, tech,
    skills: [],
    sense: 55, condition: 55, energy: 100,
  };
}

export const DEFAULT_TACTIC: Tactic = {
  distribution: 'balanced', tempo: 'high', serve: 'target', block: 'read', defense: 'deep', reception: 3, aim: 'weak', trick: 'none',
};

export function makeTeam(rng: Rng, name: string, target: number, tactic: Partial<Tactic> = {}): Team {
  const order: Position[] = ['S', 'OH', 'MB', 'OP', 'OH', 'MB'];
  const lineup = order.map((pos, i) => makePlayer(rng, pos, target, `${name}-${pos}${i}`));
  return {
    name,
    lineup,
    libero: makePlayer(rng, 'L', target, `${name}-L`),
    tactic: { ...DEFAULT_TACTIC, ...tactic },
  };
}

export function teamOvr(t: Team): number {
  const all = [...t.lineup, t.libero];
  return all.reduce((a, p) => a + ovr(p), 0) / all.length;
}

// ── effective stats in a match ──

export function gaugeMul(p: Player): number {
  let m = 1;
  if (p.sense >= CFG.senseUpAt) m *= CFG.gaugeUp;
  else if (p.sense < CFG.senseDownBelow) m *= CFG.gaugeDown;
  if (p.condition >= CFG.condUpAt) m *= CFG.gaugeUp;
  else if (p.condition < CFG.condDownBelow) m *= CFG.gaugeDown;
  if (p.energy < CFG.fatiguePenaltyBelow) m *= 1 - (CFG.fatiguePenaltyBelow - p.energy) * CFG.fatiguePenaltyPerPoint;
  return m;
}

export function techEff(p: Player, k: TechKey): number { return p.tech[k] * gaugeMul(p); }
export function physEff(p: Player, k: PhysKey): number { return p.phys[k] * gaugeMul(p); }
