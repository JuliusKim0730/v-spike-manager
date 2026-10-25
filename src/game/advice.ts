/**
 * 추천 모드 (Julius 2026-10-25): before a match, read the opponent's scouted plan and say how our tactic matches up
 * and what to pick; during a match, guess whether the opponent will keep or change its plan.
 * Rules follow the engine's counters (game/tactics.ts MATCHUPS, engine/coach.ts advise and aiCoach).
 */
import type { Player, Tactic } from '../engine/types.ts';
import { optName } from './tactics.ts';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface Pick { key: keyof Tactic; value: Tactic[keyof Tactic]; why: string; warn?: string }
export interface Verdict { key: keyof Tactic; tone: 'good' | 'bad' | 'even'; text: string }
export interface Recommendation {
  /** the opponent axes the analysts could read */
  known: (keyof Tactic)[];
  picks: Pick[];
  tactic: Partial<Tactic>;
  /** how our current plan fares against what is known */
  verdicts: Verdict[];
}

/**
 * Pre-match recommendation. `me` and `them` are starting sevens in slot order [S, OH, MB, OP, OH, MB, L].
 * `opp` holds only the axes the analysis room revealed.
 */
export function recommend(our: Tactic, me: Player[], them: Player[], opp: Partial<Tactic>): Recommendation {
  const known = (Object.keys(opp) as (keyof Tactic)[]).filter(k => opp[k] !== undefined);
  const picks: Pick[] = [];
  const add = (p: Pick) => { if (!picks.some(x => x.key === p.key)) picks.push(p); };
  const [ms, moh1, mmb1, mop, moh2, mmb2, ml] = me;
  const [, toh1, tmb1, top, toh2, tmb2, tl] = them;
  const spike = (p: Player) => 0.7 * p.tech.spike + 0.3 * p.phys.jump + (p.height - 180) * 0.6;
  const blockPow = avg([mmb1, mmb2, mop, moh1].map(p => 0.7 * p.tech.block + 0.3 * p.phys.jump + (p.height - 180) * 0.6));
  const ourRecv = avg([moh1, moh2, ml].map(p => p.tech.receive));
  const theirRecvs = [toh1, toh2, tl];
  const theirRecv = avg(theirRecvs.map(p => p.tech.receive));
  const ourServe = avg(me.slice(0, 6).map(p => p.tech.serve));

  // ── block ──
  if (opp.trick === 'decoy') add({ key: 'block', value: 'read', why: '상대가 속공 페이크를 씁니다. 먼저 뛰지 말고 공을 보고 따라가면 속지 않아요.' });
  else if (opp.distribution === 'middle') add({ key: 'block', value: 'commit', why: '상대가 중앙 속공을 자주 씁니다. 센터 타이밍에 미리 뛰는 예측 블로킹이 잘 맞아요.' });
  else if (opp.distribution === 'right' || opp.distribution === 'left') {
    const ace = opp.distribution === 'right' ? top : (toh1.tech.spike >= toh2.tech.spike ? toh1 : toh2);
    add({
      key: 'block', value: 'aceMark', why: `상대 공격이 ${opp.distribution === 'right' ? '라이트' : '레프트'}에 몰립니다. ${ace.name}에게 블로커를 붙이세요.`,
      warn: spike(ace) - blockPow > 12 ? `${ace.name}의 공격력이 우리 블로킹보다 한참 위라 다 막기는 어려워요.` : undefined,
    });
  } else if (opp.distribution === 'balanced') add({ key: 'block', value: 'read', why: '상대가 고르게 때립니다. 한 곳에 걸지 말고 따라가는 게 안전해요.' });

  // ── defense ──
  if (opp.trick === 'dump') add({ key: 'defense', value: 'tip', why: '상대 세터가 투 어택을 노립니다. 앞쪽 수비를 당겨 세우세요.' });
  else if (opp.trick !== undefined && our.defense === 'tip') add({ key: 'defense', value: 'deep', why: '상대가 투 어택을 안 씁니다. 강타 대비로 뒤를 지키세요.' });

  // ── serve ──
  if (opp.reception === 2) {
    if (ourServe >= theirRecv + 3) add({ key: 'serve', value: 'power', why: '상대가 2인 리시브라 빈 곳이 넓고, 우리 서브가 상대 리시브보다 좋아요. 강하게 때리세요.' });
    else { add({ key: 'serve', value: 'target', why: '상대가 2인 리시브입니다. 두 리시버 사이로 넣으면 서로 미루다 흔들려요.' }); add({ key: 'aim', value: 'seam', why: '2인 리시브의 틈을 노립니다.' }); }
  } else if (opp.distribution === 'middle' || opp.tempo === 'fast') {
    add({ key: 'serve', value: 'target', why: `상대가 ${opp.distribution === 'middle' ? '중앙 속공' : '빠른 공'}을 씁니다. 짧게 넣으면 센터가 받느라 속공을 못 뛰어요.` });
    add({ key: 'aim', value: 'short', why: '네트 앞에 짧게 떨어뜨려 속공을 끊습니다.' });
  } else if (opp.distribution === 'left') {
    add({ key: 'serve', value: 'target', why: '상대 레프트가 리시브도 하고 공격도 합니다. 그쪽으로 서브를 몰면 공격이 늦어져요.' });
    add({ key: 'aim', value: 'hitter', why: '레프트 주공격수를 겨냥합니다.' });
  } else if (opp.reception === 3 && our.serve === 'power') {
    add({ key: 'serve', value: 'target', why: '상대가 3인 리시브라 강서브는 범실만 늘어요. 약한 리시버를 노리세요.' });
    add({ key: 'aim', value: 'weak', why: '리시브가 가장 약한 선수에게 모읍니다.' });
  } else if (known.length) {
    const weak = theirRecvs.reduce((a, b) => (b.tech.receive < a.tech.receive ? b : a));
    if (weak.tech.receive <= theirRecv - 6) {
      add({ key: 'serve', value: 'target', why: `${weak.name}의 리시브가 약합니다. 그쪽으로 서브를 모으세요.` });
      add({ key: 'aim', value: 'weak', why: `${weak.name}을(를) 노립니다.` });
    }
  }

  // ── reception ──
  if (opp.serve === 'power' || (opp.serve === 'target' && (opp.aim === 'seam' || opp.aim === 'weak'))) {
    add({ key: 'reception', value: 3, why: `상대가 ${opp.serve === 'power' ? '강서브' : opp.aim === 'seam' ? '리시버 사이 틈' : '약한 리시버'}를 노립니다. 세 명이 받아 빈 곳을 줄이세요.` });
  } else if (opp.serve === 'safe' && ourRecv >= 60) {
    add({ key: 'reception', value: 2, why: '상대 서브가 약해요. 두 명만 받고 레프트 한 명은 공격 준비에 집중하세요.' });
  }

  // ── attack ──
  if (opp.block === 'commit') {
    add({
      key: 'trick', value: 'decoy', why: '상대 블로커가 속공에 먼저 뜁니다. 센터를 미끼로 띄우고 날개로 올리면 블로커가 속아요.',
      warn: ms.tech.set + avg([mmb1, mmb2].map(p => p.tech.quick)) < 2 * avg([tmb1, tmb2].map(p => p.tech.block)) - 10 ? '상대 블로커가 노련해서 페이크에 잘 안 속을 수 있어요.' : undefined,
    });
  } else if (opp.block === 'aceMark') {
    add({ key: 'distribution', value: 'balanced', why: '상대가 우리 에이스를 집중 마크합니다. 고르게 나눠 주면 빈 곳이 생겨요.' });
    add({ key: 'trick', value: 'decoy', why: '마크하는 블로커를 페이크로 끌어내면 더 쉽게 뚫려요.' });
  } else if (opp.block === 'read') {
    if (ourRecv >= 58) add({ key: 'tempo', value: 'fast', why: '상대가 공을 보고 따라오는 블로킹입니다. 빠르게 쏘면 블로커가 붙기 전에 때려요.' });
    if (our.trick === 'decoy') add({ key: 'trick', value: 'none', why: '따라가기 블로킹은 페이크에 잘 안 속아요.' });
  }
  if (opp.defense === 'deep' && ms.tech.set >= 60) add({ key: 'trick', value: 'dump', why: '상대 수비가 뒤로 깊게 섭니다. 세터가 두 번째 공을 살짝 넘기면 앞쪽이 비어 있어요.' });
  if (opp.serve === 'target' && opp.aim === 'short' && our.tempo === 'fast') add({ key: 'tempo', value: 'high', why: '상대 짧은 서브에 빠른 공이 자주 끊겨요. 높게 올리세요.' });
  if (opp.serve === 'target' && opp.aim === 'hitter' && our.distribution === 'left') add({ key: 'distribution', value: 'right', why: '상대가 레프트를 서브로 괴롭힙니다. 리시브를 안 하는 라이트에게 더 주세요.' });
  if (opp.block !== undefined && opp.block !== 'aceMark' && !picks.some(p => p.key === 'distribution')) {
    const best = [{ d: 'left' as const, v: Math.max(spike(moh1), spike(moh2)) }, { d: 'right' as const, v: spike(mop) }, { d: 'middle' as const, v: avg([mmb1, mmb2].map(p => p.tech.quick)) - 4 }]
      .sort((a, b) => b.v - a.v)[0];
    if (best.d !== our.distribution && (best.d !== 'middle' || opp.block !== 'commit')) {
      add({ key: 'distribution', value: best.d, why: `우리 공격수 중 ${best.d === 'left' ? '레프트' : best.d === 'right' ? '라이트' : '센터 속공'}가 가장 강해요. 상대가 집중 마크하지 않으니 몰아주세요.` });
    }
  }

  const tactic: Partial<Tactic> = {};
  for (const p of picks) (tactic as Record<string, unknown>)[p.key] = p.value;
  return { known, picks, tactic, verdicts: verdicts(our, opp) };
}

/** How our current plan fares against the known opponent axes */
export function verdicts(our: Tactic, opp: Partial<Tactic>): Verdict[] {
  const out: Verdict[] = [];
  const v = (key: keyof Tactic, tone: Verdict['tone'], text: string) => out.push({ key, tone, text });
  const aim = our.aim ?? 'weak';
  if (opp.reception !== undefined) {
    if (our.serve === 'power') v('serve', opp.reception === 2 ? 'good' : 'bad', opp.reception === 2 ? '강서브 ↔ 상대 2인 리시브: 빈 곳이 넓어 잘 먹혀요' : '강서브 ↔ 상대 3인 리시브: 막히고 범실만 늘 수 있어요');
    if (our.serve === 'target' && aim === 'seam') v('aim', opp.reception === 2 ? 'good' : 'bad', opp.reception === 2 ? '틈새 목적타 ↔ 2인 리시브: 상성 좋음' : '틈새 목적타 ↔ 3인 리시브: 틈이 좁아요');
    if (our.serve === 'target' && aim === 'weak') v('aim', opp.reception === 2 ? 'good' : 'even', opp.reception === 2 ? '약한 리시버 목적타 ↔ 2인 리시브: 노리기 쉬워요' : '약한 리시버 목적타 ↔ 3인 리시브: 효과가 줄어요');
  }
  if (our.serve === 'target' && aim === 'short' && (opp.distribution !== undefined || opp.tempo !== undefined)) {
    const good = opp.distribution === 'middle' || opp.tempo === 'fast';
    v('aim', good ? 'good' : 'bad', good ? '짧은 서브 ↔ 상대 속공·빠른 공: 센터가 받느라 속공을 못 뛰어요' : '짧은 서브 ↔ 상대 높은 공·날개 공격: 압박이 약해 손해예요');
  }
  if (our.serve === 'target' && aim === 'hitter' && opp.distribution !== undefined) {
    v('aim', opp.distribution === 'left' ? 'good' : opp.distribution === 'balanced' ? 'even' : 'bad', opp.distribution === 'left' ? '공격수 겨냥 ↔ 레프트 중심: 공격 준비를 늦춰요' : `공격수 겨냥 ↔ ${optName('distribution', opp.distribution)}: 레프트를 덜 써서 효과가 작아요`);
  }
  if (opp.block !== undefined) {
    if (our.tempo === 'fast') v('tempo', opp.block === 'read' ? 'good' : 'even', opp.block === 'read' ? '빠른 공 ↔ 따라가기 블로킹: 블로커가 늦어요' : '빠른 공: 상대 블로킹과 큰 상성은 없어요');
    if (our.trick === 'decoy') v('trick', opp.block === 'read' ? 'bad' : 'good', opp.block === 'read' ? '속공 페이크 ↔ 따라가기 블로킹: 잘 안 속아요' : `속공 페이크 ↔ ${optName('block', opp.block)}: 블로커가 잘 속아요`);
    if (opp.block === 'aceMark' && (our.distribution === 'right' || our.distribution === 'left')) v('distribution', 'bad', `${optName('distribution', our.distribution)} ↔ 에이스 마크: 우리 에이스가 집중 견제당해요`);
    if (opp.block === 'commit' && our.distribution === 'middle') v('distribution', 'bad', '중앙 활용 ↔ 예측 블로킹: 속공이 읽혀요');
    if (opp.block === 'commit' && (our.distribution === 'left' || our.distribution === 'right')) v('distribution', 'good', `${optName('distribution', our.distribution)} ↔ 예측 블로킹: 날개가 비어요`);
  }
  if (opp.distribution !== undefined || opp.trick !== undefined) {
    if (our.block === 'commit') {
      const good = opp.distribution === 'middle' && opp.trick !== 'decoy';
      v('block', good ? 'good' : opp.trick === 'decoy' || opp.distribution === 'left' || opp.distribution === 'right' ? 'bad' : 'even', good ? '예측 블로킹 ↔ 중앙 활용: 속공을 잡아요' : opp.trick === 'decoy' ? '예측 블로킹 ↔ 속공 페이크: 먼저 뛰다 속아요' : '예측 블로킹 ↔ 날개 공격: 날개가 비어요');
    }
    if (our.block === 'aceMark') {
      const good = (opp.distribution === 'left' || opp.distribution === 'right') && opp.trick !== 'decoy';
      v('block', good ? 'good' : opp.distribution === 'balanced' || opp.trick === 'decoy' ? 'bad' : 'even', good ? `에이스 마크 ↔ ${optName('distribution', opp.distribution)}: 에이스를 잡아요` : opp.trick === 'decoy' ? '에이스 마크 ↔ 속공 페이크: 마크가 흐트러져요' : '에이스 마크 ↔ 고른 배분: 한 명만 막아선 소용없어요');
    }
    if (our.block === 'read' && opp.trick === 'decoy') v('block', 'good', '따라가기 ↔ 속공 페이크: 속지 않아요');
  }
  if (opp.defense !== undefined && our.trick === 'dump') v('trick', opp.defense === 'deep' ? 'good' : 'bad', opp.defense === 'deep' ? '세터 투 어택 ↔ 강타 대비: 앞이 비어 있어요' : '세터 투 어택 ↔ 연타 대비: 읽혀서 찬스볼이 돼요');
  if (opp.trick !== undefined) {
    if (our.defense === 'tip') v('defense', opp.trick === 'dump' ? 'good' : 'bad', opp.trick === 'dump' ? '연타 대비 ↔ 세터 투 어택: 잘 받아요' : '연타 대비: 상대가 투 어택을 안 써서 강타가 뒤로 빠져요');
    else if (opp.trick === 'dump') v('defense', 'bad', '강타 대비 ↔ 세터 투 어택: 앞쪽이 비어요');
  }
  if (opp.serve !== undefined) {
    const pressure = opp.serve === 'power' || (opp.serve === 'target' && (opp.aim === 'seam' || opp.aim === 'weak'));
    if (our.reception === 2 && pressure) v('reception', 'bad', `2인 리시브 ↔ ${opp.serve === 'power' ? '강서브' : '목적타'}: 흔들리기 쉬워요`);
    if (our.reception === 3 && pressure) v('reception', 'good', `3인 리시브 ↔ ${opp.serve === 'power' ? '강서브' : '목적타'}: 안정적으로 받아요`);
    if (our.tempo === 'fast' && opp.serve === 'target' && opp.aim === 'short') v('tempo', 'bad', '빠른 공 ↔ 짧은 서브: 토스가 자주 끊겨요');
  }
  return out;
}

// ───────────────────────── will the opponent change its plan? ─────────────────────────

export interface Forecast { level: 'high' | 'mid' | 'low'; pct: number; text: string; hints: string[] }

/** What the AI's own read (engine/coach.ts readGame) would likely switch to, given our plan */
function likelyCounters(our: Tactic): string[] {
  const out: string[] = [];
  if (our.distribution === 'middle') out.push('우리 속공이 많아 예측 블로킹으로 바꿀 수 있어요');
  if (our.distribution === 'right') out.push('라이트 공격이 몰려 에이스 마크를 붙일 수 있어요');
  if (our.reception === 2 || our.tempo === 'fast') out.push(`우리가 ${our.reception === 2 ? '2인 리시브' : '빠른 공'}라 강서브로 흔들 수 있어요`);
  else out.push('목적타 서브로 우리 리시브를 노릴 수 있어요');
  return out;
}

/**
 * During a match. Mirrors aiCoach: a losing side changes plans at most breaks (55–80%),
 * a winning side rarely (12–25%). `score` and `sets` are [ours, theirs].
 */
export function forecastLive(score: [number, number], sets: [number, number], our: Tactic): Forecast {
  const deficit = score[0] - score[1];
  const behindSets = sets[1] < sets[0];
  let pct: number, text: string;
  if (deficit >= 4) { pct = 80; text = `상대가 ${deficit}점 뒤져 있어요. 다음 작전 타임에 작전을 바꿀 가능성이 큽니다.`; }
  else if (deficit > 0) { pct = 55; text = '상대가 끌려가고 있어요. 다음 타임아웃에 작전을 손볼 수 있어요.'; }
  else if (deficit === 0) { pct = behindSets ? 60 : 35; text = behindSets ? '세트에서 밀리는 상대라 흐름이 바뀌면 작전도 바꿀 거예요.' : '팽팽합니다. 상대는 아직 지켜보는 중이에요.'; }
  else { pct = behindSets ? 25 : 15; text = '상대가 앞서고 있어요. 지금 작전을 유지할 가능성이 큽니다.'; }
  if (behindSets && pct < 80) pct = Math.min(80, pct + 10);
  return { level: pct >= 55 ? 'high' : pct >= 30 ? 'mid' : 'low', pct, text, hints: pct >= 30 ? likelyCounters(our) : [] };
}

/** Before a match: from the strength gap */
export function forecastPre(ourOvr: number, oppOvr: number, our: Tactic): Forecast {
  const gap = oppOvr - ourOvr;
  if (gap >= 4) return { level: 'low', pct: 20, text: '상대가 더 강해서 리드를 잡으면 시작 작전을 끝까지 밀고 갈 가능성이 큽니다.', hints: [] };
  if (gap <= -4) return { level: 'high', pct: 75, text: '상대가 약한 쪽이라 세트를 내주면 거의 매번 작전을 바꿀 거예요. 바뀐 작전을 경기 중에 확인하세요.', hints: likelyCounters(our) };
  return { level: 'mid', pct: 45, text: '전력이 비슷합니다. 지고 있는 쪽이 먼저 작전을 바꿉니다.', hints: likelyCounters(our) };
}
