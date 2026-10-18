/** One full season: offseason turns → regular season → playoffs → books → off turns (GDD 3) */
import type { Player, Position, Tactic, Team } from '../types.ts';
import { Rng } from '../rng.ts';
import { ovr, gaugeMul, DEFAULT_TACTIC, makePlayer } from '../player.ts';
import { playMatch } from '../match.ts';
import { applyDecline, makePro, notePeak, potentialFromGrade, seasonGP, spendGP, trainModeFor } from './growth.ts';
import { GRADE_RANGE, RULES } from './rules.ts';
import { askingSalary } from './contract.ts';
import { rollSkill, skillSlots, startingSkills } from '../skills.ts';
import { budgetOf, payroll, randomAge, signPro } from './world.ts';
import type { Club, Facility, Grade, GrowthType, Pro, SeasonRecord, World } from './types.ts';

const POS: Position[] = ['S', 'OP', 'OH', 'MB', 'L'];

// ───────────────────────── lineup & tactics (BALANCE-SIM 2.1) ─────────────────────────

export function available(c: Club, pos: Position): Pro[] {
  return c.roster.filter(p => p.position === pos && p.injured === 0)
    .sort((a, b) => ovr(b) * gaugeMul(b) - ovr(a) * gaugeMul(a));
}

export function pick(c: Club, pos: Position, n: number, used: Set<string>): Pro[] {
  let pool = available(c, pos).filter(p => !used.has(p.id));
  const fresh = pool.filter(p => p.energy >= 45);
  if (fresh.length >= n) pool = fresh;
  if (pool.length < n) {
    // emergency: anyone healthy from another position
    const extra = c.roster.filter(p => p.injured === 0 && !used.has(p.id) && !pool.includes(p) && p.position !== 'L');
    pool = pool.concat(extra.sort((a, b) => ovr(b) - ovr(a)));
  }
  const out = pool.slice(0, n);
  out.forEach(p => used.add(p.id));
  return out;
}

export function aiTactic(starters: Pro[]): Tactic {
  const t: Tactic = { ...DEFAULT_TACTIC };
  const op = starters.find(p => p.position === 'OP');
  const mbs = starters.filter(p => p.position === 'MB');
  const ohs = starters.filter(p => p.position === 'OH');
  const best = Math.max(...starters.filter(p => p.position !== 'S' && p.position !== 'L').map(p => p.tech.spike));
  if (op && op.tech.spike >= best) t.distribution = 'right';
  else if (mbs.length && mbs.reduce((a, p) => a + p.tech.quick, 0) / mbs.length > (ohs[0]?.tech.spike ?? 0)) t.distribution = 'middle';
  const serve = starters.reduce((a, p) => a + p.tech.serve, 0) / starters.length;
  const avg = starters.reduce((a, p) => a + ovr(p), 0) / starters.length;
  t.serve = serve > avg + 2 ? 'power' : 'target';
  return t;
}

export function buildTeam(c: Club): { team: Team; starters: Pro[] } {
  const used = new Set<string>();
  const [s] = pick(c, 'S', 1, used);
  const oh = pick(c, 'OH', 2, used);
  const mb = pick(c, 'MB', 2, used);
  const [op] = pick(c, 'OP', 1, used);
  const [l] = pick(c, 'L', 1, used);
  const lineup = [s, oh[0], mb[0], op, oh[1], mb[1]] as Player[];
  const starters = [...lineup, l] as Pro[];
  return { team: { name: c.name, lineup, libero: l, tactic: aiTactic(starters) }, starters };
}

// ───────────────────────── schedule ─────────────────────────

/** Circle method: 7 matchdays per round for 8 clubs, home/away alternating by round */
export function schedule(ids: number[], games: number): [number, number][][] {
  const rounds = Math.round(games / 7);
  const days: [number, number][][] = [];
  for (let r = 0; r < rounds; r++) {
    const arr = [...ids];
    for (let d = 0; d < 7; d++) {
      const day: [number, number][] = [];
      for (let i = 0; i < 4; i++) {
        const a = arr[i], b = arr[7 - i];
        day.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      days.push(day);
      arr.splice(1, 0, arr.pop()!);
    }
  }
  return days;
}

// ───────────────────────── gauges, injuries ─────────────────────────

export function afterMatch(rng: Rng, c: Club, starters: Pro[], won: boolean, sets: number, remaining: number) {
  const startIds = new Set(starters.map(p => p.id));
  c.streak = won ? Math.max(1, c.streak + 1) : Math.min(-1, c.streak - 1);
  for (const p of c.roster) {
    p.segGames++;
    if (startIds.has(p.id)) {
      p.segPlayed++;
      p.sense = Math.min(100, p.sense + (p.sense >= 80 ? 3 : 6));
      p.condition += won ? 2 : -1;
      // injury (GDD 7.4)
      let risk = sets * RULES.injuryPerSet * (p.energy < 30 ? 3 : 1) * (p.condition < 35 ? 1.15 : 1)
        * (1.1 - p.phys.flexibility / 500) * RULES.medicalMult[c.facilities.medical];
      if (rng.chance(risk)) {
        const r = rng.next();
        p.injured = r < 0.8 ? rng.int(1, 2) : r < 0.98 ? rng.int(3, 8) : remaining + 20;
        c.injuries++;
      }
    } else {
      p.sense = Math.max(0, p.sense - (c.roster.indexOf(p) >= 14 ? 1 : 3));
      if (p.injured > 0) p.injured--;
    }
    if (c.streak >= 3) p.condition += 3;
    if (c.streak <= -3) p.condition -= 3;
    if (p.condition < 60) p.condition += 2 * (p.energy >= 80 ? 1.5 : p.energy >= 50 ? 1 : 0.5) * (1 + c.facilities.restaurant * 0.08);
    if (rng.chance(0.01)) p.condition += 12;
    if (rng.chance(0.008)) p.condition -= 10;
    p.condition = Math.max(0, Math.min(100, p.condition));
    const zone = p.energy >= 70 ? 1.25 : p.energy >= 40 ? 1 : 0.7;
    p.energy = Math.min(100, p.energy + 24 * zone * (0.9 + c.facilities.restaurant * 0.1));
  }
}

// ───────────────────────── growth checkpoints (GDD 6.1) ─────────────────────────

/** Growth environment of a club: training facility × coach (GDD 6.2, best = 1.0) */
export function clubGrowthMult(c: Club): number {
  return RULES.trainingMult[c.facilities.training] * RULES.coachMult[c.coach ?? RULES.defaultCoach[c.division]];
}

/** Playing time (Julius 2026-10-17): starters grow fastest, 2군 and unused players slower */
export function playMult(c: Club, p: Pro): number {
  if (p.injured > 0) return RULES.playMult.injured;
  if (c.roster.indexOf(p) >= 14) return RULES.playMult.reserve;
  if (!p.segGames) return RULES.playMult.regular; // no matches yet in this segment
  const ratio = p.segPlayed / p.segGames;
  return ratio >= 0.7 ? RULES.playMult.regular : ratio >= 0.3 ? RULES.playMult.rotation : RULES.playMult.bench;
}

export function growClub(c: Club, share: number, offseasonUnits?: number) {
  const env = clubGrowthMult(c);
  for (const p of c.roster) {
    if (p.foreign) continue;
    let gp = seasonGP(p, env) * share;
    if (offseasonUnits !== undefined) gp *= Math.min(6, offseasonUnits) / 6;
    else gp *= playMult(c, p);
    spendGP(p, gp, trainModeFor(p));
    notePeak(p);
    p.segGames = 0; p.segPlayed = 0;
  }
}

// ───────────────────────── standings & playoffs ─────────────────────────

export function rankDivision(clubs: Club[]): Club[] {
  return [...clubs].sort((a, b) => b.points - a.points || b.wins - a.wins
    || (b.setsWon / Math.max(1, b.setsLost)) - (a.setsWon / Math.max(1, a.setsLost)));
}

export function series(rng: Rng, hi: Club, lo: Club, need: number): Club {
  let w = [0, 0];
  for (let g = 0; w[0] < need && w[1] < need; g++) {
    const home = g % 2 === 0 ? hi : lo;
    const away = home === hi ? lo : hi;
    for (const c of [home, away]) for (const p of c.roster) p.energy = Math.min(100, p.energy + 30);
    const a = buildTeam(home), b = buildTeam(away);
    const r = playMatch([a.team, b.team], { seed: rng.int(1, 2 ** 31) });
    const winner = r.winner === 0 ? home : away;
    w[winner === hi ? 0 : 1]++;
  }
  return w[0] >= need ? hi : lo;
}

// ───────────────────────── books (GDD 12) ─────────────────────────

export function settleBooks(c: Club, finish: number, homeGames: number) {
  const base = budgetOf(c);
  const winPct = c.wins / Math.max(1, c.wins + c.losses);
  const seats = RULES.stadiumSeats[c.facilities.stadium];
  const crowd = Math.min(seats, c.fans * 0.15 * (0.7 + 0.6 * winPct));
  const tickets = homeGames * crowd * RULES.ticketPrice[c.division];
  const goods = c.fans * RULES.goodsPerFan;
  const prize = finish <= 4 ? RULES.prize[c.division][finish - 1] : 0;
  const sponsor = base * (1 + RULES.sponsorPerf * (1 - 2 * (c.lastRank - 1) / 7));
  const income = sponsor + tickets + goods + prize;
  const maint = 0.01 * base * Object.values(c.facilities).reduce((a, b) => a + b, 0);
  const expense = payroll(c) + RULES.opsShare[c.division] * base + maint + [2, 1, 0.5][c.division];
  c.income = income; c.expense = expense;
  c.balancePct = 100 * (income - expense) / base;
  c.cash += income - expense;
  c.deficitStreak = income < expense ? c.deficitStreak + 1 : 0;
  c.fans *= 0.85 + 0.3 * winPct + (finish === 1 ? 0.1 : 0);
}

export function invest(c: Club) {
  const reserve = RULES.reserveShare[c.personality] * budgetOf(c);
  const order: Facility[] = ['training', 'medical', 'restaurant', 'stadium', 'analysis', 'bus'];
  for (const f of order) {
    const lvl = c.facilities[f];
    if (lvl >= 5) continue;
    const cost = RULES.upgradeBase[lvl + 1] * RULES.facilityWeight[f];
    if (c.cash - reserve >= cost * 1.5) { c.cash -= cost; c.facilities[f]++; }
  }
}

// ───────────────────────── off turns (GDD 3.1, 14) ─────────────────────────

export const NEED: Record<Position, number> = { S: 2, OP: 2, OH: 4, MB: 4, L: 2 };

export function wantsToKeep(c: Club, p: Pro): boolean {
  const same = c.roster.filter(q => q.position === p.position && !q.foreign).sort((a, b) => ovr(b) - ovr(a));
  const rank = same.indexOf(p);
  const young = p.age <= 25 && (p.potPhys + p.potTech) / 2 - ovr(p) >= 8;
  return rank < NEED[p.position] || young;
}

export function payRoom(c: Club): number {
  let limit = RULES.payrollShare[c.personality] * budgetOf(c);
  if (RULES.salaryCap !== null) limit = Math.min(limit, RULES.salaryCap * RULES.baseBudget[c.division]);
  return limit - payroll(c);
}

/** A club deep in debt must sell its most expensive players to whoever can pay (GDD: 상위 구단도 위험). */
export function distressSales(world: World, rng: Rng, canBuy: (c: Club) => boolean = () => true) {
  for (const c of world.clubs) {
    for (let n = 0; n < 3 && c.cash < -RULES.distressAt * budgetOf(c); n++) {
      const p = c.roster.filter(q => !q.foreign).sort((a, b) => b.salary - a.salary)[0];
      if (!p) break;
      const fee = askingSalary(p) * RULES.transferFeeMult;
      const buyer = world.clubs.filter(o => o !== c && canBuy(o) && o.cash >= fee && payRoom(o) >= askingSalary(p))
        .sort((a, b) => a.division - b.division || b.cash - a.cash)[0];
      c.roster.splice(c.roster.indexOf(p), 1);
      c.forcedSales++;
      if (buyer) {
        buyer.cash -= fee; c.cash += fee;
        buyer.transferNet -= fee; c.transferNet += fee;
        signPro(buyer, p, rng);
      } else { p.clubId = -1; world.freeAgents.push(p); }
    }
  }
}

/** Higher-division clubs buy the best players of lower divisions (sorts the pyramid). */
export function transfers(world: World, rng: Rng) {
  const buyers = [...world.clubs].filter(c => c.division < 2).sort((a, b) => a.division - b.division);
  for (const c of buyers) {
    for (let n = 0; n < RULES.transfersPerClub; n++) {
      const { starters } = buildTeam(c);
      const weakest = starters.filter(p => !p.foreign).sort((a, b) => ovr(a) - ovr(b))[0];
      if (!weakest) break;
      const targets = world.clubs.filter(o => o.division > c.division)
        .flatMap(o => o.roster.filter(p => !p.foreign && p.position === weakest.position && ovr(p) >= ovr(weakest) + 3).map(p => ({ o, p })))
        .sort((a, b) => ovr(b.p) - ovr(a.p));
      const deal = targets.find(({ p }) => {
        const fee = askingSalary(p) * RULES.transferFeeMult;
        return payRoom(c) + weakest.salary >= askingSalary(p) && c.cash >= fee;
      });
      if (!deal) break;
      const { o, p } = deal;
      const fee = askingSalary(p) * RULES.transferFeeMult;
      c.cash -= fee; o.cash += fee;
      c.transferNet -= fee; o.transferNet += fee;
      o.roster.splice(o.roster.indexOf(p), 1);
      releaseTo(world, c, weakest);
      signPro(c, p, rng);
    }
  }
}

export function releaseTo(world: World, c: Club, p: Pro) {
  c.roster.splice(c.roster.indexOf(p), 1);
  p.clubId = -1;
  if (!p.foreign) world.freeAgents.push(p);
}

/** GDD 14.1 — once a season, a player with an empty slot may learn a new skill (younger learn faster) */
export function learnSkills(world: World, rng: Rng) {
  for (const p of [...world.clubs.flatMap(c => c.roster), ...world.freeAgents]) {
    if (p.foreign || p.skills.length >= skillSlots(ovr(p))) continue;
    if (!rng.chance(p.age <= 24 ? 0.3 : p.age <= 29 ? 0.2 : 0.1)) continue;
    const s = rollSkill(rng, ovr(p), p.position, p.skills);
    if (s) p.skills.push(s);
  }
}

export function retirements(world: World, rng: Rng) {
  world.retired = [];
  const pools = [...world.clubs.map(c => c.roster), world.freeAgents];
  for (const pool of pools) {
    for (const p of [...pool]) {
      if (p.foreign) continue;
      const unsigned = p.clubId === -1;
      let prob = p.age >= 40 ? 1 : p.age >= 33 ? 0.15 + (p.age - 33) * 0.12 : 0;
      // nobody signed them: veterans quit, young players keep trying
      if (unsigned) prob += p.age >= 31 ? 0.4 : p.age >= 28 ? 0.15 : 0.03;
      if (rng.chance(prob)) {
        pool.splice(pool.indexOf(p), 1);
        world.retired.push(p);
      }
    }
  }
}

export function contracts(world: World, rng: Rng) {
  for (const c of world.clubs) {
    for (const p of [...c.roster]) {
      if (p.foreign) { c.roster.splice(c.roster.indexOf(p), 1); continue; } // 1-year deals end
      p.contract--;
      if (p.contract > 0) continue;
      // internal FA: re-sign or let go
      const ask = askingSalary(p) * (c.lastRank <= 2 ? 1 + RULES.winnerRaise : 1);
      if (wantsToKeep(c, p) && payRoom(c) + p.salary >= ask) {
        p.salary = ask; p.contract = rng.int(1, 3);
      } else releaseTo(world, c, p);
    }
  }
}

export function needScore(c: Club, p: Pro): number {
  const same = c.roster.filter(q => q.position === p.position && !q.foreign);
  const short = NEED[p.position] - same.length;
  const worst = same.length ? Math.min(...same.map(q => ovr(q))) : 0;
  return (short > 0 ? 20 * short : 0) + Math.max(0, ovr(p) - worst);
}

export function externalFA(world: World, rng: Rng) {
  world.freeAgents.sort((a, b) => ovr(b) - ovr(a));
  for (const p of [...world.freeAgents]) {
    const ask = askingSalary(p);
    const offers = world.clubs
      .filter(c => payRoom(c) >= ask && (c.roster.length < RULES.rosterSize || needScore(c, p) > 3))
      .map(c => ({ c, score: ask * [1.2, 1.0, 0.85][c.division] * (1 + needScore(c, p) / 50) + rng.next() * 0.2 }))
      .sort((a, b) => b.score - a.score);
    if (!offers.length) continue;
    const c = offers[0].c;
    if (c.roster.length >= RULES.rosterSize) {
      const same = c.roster.filter(q => q.position === p.position && !q.foreign).sort((a, b) => ovr(a) - ovr(b));
      const cut = same.length > NEED[p.position] ? same[0] : c.roster.filter(q => !q.foreign).sort((a, b) => ovr(a) - ovr(b))[0];
      releaseTo(world, c, cut);
    }
    world.freeAgents.splice(world.freeAgents.indexOf(p), 1);
    signPro(c, p, rng);
  }
}

const skippedForeign: [number, number, number] = [0, 0, 0];
export function foreigners(world: World, rng: Rng) {
  for (const c of world.clubs) {
    const [m, sd] = RULES.foreignOvr[c.division];
    let target = Math.round(rng.normal(m, sd));
    // can't afford the usual level → try a B-grade, else go without (invest clubs gamble anyway)
    if (payRoom(c) < RULES.foreignSalary(target) && c.personality !== 'invest') target = Math.min(target, 76);
    const cost = RULES.foreignSalary(target);
    if (payRoom(c) < cost && c.personality !== 'invest') { skippedForeign[c.division]++; continue; }
    const base = makePlayer(rng, 'OP', target);
    const p: Pro = {
      ...base, id: `f${world.year}-${c.id}`, name: `용병-${c.id}`, age: 27, growth: 'normal', potGrade: 'A',
      potPhys: 99, potTech: 99, salary: cost, contract: 1, injured: 0, foreign: true, clubId: c.id,
      peakOvr: target, peakAge: 27, segGames: 0, segPlayed: 0,
    };
    p.skills = startingSkills(rng, target, 'OP');
    c.roster.push(p);
  }
}

export interface DraftLog { year: number; ids: string[] }

export function draft(world: World, rng: Rng, log: DraftLog[]) {
  const grades = Object.keys(RULES.draftGrades) as Grade[];
  const weights = grades.map(g => RULES.draftGrades[g]);
  const pool: Pro[] = [];
  for (let i = 0; i < 24 * RULES.draftPoolPerClub; i++) {
    const g = rng.pickWeighted(grades, weights);
    const age = rng.pickWeighted([19, 20, 21, 22, 23], [40, 15, 15, 20, 10]);
    pool.push(makePro(rng, rng.pickWeighted(POS, [1, 1, 2, 2, 1]), potentialFromGrade(rng, g), age));
  }
  // order: lower divisions first by default so small clubs get the best prospects; worst rank first inside a division
  const order = [...world.clubs].sort((a, b) =>
    (RULES.draftOrder === 'lowerFirst' ? b.division - a.division : a.division - b.division) || b.lastRank - a.lastRank);
  const firsts: string[] = [];
  for (let round = 0; round < 8 && pool.length; round++) {
    for (const c of order) {
      const domestic = c.roster.filter(p => !p.foreign).length;
      if (domestic >= RULES.rosterSize - 1 || !pool.length) continue;
      const scored = pool.map(p => ({ p, s: (p.potPhys + p.potTech) / 2 + rng.normal(0, 6) + needScore(c, p) * 0.3 }))
        .sort((a, b) => b.s - a.s);
      const p = scored[0].p;
      pool.splice(pool.indexOf(p), 1);
      signPro(c, p, rng);
      p.contract = 3;
      if (round === 0 && firsts.length < 3) firsts.push(p.id);
    }
  }
  log.push({ year: world.year, ids: firsts });
}

/** Every club must field the minimum per position; fill holes from FA, else a cheap local. */
export function fillMinimums(world: World, rng: Rng) {
  for (const c of world.clubs) {
    for (const pos of POS) {
      while (c.roster.filter(p => p.position === pos && !p.foreign).length < NEED[pos]) {
        const fa = world.freeAgents.filter(p => p.position === pos).sort((a, b) => ovr(b) - ovr(a))[0];
        if (fa) { world.freeAgents.splice(world.freeAgents.indexOf(fa), 1); signPro(c, fa, rng); }
        else signPro(c, makePro(rng, pos, rng.int(...GRADE_RANGE[['D', 'E', 'F'][c.division] as Grade]), randomAge(rng)), rng);
      }
    }
  }
}

// ───────────────────────── the season ─────────────────────────

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function playSeason(world: World, rng: Rng, draftLog: DraftLog[]): SeasonRecord {
  skippedForeign.fill(0);
  const games = RULES.gamesPerSeason;
  for (const c of world.clubs) {
    c.wins = c.losses = c.points = c.setsWon = c.setsLost = c.streak = c.injuries = 0;
    c.transferNet = 0; c.forcedSales = 0;
    if (c.parachute > 0) c.parachute--;
    for (const p of c.roster) { p.segGames = 0; p.segPlayed = 0; p.energy = 100; p.condition = 55; p.injured = 0; }
  }

  // ① 시즌 준비 ② 전지훈련 ③④⑤ 자유 턴 → G1 (AI: practice matches while sense is low)
  for (const c of world.clubs) {
    let units = 0.8 + 1.6;
    for (const p of c.roster) p.sense = Math.max(0, p.sense - 2 + 4);
    for (let t = 0; t < 3; t++) {
      const avgSense = c.roster.reduce((a, p) => a + p.sense, 0) / c.roster.length;
      if (avgSense < 70) {
        units += 0.6;
        for (const p of c.roster) { p.sense = Math.min(100, p.sense + (p.sense >= 80 ? 4 : 8)); p.condition -= 3; }
      } else { units += 1.2; for (const p of c.roster) p.sense -= 2; }
    }
    growClub(c, 0.5, units);
  }

  // regular season by division
  const checkpoints = [Math.ceil(games / 4), Math.ceil(games / 2), Math.ceil(games * 3 / 4), games];
  const divClubs = [0, 1, 2].map(d => world.clubs.filter(c => c.division === d));
  const days = divClubs.map(cs => schedule(cs.map(c => c.id), games));
  const byId = new Map(world.clubs.map(c => [c.id, c]));
  const nDays = days[0].length;
  for (let day = 0; day < nDays; day++) {
    for (let d = 0; d < 3; d++) {
      for (const [h, a] of days[d][day]) {
        const H = byId.get(h)!, A = byId.get(a)!;
        const bh = buildTeam(H), ba = buildTeam(A);
        const r = playMatch([bh.team, ba.team], { seed: rng.int(1, 2 ** 31) });
        const sets = r.setsWon[0] + r.setsWon[1];
        const [W, L] = r.winner === 0 ? [H, A] : [A, H];
        W.wins++; L.losses++;
        const close = sets === 5;
        W.points += close ? 2 : 3; if (close) L.points += 1;
        H.setsWon += r.setsWon[0]; H.setsLost += r.setsWon[1];
        A.setsWon += r.setsWon[1]; A.setsLost += r.setsWon[0];
        afterMatch(rng, H, bh.starters, r.winner === 0, sets, nDays - day);
        afterMatch(rng, A, ba.starters, r.winner === 1, sets, nDays - day);
      }
    }
    if (checkpoints.includes(day + 1)) for (const c of world.clubs) growClub(c, 0.125);
  }

  // playoffs, promotion/relegation
  const champion: [number, number, number] = [-1, -1, -1];
  const promoted: number[] = [], relegated: number[] = [];
  let firstSeedChampion = 0;
  const finals: Club[][] = [];
  const ranked = divClubs.map(rankDivision);
  for (let d = 0; d < 3; d++) {
    const r = ranked[d];
    r.forEach((c, i) => (c.lastRank = i + 1));
    const semi = series(rng, r[2], r[3], 2);
    const po = series(rng, r[1], semi, 2);
    const champ = series(rng, r[0], po, 3);
    champion[d] = champ.id;
    if (champ === r[0]) firstSeedChampion++;
    finals.push([r[0], po]);
    // finish order for prize money: champion, runner-up, then PO / semi losers
    const finish = new Map<number, number>();
    finish.set(champ.id, 1);
    finish.set((champ === r[0] ? po : r[0]).id, 2);
    const poLoser = po === r[1] ? semi : r[1];
    const semiLoser = semi === r[2] ? r[3] : r[2];
    finish.set(poLoser.id, 3); finish.set(semiLoser.id, 4);
    for (const c of r) settleBooks(c, finish.get(c.id) ?? 99, games / 2);
  }
  for (let d = 0; d < 2; d++) {
    const down = ranked[d].slice(6);
    const up = finals[d + 1];
    for (const c of down) { c.division = (d + 1) as 0 | 1 | 2; c.fans *= 0.8; c.parachute = 2; relegated.push(c.id); }
    for (const c of up) { c.division = d as 0 | 1 | 2; c.fans *= 1.3; promoted.push(c.id); }
  }

  // record before the off turns change rosters
  const starterOvr = (cs: Club[]) => cs.reduce((a, c) => a + buildTeam(c).starters.reduce((x, p) => x + ovr(p), 0) / 7, 0) / cs.length;
  const domestic = [...world.clubs.flatMap(c => c.roster), ...world.freeAgents].filter(p => !p.foreign);
  const balances: [number[], number[], number[]] = [[], [], []];
  ranked.forEach((r, d) => r.forEach(c => balances[d].push(c.balancePct)));

  for (const c of world.clubs) invest(c);
  // 결산 → 시상식 → 은퇴 → 내부 FA → 외부 FA → 용병 → 드래프트
  for (const c of world.clubs) for (const p of c.roster) { p.age++; applyDecline(p); p.sense = Math.max(0, p.sense - 25); }
  for (const p of world.freeAgents) { p.age++; applyDecline(p); }
  retirements(world, rng);
  learnSkills(world, rng);
  contracts(world, rng);
  distressSales(world, rng);
  externalFA(world, rng);
  foreigners(world, rng);
  draft(world, rng, draftLog);
  fillMinimums(world, rng);
  // transfers need full rosters to judge the weakest starter; sellers refill afterwards
  transfers(world, rng);
  fillMinimums(world, rng);

  const peakAges: Record<GrowthType, number[]> = { early: [], normal: [], late: [], elite: [] };
  for (const p of world.retired) peakAges[p.growth].push(p.peakAge);
  const rec: SeasonRecord = {
    year: world.year, champion, promoted, relegated,
    divStarterOvr: ranked.map(starterOvr) as [number, number, number],
    domesticS: domestic.filter(p => ovr(p) >= 90).length,
    domesticA: domestic.filter(p => ovr(p) >= 80 && ovr(p) < 90).length,
    retireAges: world.retired.map(p => p.age),
    peakAges,
    injuriesPerClub: world.clubs.reduce((a, c) => a + c.injuries, 0) / 24,
    seasonOutInjuries: 0,
    balances,
    deficit3: world.clubs.filter(c => c.deficitStreak >= 3).length,
    firstSeedChampion,
    draftTop: [],
    divisions: world.clubs.map(c => c.division),
    transferNet: [0, 1, 2].map(d => avgOf(world.clubs.filter(c => c.division === d).map(c => c.transferNet))) as [number, number, number],
    forcedSales: [0, 1, 2].map(d => world.clubs.filter(c => c.division === d).reduce((a, c) => a + c.forcedSales, 0)) as [number, number, number],
    skippedForeign: [...skippedForeign] as [number, number, number],
    negative: balances.map(b => b.filter(x => x < 0).length) as [number, number, number],
  };
  world.history.push(rec);
  world.year++;
  return rec;
}
