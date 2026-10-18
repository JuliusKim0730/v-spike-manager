/**
 * Coaches for in-match decisions (GDD 7.3). The player decides through the UI;
 * these stand in for AI clubs and for measuring how much good coaching is worth.
 */
import type { Coach, CoachView, Player, Tactic } from './types.ts';
import { ovr } from './player.ts';

/** Swap tired starters for a rested reserve of the same position who is not much worse */
function tiredSwaps(v: CoachView): [number | 'L', Player][] {
  const out: [number | 'L', Player][] = [];
  const bench = [...(v.me.bench ?? [])];
  const slots: [number | 'L', Player][] = [...v.me.lineup.map((p, i) => [i, p] as [number, Player]), ['L', v.me.libero]];
  for (const [slot, p] of slots) {
    if (p.energy >= 45) continue;
    const r = bench.filter(b => b.position === p.position && b.energy > p.energy + 20 && ovr(b) >= ovr(p) - 6)
      .sort((a, b) => ovr(b) - ovr(a))[0];
    if (!r) continue;
    bench.splice(bench.indexOf(r), 1);
    out.push([slot, r]);
  }
  return out;
}

/** Read the match so far and pick the counter (what a good player would do) */
export function readGame(v: CoachView): Partial<Tactic> {
  const o = v.oppAttacks, t = v.opp.tactic, r = v.myRecv;
  const change: Partial<Tactic> = {};
  if (o.total >= 12) {
    // shares measured with sim: MB ≈ 0.11 normally, 0.24 under middle; OP ≈ 0.37, 0.52 under right
    if (o.MB / o.total >= 0.18) change.block = 'commit';
    else if (o.OP / o.total >= 0.45) change.block = 'aceMark';
    else change.block = 'read';
  }
  // reception formation and tempo are visible from the bench
  change.serve = t.reception === 2 || t.tempo === 'fast' ? 'power' : 'target';
  const received = r.A + r.B + r.C + r.aced;
  if (received >= 10) change.reception = (r.C + r.aced) / received > 0.35 ? 3 : v.me.tactic.reception;
  return change;
}

/** AI default: timeouts to stop runs and fresh legs, no tactical reading */
export const basicCoach: Coach = {
  wantsTimeout: v => v.oppRun >= 4,
  substitutions: tiredSwaps,
};

/** A player who reads the game: counters between sets and in timeouts, timeouts at a 3-point run */
export const smartCoach: Coach = {
  betweenSets: readGame,
  wantsTimeout: v => v.oppRun >= 3,
  inTimeout: readGame,
  substitutions: tiredSwaps,
};
