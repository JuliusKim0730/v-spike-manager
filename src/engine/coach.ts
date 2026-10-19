/**
 * Coaches for in-match decisions (GDD 7.3). The player decides through the UI;
 * these stand in for AI clubs and for measuring how much good coaching is worth.
 */
import type { BreakPlan, Coach, CoachView, Player, Tactic } from './types.ts';
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

// ───────────────────────── AI clubs in a live match (Julius 2026-10-19) ─────────────────────────

type Axis = { [K in keyof Tactic]-?: Tactic[K][] };
const VALUES: Axis = {
  distribution: ['balanced', 'left', 'right', 'middle'], tempo: ['high', 'fast'], serve: ['target', 'power', 'safe'],
  aim: ['weak', 'hitter', 'seam', 'short'], block: ['read', 'commit', 'aceMark'], defense: ['deep', 'tip'],
  reception: [3, 2], trick: ['none', 'decoy', 'dump'],
};

/** A plan the AI makes up on its own: one or two axes, leaning on its own strengths */
function freshIdea(v: CoachView): Partial<Tactic> {
  const me = v.me, r = v.rand;
  const pickOf = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const out: Partial<Tactic> = {};
  const n = r() < 0.6 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const axis = pickOf(['distribution', 'tempo', 'serve', 'block', 'defense', 'trick', 'reception'] as const);
    if (axis === 'distribution') {
      // feed whoever hits hardest more often
      const [, oh1, mb1, op, oh2, mb2] = me.lineup;
      const w = { left: (oh1.tech.spike + oh2.tech.spike) / 2, right: op.tech.spike, middle: (mb1.tech.quick + mb2.tech.quick) / 2 - 4, balanced: 0 };
      w.balanced = (w.left + w.right + w.middle) / 3 + 2;
      out.distribution = (Object.keys(w) as Tactic['distribution'][]).sort((a, b) => w[b] + r() * 8 - w[a] - r() * 8)[0];
    } else if (axis === 'serve') {
      out.serve = pickOf(VALUES.serve.filter(x => x !== me.tactic.serve));
      if (out.serve === 'target') out.aim = pickOf(VALUES.aim);
    } else {
      const cur = me.tactic[axis];
      (out as Record<string, unknown>)[axis] = pickOf((VALUES[axis] as unknown[]).filter(x => x !== cur));
    }
  }
  return out;
}

function poorDay(v: CoachView, p: Player): boolean {
  const l = v.line(p);
  return l.attacks >= 6 && (l.kills / l.attacks < 0.28 || l.attackErrors + l.blocked >= l.kills);
}

/** in-set substitutions: tired or off-form players, more readily when behind */
function breakSubs(v: CoachView, behind: boolean): [number | 'L', Player][] {
  const out: [number | 'L', Player][] = [];
  const bench = [...(v.me.bench ?? [])];
  let left = v.subsLeft;
  v.me.lineup.forEach((p, i) => {
    if (left <= 0) return;
    const tired = p.energy < (behind ? 60 : 35);
    const off = behind && poorDay(v, p);
    if (!tired && !off) return;
    const r = bench.filter(b => b.position === p.position && b.energy > p.energy - (off ? 15 : -10) && ovr(b) >= ovr(p) - (behind ? 8 : 4))
      .sort((a, b) => ovr(b) - ovr(a))[0];
    if (!r) return;
    bench.splice(bench.indexOf(r), 1);
    out.push([i, r]);
    left--;
  });
  return out;
}

/**
 * AI club: a winning side mostly keeps its plan, a losing side changes it.
 * Sometimes a winning side changes too, expecting the opponent to adjust.
 * The plan is its own read of what it has seen, never the opponent's change in this same break.
 */
export const aiCoach: Coach = {
  wantsTimeout: v => v.oppRun >= 3 || (v.oppRun >= 2 && v.score[1] - v.score[0] >= 4),
  substitutions: tiredSwaps,
  atBreak(v, kind, mine) {
    const deficit = v.score[1] - v.score[0];
    const behind = kind === 'set' ? v.setsWon[0] < v.setsWon[1] || (v.setsWon[0] === v.setsWon[1] && v.rand() < 0.4) : deficit > 0;
    const p = behind ? (kind === 'set' || deficit >= 4 || mine ? 0.8 : 0.55) : kind === 'timeout' && !mine ? 0.25 : 0.12;
    const plan: BreakPlan = {};
    if (v.rand() < p) plan.tactic = v.rand() < 0.45 ? readGame(v) : freshIdea(v);
    if (kind !== 'set') plan.subs = breakSubs(v, behind);
    return plan;
  },
};

// ───────────────────────── 수석 코치 조언 ─────────────────────────

export interface AdviceNote { title: string; text: string; warn?: boolean }
export interface Advice { tactic: Partial<Tactic>; notes: AdviceNote[] }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * The assistant coach reads the opponent's tactic (what they played up to this break)
 * and proposes counters, with a warning when player quality is likely to beat the counter anyway.
 */
export function advise(v: CoachView, opp: Tactic): Advice {
  const me = v.me, them = v.opp;
  const t: Partial<Tactic> = {};
  const notes: AdviceNote[] = [];
  const [ms, moh1, mmb1, mop, , mmb2] = me.lineup;
  const [, toh1, tmb1, top, toh2, tmb2] = them.lineup;
  const spikePow = (p: Player) => 0.7 * p.tech.spike + 0.3 * p.phys.jump + (p.height - 180) * 0.6;
  const blockPow = avg([mmb1, mmb2, mop, moh1].map(p => 0.7 * p.tech.block + 0.3 * p.phys.jump + (p.height - 180) * 0.6));
  const recvRate = (v.myRecv.C + v.myRecv.aced) / Math.max(1, v.myRecv.A + v.myRecv.B + v.myRecv.C + v.myRecv.aced);
  const oppAim = opp.aim ?? 'weak', oppTrick = opp.trick ?? 'none';

  // ── block ──
  if (oppTrick === 'decoy') {
    t.block = 'read';
    notes.push({ title: '블로킹: 따라가기', text: '상대가 센터를 미끼로 띄우는 속공 페이크를 씁니다. 먼저 뛰지 말고 공을 보고 따라가면 속지 않아요.' });
  } else if (opp.distribution === 'middle') {
    t.block = 'commit';
    notes.push({ title: '블로킹: 예측', text: '상대가 중앙 속공을 자주 씁니다. 센터 속공 타이밍에 미리 뛰는 예측 블로킹이 잘 맞아요.' });
  } else if (opp.distribution === 'right' || opp.distribution === 'left') {
    t.block = 'aceMark';
    const ace = opp.distribution === 'right' ? top : (toh1.tech.spike >= toh2.tech.spike ? toh1 : toh2);
    notes.push({ title: '블로킹: 에이스 마크', text: `상대 공격이 ${opp.distribution === 'right' ? '라이트' : '레프트'}에 몰려요. ${ace.name} 선수에게 블로커를 붙이세요.` });
    if (spikePow(ace) - blockPow > 12) notes.push({ warn: true, title: '능력 차이 주의', text: `${ace.name}의 공격력이 우리 블로킹보다 한참 위입니다. 상성을 맞춰도 다 막기는 어려워요.` });
  } else {
    t.block = 'read';
    notes.push({ title: '블로킹: 따라가기', text: '상대가 고르게 때립니다. 한 곳에 걸지 말고 공을 보고 따라가는 게 안전해요.' });
  }

  // ── defense ──
  if (oppTrick === 'dump') {
    t.defense = 'tip';
    notes.push({ title: '수비: 연타 대비', text: '상대 세터가 두 번째 공을 넘기는 투 어택을 노립니다. 앞쪽 수비를 당겨 세우세요.' });
  } else if (me.tactic.defense === 'tip') t.defense = 'deep';

  // ── serve ──
  const tRecv = [toh1, toh2, them.libero];
  const theirRecv = avg(tRecv.map(p => p.tech.receive));
  const ourServe = avg(me.lineup.map(p => p.tech.serve));
  if (opp.reception === 2) {
    if (ourServe >= theirRecv + 3) { t.serve = 'power'; notes.push({ title: '서브: 강서브', text: '상대가 2인 리시브라 빈 곳이 넓어요. 우리 서브가 상대 리시브보다 좋으니 강하게 때리세요.' }); }
    else { t.serve = 'target'; t.aim = 'seam'; notes.push({ title: '서브: 목적타 · 리시버 사이 틈', text: '상대가 2인 리시브입니다. 두 리시버 사이로 넣으면 서로 미루다 흔들려요.' }); }
  } else if (opp.distribution === 'middle' || opp.tempo === 'fast') {
    t.serve = 'target'; t.aim = 'short';
    notes.push({ title: '서브: 목적타 · 짧은 서브', text: `상대가 ${opp.distribution === 'middle' ? '중앙 속공' : '빠른 공'}을 씁니다. 네트 앞에 짧게 떨어뜨리면 센터가 받느라 속공을 못 뛰어요.` });
  } else if (opp.distribution === 'left') {
    t.serve = 'target'; t.aim = 'hitter';
    notes.push({ title: '서브: 목적타 · 공격수 겨냥', text: '상대 레프트가 리시브도 하고 공격도 합니다. 그 선수에게 서브를 몰면 공격 준비가 늦어져요.' });
  } else {
    const weak = tRecv.reduce((a, b) => (b.tech.receive < a.tech.receive ? b : a));
    if (weak.tech.receive <= theirRecv - 6) {
      t.serve = 'target'; t.aim = 'weak';
      notes.push({ title: '서브: 목적타 · 약한 리시버', text: `${weak.name} 선수의 리시브가 약합니다. 그쪽으로 서브를 모으세요.` });
    }
  }

  // ── reception ──
  if (opp.serve === 'power' || (opp.serve === 'target' && (oppAim === 'seam' || oppAim === 'weak'))) {
    t.reception = 3;
    notes.push({ title: '리시브: 3인', text: `상대가 ${opp.serve === 'power' ? '강서브' : oppAim === 'seam' ? '리시버 사이 틈' : '약한 리시버'}를 노립니다. 세 명이 받아 빈 곳을 줄이세요.` });
  }

  // ── attack ──
  if (opp.block === 'commit') {
    t.trick = 'decoy';
    notes.push({ title: '세트 플레이: 속공 페이크', text: '상대 블로커가 속공에 먼저 뜁니다. 센터를 미끼로 띄우고 날개로 올리면 블로커가 속아요.' });
    if (ms.tech.set + avg([mmb1, mmb2].map(p => p.tech.quick)) < 2 * avg([tmb1, tmb2].map(p => p.tech.block)) - 10) {
      notes.push({ warn: true, title: '능력 차이 주의', text: '우리 세터·센터보다 상대 블로커가 훨씬 노련해서 페이크에 잘 안 속을 수 있어요.' });
    }
  } else if (opp.block === 'aceMark') {
    t.distribution = 'balanced';
    notes.push({ title: '공격 배분: 고르게', text: '상대가 우리 에이스를 집중 마크합니다. 다른 공격수에게 나눠 주면 빈 곳이 생겨요.' });
  } else if (opp.defense === 'deep' && ms.tech.set >= 60 && oppTrick !== 'dump') {
    t.trick = 'dump';
    notes.push({ title: '세트 플레이: 세터 투 어택', text: '상대 수비가 뒤로 깊게 서 있어요. 세터가 전위일 때 두 번째 공을 살짝 넘기면 빈 앞쪽에 떨어집니다.' });
  }
  if (opp.block === 'read' && recvRate < 0.3 && t.trick !== 'decoy') {
    t.tempo = 'fast';
    notes.push({ title: '템포: 빠른 공', text: '상대가 공을 보고 따라오는 블로킹입니다. 리시브가 안정적이니 빠르게 쏴서 블로커가 붙기 전에 때리세요.' });
  } else if (recvRate >= 0.4 && me.tactic.tempo === 'fast') {
    t.tempo = 'high';
    notes.push({ title: '템포: 높은 공', text: '리시브가 많이 흔들려요. 빠른 공은 범실이 늘어나니 높게 올려 확실히 때리세요.' });
  }
  if (oppAim === 'hitter' && opp.serve === 'target' && me.tactic.distribution === 'left') {
    t.distribution = 'right';
    notes.push({ title: '공격 배분: 라이트', text: '상대가 우리 레프트를 서브로 괴롭힙니다. 리시브를 안 하는 라이트에게 공을 더 주세요.' });
  }
  return { tactic: t, notes };
}

/** The person's side when they hand the match to the assistant coach: follows advise() at every break */
export const assistantCoach: Coach = {
  wantsTimeout: v => v.oppRun >= 3,
  substitutions: tiredSwaps,
  atBreak: (v, kind) => ({ tactic: advise(v, v.opp.tactic).tactic, subs: kind === 'set' ? undefined : breakSubs(v, v.score[0] < v.score[1]) }),
};
