/**
 * What a player asks to be paid (Julius 2026-10-16):
 * OVR (grade) × age × stat total (all-round ability) × owned skill grades × young-potential premium.
 */
import { ovr, PHYS_KEYS, TECH_KEYS } from '../player.ts';
import { SKILL_BY_ID } from '../skills.ts';
import { RULES } from './rules.ts';
import type { Pro } from './types.ts';

/** Rookie deals are cheap, prime years cost most, veterans take a cut */
export function ageFactor(age: number): number {
  if (age <= 21) return 0.75;
  if (age <= 23) return 0.9;
  if (age <= 25) return 1.0;
  if (age <= 29) return 1.1;
  if (age <= 31) return 1.0;
  if (age <= 33) return 0.85;
  return 0.7;
}

/**
 * Sum of all 13 stats compared with what a player of this OVR usually has.
 * Generated players: median ratio 0.815, 5–95% range 0.76–0.88 → about ±12% on the ask.
 * Players who are good beyond their position (multi-position value) ask more, one-dimensional ones less.
 */
export function totalFactor(p: Pro): number {
  const o = Math.max(1, ovr(p));
  const total = PHYS_KEYS.reduce((a, k) => a + p.phys[k], 0) + TECH_KEYS.reduce((a, k) => a + p.tech[k], 0);
  const ratio = total / (13 * o);
  return Math.max(0.88, Math.min(1.15, 1 + (ratio - 0.815) * 2.0));
}

export const SKILL_PREMIUM = { S: 0.10, A: 0.05, B: 0.025, C: 0.01 }; // Julius 2026-10-16: cut so the price matches the in-match effect

export function skillFactor(p: Pro): number {
  return p.skills.reduce((m, id) => {
    const s = SKILL_BY_ID.get(id);
    return s ? m * (1 + SKILL_PREMIUM[s.grade]) : m;
  }, 1);
}

/** Young players with room to grow ask a little extra */
export function potentialFactor(p: Pro): number {
  if (p.age > 24) return 1;
  return 1 + Math.max(0, (p.potPhys + p.potTech) / 2 - ovr(p)) / 100;
}

export function askingSalary(p: Pro): number {
  return RULES.salary(ovr(p)) * ageFactor(p.age) * totalFactor(p) * skillFactor(p) * potentialFactor(p);
}

/** Breakdown for the contract screen */
export function salaryBreakdown(p: Pro) {
  return {
    base: RULES.salary(ovr(p)), age: ageFactor(p.age), total: totalFactor(p),
    skills: skillFactor(p), potential: potentialFactor(p), ask: askingSalary(p),
  };
}
