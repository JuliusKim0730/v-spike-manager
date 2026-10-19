/**
 * Career mode turn loop (GDD 3): one turn = one match day or one step of the off-season.
 * Reuses the balance-sim league code (engine/league/season.ts) and drives it turn by turn
 * so the player can decide between turns.
 */
import type { MatchResult, Player, PlayerLine, Position, Tactic, Team } from '../engine/types.ts';
import { Rng } from '../engine/rng.ts';
import { ID_SEQ, makePlayer, ovr, DEFAULT_TACTIC } from '../engine/player.ts';
import { matchSteps, playMatch, type MatchEvent, type StepInput } from '../engine/match.ts';
import { aiCoach, assistantCoach, basicCoach } from '../engine/coach.ts';
import { startingSkills } from '../engine/skills.ts';
import { createWorld, budgetOf, payroll, signPro } from '../engine/league/world.ts';
import { RULES, GRADE_RANGE } from '../engine/league/rules.ts';
import { askingSalary } from '../engine/league/contract.ts';
import { applyDecline, makePro, potentialFromGrade } from '../engine/league/growth.ts';
import {
  afterMatch, aiTactic, buildTeam, contracts, distressSales, externalFA, fillMinimums, foreigners, growClub,
  invest, learnSkills, needScore, rankDivision, releaseTo, retirements, schedule, settleBooks, transfers, NEED,
} from '../engine/league/season.ts';
import type { Club, Facility, Grade, Pro, World } from '../engine/league/types.ts';
import { CLUBS, foreignName, koreanName } from './names.ts';

export type PhaseKind =
  | 'prep' | 'camp' | 'free' | 'sponsor'
  | 'match' | 'allstar' | 'playoff'
  | 'books' | 'awards' | 'retire' | 'resign' | 'fa' | 'foreign' | 'draft' | 'next' | 'fired';

export interface Phase { k: PhaseKind; n?: number }

export type FreeChoice = 'practice' | 'train' | 'rest';
export type Preset = 'stable' | 'attack' | 'serve' | 'custom';
/** lineup slots: S, OH1, MB1, OP, OH2, MB2, L */
export const SLOT_POS: Position[] = ['S', 'OH', 'MB', 'OP', 'OH', 'MB', 'L'];
export const SLOT_LABEL = ['세터', '레프트1', '센터1', '라이트', '레프트2', '센터2', '리베로'];

export interface BoxLine extends PlayerLine { id: string; name: string; pos: Position; side: 0 | 1 }

export interface MatchReport {
  title: string;
  home: number; away: number;      // club ids
  userSide: 0 | 1;
  sets: [number, number][];
  setsWon: [number, number];
  winner: 0 | 1;
  log: string[];
  box: BoxLine[];
  tactics: [Tactic, Tactic];
  practice?: boolean;
}

export interface SeriesState { hi: number; lo: number; need: number; w: [number, number]; game: number }
export interface DivPlayoff { stage: 'semi' | 'po' | 'final' | 'done'; series: SeriesState | null; semiW?: number; poW?: number; champ?: number; runnerUp?: number; ranked: number[] }

export interface SeasonStat { g: number; pts: number; kills: number; blocks: number; aces: number; digs: number; recv: number; recvA: number }

export interface DraftState { pool: Pro[]; order: number[]; round: number; idx: number; picks: { club: number; id: string; name: string; round: number }[] }

export interface News { turn: string; text: string; tone?: 'good' | 'bad' | 'info' }

export interface SeasonSummary { year: number; division: number; rank: number; finish: string; trustAfter: number; balance: number }

export interface Career {
  version: 1;
  slot: number;
  savedAt: number;
  seed: number;
  rng: number;
  ids: { player: number; pro: number };
  world: World;
  userId: number;
  games: 28 | 35 | 42;
  funding: number;
  phase: Phase;
  days: [number, number][][][];   // per division: match days
  day: number;                     // next regular match day index
  tactic: Tactic;
  preset: Preset;
  lineup: (string | null)[];
  autoCoach: boolean;
  sponsor: { kind: 'parent' | 'naming'; goalRank: number } | null;
  trust: number;
  growthUnits: number;             // user's preseason training units (GDD 6.1 비시즌 성장)
  news: News[];
  lastMatch: MatchReport | null;
  results: { label: string; opp: number; home: boolean; setsWon: [number, number]; win: boolean }[];
  playoffs: DivPlayoff[] | null;
  stats: Record<string, SeasonStat>;
  awards: { title: string; name: string; club: string; value?: string }[];
  retiredNews: string[];
  expiring: { id: string; ask: number; keep: boolean; years: number }[];
  foreignOptions: Pro[];
  foreignPick: number;             // -1 none
  draft: DraftState | null;
  seasons: SeasonSummary[];
  turnNo: number;
  finishes: Record<number, number>; // last season finish by club (1 = champion)
}

// ───────────────────────── helpers ─────────────────────────

export const userClub = (c: Career) => c.world.clubs[c.userId];
export const clubName = (id: number) => CLUBS[id].name;
export const clubShort = (id: number) => CLUBS[id].short;
export const clubColor = (id: number) => CLUBS[id].color;
export const DIV_NAME = ['1부', '2부', '3부'];
const rngOf = (c: Career) => { const r = new Rng(1); r.state = c.rng; return r; };
const saveRng = (c: Career, r: Rng) => { c.rng = r.state; };

export const PRESETS: Record<Exclude<Preset, 'custom'>, { name: string; desc: string; tactic: Tactic }> = {
  stable: { name: '안정형', desc: '높은 공 · 안전 서브 · 3인 리시브. 범실을 줄이고 버틴다', tactic: { distribution: 'balanced', tempo: 'high', serve: 'safe', block: 'read', defense: 'deep', reception: 3, aim: 'weak', trick: 'none' } },
  attack: { name: '공격형', desc: '라이트 집중 · 빠른 공 · 2인 리시브. 에이스에게 몰아준다', tactic: { distribution: 'right', tempo: 'fast', serve: 'target', block: 'read', defense: 'deep', reception: 2, aim: 'weak', trick: 'none' } },
  serve: { name: '서브 공략형', desc: '강서브로 리시브를 흔들고 높은 공을 블로킹으로 잡는다', tactic: { distribution: 'balanced', tempo: 'high', serve: 'power', block: 'read', defense: 'deep', reception: 3, aim: 'weak', trick: 'none' } },
};

export function phaseLabel(c: Career, p: Phase = c.phase): string {
  const nDays = c.days[0]?.length ?? c.games;
  switch (p.k) {
    case 'prep': return '① 시즌 준비';
    case 'camp': return '② 전지훈련';
    case 'free': return `자유 턴 ${p.n}/3`;
    case 'sponsor': return '⑥ 스폰서 계약';
    case 'match': return `정규리그 ${c.day + 1}/${nDays}경기`;
    case 'allstar': return '올스타 휴식기';
    case 'playoff': return '포스트시즌';
    case 'books': return '결산';
    case 'awards': return '시상식';
    case 'retire': return '은퇴';
    case 'resign': return '내부 FA · 재계약';
    case 'fa': return '외부 FA';
    case 'foreign': return '외국인 트라이아웃';
    case 'draft': return '신인 드래프트';
    case 'next': return '다음 시즌 준비';
    case 'fired': return '해임';
  }
}

/** turns where signing is allowed (GDD 3.3) */
export const canTrade = (c: Career) => ['prep', 'camp', 'free', 'sponsor', 'allstar', 'resign', 'fa', 'foreign'].includes(c.phase.k);

function addNews(c: Career, text: string, tone: News['tone'] = 'info') {
  c.news.unshift({ turn: `${c.world.year}시즌 · ${phaseLabel(c)}`, text, tone });
  if (c.news.length > 60) c.news.length = 60;
}

const allstarAfter = (c: Career) => Math.floor(c.days[0].length / 2);

export function divisionClubs(c: Career, d: number): Club[] {
  return c.world.clubs.filter(x => x.division === d);
}

export function standings(c: Career, d: number): Club[] {
  return rankDivision(divisionClubs(c, d));
}

export function starterAvg(club: Club): number {
  const { starters } = buildTeam(club);
  return starters.reduce((a, p) => a + ovr(p), 0) / starters.length;
}

/** 1군 14 + 2군 8 + 후보군 6 (GDD 4) */
export const MAX_ROSTER = 28;
export const isFirstTeam = (club: Club, p: Pro) => club.roster.indexOf(p) < 14;

// ───────────────────────── new game ─────────────────────────

export interface NewGameOpts { slot: number; division: 0 | 1 | 2; team: number; funding: number; games: 28 | 35 | 42; seed?: number }

/** A world with names, for the team picker and for a new game */
export function makeWorld(seed: number): World {
  ID_SEQ.player = 0; ID_SEQ.pro = 0;
  const w = createWorld(seed);
  const r = new Rng(seed ^ 0x5eed);
  for (const club of w.clubs) {
    club.name = CLUBS[club.id].name;
    for (const p of club.roster) p.name = koreanName(r);
  }
  return w;
}

export function newCareer(o: NewGameOpts): Career {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  const world = makeWorld(seed);
  const userId = o.division * 8 + o.team;
  const user = world.clubs[userId];
  user.budgetFactor *= o.funding;
  user.personality = 'balanced';
  user.cash = 0.15 * budgetOf(user);
  const c: Career = {
    version: 1, slot: o.slot, savedAt: Date.now(), seed, rng: seed ^ 0xabcdef,
    ids: { ...ID_SEQ }, world, userId, games: o.games, funding: o.funding,
    phase: { k: 'prep' }, days: [], day: 0,
    tactic: { ...DEFAULT_TACTIC }, preset: 'custom', lineup: [null, null, null, null, null, null, null], autoCoach: true,
    sponsor: null, trust: 50, growthUnits: 0, news: [], lastMatch: null, results: [], playoffs: null, stats: {},
    awards: [], retiredNews: [], expiring: [], foreignOptions: [], foreignPick: -1, draft: null, seasons: [], turnNo: 1, finishes: {},
  };
  startSeason(c, true);
  addNews(c, `${user.name} 감독으로 부임했습니다. 목표는 시즌 준비 턴부터 차근차근!`, 'good');
  return c;
}

function startSeason(c: Career, first: boolean) {
  const w = c.world;
  for (const club of w.clubs) {
    club.wins = club.losses = club.points = club.setsWon = club.setsLost = club.streak = club.injuries = 0;
    club.transferNet = 0; club.forcedSales = 0;
    if (!first && club.parachute > 0) club.parachute--;
    for (const p of club.roster) { p.segGames = 0; p.segPlayed = 0; p.energy = 100; p.condition = 55; p.injured = 0; }
  }
  c.days = [0, 1, 2].map(d => schedule(divisionClubs(c, d).map(x => x.id), c.games));
  c.day = 0;
  c.results = [];
  c.playoffs = null;
  c.stats = {};
  c.awards = [];
  c.sponsor = null;
  c.growthUnits = 0;
  c.lineup = c.lineup.map(id => (id && userClub(c).roster.some(p => p.id === id) ? id : null));
  c.phase = { k: 'prep' };
  // ① 시즌 준비: base training
  const r = rngOf(c);
  for (const club of w.clubs) for (const p of club.roster) p.sense = Math.max(0, p.sense - 2);
  c.growthUnits += 0.8;
  saveRng(c, r);
}

// ───────────────────────── teams for a match ─────────────────────────

export function userTeam(c: Career): { team: Team; starters: Pro[] } {
  const club = userClub(c);
  const auto = buildTeam(club);
  const autoSlots: Pro[] = [...auto.team.lineup, auto.team.libero] as Pro[];
  const used = new Set<string>();
  const chosen: (Pro | null)[] = c.lineup.map(id => {
    const p = id ? club.roster.find(q => q.id === id) : undefined;
    if (!p || p.injured > 0 || used.has(p.id)) return null;
    used.add(p.id);
    return p;
  });
  // fill empty slots with the auto pick for that slot, else the best healthy player left at that position
  for (let i = 0; i < 7; i++) {
    if (chosen[i]) continue;
    const a = autoSlots[i];
    if (a && !used.has(a.id)) { chosen[i] = a; used.add(a.id); continue; }
    const alt = club.roster.filter(p => !used.has(p.id) && p.injured === 0)
      .sort((x, y) => (y.position === SLOT_POS[i] ? 100 : 0) + ovr(y) - (x.position === SLOT_POS[i] ? 100 : 0) - ovr(x))[0];
    chosen[i] = alt; used.add(alt.id);
  }
  const lineup = chosen.slice(0, 6) as Player[];
  const libero = chosen[6]! as Player;
  const bench = club.roster.filter(p => !used.has(p.id) && p.injured === 0 && isFirstTeam(club, p));
  return { team: { name: club.name, lineup, libero, tactic: { ...c.tactic }, bench }, starters: chosen as Pro[] };
}

/** an opponent's probable starting seven (for the pre-match screen) */
export function clubStarters(c: Career, id: number): Pro[] {
  return id === c.userId ? userTeam(c).starters : buildTeam(c.world.clubs[id]).starters;
}

/** move a player between 1군 (roster index < 14) and 2군; going up swaps with the weakest 1군 non-starter */
export function moveSquad(c: Career, p: Pro): string | null {
  const club = userClub(c);
  const r = club.roster;
  const i = r.indexOf(p);
  if (i < 0) return '우리 선수가 아닙니다';
  if (isFirstTeam(club, p)) {
    if (r.length <= 14) return '선수가 14명 이하라 2군을 따로 둘 수 없습니다';
    r.splice(i, 1); r.push(p);
    c.lineup = c.lineup.map(id => (id === p.id ? null : id));
    return `${p.name} → 2군`;
  }
  const starters = new Set(userTeam(c).starters.map(x => x.id));
  const down = r.slice(0, 14).filter(x => !starters.has(x.id)).sort((a, b) => ovr(a) - ovr(b))[0];
  if (!down) return '1군에 내려보낼 선수가 없습니다';
  const j = r.indexOf(down);
  r[j] = p; r[i] = down;
  return `${p.name} → 1군 · ${down.name} → 2군`;
}

/** share of the regular season played, for the dashboard bar */
export function seasonProgress(c: Career): [number, number] {
  const n = c.days[0]?.length ?? c.games;
  const k = c.phase.k;
  const pre = ['prep', 'camp', 'free', 'sponsor'].includes(k);
  return [pre ? 0 : k === 'match' || k === 'allstar' ? c.day : n, n];
}

function teamFor(c: Career, id: number) {
  if (id === c.userId) return userTeam(c);
  const t = buildTeam(c.world.clubs[id]);
  t.team.tactic = clubTactic(c, id, t.starters);
  t.team.bench = c.world.clubs[id].roster.filter(p => !t.starters.includes(p) && p.injured === 0).slice(0, 7);
  return t;
}

function boxOf(res: ReturnType<typeof playMatch>, teams: [Team, Team]): BoxLine[] {
  const out: BoxLine[] = [];
  teams.forEach((t, side) => {
    const ps = [...t.lineup, t.libero, ...(t.bench ?? [])];
    const seen = new Set<string>();
    for (const p of ps) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const l = res.lines.get(p.id);
      if (!l) continue;
      out.push({ ...l, id: p.id, name: p.name, pos: p.position, side: side as 0 | 1 });
    }
  });
  return out;
}

function recordStats(c: Career, res: ReturnType<typeof playMatch>) {
  for (const [id, l] of res.lines) {
    const s = (c.stats[id] ??= { g: 0, pts: 0, kills: 0, blocks: 0, aces: 0, digs: 0, recv: 0, recvA: 0 });
    s.g++; s.kills += l.kills; s.blocks += l.blocks; s.aces += l.aces; s.digs += l.digs;
    s.recv += l.receives; s.recvA += l.recvA; s.pts += l.kills + l.blocks + l.aces;
  }
}

/** An AI club's game plan for a match: its usual tactic plus a serve aim and set play that vary by match day */
export function clubTactic(c: Career, id: number, starters: Pro[] = buildTeam(c.world.clubs[id]).starters): Tactic {
  const t = aiTactic(starters);
  const r = new Rng((id + 1) * 7919 + c.world.year * 131 + c.day * 31 + (c.phase.k === 'playoff' ? 977 : 0));
  const [s, , mb1, , , mb2] = starters;
  const oh = starters.filter(p => p.position === 'OH');
  if (t.serve === 'target') t.aim = r.pickWeighted(['weak', 'hitter', 'seam', 'short'] as const, [3, 1, 1, 1]);
  const quick = (mb1.tech.quick + mb2.tech.quick) / 2;
  t.trick = s.tech.set >= 66 && quick >= 64 && r.chance(0.4) ? 'decoy' : s.tech.set >= 68 && r.chance(0.25) ? 'dump' : 'none';
  if (r.chance(0.25)) t.reception = oh.every(p => p.tech.receive >= 66) ? 2 : 3;
  if (r.chance(0.2)) t.block = r.pickWeighted(['read', 'commit', 'aceMark'] as const, [2, 1, 1]);
  return t;
}

/** What the person's side does when nobody steers it: the assistant coach, or nothing */
const userAuto = (c: Career) => (c.autoCoach ? assistantCoach : undefined);

/** A user match being played live (web app): the generator plus what the turn needs afterwards */
export interface LiveMatch {
  steps: Generator<MatchEvent, MatchResult, StepInput | undefined>;
  home: number; away: number; userSide: 0 | 1; label: string;
  th: { team: Team; starters: Pro[] }; ta: { team: Team; starters: Pro[] };
  result?: MatchResult;
}

/**
 * Start the user's next match so it can be steered point by point.
 * Finish it, then call advance(c, { live }) to record it with the rest of the match day.
 */
export function startLive(c: Career): LiveMatch | null {
  const f = nextFixture(c);
  if (!f) return null;
  const [h, a] = f.home ? [c.userId, f.opp] : [f.opp, c.userId];
  if (c.phase.k === 'playoff') for (const id of [h, a]) for (const p of c.world.clubs[id].roster) p.energy = Math.min(100, p.energy + 30);
  const r = rngOf(c);
  const seed = r.int(1, 2 ** 31);
  saveRng(c, r);
  const th = teamFor(c, h), ta = teamFor(c, a);
  const userSide: 0 | 1 = h === c.userId ? 0 : 1;
  const coaches: [typeof aiCoach | undefined, typeof aiCoach | undefined] = [aiCoach, aiCoach];
  coaches[userSide] = userAuto(c);
  const steps = matchSteps([th.team, ta.team], { seed, log: true, homeTeam: 0, manual: userSide, coaches });
  return { steps, home: h, away: a, userSide, label: f.label, th, ta };
}

/** Play one match between two clubs; the user's own match gets a full report */
function play(c: Career, r: Rng, h: number, a: number, opts: { remaining: number; league: boolean; label: string }, live?: LiveMatch): 0 | 1 {
  const H = c.world.clubs[h], A = c.world.clubs[a];
  const involvesUser = h === c.userId || a === c.userId;
  const done = involvesUser && live?.result && live.home === h && live.away === a ? live : undefined;
  const th = done ? done.th : teamFor(c, h), ta = done ? done.ta : teamFor(c, a);
  const coachFor = (id: number) => (id === c.userId ? userAuto(c) : involvesUser ? aiCoach : basicCoach);
  const res = done ? done.result! : playMatch([th.team, ta.team], {
    seed: r.int(1, 2 ** 31), log: involvesUser, homeTeam: 0,
    coaches: [coachFor(h), coachFor(a)],
  });
  const sets = res.setsWon[0] + res.setsWon[1];
  recordStats(c, res);
  if (opts.league) {
    const [W, L] = res.winner === 0 ? [H, A] : [A, H];
    W.wins++; L.losses++;
    const close = sets === 5;
    W.points += close ? 2 : 3; if (close) L.points += 1;
    H.setsWon += res.setsWon[0]; H.setsLost += res.setsWon[1];
    A.setsWon += res.setsWon[1]; A.setsLost += res.setsWon[0];
  }
  afterMatch(r, H, th.starters, res.winner === 0, sets, opts.remaining);
  afterMatch(r, A, ta.starters, res.winner === 1, sets, opts.remaining);
  if (involvesUser) {
    const userSide: 0 | 1 = h === c.userId ? 0 : 1;
    c.lastMatch = {
      title: opts.label, home: h, away: a, userSide,
      sets: res.sets.map(s => s.score), setsWon: res.setsWon, winner: res.winner,
      log: res.log, box: boxOf(res, [th.team, ta.team]), tactics: [th.team.tactic, ta.team.tactic],
    };
    const win = res.winner === userSide;
    const us = res.setsWon[userSide], them = res.setsWon[1 - userSide];
    c.results.push({ label: opts.label, opp: userSide === 0 ? a : h, home: userSide === 0, setsWon: [us, them], win });
    for (const p of [...th.starters, ...ta.starters]) {
      if (p.clubId === c.userId && p.injured > 0) addNews(c, `${p.name} 부상 (${p.injured > 30 ? '시즌 아웃' : `${p.injured}경기 결장`})`, 'bad');
    }
  }
  return res.winner;
}

// ───────────────────────── AI preseason (BALANCE-SIM 2.1) ─────────────────────────

const aiUnits = new WeakMap<Club, number>();
function aiFreeTurn(club: Club) {
  const avgSense = club.roster.reduce((a, p) => a + p.sense, 0) / club.roster.length;
  let u = aiUnits.get(club) ?? 2.4;
  if (avgSense < 70) {
    u += 0.6;
    for (const p of club.roster) { p.sense = Math.min(100, p.sense + (p.sense >= 80 ? 4 : 8)); p.condition -= 3; }
  } else { u += 1.2; for (const p of club.roster) p.sense -= 2; }
  aiUnits.set(club, u);
}

// ───────────────────────── advancing turns ─────────────────────────

export interface AdvanceInput { free?: FreeChoice; sponsor?: 'parent' | 'naming'; live?: LiveMatch }

/** Finish the current turn and enter the next one. Returns a short result line for the UI. */
export function advance(c: Career, input: AdvanceInput = {}): string | void {
  const r = rngOf(c);
  const club = userClub(c);
  const ai = c.world.clubs.filter(x => x.id !== c.userId);
  let msg: string | void = undefined;
  c.turnNo++;
  switch (c.phase.k) {
    case 'prep': {
      // ② 전지훈련: training ×1.6, small sense boost (GDD 3.1)
      for (const x of c.world.clubs) for (const p of x.roster) p.sense = Math.min(100, p.sense + 4);
      c.growthUnits += 1.6;
      c.phase = { k: 'camp' };
      break;
    }
    case 'camp': c.phase = { k: 'free', n: 1 }; break;
    case 'free': {
      msg = freeTurn(c, r, input.free ?? 'train');
      for (const x of ai) aiFreeTurn(x);
      c.phase = c.phase.n! < 3 ? { k: 'free', n: c.phase.n! + 1 } : { k: 'sponsor' };
      break;
    }
    case 'sponsor': {
      const kind = input.sponsor ?? 'naming';
      const exp = expectedRank(c);
      const goalRank = Math.max(1, Math.min(userClub(c).division < 2 ? 6 : 7, kind === 'parent' ? exp - 1 : exp + 1));
      c.sponsor = { kind, goalRank };
      addNews(c, `${kind === 'parent' ? '모기업' : '네이밍 스폰서'} 계약. 시즌 목표: 정규리그 ${goalRank}위 이내`, 'info');
      // preseason growth (GDD 6.1 first of five)
      for (const x of c.world.clubs) growClub(x, 0.5, x.id === c.userId ? c.growthUnits : aiUnits.get(x) ?? 4);
      c.phase = { k: 'match' };
      break;
    }
    case 'match': {
      msg = playDay(c, r, input.live);
      if (c.day >= c.days[0].length) startPlayoffs(c);
      else if (c.day === allstarAfter(c)) c.phase = { k: 'allstar' };
      break;
    }
    case 'allstar': c.phase = { k: 'match' }; break;
    case 'playoff': {
      msg = playoffTurn(c, r, input.live);
      if (c.playoffs!.every(p => p.stage === 'done')) { c.phase = { k: 'books' }; enterBooks(c); }
      break;
    }
    case 'books': {
      if (c.trust <= 0 || club.deficitStreak >= 3) { c.phase = { k: 'fired' }; break; }
      c.phase = { k: 'awards' }; enterAwards(c); break;
    }
    case 'awards': c.phase = { k: 'retire' }; enterRetire(c, r); break;
    case 'retire': c.phase = { k: 'resign' }; enterResign(c, r); break;
    case 'resign': leaveResign(c, r); c.phase = { k: 'fa' }; enterFA(c, r); break;
    case 'fa': {
      externalFA({ ...c.world, clubs: ai }, r);
      c.phase = { k: 'foreign' }; enterForeign(c, r); break;
    }
    case 'foreign': leaveForeign(c); c.phase = { k: 'draft' }; enterDraft(c, r); runDraft(c, r); break;
    case 'draft': {
      // skip remaining user picks
      if (c.draft) { c.draft.order = c.draft.order.filter(id => id !== c.userId); runDraft(c, r); }
      finishDraft(c, r);
      c.phase = { k: 'next' };
      break;
    }
    case 'next': {
      c.world.year++;
      startSeason(c, false);
      addNews(c, `${c.world.year}시즌이 시작됩니다. ${DIV_NAME[club.division]} 리그`, 'info');
      break;
    }
    case 'fired': break;
  }
  saveRng(c, r);
  c.ids = { ...ID_SEQ };
  return msg;
}

function expectedRank(c: Career): number {
  const club = userClub(c);
  const cs = divisionClubs(c, club.division).sort((a, b) => starterAvg(b) - starterAvg(a));
  return cs.indexOf(club) + 1;
}

function freeTurn(c: Career, r: Rng, choice: FreeChoice): string {
  const club = userClub(c);
  if (choice === 'practice') {
    c.growthUnits += 0.6;
    const opps = divisionClubs(c, club.division).filter(x => x.id !== c.userId);
    const opp = opps[r.int(0, opps.length - 1)];
    // practice match: no standings, but it moves the gauges (GDD 7.2)
    const th = userTeam(c), ta = teamFor(c, opp.id);
    const res = playMatch([th.team, ta.team], { seed: r.int(1, 2 ** 31), log: true, coaches: [userAuto(c), aiCoach] });
    const startIds = new Set(th.starters.map(p => p.id));
    for (const p of club.roster) {
      const gain = startIds.has(p.id) ? 8 : 4;
      p.sense = Math.min(100, p.sense + (p.sense >= 80 ? gain / 2 : gain));
      p.condition = Math.max(0, p.condition - 3);
      p.energy = Math.min(100, p.energy + 10);
    }
    for (const p of opp.roster) p.energy = 100;
    c.lastMatch = {
      title: `연습경기 vs ${opp.name}`, home: c.userId, away: opp.id, userSide: 0, practice: true,
      sets: res.sets.map(s => s.score), setsWon: res.setsWon, winner: res.winner, log: res.log,
      box: boxOf(res, [th.team, ta.team]), tactics: [th.team.tactic, ta.team.tactic],
    };
    return `연습경기 ${res.setsWon[0]}:${res.setsWon[1]} ${res.winner === 0 ? '승' : '패'} · 경기감각 상승, 컨디션 소폭 하락`;
  }
  if (choice === 'rest') {
    for (const p of club.roster) {
      p.sense = Math.max(0, p.sense - 5);
      p.condition = Math.min(75, Math.max(p.condition, p.condition + 8));
      p.energy = 100;
    }
    return '휴식 · 컨디션·체력 회복, 경기감각 하락';
  }
  c.growthUnits += 1.2;
  for (const p of club.roster) { p.sense = Math.max(0, p.sense - 2); p.energy = Math.min(100, p.energy + 30); }
  return '훈련 · 성장 포인트 적립, 경기감각 소폭 하락';
}

function playDay(c: Career, r: Rng, live?: LiveMatch): string {
  const day = c.day;
  const nDays = c.days[0].length;
  const remaining = nDays - day;
  let msg = '';
  for (let d = 0; d < 3; d++) {
    for (const [h, a] of c.days[d][day]) {
      const w = play(c, r, h, a, { remaining, league: true, label: `정규리그 ${day + 1}경기` }, live);
      if (h === c.userId || a === c.userId) {
        const userWon = (w === 0) === (h === c.userId);
        const opp = h === c.userId ? a : h;
        msg = `${userWon ? '승리' : '패배'} vs ${clubShort(opp)} (${c.lastMatch!.setsWon[c.lastMatch!.userSide]}:${c.lastMatch!.setsWon[1 - c.lastMatch!.userSide]})`;
      }
    }
  }
  c.day++;
  const checkpoints = [Math.ceil(nDays / 4), Math.ceil(nDays / 2), Math.ceil(nDays * 3 / 4), nDays];
  if (checkpoints.includes(c.day)) {
    const club = userClub(c);
    const before = new Map(club.roster.map(p => [p.id, ovr(p)]));
    for (const x of c.world.clubs) growClub(x, 0.125);
    const ups = club.roster.map(p => ({ p, d: ovr(p) - (before.get(p.id) ?? ovr(p)) })).filter(x => x.d > 0).sort((a, b) => b.d - a.d);
    addNews(c, `성장 리포트 (${checkpoints.indexOf(c.day) + 2}/5): ${ups.length ? ups.slice(0, 3).map(x => `${x.p.name} +${x.d}`).join(', ') : '눈에 띄는 변화 없음'}`, 'good');
  }
  return msg;
}

// ───────────────────────── playoffs (GDD 2.1) ─────────────────────────

function startPlayoffs(c: Career) {
  c.playoffs = [0, 1, 2].map(d => {
    const ranked = standings(c, d);
    ranked.forEach((x, i) => (x.lastRank = i + 1));
    return { stage: 'semi', series: { hi: ranked[2].id, lo: ranked[3].id, need: 2, w: [0, 0], game: 0 }, ranked: ranked.map(x => x.id) } as DivPlayoff;
  });
  const rank = userClub(c).lastRank;
  addNews(c, `정규리그 종료: ${rank}위${rank <= 4 ? ' · 포스트시즌 진출!' : ''}`, rank <= 4 ? 'good' : 'info');
  c.phase = { k: 'playoff' };
}

const STAGE_NAME = { semi: '준플레이오프', po: '플레이오프', final: '챔피언결정전', done: '' };

function playoffTurn(c: Career, r: Rng, live?: LiveMatch): string {
  let msg = '';
  for (const po of c.playoffs!) {
    const s = po.series;
    if (!s) continue;
    const homeIsHi = s.game % 2 === 0;
    const h = homeIsHi ? s.hi : s.lo, a = homeIsHi ? s.lo : s.hi;
    const isLive = !!live?.result && live.home === h && live.away === a;
    // a live match already got its rest when it started
    if (!isLive) for (const id of [h, a]) for (const p of c.world.clubs[id].roster) p.energy = Math.min(100, p.energy + 30);
    const label = `${STAGE_NAME[po.stage]} ${s.game + 1}차전`;
    const w = play(c, r, h, a, { remaining: 0, league: false, label }, live);
    const winner = w === 0 ? h : a;
    s.w[winner === s.hi ? 0 : 1]++;
    s.game++;
    if (h === c.userId || a === c.userId) {
      msg = `${label} ${winner === c.userId ? '승리' : '패배'} (시리즈 ${s.hi === c.userId ? s.w[0] : s.w[1]}:${s.hi === c.userId ? s.w[1] : s.w[0]})`;
    }
    if (s.w[0] < s.need && s.w[1] < s.need) continue;
    const sw = s.w[0] >= s.need ? s.hi : s.lo;
    const sl = sw === s.hi ? s.lo : s.hi;
    if (sw === c.userId || sl === c.userId) addNews(c, `${STAGE_NAME[po.stage]} ${sw === c.userId ? '통과!' : '탈락'}`, sw === c.userId ? 'good' : 'bad');
    if (po.stage === 'semi') { po.semiW = sw; po.stage = 'po'; po.series = { hi: po.ranked[1], lo: sw, need: 2, w: [0, 0], game: 0 }; }
    else if (po.stage === 'po') { po.poW = sw; po.stage = 'final'; po.series = { hi: po.ranked[0], lo: sw, need: 3, w: [0, 0], game: 0 }; }
    else {
      po.champ = sw; po.runnerUp = sl; po.stage = 'done'; po.series = null;
      if (sw === c.userId) addNews(c, '🏆 챔피언 결정전 우승!', 'good');
    }
  }
  return msg;
}

export const userInPlayoffs = (c: Career) => c.playoffs?.some(p => p.series && (p.series.hi === c.userId || p.series.lo === c.userId)) ?? false;

// ───────────────────────── off turns (GDD 3.1) ─────────────────────────

function enterBooks(c: Career) {
  const finals: number[][] = [];
  const user = userClub(c);
  for (const po of c.playoffs!) {
    const finish = new Map<number, number>();
    finish.set(po.champ!, 1); finish.set(po.runnerUp!, 2);
    const poLoser = po.poW === po.ranked[1] ? po.semiW! : po.ranked[1];
    const semiLoser = po.semiW === po.ranked[2] ? po.ranked[3] : po.ranked[2];
    finish.set(poLoser, 3); finish.set(semiLoser, 4);
    po.ranked.forEach((id, i) => { if (!finish.has(id)) finish.set(id, i + 1); });
    for (const id of po.ranked) {
      const club = c.world.clubs[id];
      // naming sponsor = base, parent company adds 10% (GDD 12.3)
      if (id === c.userId && c.sponsor?.kind === 'parent') club.cash += 0.1 * budgetOf(club);
      settleBooks(club, finish.get(id)! <= 4 ? finish.get(id)! : 99, c.games / 2);
      c.finishes[id] = finish.get(id)!;
    }
    finals.push([po.champ!, po.runnerUp!]);
  }
  // goal & trust (GDD 15.1)
  const rank = user.lastRank;
  const goal = c.sponsor?.goalRank ?? 8;
  const mult = c.sponsor?.kind === 'parent' ? 1.5 : 1;
  const hit = rank <= goal;
  const delta = hit ? 15 + (goal - rank) * 2 : -Math.round((10 + (rank - goal) * 3) * mult);
  c.trust = Math.max(0, Math.min(100, c.trust + delta));
  const bal = user.income - user.expense;
  if (bal < 0) c.trust = Math.max(0, c.trust - 3);
  addNews(c, `시즌 목표 ${goal}위 이내 → ${rank}위 ${hit ? '달성' : '미달'} · 신임도 ${delta >= 0 ? '+' : ''}${delta}`, hit ? 'good' : 'bad');
  addNews(c, `결산: 수입 ${user.income.toFixed(1)}억 · 지출 ${user.expense.toFixed(1)}억 · ${bal >= 0 ? '흑자' : '적자'} ${Math.abs(bal).toFixed(1)}억`, bal >= 0 ? 'good' : 'bad');

  // promotion / relegation (GDD 2.2)
  const ranked = c.playoffs!.map(p => p.ranked.map(id => c.world.clubs[id]));
  const fromDiv = user.division;
  for (let d = 0; d < 2; d++) {
    for (const x of ranked[d].slice(6)) { x.division = (d + 1) as 0 | 1 | 2; x.fans *= 0.8; x.parachute = 2; }
    for (const id of finals[d + 1]) { const x = c.world.clubs[id]; x.division = d as 0 | 1 | 2; x.fans *= 1.3; }
  }
  if (user.division < fromDiv) addNews(c, `🎉 ${DIV_NAME[user.division]} 승격!`, 'good');
  if (user.division > fromDiv) addNews(c, `${DIV_NAME[user.division]} 강등…`, 'bad');
  for (const x of c.world.clubs) if (x.id !== c.userId) invest(x);
  c.seasons.push({
    year: c.world.year, division: fromDiv, rank, trustAfter: c.trust, balance: bal,
    finish: c.finishes[c.userId] === 1 ? '우승' : c.finishes[c.userId] === 2 ? '준우승' : c.finishes[c.userId] <= 4 ? `PS ${c.finishes[c.userId]}위` : `${rank}위`,
  });
}

function enterAwards(c: Career) {
  c.awards = [];
  const byId = new Map(c.world.clubs.flatMap(x => x.roster.map(p => [p.id, { p, x }] as const)));
  for (let d = 0; d < 3; d++) {
    const po = c.playoffs![d];
    const div = DIV_NAME[d];
    c.awards.push({ title: `${div} 챔피언`, name: clubName(po.champ!), club: '' });
    c.awards.push({ title: `${div} 정규리그 1위`, name: clubName(po.ranked[0]), club: '' });
    const ids = new Set(po.ranked);
    const players = Object.entries(c.stats).map(([id, s]) => ({ id, s, e: byId.get(id) })).filter(v => v.e && ids.has(v.e.x.id));
    const top = (f: (s: SeasonStat) => number) => players.sort((a, b) => f(b.s) - f(a.s))[0];
    const mvp = players.filter(v => v.e!.x.id === po.ranked[0]).sort((a, b) => b.s.pts + b.s.digs * 0.3 - a.s.pts - a.s.digs * 0.3)[0];
    const add = (title: string, v: typeof players[number] | undefined, value: string) => {
      if (!v) return;
      c.awards.push({ title: `${div} ${title}`, name: v.e!.p.name, club: clubShort(v.e!.x.id), value });
      if (v.e!.x.id === c.userId) { v.e!.p.condition = Math.min(100, v.e!.p.condition + 10); userClub(c).fans *= 1.03; }
    };
    add('MVP', mvp, `${mvp?.s.pts ?? 0}점`);
    const scorer = top(s => s.pts); add('득점왕', scorer, `${scorer?.s.pts}점`);
    const blk = top(s => s.blocks); add('블로킹왕', blk, `${blk?.s.blocks}개`);
    const ace = top(s => s.aces); add('서브왕', ace, `${ace?.s.aces}개`);
    const dig = top(s => s.digs); add('수비상', dig, `디그 ${dig?.s.digs}`);
  }
}

function enterRetire(c: Career, r: Rng) {
  const w = c.world;
  for (const x of w.clubs) for (const p of x.roster) { p.age++; applyDecline(p); p.sense = Math.max(0, p.sense - 25); }
  for (const p of w.freeAgents) { p.age++; applyDecline(p); }
  retirements(w, r);
  learnSkills(w, r);
  const mine = w.retired.filter(p => p.clubId === c.userId);
  c.retiredNews = mine.map(p => `${p.name} (${p.position}, ${p.age}세, OVR ${ovr(p)})`);
  addNews(c, mine.length ? `은퇴: ${mine.map(p => p.name).join(', ')}` : '우리 팀 은퇴 선수 없음', 'info');
}

function enterResign(c: Career, r: Rng) {
  const ai = c.world.clubs.filter(x => x.id !== c.userId);
  contracts({ ...c.world, clubs: ai }, r);
  const club = userClub(c);
  c.expiring = [];
  for (const p of [...club.roster]) {
    if (p.foreign) { club.roster.splice(club.roster.indexOf(p), 1); addNews(c, `외국인 선수 ${p.name} 계약 만료`, 'info'); continue; }
    p.contract--;
    if (p.contract > 0) continue;
    const ask = askingSalary(p) * (club.lastRank <= 2 ? 1 + RULES.winnerRaise : 1);
    c.expiring.push({ id: p.id, ask, keep: ovr(p) >= 50 || p.age <= 24, years: 2 });
  }
}

function leaveResign(c: Career, _r: Rng) {
  const club = userClub(c);
  for (const e of c.expiring) {
    const p = club.roster.find(q => q.id === e.id);
    if (!p) continue;
    if (e.keep) { p.salary = e.ask; p.contract = e.years; }
    else { releaseTo(c.world, club, p); addNews(c, `${p.name} 재계약 포기 → FA 시장`, 'info'); }
  }
  c.expiring = [];
}

function enterFA(c: Career, r: Rng) {
  const before = userClub(c).roster.length;
  distressSales(c.world, r, x => x.id !== c.userId);
  const lost = before - userClub(c).roster.length;
  if (lost > 0) addNews(c, `재정 위기로 선수 ${lost}명 강제 판매`, 'bad');
}

export function signFA(c: Career, p: Pro): string | null {
  const club = userClub(c);
  if (club.roster.length >= MAX_ROSTER) return `선수단이 가득 찼습니다 (${MAX_ROSTER}명). 먼저 방출하세요.`;
  const i = c.world.freeAgents.indexOf(p);
  if (i < 0) return '이미 계약된 선수입니다.';
  const f = finance(c);
  const ask = askingSalary(p);
  if (f.projected - ask < -0.2 * f.base) return `예산 초과입니다. 영입하면 예상 손익이 ${(f.projected - ask).toFixed(1)}억이 됩니다 (한도: 기본 예산의 −20%).`;
  c.world.freeAgents.splice(i, 1);
  signPro(club, p, rngOf(c));
  p.contract = 2;
  addNews(c, `FA ${p.name} 영입 (연봉 ${p.salary.toFixed(2)}억)`, 'good');
  return null;
}

export function releasePlayer(c: Career, p: Pro): string | null {
  const club = userClub(c);
  if (club.roster.filter(q => q.position === p.position && !q.foreign).length <= (NEED[p.position] ?? 0) && !p.foreign)
    return `${p.position} 최소 인원(${NEED[p.position]}명) 아래로는 방출할 수 없습니다.`;
  releaseTo(c.world, club, p);
  c.lineup = c.lineup.map(id => (id === p.id ? null : id));
  addNews(c, `${p.name} 방출`, 'info');
  return null;
}

function enterForeign(c: Career, r: Rng) {
  const ai = c.world.clubs.filter(x => x.id !== c.userId);
  foreigners({ ...c.world, clubs: ai }, r);
  for (const x of ai) for (const p of x.roster) if (p.foreign && p.name.startsWith('용병')) p.name = foreignName(r);
  const club = userClub(c);
  const [m] = RULES.foreignOvr[club.division];
  c.foreignOptions = [m + 6, m, m - 6].map((t, i) => {
    const base = makePlayer(r, 'OP', t);
    const p: Pro = {
      ...base, id: `f${c.world.year}-${club.id}-${i}`, name: foreignName(r), age: r.int(23, 31), growth: 'normal', potGrade: 'A',
      potPhys: 99, potTech: 99, salary: RULES.foreignSalary(ovr(base)), contract: 1, injured: 0, foreign: true, clubId: -1,
      peakOvr: ovr(base), peakAge: 27, segGames: 0, segPlayed: 0,
    };
    p.skills = startingSkills(r, ovr(p), 'OP');
    return p;
  });
  c.foreignPick = -1;
}

function leaveForeign(c: Career) {
  const p = c.foreignOptions[c.foreignPick];
  if (p) {
    p.clubId = c.userId;
    userClub(c).roster.push(p);
    addNews(c, `외국인 선수 ${p.name} 계약 (OVR ${ovr(p)}, ${p.salary}억)`, 'good');
  }
  c.foreignOptions = [];
}

// ───────────────────────── draft (GDD 15.4) ─────────────────────────

function enterDraft(c: Career, r: Rng) {
  const grades = Object.keys(RULES.draftGrades) as Grade[];
  const weights = grades.map(g => RULES.draftGrades[g]);
  const pool: Pro[] = [];
  const POSW: Position[] = ['S', 'OP', 'OH', 'MB', 'L'];
  for (let i = 0; i < 24 * RULES.draftPoolPerClub; i++) {
    const g = r.pickWeighted(grades, weights);
    const age = r.pickWeighted([19, 20, 21, 22, 23], [40, 15, 15, 20, 10]);
    const p = makePro(r, r.pickWeighted(POSW, [1, 1, 2, 2, 1]), potentialFromGrade(r, g), age);
    p.name = koreanName(r);
    pool.push(p);
  }
  const order = [...c.world.clubs].sort((a, b) => b.division - a.division || b.lastRank - a.lastRank).map(x => x.id);
  c.draft = { pool, order, round: 0, idx: 0, picks: [] };
}

/** AI picks until it is the user's turn or the draft ends */
function runDraft(c: Career, r: Rng) {
  const d = c.draft!;
  while (d.round < 8 && d.pool.length) {
    if (d.idx >= d.order.length) { d.idx = 0; d.round++; continue; }
    const club = c.world.clubs[d.order[d.idx]];
    const domestic = club.roster.filter(p => !p.foreign).length;
    // the user may also fill the 후보군 (up to 28), AI clubs keep the sim's limit
    if (club.id === c.userId ? club.roster.length >= MAX_ROSTER : domestic >= RULES.rosterSize - 1) { d.idx++; continue; }
    if (club.id === c.userId) return;
    const scored = d.pool.map(p => ({ p, s: (p.potPhys + p.potTech) / 2 + r.normal(0, 6) + needScore(club, p) * 0.3 })).sort((a, b) => b.s - a.s);
    take(c, club, scored[0].p);
  }
}

function take(c: Career, club: Club, p: Pro) {
  const d = c.draft!;
  d.pool.splice(d.pool.indexOf(p), 1);
  signPro(club, p, rngOf(c));
  p.contract = 3;
  d.picks.push({ club: club.id, id: p.id, name: p.name, round: d.round + 1 });
  d.idx++;
}

export function userDraftPick(c: Career, p: Pro | null) {
  const r = rngOf(c);
  const d = c.draft!;
  if (p) { take(c, userClub(c), p); addNews(c, `드래프트 ${d.round + 1}라운드: ${p.name} (${p.position}, ${p.age}세)`, 'good'); }
  else { d.order = d.order.filter(id => id !== c.userId); }
  runDraft(c, r);
  saveRng(c, r);
  c.ids = { ...ID_SEQ };
}

export const userOnTheClock = (c: Career) => {
  const d = c.draft;
  return !!d && d.round < 8 && d.pool.length > 0 && d.order[d.idx] === c.userId;
};

function finishDraft(c: Career, r: Rng) {
  const ai = c.world.clubs.filter(x => x.id !== c.userId);
  c.draft = null;
  fillMinimums(c.world, r);
  transfers({ ...c.world, clubs: ai }, r);
  fillMinimums(c.world, r);
  for (const x of c.world.clubs) for (const p of x.roster) if (/^[A-Z]+-\d+$/.test(p.name)) p.name = koreanName(r);
  for (const p of c.world.freeAgents) if (/^[A-Z]+-\d+$/.test(p.name)) p.name = koreanName(r);
}

// ───────────────────────── club management ─────────────────────────

export const FACILITY_NAME: Record<Facility, string> = {
  stadium: '경기장', training: '훈련시설', medical: '의료센터', restaurant: '식당', bus: '구단 버스', analysis: '전력분석실',
};
export const FACILITY_EFFECT: Record<Facility, (l: number) => string> = {
  stadium: l => `수용 ${RULES.stadiumSeats[l].toLocaleString()}석`,
  training: l => `성장 속도 ${Math.round(RULES.trainingMult[l] * 100)}%`,
  medical: l => `부상률 ×${RULES.medicalMult[l]}`,
  restaurant: l => `회복 ×${(0.9 + l * 0.1).toFixed(1)}`,
  bus: l => `원정 소모 +${[15, 10, 7, 4, 2, 0][l]}%`,
  analysis: l => `상대 작전 ${l}/5축 공개`,
};

export const upgradeCost = (f: Facility, lvl: number) => (lvl >= 5 ? Infinity : RULES.upgradeBase[lvl + 1] * RULES.facilityWeight[f]);

export function upgrade(c: Career, f: Facility): string | null {
  const club = userClub(c);
  const cost = upgradeCost(f, club.facilities[f]);
  if (cost === Infinity) return '최고 단계입니다.';
  if (club.cash < cost) return `자금이 부족합니다 (필요 ${cost.toFixed(1)}억).`;
  club.cash -= cost;
  club.facilities[f]++;
  addNews(c, `${FACILITY_NAME[f]} ${club.facilities[f]}단계 완공 (−${cost.toFixed(1)}억)`, 'good');
  return null;
}

export function finance(c: Career) {
  const club = userClub(c);
  const base = budgetOf(club);
  const sponsor = base * (1 + RULES.sponsorPerf * (1 - 2 * (club.lastRank - 1) / 7));
  const pay = payroll(club);
  const ops = RULES.opsShare[club.division] * base;
  const maint = 0.01 * base * Object.values(club.facilities).reduce((a, b) => a + b, 0);
  const camp = [2, 1, 0.5][club.division];
  return { base, sponsor, pay, ops, maint, camp, projected: sponsor - pay - ops - maint - camp, cash: club.cash };
}

/** Next opponent for the match card */
export function nextFixture(c: Career): { opp: number; home: boolean; label: string } | null {
  const club = userClub(c);
  if (c.phase.k === 'match' || c.phase.k === 'allstar') {
    const day = c.days[club.division][c.day];
    const f = day?.find(([h, a]) => h === c.userId || a === c.userId);
    if (!f) return null;
    return { opp: f[0] === c.userId ? f[1] : f[0], home: f[0] === c.userId, label: `정규리그 ${c.day + 1}경기` };
  }
  if (c.phase.k === 'playoff') {
    for (const po of c.playoffs ?? []) {
      const s = po.series;
      if (!s || (s.hi !== c.userId && s.lo !== c.userId)) continue;
      const homeIsHi = s.game % 2 === 0;
      const h = homeIsHi ? s.hi : s.lo;
      return { opp: s.hi === c.userId ? s.lo : s.hi, home: h === c.userId, label: `${STAGE_NAME[po.stage]} ${s.game + 1}차전` };
    }
  }
  return null;
}

/** What the analysis room reveals of an opponent's tactic (GDD 11.3) */
export function scoutTactic(c: Career, opp: number): (string | null)[] {
  const t = clubTactic(c, opp);
  const lvl = userClub(c).facilities.analysis;
  const vals = [
    `${DIST_TXT[t.distribution]}${t.trick && t.trick !== 'none' ? ` · ${TRICK_TXT[t.trick]}` : ''}`, TEMPO_TXT[t.tempo],
    t.serve === 'target' ? `목적타 (${AIM_TXT[t.aim ?? 'weak']})` : SERVE_TXT[t.serve], BLOCK_TXT[t.block], `${DEF_TXT[t.defense]} · ${t.reception}인 리시브`,
  ];
  return vals.map((v, i) => (i < lvl ? v : null));
}

export const DIST_TXT = { left: '레프트 중심', right: '라이트 집중', middle: '중앙 활용', balanced: '고른 배분' };
export const TEMPO_TXT = { high: '높은 공', fast: '빠른 공' };
export const SERVE_TXT = { power: '강서브', target: '목적타', safe: '안전' };
export const BLOCK_TXT = { read: '따라가기', commit: '예측', aceMark: '에이스 마크' };
export const DEF_TXT = { deep: '강타 대비', tip: '연타 대비' };
export const AIM_TXT = { weak: '약한 리시버', hitter: '공격수 겨냥', seam: '리시버 사이 틈', short: '짧은 서브' };
export const TRICK_TXT = { none: '정공법', decoy: '속공 페이크', dump: '세터 투 어택' };
export const AXES = ['공격 배분', '공격 템포', '서브', '블로킹', '수비'];

export { ovr, budgetOf, payroll, askingSalary, GRADE_RANGE };
