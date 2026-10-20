/** Player growth, decline, generation (GDD 6) */
import type { PhysKey, Position, TechKey } from '../types.ts';
import { Rng } from '../rng.ts';
import { ID_SEQ, makePlayer, ovr, OVR_WEIGHT, PHYS_KEYS, TECH_SET } from '../player.ts';
import { startingSkills } from '../skills.ts';
import { ageBracket, GRADE_RANGE, gradeOf, RULES } from './rules.ts';
import type { Grade, GrowthType, Pro } from './types.ts';

/**
 * GDD 6.4 training focus (Julius 2026-10-17). The season's GP is split over the targeted stats,
 * so fewer targets grow faster: integrated 8 stats ×1, physical / skill 4 stats ×2, one stat ×8.
 * "skill" = the position's 4 technique stats.
 */
export type TrainMode = 'integrated' | 'physical' | 'skill' | { focus: PhysKey | TechKey };

const sumOf = (p: Pro, keys: (PhysKey | TechKey)[], phys: boolean) =>
  keys.reduce((a, k) => a + (phys ? p.phys[k as PhysKey] : p.tech[k as TechKey]), 0);

/** GDD 6.4 — extra GP needed when a stat runs ahead of the lowest in its group */
function gapCost(v: number, min: number): number {
  const r = v / Math.max(1, min);
  if (r >= 3) return 3;
  if (r >= 2.5) return 2.5;
  if (r >= 2) return 2;
  if (r >= 1.5) return 1.5;
  return 1;
}

/**
 * Imbalance brake (Julius 2026-10-17 "성장속도를 더 늦춰줘"): measured against the category average instead of
 * the lowest stat, so a focused stat slows down early. 10% above average ×1.5, 20% ×2, 30% ×3.
 * (GDD 6.4 `gapCost` against the lowest stat let one season of focus take a stat from 76 to 99.)
 */
function avgBrake(v: number, avg: number): number {
  const r = v / Math.max(1, avg);
  if (r >= 1.3) return 3;
  if (r >= 1.2) return 2;
  if (r >= 1.1) return 1.5;
  return 1;
}

type Target = { phys: boolean; k: PhysKey | TechKey };

function targetsOf(p: Pro, mode: TrainMode): Target[] {
  const phys = PHYS_KEYS.map(k => ({ phys: true, k }));
  const tech = TECH_SET[p.position].map(k => ({ phys: false, k }));
  if (mode === 'physical') return phys;
  if (mode === 'skill') return tech;
  if (mode === 'integrated') return [...phys, ...tech];
  const f = mode.focus;
  return [{ phys: (PHYS_KEYS as string[]).includes(f), k: f }];
}

/**
 * Spend GP on the targeted stats. Each stat takes a share proportional to its current value,
 * so a player grows along her own stat shape instead of always filling the lowest stat.
 * GDD 6.4 cost (stat ÷ lowest in its category ≥ 1.5 → ×1.5 … ≥ 3 → ×3) is the brake on lopsided growth.
 * Category sums stay under 4 × that category's potential (GDD 6.3); GP that can't be used there
 * spills over to integrated training so it is not lost.
 */
/** `cat` scales what each GP buys in physical / skill stats (physical and skill coaches) */
export function spendGP(p: Pro, gp: number, mode: TrainMode, cat = { phys: 1, tech: 1 }) {
  const techSet = TECH_SET[p.position];
  const val = (t: Target) => (t.phys ? p.phys[t.k as PhysKey] : p.tech[t.k as TechKey]);
  const add = (t: Target, d: number) => {
    if (t.phys) p.phys[t.k as PhysKey] = Math.min(99, p.phys[t.k as PhysKey] + d);
    else p.tech[t.k as TechKey] = Math.min(99, p.tech[t.k as TechKey] + d);
  };
  const chunk = 0.5;
  let targets = targetsOf(p, mode);
  for (let guard = 0; gp > 0.01 && guard < 2000; guard++) {
    const room = (phys: boolean) => phys ? 4 * p.potPhys - sumOf(p, PHYS_KEYS, true) : 4 * p.potTech - sumOf(p, techSet, false);
    const open = targets.filter(t => room(t.phys) > 0 && val(t) < 99);
    if (open.length === 0) {
      if (targets.length === 8) return; // everything capped
      targets = targetsOf(p, 'integrated');
      continue;
    }
    const use = Math.min(chunk, gp);
    const total = open.reduce((a, t) => a + val(t), 0);
    const physAvg = PHYS_KEYS.reduce((a, k) => a + p.phys[k], 0) / 4;
    const techAvg = techSet.reduce((a, k) => a + p.tech[k], 0) / 4;
    for (const t of open) {
      const share = use * val(t) / total;
      const gain = Math.min(share * (t.phys ? cat.phys : cat.tech) / avgBrake(val(t), t.phys ? physAvg : techAvg), room(t.phys));
      if (gain > 0) add(t, gain);
    }
    gp -= use;
  }
}

export function seasonGP(p: Pro, trainingMult: number): number {
  return RULES.baseGP[p.potGrade] * RULES.growthScale * RULES.ageMult[p.growth][ageBracket(p.age)] * trainingMult;
}

/** GDD 6.5 — yearly decline, physical ×1.5 and technique ×0.5 */
export function applyDecline(p: Pro) {
  const [start, r1, r2] = RULES.decline[p.growth];
  if (p.age < start) return;
  const ovrDrop = p.age >= start + 3 ? r2 : r1;
  const [wp, wt] = OVR_WEIGHT[p.position];
  const x = ovrDrop / (1.5 * wp + 0.5 * wt);
  for (const k of PHYS_KEYS) p.phys[k] = Math.max(1, p.phys[k] - 1.5 * x);
  for (const k of TECH_SET[p.position]) p.tech[k] = Math.max(1, p.tech[k] - 0.5 * x);
}

export function pickGrowth(rng: Rng): GrowthType {
  const m = RULES.growthMix;
  return rng.pickWeighted(['early', 'normal', 'late', 'elite'] as GrowthType[], [m.early, m.normal, m.late, m.elite]);
}

/** AI clubs and the default for the player's squad: integrated training (GDD 6.4) */
export function trainModeFor(p: Pro): TrainMode {
  return p.train ?? 'integrated'; // web app: the player's own plan
}

/**
 * A 19-year-old with potential P, then fast-forwarded with average growth and
 * decline to `age`, so generated veterans follow the same curves as real careers.
 */
export function makePro(rng: Rng, position: Position, potential: number, age: number, growth?: GrowthType): Pro {
  const g = growth ?? pickGrowth(rng);
  const P = Math.max(30, Math.min(99, potential));
  const spreadP = () => Math.max(25, Math.min(99, P + Math.max(-10, Math.min(10, rng.normal(0, 5)))));
  const potPhys = spreadP();
  const potTech = Math.max(25, Math.min(99, 2 * P - potPhys + rng.normal(0, 2)));
  const base = makePlayer(rng, position, P * RULES.startRatio[g]);
  const proSeq = ++ID_SEQ.pro;
  const p: Pro = {
    ...base,
    id: `r${proSeq}`,
    name: `${position}-${proSeq}`,
    age: 19, growth: g, potGrade: gradeOf(P) as Grade, potPhys, potTech,
    salary: 0, contract: 0, injured: 0, foreign: false, clubId: -1,
    peakOvr: 0, peakAge: 19, segGames: 0, segPlayed: 0,
  };
  // starting stats must respect the potential caps too
  clampToPotential(p);
  while (p.age < age) {
    spendGP(p, seasonGP(p, RULES.genGrowthMult) * rng.normal(1, 0.15), trainModeFor(p));
    p.age++;
    applyDecline(p);
  }
  notePeak(p);
  p.skills = startingSkills(rng, ovr(p), position);
  return p;
}

export function clampToPotential(p: Pro) {
  const scale = (keys: (PhysKey | TechKey)[], phys: boolean, cap: number) => {
    const s = sumOf(p, keys, phys);
    if (s <= cap) return;
    const f = cap / s;
    for (const k of keys) {
      if (phys) p.phys[k as PhysKey] *= f; else p.tech[k as TechKey] *= f;
    }
  };
  scale(PHYS_KEYS, true, 4 * p.potPhys);
  scale(TECH_SET[p.position], false, 4 * p.potTech);
}

export function notePeak(p: Pro) {
  const o = ovr(p);
  if (o > p.peakOvr) { p.peakOvr = o; p.peakAge = p.age; }
}

export function potentialFromGrade(rng: Rng, g: Grade): number {
  const [lo, hi] = GRADE_RANGE[g];
  return rng.int(lo, hi);
}
