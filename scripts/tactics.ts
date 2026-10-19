/**
 * Tactic matchups for evenly matched mirrored rosters (A's win rate).
 *   node --experimental-strip-types --no-warnings scripts/tactics.ts [matches]
 */
import { Rng } from '../src/engine/rng.ts';
import { DEFAULT_TACTIC, makeTeam } from '../src/engine/player.ts';
import { playMatch } from '../src/engine/match.ts';
import type { Tactic, Team } from '../src/engine/types.ts';

const N = Number(process.argv[2] ?? 1000);
const ONLY = process.argv[3];

function mirror(t: Team, tac: Partial<Tactic>): Team {
  const c: Team = structuredClone(t);
  c.name = 'B';
  for (const p of [...c.lineup, c.libero]) p.id = 'B' + p.id;
  c.tactic = { ...DEFAULT_TACTIC, ...tac };
  return c;
}
const reset = (t: Team) => { for (const p of [...t.lineup, t.libero]) { p.energy = 100; p.sense = 55; p.condition = 55; } };

export function winRate(a: Partial<Tactic>, b: Partial<Tactic>, n = N, ovrA = 70, ovrB = 70, seed = 23): number {
  const rng = new Rng(seed);
  let w = 0;
  let A!: Team, B!: Team;
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) {
      A = makeTeam(rng, 'A', ovrA, a);
      B = ovrA === ovrB ? mirror(A, b) : makeTeam(rng, 'B', ovrB, b);
    }
    reset(A); reset(B);
    const flip = i % 2 === 1;
    const r = playMatch(flip ? [B, A] : [A, B], { seed: rng.int(1, 2 ** 31) });
    if (r.winner === (flip ? 1 : 0)) w++;
  }
  return 100 * w / n;
}

const T: [string, Partial<Tactic>, Partial<Tactic>, string][] = [
  ['목적타:공격수 겨냥 vs 기본', { aim: 'hitter' }, {}, '45~55'],
  ['목적타:틈 vs 기본(3인)', { aim: 'seam' }, {}, '40~50'],
  ['목적타:짧은 서브 vs 기본', { aim: 'short' }, {}, '45~55'],
  ['속공 페이크 vs 기본(따라가기)', { trick: 'decoy' }, {}, '42~52'],
  ['세터 투어택 vs 기본(강타 대비)', { trick: 'dump' }, {}, '48~56'],
  ['[상성] 공격수 겨냥 vs 레프트 중심', { aim: 'hitter' }, { distribution: 'left' }, '55~63'],
  ['[역] 공격수 겨냥 vs 라이트 집중', { aim: 'hitter' }, { distribution: 'right' }, '40~50'],
  ['[상성] 틈 vs 2인 리시브', { aim: 'seam' }, { reception: 2 }, '57~65'],
  ['[상성] 짧은 서브 vs 중앙 활용', { aim: 'short' }, { distribution: 'middle' }, '55~63'],
  ['[상성] 짧은 서브 vs 빠른 공', { aim: 'short' }, { tempo: 'fast' }, '53~60'],
  ['[상성] 속공 페이크 vs 예측 블록', { trick: 'decoy' }, { block: 'commit' }, '57~65'],
  ['[상성] 속공 페이크 vs 에이스 마크', { trick: 'decoy' }, { block: 'aceMark' }, '52~60'],
  ['[역] 세터 투어택 vs 연타 대비', { trick: 'dump' }, { defense: 'tip' }, '38~46'],
  ['[상성] 연타 대비 vs 세터 투어택', { defense: 'tip' }, { trick: 'dump' }, '54~62'],
  ['(기존) 강서브 vs 2인 리시브', { serve: 'power' }, { reception: 2 }, '57~65'],
  ['(기존) 예측 블록 vs 중앙 활용', { block: 'commit' }, { distribution: 'middle' }, '57~65'],
  ['(기존) 미러', {}, {}, '48~52'],
];
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [label, a, b, target] of T) {
    if (ONLY && !label.includes(ONLY)) continue;
    console.log(label.padEnd(34) + `${winRate(a, b).toFixed(1)}%`.padStart(8) + `   목표 ${target}`);
  }
  // stats beat tactics: the countered side with +4 OVR
  console.log('[능력치] 예측 블록(74) vs 속공 페이크(70)'.padEnd(34) + `${winRate({ block: 'commit' }, { trick: 'decoy' }, N, 74, 70).toFixed(1)}%`.padStart(8));
  console.log('[능력치] 2인 리시브(74) vs 틈(70)'.padEnd(34) + `${winRate({ reception: 2 }, { aim: 'seam' }, N, 74, 70).toFixed(1)}%`.padStart(8));
}
