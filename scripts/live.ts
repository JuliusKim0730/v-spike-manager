/**
 * Live-match check: side 0 is steered through matchSteps like the web app does.
 *   node --experimental-strip-types --no-warnings scripts/live.ts [matches]
 */
import { Rng } from '../src/engine/rng.ts';
import { makePlayer, makeTeam } from '../src/engine/player.ts';
import { matchSteps, playMatch } from '../src/engine/match.ts';
import { advise, aiCoach, basicCoach } from '../src/engine/coach.ts';
import type { Coach, MatchResult, Position, Tactic, Team } from '../src/engine/types.ts';

const N = Number(process.argv[2] ?? 600);
const BENCH: Position[] = ['S', 'OH', 'OH', 'MB', 'MB', 'OP', 'L'];
function team(rng: Rng, name: string, o: number, tac: Partial<Tactic> = {}): Team {
  const t = makeTeam(rng, name, o, tac);
  t.bench = BENCH.map((pos, i) => makePlayer(rng, pos, o - 4, `${name}-b${i}`));
  return t;
}
const reset = (t: Team) => { for (const p of [...t.lineup, t.libero, ...t.bench!]) { p.energy = 100; p.sense = 55; p.condition = 55; } };

function live(A: Team, B: Team, seed: number, follow: boolean, stats: { breaks: number; tto: number; oppChanges: number }): MatchResult {
  const g = matchSteps([A, B], { seed, log: true, manual: 0, coaches: [undefined, aiCoach] });
  let run = 0;
  let r = g.next();
  while (!r.done) {
    const e = r.value;
    if (e.type === 'point') {
      run = e.winner === 1 ? run + 1 : 0;
      r = g.next({ timeout: follow && run >= 3 });
    } else {
      stats.breaks++;
      if (e.kind === 'technical') stats.tto++;
      r = g.next(follow ? { tactic: advise(e.view, e.oppTactic).tactic } : {});
      run = 0;
    }
  }
  stats.oppChanges += r.value.tacticChanges[1];
  return r.value;
}

const rng = new Rng(5);
let A!: Team, B!: Team;
const rows: Record<string, number> = { advice: 0, none: 0, mirrorAi: 0, basicVsAi: 0 };
const st = { breaks: 0, tto: 0, oppChanges: 0 };
let subs = 0, ttoTotal = 0;
for (let i = 0; i < N; i++) {
  if (i % 5 === 0) { A = team(rng, 'A', 70); B = team(rng, 'B', 70); }
  const seed = rng.int(1, 2 ** 31);
  reset(A); reset(B); if (live(A, B, seed, true, st).winner === 0) rows.advice++;
  reset(A); reset(B); if (live(A, B, seed, false, { breaks: 0, tto: 0, oppChanges: 0 }).winner === 0) rows.none++;
  reset(A); reset(B);
  const m = playMatch([A, B], { seed, coaches: [aiCoach, aiCoach] as [Coach, Coach] });
  if (m.winner === 0) rows.mirrorAi++;
  subs += m.subs[0] + m.subs[1]; ttoTotal += m.technicalTimeouts;
  reset(A); reset(B); if (playMatch([A, B], { seed, coaches: [basicCoach, aiCoach] }).winner === 0) rows.basicVsAi++;
}
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(12), (100 * v / N).toFixed(1) + '%');
console.log('per match: breaks', (st.breaks / N).toFixed(1), 'TTO', (st.tto / N).toFixed(1), 'AI tactic changes', (st.oppChanges / N).toFixed(1), 'AI-vs-AI subs', (subs / N).toFixed(1), 'TTO', (ttoTotal / N).toFixed(1));

// one sample log
reset(A); reset(B);
const one = live(A, B, 42, true, { breaks: 0, tto: 0, oppChanges: 0 });
console.log(one.log.filter(l => !l.startsWith('§') && (l.includes('작전') || l.includes('교체') || l.includes('테크니컬') || l.includes('세트') || l.includes('페이크') || l.includes('투 어택') || l.includes('목적타'))).slice(0, 40).join('\n'));
