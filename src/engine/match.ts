import type { BreakKind, BreakPlan, Coach, CoachView, MatchResult, Pass, Player, PlayerLine, Position, Tactic, Team, TeamTotals, TechKey } from './types.ts';
import { Rng } from './rng.ts';
import { CFG } from './config.ts';
import { physEff, techEff } from './player.ts';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
/** How strongly a stat difference moves a single contact. Small = upsets are possible. */
const K = CFG.statK;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const AIM_SAY = { weak: '목적타 ', hitter: '공격수 겨냥 ', seam: '틈새 ', short: '짧은 ' };

const newLine = (): PlayerLine => ({
  serves: 0, aces: 0, serveErrors: 0,
  receives: 0, recvA: 0, recvB: 0, recvC: 0, recvAced: 0,
  attacks: 0, kills: 0, attackErrors: 0, blocked: 0,
  blocks: 0, digs: 0, sets: 0,
});

const newTotals = (): TeamTotals => ({
  rallies: 0, receiveRallies: 0, sideouts: 0, serveRallies: 0, breakPoints: 0,
  attacks: 0, kills: 0, attackErrors: 0, blocked: 0, blockPoints: 0,
  serves: 0, aces: 0, serveErrors: 0, recvA: 0, recvB: 0, recvC: 0, attacksPerRally: 0,
});

interface Court {
  team: Team;
  rot: number; // rotation index; player i stands at position index (i - rot) mod 6
}

// Position index 0=P1 (server, back-right) 1=P2 2=P3 3=P4 (front) 4=P5 5=P6 (back)
const posOf = (i: number, rot: number) => (((i - rot) % 6) + 6) % 6;
const isFront = (pos: number) => pos >= 1 && pos <= 3;
/** Court roles come from the lineup slot, so a player filling in at another position plays that role. */
const ROLE: Position[] = ['S', 'OH', 'MB', 'OP', 'OH', 'MB'];
const roleOf = (t: Team, p: Player): Position => (p === t.libero ? 'L' : ROLE[t.lineup.indexOf(p)] ?? p.position);

interface Attack {
  hitter: Player;
  kind: 'wing' | 'quick' | 'back';
  key: TechKey;
}

export interface MatchOptions {
  seed: number;
  log?: boolean;
  homeTeam?: 0 | 1;
  /** in-match coaching per side; none = the starting tactic and six play the whole match */
  coaches?: [Coach | undefined, Coach | undefined];
  /** side the person controls through matchSteps: every point and break is yielded to them */
  manual?: 0 | 1;
  /**
   * 신인감독모드 (Julius 2026-10-25: 작전 성공을 좀 더 잘할 수 있게, 우리도 상대도): scales what a well-chosen
   * tactic earns (counters, set plays, serve aims) for both sides; the costs stay as they are. 1 = normal.
   */
  tacticBoost?: number;
}

/** A point was played. `lines` = the log lines since the previous event. */
export interface PointEvent {
  type: 'point'; setNo: number; score: [number, number]; winner: 0 | 1; lines: string[];
  /** both sides' tactics after this point, so the person can watch the opponent change plans */
  tactics: [Tactic, Tactic];
  /** the winner's run of points */
  run: number;
  /** live player lines so far (the match's own map: read it, don't keep it) */
  box: Map<string, PlayerLine>;
}
/** Play stops for a break; the manual side answers with a BreakInput. */
export interface BreakEvent {
  type: 'break'; kind: BreakKind;
  /** who called the timeout */
  by?: 0 | 1;
  setNo: number; score: [number, number]; lines: string[];
  /** the manual side's view */
  view: CoachView;
  /** the tactic the opponent has been playing up to this break (they may change it now too) */
  oppTactic: Tactic;
  box: Map<string, PlayerLine>;
}
export type MatchEvent = PointEvent | BreakEvent;
/** after a point: call a timeout and/or signal a tactic change from the bench (applies from the next rally). In a break: the plan. Either: hand the rest of the match to a coach. */
export interface StepInput extends BreakPlan { timeout?: boolean; auto?: Coach | 'none' }

export function playMatch(teams: [Team, Team], opts: MatchOptions): MatchResult {
  const g = matchSteps(teams, { ...opts, manual: undefined });
  let r = g.next();
  while (!r.done) r = g.next({});
  return r.value;
}

/**
 * The match as a generator so a person can pause it (web app live match).
 * Without `manual` it never yields and plays exactly like playMatch.
 */
export function* matchSteps(teams: [Team, Team], opts: MatchOptions): Generator<MatchEvent, MatchResult, StepInput | undefined> {
  const rng = new Rng(opts.seed);
  const TB = opts.tacticBoost ?? 1;
  /** a tactic's payoff, scaled by tacticBoost */
  const pay = (v: number) => v * TB;
  /** plays that worked because of a tactic (set play fooled them, aimed serve ace, marked block…), per side */
  const tacticHits: [number, number] = [0, 0];
  const lines = new Map<string, PlayerLine>();
  const line = (p: Player) => {
    let l = lines.get(p.id);
    if (!l) { l = newLine(); lines.set(p.id, l); }
    return l;
  };
  const totals: [TeamTotals, TeamTotals] = [newTotals(), newTotals()];
  const log: string[] = [];
  const say = (s: string) => { if (opts.log) log.push(s); };
  let flushed = 0;
  const flush = () => { const out = log.slice(flushed); flushed = log.length; return out; };
  let manual = opts.manual;

  // working copies of lineup / tactic / bench so coaching does not change the caller's team; players are shared
  const copy = (t: Team): Team => ({ ...t, lineup: [...t.lineup], tactic: { ...t.tactic }, bench: [...(t.bench ?? [])] });
  const courts: [Court, Court] = [{ team: copy(teams[0]), rot: 0 }, { team: copy(teams[1]), rot: 0 }];
  const coaches: [Coach | undefined, Coach | undefined] = [...(opts.coaches ?? [undefined, undefined])];

  // ── in-match coaching state ──
  const run: [number, number] = [0, 0];
  /** momentum: a team on a run of 3+ plays slightly better until the run ends or a timeout breaks it */
  const mom = (side: number) => Math.min(CFG.momentumMax, Math.max(0, run[side] - 2) * CFG.momentumStep);
  const oppAttacks = [0, 1].map(() => ({ OH: 0, OP: 0, MB: 0, back: 0, total: 0 }));
  const recv = [0, 1].map(() => ({ A: 0, B: 0, C: 0, aced: 0 }));
  const timeouts: [number, number] = [0, 0];
  const tacticChanges: [number, number] = [0, 0];
  const subs: [number, number] = [0, 0];
  const subsLeft: [number, number] = [CFG.subsPerSet, CFG.subsPerSet];
  let technical = 0;
  const sideOf = (c: Court) => (c === courts[0] ? 0 : 1);

  /** On-court six with the libero replacing back-row MBs (except an MB serving from P1). */
  function onCourt(c: Court, serving: boolean): { p: Player; pos: number; role: Position }[] {
    return c.team.lineup.map((p, i) => {
      const pos = posOf(i, c.rot);
      if (ROLE[i] === 'MB' && !isFront(pos) && !(serving && pos === 0)) return { p: c.team.libero, pos, role: 'L' as Position };
      return { p, pos, role: ROLE[i] };
    });
  }

  /** The hitter a defense marks: whoever the opponent's distribution feeds most */
  function aceHitter(t: Team): Player {
    const d = t.tactic.distribution;
    const pool = t.lineup.filter((_, i) => d === 'right' ? ROLE[i] === 'OP' : d === 'left' ? ROLE[i] === 'OH' : d === 'middle' ? ROLE[i] === 'MB' : ROLE[i] !== 'S');
    return pool.reduce((a, b) => (b.tech.spike > a.tech.spike ? b : a));
  }

  // ── rally pieces ──

  /** first ball after a serve: who the 목적타 aimed at and whether it was short */
  interface FirstBall { aimed?: Player; short?: boolean }

  function chooseAttack(c: Court, pass: Pass, serving: boolean, setterBusy: boolean, first?: FirstBall): { atk: Attack; setQ: number; setter: Player } {
    const six = onCourt(c, serving);
    const t = c.team.tactic;
    const setterSlot = six.find(s => s.role === 'S')!;
    const setter = setterBusy ? c.team.libero : setterSlot.p;
    if (!setterBusy) line(setter).sets++;

    const fast = t.tempo === 'fast' && !(first?.short && rng.chance(CFG.shortFastCut));
    const decoy = t.trick === 'decoy' && pass !== 'C';
    let setQ = CFG.passBase[pass] * (1 - CFG.tossWeight + CFG.tossWeight * techEff(setter, 'set') / 100);
    if (fast) setQ += pass === 'A' ? 0.02 : -0.06;
    if (setterBusy) setQ -= 0.12;
    if (decoy) setQ -= CFG.decoySetCost;
    setQ = clamp(setQ + rng.normal(0, 0.05), 0.2, 1.05);

    const options: Attack[] = [];
    const weights: number[] = [];
    const add = (hitter: Player, kind: Attack['kind'], key: TechKey, w: number) => {
      if (w <= 0) return;
      if (kind === 'quick') w *= (decoy ? CFG.decoyQuickMul : 1) * (first?.short ? CFG.shortQuickMul : 1);
      if (first?.aimed === hitter) w *= CFG.aimHitterWeight;
      options.push({ hitter, kind, key });
      weights.push(w * Math.pow(techEff(hitter, key) / 70, 2));
    };
    const dist = t.distribution;
    for (const { p, pos, role } of six) {
      if (role === 'L' || role === 'S') continue;
      const front = isFront(pos);
      if (role === 'OH') {
        if (front) add(p, 'wing', 'spike', 1.0 * (dist === 'left' ? 1.7 : 1));
        else if (pass !== 'C') add(p, 'back', 'backAttack', 0.18 * (fast ? 1.5 : 1));
      } else if (role === 'OP') {
        const w = dist === 'right' ? 1.9 : 1;
        if (front) add(p, 'wing', 'spike', 1.1 * w);
        else add(p, 'back', 'backAttack', (pass === 'C' ? 0.35 : 0.6) * w);
      } else if (role === 'MB' && front) {
        if (pass === 'A') add(p, 'quick', 'quick', 0.55 * (dist === 'middle' ? 2.2 : 1) * (fast ? 1.4 : 1));
        else if (pass === 'B') add(p, 'quick', 'quick', (dist === 'middle' ? 0.9 : 0.25) * (fast ? 1.4 : 1));
      }
    }
    const atk = rng.pickWeighted(options, weights);
    return { atk, setQ, setter };
  }

  /** Returns the rally winner side relative to the attacking team: 'att' | 'def' | 'cont' (dug, rally continues) */
  function resolveAttack(attC: Court, defC: Court, a: Attack, setQ: number, pass: Pass, attServing: boolean, fromServe: boolean, setter: Player, first?: FirstBall):
    { result: 'kill' | 'error' | 'stuff' | 'dug'; digQ?: number; blocker?: Player; digger?: Player; bit?: boolean; read?: string } {
    const at = attC.team.tactic;
    const dt = defC.team.tactic;
    const h = a.hitter;
    const stat = techEff(h, a.key);
    let A = 0.7 * stat + 0.3 * physEff(h, 'jump') + (h.height - 180) * 0.6 + (setQ - 0.8) * 40;
    if (h.skills.includes('aceInstinct') && clutch) A += 8;
    if (fromServe && at.reception === 3 && roleOf(attC.team, h) === 'OH') A -= CFG.threeRecvAttackCost / K;
    if (fromServe && first?.aimed === h) A -= pay(CFG.aimHitterCost);
    A += mom(sideOf(attC));
    const defMom = mom(sideOf(defC));

    // blockers
    const defSix = onCourt(defC, !attServing);
    const front = defSix.filter(s => isFront(s.pos)).map(s => s.p);
    let n = a.kind === 'quick' ? 1.1 : pass === 'C' || at.tempo === 'high' ? 2.3 : 1.7;
    if (at.tempo === 'fast' && a.kind !== 'quick' && pass !== 'C') n -= pay(CFG.tempoFastBlockerCut);
    if (a.kind === 'back') n -= 0.3;
    let blockAdj = 0;
    /** what the defense's block plan read right, for the play-by-play */
    let read: string | undefined;
    if (dt.block === 'commit') {
      if (a.kind === 'quick') { blockAdj += pay(CFG.commitVsQuick); n += 0.6; read = '예측 블로킹 적중'; }
      else { blockAdj += CFG.commitVsWing; n -= CFG.commitWingBlockerCut; }
    }
    const bp = front.map(b => 0.7 * techEff(b, 'block') + 0.3 * physEff(b, 'jump') + (b.height - 180) * 0.6 + (b.skills.includes('ironWall') ? 10 : 0));
    // 속공 페이크: the middle jumps first; blockers who bite are late to the wing. Setter + middle vs the blockers' read.
    let bit = false;
    if (at.trick === 'decoy' && a.kind !== 'quick' && pass !== 'C') {
      const mb = onCourt(attC, attServing).find(s => s.role === 'MB' && isFront(s.pos))?.p;
      if (mb) {
        const fool = 0.5 * techEff(setter, 'set') + 0.5 * techEff(mb, 'quick') - front.reduce((x, b) => x + techEff(b, 'block'), 0) / front.length;
        bit = rng.chance(sigmoid(CFG.decoyBite[dt.block] + fool * CFG.decoyStatSlope + (TB - 1) * 1.2));
      }
    }
    if (bit) n -= CFG.decoyBlockerCut;
    if (dt.block === 'aceMark' && !bit) {
      const ace = aceHitter(attC.team);
      if (ace.id === h.id) { blockAdj += pay(CFG.aceMarkTarget); n += 0.6; read = '에이스 마크 적중'; } else blockAdj += CFG.aceMarkOther;
    }
    if (dt.block === 'read' && (pass === 'C' || at.tempo === 'high')) blockAdj += pay(CFG.readVsHigh);
    n = clamp(n, 0.8, 3);
    const B = bp.reduce((x, y) => x + y, 0) / bp.length + defMom;

    // 1) attack error
    const tip = rng.chance(CFG.tipChance + (n > 2.2 ? 0.06 : 0) + (setQ < 0.6 ? 0.05 : 0));
    const pErr = CFG.atkErrBase + CFG.atkErrPoorSet * clamp(1 - setQ, 0, 1)
      + (at.tempo === 'fast' && pass !== 'A' ? CFG.atkErrFastRisk : 0)
      - (stat - 65) * 0.0008 * K;
    if (rng.chance(clamp(tip ? pErr * 0.4 : pErr, 0.01, 0.25))) return { result: 'error' };

    // 2) stuff block
    let pStuff = CFG.stuffBase + CFG.stuffPerBlocker * (n - 1) - ((A - B) * K - blockAdj) * CFG.stuffSlope;
    if (tip) pStuff *= 0.3;
    pStuff = clamp(pStuff, 0.01, 0.35);
    const blocker = rng.pickWeighted(front, bp.map(v => Math.max(1, v)));
    if (rng.chance(pStuff)) return { result: 'stuff', blocker, read };

    // 3) defense
    const soft = rng.chance(CFG.softBlockChance);
    const backRow = defSix.filter(s => !isFront(s.pos)).map(s => s.p);
    const digger = rng.pickWeighted(backRow, backRow.map(p => (p === defC.team.libero ? 1.6 : 1)));
    const D = defMom + 0.6 * techEff(digger, 'dig') + 0.2 * physEff(digger, 'agility') + 0.2 * techEff(digger, digger === defC.team.libero ? 'positioning' : 'dig');
    let defAdj = dt.defense === 'deep' ? (tip ? CFG.defenseDeepVsTip : pay(CFG.defenseDeepVsPower)) : (tip ? pay(CFG.defenseTipVsTip) : CFG.defenseTipVsPower);
    if (soft) defAdj += CFG.softBlockDig;
    const rel = (A - D) * K - defAdj;
    const commitCut = dt.block === 'commit' && a.kind === 'quick' ? pay(CFG.commitQuickKillCut) : 0;
    const pKill = sigmoid(rel / CFG.killScale + (tip ? CFG.tipBias : CFG.killBias) - n * CFG.killPerBlocker - commitCut);
    if (rng.chance(pKill)) return { result: 'kill', bit };
    const digQ = -rel + rng.normal(0, 12);
    return { result: 'dug', digQ, digger, bit, read: tip && dt.defense === 'tip' ? '연타 대비 적중' : undefined };
  }

  let clutch = false;

  function rally(server: 0 | 1): 0 | 1 {
    const rcv = (1 - server) as 0 | 1;
    const sC = courts[server], rC = courts[rcv];
    const sTot = totals[server], rTot = totals[rcv];
    sTot.rallies++; rTot.rallies++;
    sTot.serveRallies++; rTot.receiveRallies++;
    let attacksThisRally = 0;

    // ── serve ──
    const serverP = sC.team.lineup.find((_, i) => posOf(i, sC.rot) === 0)!;
    const st = sC.team.tactic.serve;
    const aim = st === 'target' ? sC.team.tactic.aim ?? 'weak' : undefined;
    const sl = line(serverP);
    sl.serves++; sTot.serves++;
    const serveStat = techEff(serverP, 'serve');
    let errP = (CFG.serveErrBase[st] + (aim === 'seam' ? CFG.seamErr : aim === 'short' ? CFG.shortErr : 0)) * (1 - (serveStat - 65) / 100 * CFG.serveErrStatSlope * K);
    if (serverP.skills.includes('serveBomber')) errP *= 1.3;
    if (rng.chance(errP)) {
      sl.serveErrors++; sTot.serveErrors++;
      say(`${serverP.name} 서브 범실`);
      return rcv;
    }
    const S = serveStat;

    // receiver
    const rSix = onCourt(rC, false);
    const reception = rC.team.tactic.reception;
    let receivers = rSix.filter(s => s.role === 'L' || (s.role === 'OH' && (reception === 3 || !isFront(s.pos)))).map(s => s.p);
    if (receivers.length === 0) receivers = rSix.map(s => s.p);
    let receiver: Player;
    const first: FirstBall = { short: aim === 'short' };
    const hitters = receivers.filter(p => roleOf(rC.team, p) === 'OH');
    const aimChance = Math.min(0.95, CFG.targetServeAimChance + (TB - 1) * 0.4);
    if (aim === 'weak' && rng.chance(aimChance)) {
      receiver = receivers.reduce((a, b) => (techEff(b, 'receive') < techEff(a, 'receive') ? b : a));
    } else if (aim === 'hitter' && hitters.length && rng.chance(aimChance)) {
      receiver = hitters.reduce((a, b) => (techEff(b, 'spike') > techEff(a, 'spike') ? b : a));
      first.aimed = receiver;
    } else receiver = receivers[rng.int(0, receivers.length - 1)];
    const rl = line(receiver);
    rl.receives++;
    let R = 0.8 * techEff(receiver, 'receive') + 0.2 * physEff(receiver, 'agility');
    if (receiver.skills.includes('receiveMaster')) R += 8;
    R += mom(rcv) - mom(server);
    R += CFG.receptionBonus[reception] / K;
    let aceCut = CFG.recvAceBelow;
    if (serverP.skills.includes('serveBomber')) aceCut += 8;
    const aimBonus = aim === 'weak' ? (reception === 2 ? pay(CFG.targetVsTwo) : 0)
      : aim === 'seam' ? (reception === 2 ? pay(CFG.seamVsTwo) : CFG.seamVsThree)
      : aim === 'short' ? CFG.shortPressure + (rC.team.tactic.distribution === 'middle' ? pay(CFG.shortVsMiddle) : 0) + (rC.team.tactic.tempo === 'fast' ? pay(CFG.shortVsFast) : 0) : 0;
    const targetBonus = aimBonus + (st === 'power' && reception === 2 ? pay(CFG.powerVsTwo) : 0);
    const q = (R - S) * K - CFG.servePressure[st] - targetBonus + CFG.recvOffset + rng.normal(0, CFG.recvNoise);
    if (q < aceCut) {
      sl.aces++; sTot.aces++; rl.recvAced++; recv[rcv].aced++;
      // the serve plan found the weakness it was built for
      const rT = rC.team.tactic;
      if ((reception === 2 && (st === 'power' || aim === 'weak' || aim === 'seam')) || (aim === 'short' && (rT.distribution === 'middle' || rT.tempo === 'fast')) || (aim === 'hitter' && first.aimed)) tacticHits[server]++;
      say(`${serverP.name} ${aim ? AIM_SAY[aim] : ''}서브 에이스! ${receiver.name} 리시브 실패`);
      return server;
    }
    let pass: Pass = q < CFG.recvCBelow ? 'C' : q < CFG.recvBBelow ? 'B' : 'A';
    rl[pass === 'A' ? 'recvA' : pass === 'B' ? 'recvB' : 'recvC']++;
    recv[rcv][pass]++;
    rTot[pass === 'A' ? 'recvA' : pass === 'B' ? 'recvB' : 'recvC']++;

    // ── rally loop ──
    let att: 0 | 1 = rcv;
    let attServing = false;
    let setterBusy = false;
    for (let guard = 0; guard < 40; guard++) {
      const aC = courts[att], dC = courts[1 - att];
      const aTot = totals[att];
      // 세터 투 어택: a front-row setter tips the second ball over instead of setting
      const setSlot = onCourt(aC, attServing).find(s => s.role === 'S');
      if (aC.team.tactic.trick === 'dump' && pass !== 'C' && !setterBusy && setSlot && isFront(setSlot.pos) && rng.chance(CFG.dumpRate)) {
        const sp = setSlot.p;
        attacksThisRally++;
        const sline = line(sp);
        sline.attacks++; aTot.attacks++;
        const dT = dC.team.tactic;
        const back = onCourt(dC, !attServing).filter(s => !isFront(s.pos)).map(s => s.p);
        const D = back.reduce((x, p) => x + techEff(p, 'dig'), 0) / back.length;
        const Sx = 0.5 * techEff(sp, 'set') + 0.3 * physEff(sp, 'agility') + 0.2 * physEff(sp, 'jump') + (sp.height - 175) * 0.4;
        const pKill = sigmoid((Sx - D) * K / CFG.killScale * 4 + CFG.dumpBias + CFG.dumpVs[dT.defense] + (dT.block === 'read' ? CFG.dumpVsRead : 0)
          + (dT.defense === 'deep' ? (TB - 1) * 0.8 : 0));
        if (rng.chance(pKill)) {
          sline.kills++; aTot.kills++; tacticHits[att]++;
          say(`${sp.name} 세터 투 어택(패스 페인트) 득점`);
          totals[att].attacksPerRally += attacksThisRally;
          return att;
        }
        say(`${sp.name} 투 어택 → 상대가 읽고 걷어 올림`);
        pass = rng.chance(0.6) ? 'A' : 'B';
        setterBusy = false;
        att = (1 - att) as 0 | 1;
        attServing = att === server;
        continue;
      }
      const firstBall = guard === 0 ? first : undefined;
      const { atk, setQ, setter } = chooseAttack(aC, pass, attServing, setterBusy, firstBall);
      attacksThisRally++;
      const hl = line(atk.hitter);
      hl.attacks++; aTot.attacks++;
      {
        const o = oppAttacks[1 - att];
        const role = roleOf(aC.team, atk.hitter);
        o.total++;
        if (atk.kind === 'back') o.back++;
        if (role === 'OH' || role === 'OP' || role === 'MB') o[role]++;
      }
      const r = resolveAttack(aC, dC, atk, setQ, pass, attServing, guard === 0, setter, firstBall);
      const kindTxt = atk.kind === 'quick' ? '속공' : atk.kind === 'back' ? '백어택' : '오픈 공격';
      const passTxt = pass === 'A' ? '정확한 연결' : pass === 'B' ? '무난한 연결' : '흔들린 연결';
      if (r.result === 'kill') {
        hl.kills++; aTot.kills++;
        if (r.bit) tacticHits[att]++;
        say(`${passTxt} → ${r.bit ? '속공 페이크에 블로커가 속음 → ' : ''}${atk.hitter.name} ${kindTxt} 득점`);
        totals[att].attacksPerRally += attacksThisRally;
        return att;
      }
      if (r.result === 'error') {
        hl.attackErrors++; aTot.attackErrors++;
        say(`${passTxt} → ${atk.hitter.name} ${kindTxt} 범실`);
        totals[att].attacksPerRally += attacksThisRally;
        return (1 - att) as 0 | 1;
      }
      if (r.result === 'stuff') {
        if (rng.chance(CFG.coverChance)) {
          // covered: same team attacks again from a poor ball
          pass = 'C'; setterBusy = false;
          say(`${atk.hitter.name} 공격이 블로킹에 맞았지만 커버 성공`);
          continue;
        }
        hl.blocked++; aTot.blocked++;
        line(r.blocker!).blocks++; totals[1 - att].blockPoints++;
        if (r.read) tacticHits[1 - att]++;
        say(`${passTxt} → ${atk.hitter.name} ${kindTxt}, ${r.blocker!.name} 블로킹 득점${r.read ? ` (${r.read})` : ''}`);
        totals[att].attacksPerRally += attacksThisRally;
        return (1 - att) as 0 | 1;
      }
      // dug → counterattack
      line(r.digger!).digs++;
      const dq = r.digQ!;
      pass = dq > 14 ? 'A' : dq > -2 ? 'B' : 'C';
      setterBusy = r.digger! === dC.team.lineup[0];
      if (r.read) tacticHits[1 - att]++;
      say(`${atk.hitter.name} ${kindTxt} → ${r.digger!.name} 디그${r.read ? ` (${r.read})` : ''}`);
      att = (1 - att) as 0 | 1;
      attServing = att === server;
    }
    return server;
  }

  // ── sets ──
  const setsWon: [number, number] = [0, 0];
  const sets: { score: [number, number] }[] = [];
  let firstServer: 0 | 1 = rng.chance(0.5) ? 0 : 1;
  let toLeft: [number, number] = [CFG.timeoutsPerSet, CFG.timeoutsPerSet];
  for (let setNo = 1; setsWon[0] < 3 && setsWon[1] < 3; setNo++) {
    const target = setNo === 5 ? 15 : 25;
    const score: [number, number] = [0, 0];
    courts[0].rot = 0; courts[1].rot = 0;
    run[0] = 0; run[1] = 0;
    toLeft = [CFG.timeoutsPerSet, CFG.timeoutsPerSet];
    const ttoDone = new Set<number>();
    let server: 0 | 1 = firstServer;
    say(`── ${setNo}세트 ──`);
    if (setNo > 1) yield* breakTime('set', undefined, setNo, score);
    subsLeft[0] = subsLeft[1] = CFG.subsPerSet;
    while (true) {
      clutch = Math.max(score[0], score[1]) >= target - 5 && Math.abs(score[0] - score[1]) <= 2;
      const w = rally(server);
      score[w]++;
      say(`§${score[0]}:${score[1]}:${w}`); // web app: point marker for the live scoreboard
      run[w]++; run[1 - w] = 0;
      if (w !== server) {
        totals[w].sideouts++;
        courts[w].rot = (courts[w].rot + 1) % 6;
        server = w;
      } else totals[w].breakPoints++;
      const over = (score[0] >= target || score[1] >= target) && Math.abs(score[0] - score[1]) >= 2;
      let caller: 0 | 1 | undefined;
      if (manual !== undefined) {
        const inp = yield {
          type: 'point', setNo, score: [score[0], score[1]], winner: w, lines: flush(),
          tactics: [{ ...courts[0].team.tactic }, { ...courts[1].team.tactic }], run: run[w], box: lines,
        };
        if (inp?.auto) takeOver(inp.auto);
        else {
          if (inp?.tactic) applyTactic(manual, inp.tactic, '벤치 지시');
          if (inp?.timeout && toLeft[manual] > 0) caller = manual;
        }
      }
      if (over) break;
      // technical timeout: sets 1–4, the first time the leading team reaches 8 and 16
      const lead = Math.max(score[0], score[1]);
      if (setNo <= 4 && CFG.technicalAt.includes(lead) && !ttoDone.has(lead)) {
        ttoDone.add(lead);
        technical++;
        run[0] = run[1] = 0;
        say(`테크니컬 타임아웃 (${score[0]}:${score[1]})`);
        yield* breakTime('technical', undefined, setNo, score);
        continue;
      }
      const l = (1 - w) as 0 | 1;
      const lc = coaches[l];
      if (caller === undefined && l !== manual && lc?.wantsTimeout && toLeft[l] > 0 && lc.wantsTimeout(view(l, setNo, score))) caller = l;
      if (caller !== undefined) {
        toLeft[caller]--; timeouts[caller]++;
        run[1 - caller] = 0; // the timeout breaks the run
        say(`${courts[caller].team.name} 작전 타임 (${score[0]}:${score[1]})`);
        yield* breakTime('timeout', caller, setNo, score);
      }
    }
    const sw: 0 | 1 = score[0] > score[1] ? 0 : 1;
    setsWon[sw]++;
    sets.push({ score });
    say(`${setNo}세트 ${score[0]}:${score[1]}`);
    firstServer = (1 - firstServer) as 0 | 1;
    for (const c of courts) {
      drainSet(c.team);
      for (const p of c.team.bench!) p.energy = Math.min(100, p.energy + CFG.benchRecover);
    }
  }

  /** the person stops steering: a coach (or nobody) runs their side from here */
  function takeOver(auto: Coach | 'none') {
    if (manual === undefined) return;
    coaches[manual] = auto === 'none' ? undefined : auto;
    manual = undefined;
  }

  /** A coach's plan for a break. Legacy hooks first, then atBreak on top. */
  function decide(side: 0 | 1, kind: BreakKind, by: 0 | 1 | undefined, setNo: number, score: [number, number]): BreakPlan {
    const c = coaches[side];
    if (!c) return {};
    const v = view(side, setNo, score);
    const plan: BreakPlan = {};
    if (kind === 'set') { plan.subs = c.substitutions?.(v); plan.tactic = c.betweenSets?.(v) || undefined; }
    if (kind === 'timeout' && by === side) plan.tactic = c.inTimeout?.(v) || undefined;
    const extra = c.atBreak?.(v, kind, by === side);
    if (extra?.tactic) plan.tactic = { ...plan.tactic, ...extra.tactic };
    if (extra?.subs) plan.subs = [...(plan.subs ?? []), ...extra.subs];
    return plan;
  }

  /**
   * Both sides decide at the same time: the AI's plan is fixed before the person answers,
   * so it never reacts to the person's change in this break.
   */
  function* breakTime(kind: BreakKind, by: 0 | 1 | undefined, setNo: number, score: [number, number]): Generator<MatchEvent, void, StepInput | undefined> {
    const plans: BreakPlan[] = [0, 1].map(side => (side === manual ? {} : decide(side as 0 | 1, kind, by, setNo, score)));
    if (manual !== undefined) {
      const me = manual;
      const inp = yield {
        type: 'break', kind, by, setNo, score: [score[0], score[1]], lines: flush(),
        view: view(me, setNo, score), oppTactic: { ...courts[1 - me].team.tactic }, box: lines,
      };
      if (inp?.auto) { takeOver(inp.auto); plans[me] = decide(me, kind, by, setNo, score); }
      else plans[me] = { tactic: inp?.tactic, subs: inp?.subs };
    }
    const when = kind === 'set' ? `${setNo}세트 시작` : kind === 'technical' ? '테크니컬 타임아웃' : '작전 타임';
    for (const side of [0, 1] as const) {
      for (const [slot, inP] of plans[side].subs ?? []) {
        if (kind !== 'set' && slot !== 'L') {
          if (subsLeft[side] <= 0) break;
          subsLeft[side]--;
        }
        substitute(side, slot, inP);
      }
      applyTactic(side, plans[side].tactic, when);
    }
  }

  function view(side: 0 | 1, setNo: number, score: [number, number]): CoachView {
    return {
      setNo, score: side === 0 ? [score[0], score[1]] : [score[1], score[0]],
      setsWon: side === 0 ? [setsWon[0], setsWon[1]] : [setsWon[1], setsWon[0]],
      me: courts[side].team, opp: courts[1 - side].team,
      oppAttacks: { ...oppAttacks[side] }, myRecv: { ...recv[side] },
      oppRun: run[1 - side], timeoutsLeft: toLeft[side], subsLeft: subsLeft[side],
      line, rand: () => rng.next(),
    };
  }

  function applyTactic(side: 0 | 1, change: Partial<Tactic> | void, when: string) {
    if (!change) return;
    const t = courts[side].team.tactic;
    const diff = (Object.keys(change) as (keyof Tactic)[]).filter(k => change[k] !== undefined && change[k] !== t[k]);
    if (!diff.length) return;
    Object.assign(t, change);
    tacticChanges[side]++;
    say(`${courts[side].team.name} ${when}: 작전 변경 (${diff.map(k => tacticText(k, t[k])).join(', ')})`);
  }

  function substitute(side: 0 | 1, slot: number | 'L', inP: Player) {
    const t = courts[side].team;
    const bi = t.bench!.indexOf(inP);
    if (bi < 0) return;
    const out = slot === 'L' ? t.libero : t.lineup[slot];
    if (slot === 'L') t.libero = inP; else t.lineup[slot] = inP;
    t.bench!.splice(bi, 1, out);
    subs[side]++;
    say(`${t.name} 교체: ${out.name} → ${inP.name}`);
  }

  if (manual !== undefined) flush();
  return { sets, winner: setsWon[0] > setsWon[1] ? 0 : 1, setsWon, lines, team: totals, log, timeouts, tacticChanges, subs, technicalTimeouts: technical, tacticHits };
}

/** Korean names of tactic values, for the play-by-play */
export const TACTIC_NAMES: { [K in keyof Tactic]-?: [string, Record<string, string>] } = {
  distribution: ['공격 배분', { left: '레프트 중심', right: '라이트 집중', middle: '중앙 활용', balanced: '고른 배분' }],
  tempo: ['템포', { high: '높은 공', fast: '빠른 공' }],
  serve: ['서브', { power: '강서브', target: '목적타', safe: '안전 서브' }],
  aim: ['목적타', { weak: '약한 리시버', hitter: '공격수 겨냥', seam: '리시버 사이 틈', short: '짧은 서브' }],
  block: ['블로킹', { read: '따라가기', commit: '예측', aceMark: '에이스 마크' }],
  defense: ['수비', { deep: '강타 대비', tip: '연타 대비' }],
  reception: ['리시브', { 2: '2인', 3: '3인' }],
  trick: ['세트 플레이', { none: '정공법', decoy: '속공 페이크', dump: '세터 투 어택' }],
};
export const tacticText = (k: keyof Tactic, v: unknown) => `${TACTIC_NAMES[k][0]} ${TACTIC_NAMES[k][1][String(v)] ?? v}`;

/** GDD 7.4 fatigue per set, applied to the six starters and the libero */
function drainSet(t: Team) {
  for (const p of [...t.lineup, t.libero]) {
    const condMul = p.condition >= CFG.condUpAt ? 0.7 : p.condition < CFG.condDownBelow ? 1.15 : 1;
    const d = CFG.drainPerSet * CFG.drainPos[p.position] * (1.3 - p.phys.stamina / 200) * condMul;
    p.energy = Math.max(0, p.energy - d);
  }
}
