/** Build the 24-club world (GDD 2, 4, 11, 12) */
import type { Position } from '../types.ts';
import { Rng } from '../rng.ts';
import { ovr } from '../player.ts';
import { makePro } from './growth.ts';
import { RULES } from './rules.ts';
import { askingSalary } from './contract.ts';
import type { Club, Facility, Personality, Pro, World } from './types.ts';

/** Potential distribution for generated (non-draft) players per division */
export const WORLD_POT: [number, number][] = [[80, 6], [61, 6], [49, 6]];

const POS_POOL: Position[] = ['S', 'OP', 'OH', 'MB', 'L'];

export function rosterPositions(rng: Rng): Position[] {
  const out: Position[] = [];
  for (const [pos, n] of Object.entries(RULES.minByPos)) for (let i = 0; i < n; i++) out.push(pos as Position);
  // the rest is random — some clubs end up with five liberos and two setters (GDD 4)
  while (out.length < RULES.rosterSize) out.push(rng.pickWeighted(POS_POOL, [1, 1, 2, 2, 1]));
  return out;
}

export function randomAge(rng: Rng): number {
  return rng.pickWeighted([19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
    [5, 6, 7, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4, 3, 2, 1]);
}

export function signPro(club: Club, p: Pro, rng: Rng) {
  p.clubId = club.id;
  p.salary = askingSalary(p);
  p.contract = rng.int(1, 3);
  club.roster.push(p);
}

export function createWorld(seed: number): World {
  const rng = new Rng(seed);
  const clubs: Club[] = [];
  const personalities: Personality[] = ['invest', 'balanced', 'saver'];
  for (let d = 0 as 0 | 1 | 2; d < 3; d = (d + 1) as 0 | 1 | 2) {
    for (let i = 0; i < 8; i++) {
      const id = d * 8 + i;
      const [fLo, fHi] = RULES.facilityStart[d];
      const [aLo, aHi] = RULES.analysisStart[d];
      const lvl = () => Math.max(0, Math.min(5, rng.int(fLo, fHi)));
      const facilities: Record<Facility, number> = {
        stadium: lvl(), training: lvl(), medical: lvl(), restaurant: lvl(), bus: lvl(), analysis: rng.int(aLo, aHi), scout: 0,
      };
      facilities.scout = facilities.analysis; // scout center (2026-10-20) starts like the analysis room, no extra draw
      const club: Club = {
        id, name: `${['1부', '2부', '3부'][d]}-${i + 1}`, division: d,
        budgetFactor: 1 + (rng.next() * 2 - 1) * RULES.budgetSpread,
        personality: personalities[rng.int(0, 2)],
        roster: [], facilities,
        fans: RULES.startFans[d] * (0.8 + rng.next() * 0.4),
        cash: 0, deficitStreak: 0,
        wins: 0, losses: 0, points: 0, setsWon: 0, setsLost: 0, streak: 0, injuries: 0,
        income: 0, expense: 0, balancePct: 0, transferNet: 0, forcedSales: 0, parachute: 0, lastRank: i + 1,
      };
      const [m, sd] = WORLD_POT[d];
      for (const pos of rosterPositions(rng)) {
        const p = makePro(rng, pos, Math.round(rng.normal(m, sd)), randomAge(rng));
        signPro(club, p, rng);
      }
      clubs.push(club);
    }
  }
  return { year: 1, clubs, freeAgents: [], retired: [], history: [] };
}

/** Relegated clubs keep part of the upper division's budget for a season (parachute) */
export const budgetOf = (c: Club) => {
  const own = RULES.baseBudget[c.division] * c.budgetFactor;
  if (c.parachute <= 0 || c.division === 0) return own;
  return Math.max(own, RULES.parachuteShare * RULES.baseBudget[c.division - 1] * c.budgetFactor);
};
export const payroll = (c: Club) => c.roster.reduce((a, p) => a + p.salary, 0);
