/**
 * 신인감독모드 (언더독스 모드), design/ROOKIE-MODE.md: 63 days to found the league's 8th club.
 * 1 turn = 1 day. Day 1 tryout, day 2 pick 7 opponents, official matches on days 14, 21, … 56,
 * a viewer rating every 7 days, corporate matching (the ending) on day 63.
 *
 * Clubs: 0–6 1부 V-리그 (1군 = roster 0–13, 2군 = 14+), 7 = us, 8–15 해외리그, 16–23 고교-대학리그.
 * It runs on a Career so the shared screens (선수단, 팀관리, 경기 중계) work unchanged.
 */
import type { Position, Team } from '../engine/types.ts';
import { Rng } from '../engine/rng.ts';
import { ID_SEQ, ovr, DEFAULT_TACTIC, PHYS_KEYS, TECH_KEYS } from '../engine/player.ts';
import { matchSteps, playMatch } from '../engine/match.ts';
import { aiCoach, assistantCoach } from '../engine/coach.ts';
import { startingSkills } from '../engine/skills.ts';
import { makePro, seasonGP, spendGP, trainModeFor, clampToPotential } from '../engine/league/growth.ts';
import { gradeOf } from '../engine/league/rules.ts';
import { askingSalary } from '../engine/league/contract.ts';
import { afterMatch, aiTactic, buildTeam, clubGrowthMult } from '../engine/league/season.ts';
import type { Club, Pro, World } from '../engine/league/types.ts';
import type { Career, LiveMatch, MatchReport } from './career.ts';
import { AIM_TXT, BLOCK_TXT, boxOf, userTeam, DEF_TXT, DIST_TXT, ROOKIE_MIN, SERVE_TXT, starterAvg, TEMPO_TXT, TRICK_TXT } from './career.ts';
import { CLUBS, koreanName, setClubTable, type ClubInfo } from './names.ts';

// ───────────────────────── data ─────────────────────────

export type League = 'pro' | 'overseas' | 'school';
export const LEAGUE_NAME: Record<League, string> = { pro: '1부 V-리그', overseas: '해외리그', school: '고교-대학리그' };
export const USER = 7;
export const leagueOf = (id: number): League => (id < 7 ? 'pro' : id < 16 ? 'overseas' : 'school');
export const PRO_IDS = [0, 1, 2, 3, 4, 5, 6];
export const OVERSEAS_IDS = [8, 9, 10, 11, 12, 13, 14, 15];
export const SCHOOL_IDS = [16, 17, 18, 19, 20, 21, 22, 23];

/** [name, short, color, starter OVR target, rating base %] */
const OVERSEAS: [string, string, string, number, number][] = [
  ['이스탄불 아즈르 (TUR)', '아즈르', '#c81e3a', 90, 3.2],
  ['밀라노 비앙카 (ITA)', '비앙카', '#2563eb', 87, 3.0],
  ['상파울루 솔 (BRA)', '솔', '#e8a400', 83, 2.7],
  ['오사카 사쿠라 (JPN)', '사쿠라', '#e05a8c', 77, 2.6],
  ['톈진 펄스 (CHN)', '펄스', '#b91c1c', 71, 2.1],
  ['방콕 엘리펀츠 (THA)', '엘리펀츠', '#7c3aed', 65, 1.9],
  ['마닐라 코럴 (PHI)', '코럴', '#f97316', 60, 1.6],
  ['하노이 로터스 (VIE)', '로터스', '#0d9488', 57, 1.5],
];
const SCHOOLS: [string, string, string, number, number][] = [
  ['한빛대학교', '한빛대', '#1d4ed8', 54, 1.0],
  ['청람대학교', '청람대', '#0f766e', 52, 0.9],
  ['서해대학교', '서해대', '#0369a1', 50, 0.85],
  ['백두체육대학교', '백두체대', '#4d7c0f', 49, 0.8],
  ['해솔여자고등학교', '해솔여고', '#db2777', 47, 0.75],
  ['은하여자고등학교', '은하여고', '#9333ea', 45, 0.7],
  ['태백정산고등학교', '정산고', '#b45309', 44, 0.65],
  ['새별여자고등학교', '새별여고', '#ea580c', 42, 0.6],
];
/** 1부 rating base % (well-known pro clubs draw the most viewers) */
const PRO_FAME = [3.8, 3.6, 3.5, 3.3, 3.1, 2.9, 2.7];
const PRO_TARGET: [number, number][] = [[84, 66], [83, 65], [82, 64], [81, 63], [80, 62], [79, 61], [78, 60]];

export type Squad = '1군' | '1.5군' | '2군';
/** Which 1부 squad turns up against us (design §2) */
export const squadFor = (ourOvr: number): Squad => (ourOvr < 62 ? '2군' : ourOvr < 70 ? '1.5군' : '1군');

export type StaffRole = 'coach' | 'scout' | 'analyst' | 'trainer' | 'pr';
export type StaffGrade = 'S' | 'A' | 'B' | 'C';
export const STAFF_ROLE: Record<StaffRole, [string, string]> = {
  coach: ['수석코치', '훈련 성장 속도 · 트라이아웃 추천 정확도'],
  scout: ['스카우트', '영입 후보 능력 추정 오차 · 잠재력 파악'],
  analyst: ['전력분석관', '상대 작전 공개 범위'],
  trainer: ['트레이너', '컨디션 회복 · 부상 위험'],
  pr: ['홍보 담당', '시청률 보너스'],
};
export const STAFF_COST: Record<StaffGrade, number> = { S: 1.2, A: 0.8, B: 0.5, C: 0.25 };
export const STAFF_LIMIT = { heads: 4, budget: 2.5 };
export interface Staff { id: string; role: StaffRole; grade: StaffGrade; name: string; cost: number; note: string }

const STAFF_NOTE: Record<StaffRole, string[]> = {
  coach: ['전 국가대표 코치', '대학 감독 출신', '유소년 지도 10년', '프로 2군 코치'],
  scout: ['고교 배구 전문', '해외 스카우팅 경력', '데이터 스카우트', '지역 연맹 출신'],
  analyst: ['영상 분석 전문', '통계학 전공', '프로 전력분석 5년', '전직 세터'],
  trainer: ['재활 전문', '스포츠 의학 석사', '체력 코치 출신', '필라테스 강사'],
  pr: ['방송 PD 출신', 'SNS 마케터', '스포츠 기자 출신', '구단 홍보팀 3년'],
};

export interface Deal { id: string; kind: 'PPL' | '스폰서' | '메인 스폰서'; name: string; at: number; weekly: number }
/** unlocked once the weekly rating reaches `at` (design §7) */
export const DEALS: Deal[] = [
  { id: 'ppl1', kind: 'PPL', name: '하루콩 두유', at: 2, weekly: 0.1 },
  { id: 'sp1', kind: '스폰서', name: '바른스포츠', at: 3, weekly: 0.2 },
  { id: 'ppl2', kind: 'PPL', name: '온새미 이온음료', at: 4.5, weekly: 0.15 },
  { id: 'main', kind: '메인 스폰서', name: '누리텔레콤', at: 6, weekly: 0.35 },
];

export const ECON = {
  startCash: 5,
  /** tryout signings: one project contract for everyone (억 / season), so pay doesn't give the stats away */
  tryoutSalary: 0.35,
  opsWeekly: 0.1,
  baseIncome: 0.15,
  perRating: 0.12,
};

export const MAX_SQUAD = 18;
export const MATCH_DAYS = [14, 21, 28, 35, 42, 49, 56];
export const LAST_DAY = 63;
/** share of a season's GP one training day gives */
const TRAIN_GP = 0.09;

// ───────────────────────── state ─────────────────────────

export interface TryStat { g: number; pts: number; att: number; kills: number; recv: number; recvA: number; blocks: number; aces: number; digs: number; exec: string; jump: string }
export interface Tryout { ids: string[]; stats: Record<string, TryStat>; recommended: string[]; picked: string[] }
export interface RookieGame {
  no: number; day: number; opp: number; squad?: Squad; setsWon: [number, number]; win: boolean;
  ourOvr: number; oppOvr: number; points: number; parts: string[]; rating: number;
}
export interface WeekRating { week: number; rating: number; note: string; income: number; expense: number }
export type EndingTier = 'S' | 'A' | 'B' | 'C' | 'D';
export interface Ending {
  tier: EndingTier; total: number; parts: [string, number][];
  options: { name: string; kind: string; desc: string }[];
  choice: number | null;
}

export interface RookieState {
  day: number;
  setup: { short: string; color: string };
  staff: Staff[];
  tryout: Tryout | null;
  revealed: boolean;
  schedule: number[];
  games: RookieGame[];
  hype: number;
  weeks: WeekRating[];
  /** practice broadcasts this week (rating %) */
  practice: number[];
  deals: string[];
  fame: Record<number, number>;
  /** scout noise per player id, in OVR points (stable so the estimate doesn't jump around) */
  noise: Record<string, number>;
  ending: Ending | null;
}

export type DayKind = 'tryout' | 'schedule' | 'free' | 'match' | 'ending';
export function dayKind(day: number): DayKind {
  if (day === 1) return 'tryout';
  if (day === 2) return 'schedule';
  if (MATCH_DAYS.includes(day)) return 'match';
  if (day >= LAST_DAY) return 'ending';
  return 'free';
}
export const rk = (c: Career) => c.rookie!;
export const isRookie = (c: Career) => c.mode === 'rookie';
const rngOf = (c: Career) => { const r = new Rng(1); r.state = c.rng; return r; };
const saveRng = (c: Career, r: Rng) => { c.rng = r.state; c.ids = { ...ID_SEQ }; };

export function rookieLabel(c: Career): string {
  const s = rk(c);
  const k = dayKind(s.day);
  const next = MATCH_DAYS.find(d => d >= s.day);
  if (k === 'tryout') return '1일차 · 트라이아웃';
  if (k === 'schedule') return '2일차 · 상대 선정';
  if (k === 'match') return `${s.day}일차 · 공식전 ${MATCH_DAYS.indexOf(s.day) + 1}차전`;
  if (k === 'ending') return '63일차 · 기업 매칭';
  return `${s.day}일차${next ? ` · 경기 D-${next - s.day}` : ' · 창단 심사 대기'}`;
}

function news(c: Career, text: string, tone: 'good' | 'bad' | 'info' = 'info') {
  c.news.unshift({ turn: `${rk(c).day}일차`, text, tone });
  if (c.news.length > 60) c.news.length = 60;
}

// ───────────────────────── player generation ─────────────────────────

/** A player whose OVR lands near `target` (makePro, then shifted), with growth room above it */
function makeAt(r: Rng, pos: Position, target: number, age: number, room = 6): Pro {
  const p = makePro(r, pos, Math.round(target + room), age);
  const d = target - ovr(p);
  for (const k of PHYS_KEYS) p.phys[k] = Math.max(1, Math.min(99, p.phys[k] + d));
  for (const k of TECH_KEYS) p.tech[k] = Math.max(1, Math.min(99, p.tech[k] + d));
  p.potPhys = Math.min(99, Math.max(p.potPhys, PHYS_KEYS.reduce((a, k) => a + p.phys[k], 0) / 4 + room * 0.6));
  p.potTech = Math.min(99, Math.max(p.potTech, ovr(p) + room));
  p.potGrade = gradeOf((p.potPhys + p.potTech) / 2);
  clampToPotential(p);
  p.skills = startingSkills(r, ovr(p), pos);
  p.name = koreanName(r);
  return p;
}

const STARTING: Position[] = ['S', 'OH', 'OH', 'MB', 'MB', 'OP', 'L'];
const BENCH: Position[] = ['S', 'OH', 'MB', 'OP', 'L', 'OH', 'MB'];

function sign(club: Club, p: Pro, salary?: number) {
  p.clubId = club.id;
  p.salary = salary ?? askingSalary(p);
  p.contract = 1;
  club.roster.push(p);
}

function fillClub(r: Rng, club: Club, target: number, n: number, ageLo: number, ageHi: number) {
  const pos = [...STARTING, ...BENCH].slice(0, n);
  pos.forEach((ps, i) => sign(club, makeAt(r, ps, target + (i < 7 ? r.normal(1, 2.5) : r.normal(-4, 3)), r.int(ageLo, ageHi), 4)));
}

function blankClub(id: number, name: string, division: 0 | 1 | 2): Club {
  return {
    id, name, division, budgetFactor: 1, personality: 'balanced', roster: [],
    facilities: { stadium: 0, training: 3, medical: 1, restaurant: 1, bus: 3, analysis: 0 },
    fans: 1000, cash: 0, deficitStreak: 0, wins: 0, losses: 0, points: 0, setsWon: 0, setsLost: 0, streak: 0, injuries: 0,
    income: 0, expense: 0, balancePct: 0, transferNet: 0, forcedSales: 0, parachute: 0, lastRank: 8,
  };
}

export interface RookieOpts { slot: number; name: string; short: string; color: string; staff: Staff[]; seed?: number }

/** Club names for this save: 1부 7 from the career list, us, 해외 8, 고교-대학 8 */
export function rookieNames(name: string, short: string, color: string): ClubInfo[] {
  return [
    ...CLUBS.slice(0, 7),
    { name, short, color },
    ...OVERSEAS.map(([n, s, col]) => ({ name: n, short: s, color: col })),
    ...SCHOOLS.map(([n, s, col]) => ({ name: n, short: s, color: col })),
  ];
}

/** Staff candidates for the draft: 4 per role, one of each grade */
export function staffPool(seed: number): Staff[] {
  const r = new Rng(seed ^ 0x57aff);
  const out: Staff[] = [];
  for (const role of Object.keys(STAFF_ROLE) as StaffRole[]) {
    (['S', 'A', 'B', 'C'] as StaffGrade[]).forEach((g, i) => {
      out.push({ id: `${role}${i}`, role, grade: g, name: koreanName(r), cost: STAFF_COST[g], note: STAFF_NOTE[role][r.int(0, 3)] });
    });
  }
  return out;
}

export function staffCheck(staff: Staff[]): string | null {
  const cost = staff.reduce((a, s) => a + s.cost, 0);
  if (staff.length > STAFF_LIMIT.heads) return `스태프는 최대 ${STAFF_LIMIT.heads}명입니다.`;
  if (cost > STAFF_LIMIT.budget + 1e-9) return `스태프 예산 ${STAFF_LIMIT.budget}억을 넘습니다 (${cost.toFixed(2)}억).`;
  const roles = new Set(staff.map(s => s.role));
  if (roles.size !== staff.length) return '같은 직책은 한 명만 고용할 수 있습니다.';
  return null;
}

export const staffGrade = (c: Career, role: StaffRole): StaffGrade | null => rk(c).staff.find(s => s.role === role)?.grade ?? null;
const LVL: Record<StaffGrade, number> = { S: 4, A: 3, B: 2, C: 1 };
const lvl = (g: StaffGrade | null) => (g ? LVL[g] : 0);

export function newRookie(o: RookieOpts): Career {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  ID_SEQ.player = 0; ID_SEQ.pro = 0;
  const r = new Rng(seed);
  const names = rookieNames(o.name, o.short, o.color);
  setClubTable(names);
  const clubs: Club[] = names.map((n, id) => blankClub(id, n.name, id < 7 ? 0 : id === USER || id >= 16 ? 2 : 1));
  const fame: Record<number, number> = {};
  PRO_IDS.forEach(id => {
    const [first, second] = PRO_TARGET[id];
    fillClub(r, clubs[id], first, 14, 23, 31);
    fillClub(r, clubs[id], second, 10, 19, 24);
    fame[id] = PRO_FAME[id];
  });
  OVERSEAS.forEach(([, , , t, f], i) => { fillClub(r, clubs[8 + i], t, 12, 21, 30); fame[8 + i] = f; });
  SCHOOLS.forEach(([, , , t, f], i) => { fillClub(r, clubs[16 + i], t, 12, i < 4 ? 19 : 17, i < 4 ? 22 : 18); fame[16 + i] = f; });
  for (const x of clubs) for (const p of x.roster) p.foreign = false;

  const user = clubs[USER];
  const coach = o.staff.find(s => s.role === 'coach')?.grade;
  user.coach = coach ?? 'none';
  user.facilities.analysis = [0, 2, 3, 4, 5][lvl(o.staff.find(s => s.role === 'analyst')?.grade ?? null)];
  const tr = lvl(o.staff.find(s => s.role === 'trainer')?.grade ?? null);
  user.facilities.medical = 1 + tr; user.facilities.restaurant = 1 + tr;
  user.cash = ECON.startCash - o.staff.reduce((a, s) => a + s.cost, 0);

  const world: World = { year: 1, clubs, freeAgents: [], retired: [], history: [] };
  // tryout applicants (hidden stats): mostly 3부 level, a few gems with growth room
  const applicants: Pro[] = [];
  const POS: Position[] = ['S', 'S', 'S', 'S', 'OH', 'OH', 'OH', 'OH', 'OH', 'OH', 'OH', 'OH', 'OH', 'MB', 'MB', 'MB', 'MB', 'MB', 'MB', 'MB', 'MB', 'OP', 'OP', 'OP', 'OP', 'L', 'L', 'L', 'L', 'L'];
  for (const pos of POS) {
    const t = Math.max(40, Math.min(62, r.normal(49, 5.5)));
    const p = makeAt(r, pos, t, r.int(19, 27), r.chance(0.2) ? r.int(10, 16) : r.int(3, 9));
    applicants.push(p);
  }
  world.freeAgents = applicants;

  const c: Career = {
    version: 1, slot: o.slot, savedAt: Date.now(), seed, rng: seed ^ 0xabcdef,
    ids: { ...ID_SEQ }, world, userId: USER, games: 28, funding: 1,
    phase: { k: 'free', n: 1 }, days: [], day: 0,
    tactic: { ...DEFAULT_TACTIC }, preset: 'custom', lineup: [null, null, null, null, null, null, null], autoCoach: true,
    sponsor: null, trust: 50, growthUnits: 0, news: [], lastMatch: null, results: [], playoffs: null, stats: {},
    awards: [], retiredNews: [], expiring: [], foreignOptions: [], foreignPick: -1, draft: null, seasons: [], turnNo: 1, finishes: {},
    mode: 'rookie', names,
    rookie: {
      day: 1, setup: { short: o.short, color: o.color }, staff: o.staff, tryout: null, revealed: false, schedule: [], games: [],
      hype: 0, weeks: [], practice: [], deals: [], fame, noise: {}, ending: null,
    },
  };
  runTryout(c, r, applicants);
  saveRng(c, r);
  news(c, `${o.name} 창단 프로젝트 시작. 63일 안에 8구단 창단을 증명하세요!`, 'good');
  return c;
}

// ───────────────────────── tryout (design §4) ─────────────────────────

const EXEC_SD: Record<string, number> = { S: 3, A: 5, B: 7, C: 9, none: 12 };

/** Applicants play scrimmages among themselves; the record is what the coach sees */
function runTryout(c: Career, r: Rng, ps: Pro[]) {
  const stats: Record<string, TryStat> = {};
  const coach = staffGrade(c, 'coach') ?? 'none';
  for (const p of ps) {
    const execTrue = ovr(p) * 0.6 + p.tech.positioning * 0.2 + p.phys.agility * 0.2;
    const est = execTrue + r.normal(0, EXEC_SD[coach]);
    const jump = p.phys.jump + r.normal(0, 4);
    stats[p.id] = { g: 0, pts: 0, att: 0, kills: 0, recv: 0, recvA: 0, blocks: 0, aces: 0, digs: 0, exec: est >= 60 ? 'A' : est >= 53 ? 'B' : est >= 46 ? 'C' : 'D', jump: gradeOf(jump) };
  }
  const by = (pos: Position) => ps.filter(p => p.position === pos);
  for (let round = 0; round < 3; round++) {
    const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = r.int(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
    const S = shuffle(by('S')), OH = shuffle(by('OH')), MB = shuffle(by('MB')), OP = shuffle(by('OP')), L = shuffle(by('L'));
    const teams: Team[] = [0, 1, 2, 3].map(i => ({
      name: `${'ABCD'[i]}조`, lineup: [S[i], OH[i * 2], MB[i * 2], OP[i], OH[i * 2 + 1], MB[i * 2 + 1]], libero: L[i], tactic: { ...DEFAULT_TACTIC },
      bench: [OH[8], L[4]].filter(Boolean),
    }));
    for (const [a, b] of [[0, 1], [2, 3]]) {
      const res = playMatch([teams[a], teams[b]], { seed: r.int(1, 2 ** 31), log: false, coaches: [aiCoach, aiCoach] });
      for (const [id, l] of res.lines) {
        const s = stats[id];
        if (!s) continue;
        s.g++; s.pts += l.kills + l.blocks + l.aces; s.att += l.attacks; s.kills += l.kills; s.recv += l.receives; s.recvA += l.recvA;
        s.blocks += l.blocks; s.aces += l.aces; s.digs += l.digs;
      }
    }
    for (const p of ps) p.energy = 100;
  }
  // coaches shortlist the core: the 6 they rate best (a lower-grade coach misjudges more)
  const recommended = ps.map(p => ({ p, s: ovr(p) + r.normal(0, EXEC_SD[coach] * 0.6) })).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.p.id);
  rk(c).tryout = { ids: ps.map(p => p.id), stats, recommended, picked: [...recommended] };
}

export const tryoutPlayers = (c: Career) => {
  const t = rk(c).tryout!;
  return t.ids.map(id => c.world.freeAgents.find(p => p.id === id) ?? c.world.clubs[USER].roster.find(p => p.id === id)).filter((p): p is Pro => !!p);
};

export function tryoutCheck(c: Career): string | null {
  const t = rk(c).tryout!;
  const ps = tryoutPlayers(c).filter(p => t.picked.includes(p.id));
  if (ps.length < 10) return `최소 10명을 뽑아야 합니다 (지금 ${ps.length}명).`;
  if (ps.length > 16) return `트라이아웃 합격은 16명까지입니다 (지금 ${ps.length}명).`;
  for (const [pos, n] of Object.entries(ROOKIE_MIN)) {
    if (ps.filter(p => p.position === pos).length < n) return `${pos} 포지션이 ${n}명 이상 필요합니다.`;
  }
  return null;
}

function finishTryout(c: Career, r: Rng) {
  const t = rk(c).tryout!;
  const club = c.world.clubs[USER];
  const picked = c.world.freeAgents.filter(p => t.picked.includes(p.id));
  c.world.freeAgents = c.world.freeAgents.filter(p => !t.picked.includes(p.id));
  for (const p of picked) sign(club, p, ECON.tryoutSalary);
  // a few more free agents join the market (design §4)
  const POS: Position[] = ['S', 'OH', 'OH', 'MB', 'MB', 'OP', 'L', 'OH'];
  for (const pos of POS) c.world.freeAgents.push(makeAt(r, pos, Math.max(46, Math.min(62, r.normal(55, 4))), r.int(22, 30), r.int(2, 6)));
  rk(c).revealed = true;
  news(c, `트라이아웃 합격자 ${picked.length}명 확정 · 능력치 공개! 주전 평균 OVR ${starterAvg(club).toFixed(1)}`, 'good');
}

// ───────────────────────── opponents (day 2) ─────────────────────────

/** Rough strength the staff can tell before playing (1부: the squad our level would draw) */
export function oppOvr(c: Career, id: number, ourOvr = starterAvg(c.world.clubs[USER])): number {
  if (leagueOf(id) === 'pro') return starterAvg(squadClub(c, id, squadFor(ourOvr)));
  return starterAvg(c.world.clubs[id]);
}

export function squadClub(c: Career, id: number, squad: Squad): Club {
  const club = c.world.clubs[id];
  if (squad === '1군') return club;
  const second = club.roster.slice(14);
  if (squad === '2군') return { ...club, roster: second };
  // 1.5군: 2군 plus the first team's best outside hitter, opposite and middle
  const first = buildTeam(club).starters;
  const stars = (['OH', 'OP', 'MB'] as Position[]).map(pos => first.find(p => p.position === pos)!).filter(Boolean);
  return { ...club, roster: [...stars, ...second] };
}

/** The league coefficient L (design §8) */
export function leagueCoef(id: number, squad: Squad | undefined, oOvr: number): number {
  const lg = leagueOf(id);
  if (lg === 'school') return 0.4;
  if (lg === 'overseas') return 0.8 + Math.max(0, Math.min(1, (oOvr - 57) / 33));
  return squad === '1군' ? 2.2 : squad === '1.5군' ? 1.6 : 1.2;
}

export function scheduleCheck(c: Career): string | null {
  const s = rk(c).schedule;
  if (s.length !== 7) return `상대 7팀을 골라야 합니다 (지금 ${s.length}팀).`;
  return null;
}

/** Staff suggestion: a mix that climbs from easy to hard */
export function suggestSchedule(c: Career): number[] {
  return [19, 15, 16, 13, 6, 12, 0];
}

// ───────────────────────── matches ─────────────────────────

function oppTeam(c: Career, id: number, squad?: Squad) {
  const club = squad ? squadClub(c, id, squad) : c.world.clubs[id];
  const t = buildTeam(club);
  t.team.tactic = aiTactic(t.starters);
  const r = new Rng((id + 1) * 7919 + rk(c).day * 31);
  if (t.team.tactic.serve === 'target') t.team.tactic.aim = r.pickWeighted(['weak', 'hitter', 'seam', 'short'] as const, [3, 1, 1, 1]);
  t.team.bench = club.roster.filter(p => !t.starters.includes(p) && p.injured === 0).slice(0, 7);
  for (const p of club.roster) p.energy = 100;
  return t;
}

/** our side: the career lineup logic (manual slots, auto fill) */
const userTeamOf = (c: Career) => userTeam(c);

export function nextMatch(c: Career): { opp: number; no: number; squad?: Squad; label: string } | null {
  const s = rk(c);
  const no = MATCH_DAYS.indexOf(s.day);
  if (no < 0) return null;
  const opp = s.schedule[no];
  const squad = leagueOf(opp) === 'pro' ? squadFor(starterAvg(c.world.clubs[USER])) : undefined;
  return { opp, no, squad, label: `공식전 ${no + 1}차전` };
}

export function rookieStartLive(c: Career): LiveMatch | null {
  const f = nextMatch(c);
  if (!f) return null;
  const r = rngOf(c);
  const seed = r.int(1, 2 ** 31);
  saveRng(c, r);
  const th = userTeamOf(c), ta = oppTeam(c, f.opp, f.squad);
  const steps = matchSteps([th.team, ta.team], { seed, log: true, homeTeam: 0, manual: 0, coaches: [c.autoCoach ? assistantCoach : undefined, aiCoach] });
  return { steps, home: USER, away: f.opp, userSide: 0, label: f.label, th, ta };
}

/** Points for one official match (design §8) */
export function scoreMatch(id: number, squad: Squad | undefined, ourOvr: number, oOvr: number, setsWon: [number, number]) {
  const L = leagueCoef(id, squad, oOvr);
  const win = setsWon[0] === 3;
  const parts: [string, number][] = [];
  if (win) {
    parts.push([`승리 (리그 계수 ${L.toFixed(1)})`, 10 * L]);
    if (oOvr > ourOvr) parts.push([`전력 차 역전 (+${(oOvr - ourOvr).toFixed(1)})`, (oOvr - ourOvr) * 0.8]);
  } else parts.push([`패배 (리그 계수 ${L.toFixed(1)})`, -8 / L]);
  const key = `${setsWon[0]}:${setsWon[1]}`;
  const SET: Record<string, [string, number]> = {
    '3:0': ['셧아웃 승', 4], '3:1': ['3:1 승', 2], '3:2': ['풀세트 승', 1],
    '2:3': ['풀세트 접전 패', 2], '1:3': ['1:3 패', -1], '0:3': ['셧아웃 패', -3],
  };
  // a sweep counts for less against weaker leagues
  const [sk, sv] = SET[key];
  parts.push([sk, sv > 0 && win ? sv * Math.min(1, L) : sv]);
  return { L, win, parts, points: parts.reduce((a, [, v]) => a + v, 0) };
}

const PR_BONUS: Record<StaffGrade, number> = { S: 0.25, A: 0.15, B: 0.08, C: 0.03 };
const DRAMA: Record<string, [number, string]> = {
  '3:0': [0.6, '원사이드 승리'], '3:1': [0.3, '완승'], '3:2': [1.0, '풀세트 명승부'],
  '2:3': [1.0, '아슬아슬한 접전'], '1:3': [-0.2, '무기력한 패배'], '0:3': [-0.8, '원사이드 패배'],
};

/** Match rating % (design §9) */
export function ratingFor(c: Career, opp: number, setsWon: [number, number], scale = 1): { rating: number; note: string } {
  const s = rk(c);
  const pr = staffGrade(c, 'pr');
  const base = s.fame[opp] * (1 + s.hype) * (1 + (pr ? PR_BONUS[pr] : 0));
  const [d, note] = DRAMA[`${setsWon[0]}:${setsWon[1]}`];
  return { rating: Math.max(0.3, (base + d) * scale), note };
}

function recordReport(c: Career, res: ReturnType<typeof playMatch>, th: { team: Team }, ta: { team: Team }, opp: number, title: string, practice: boolean) {
  const rep: MatchReport = {
    title, home: USER, away: opp, userSide: 0, practice,
    sets: res.sets.map(s => s.score), setsWon: res.setsWon, winner: res.winner, log: res.log,
    box: boxOf(res, [th.team, ta.team]), tactics: [th.team.tactic, ta.team.tactic],
  };
  c.lastMatch = rep;
  for (const [id, l] of res.lines) {
    const st = (c.stats[id] ??= { g: 0, pts: 0, kills: 0, blocks: 0, aces: 0, digs: 0, recv: 0, recvA: 0 });
    st.g++; st.kills += l.kills; st.blocks += l.blocks; st.aces += l.aces; st.digs += l.digs; st.recv += l.receives; st.recvA += l.recvA; st.pts += l.kills + l.blocks + l.aces;
  }
}

function playOfficial(c: Career, r: Rng, live?: LiveMatch): string {
  const s = rk(c);
  const f = nextMatch(c)!;
  const done = live?.result && live.away === f.opp ? live : undefined;
  const th = done ? done.th : userTeamOf(c), ta = done ? done.ta : oppTeam(c, f.opp, f.squad);
  const res = done ? done.result! : playMatch([th.team, ta.team], { seed: r.int(1, 2 ** 31), log: true, homeTeam: 0, coaches: [c.autoCoach ? assistantCoach : undefined, aiCoach] });
  const ourOvr = starterAvg(c.world.clubs[USER]);
  const oOvr = ta.starters.reduce((a, p) => a + ovr(p), 0) / ta.starters.length;
  const sc = scoreMatch(f.opp, f.squad, ourOvr, oOvr, res.setsWon);
  const rt = ratingFor(c, f.opp, res.setsWon);
  // hype: wins build it (stronger opponents more), one-sided losses cost it
  if (sc.win) s.hype = Math.min(2, s.hype + 0.08 + 0.05 * sc.L);
  else if (res.setsWon[0] === 0) s.hype = Math.max(0, s.hype - 0.08);
  else if (res.setsWon[0] === 2) s.hype = Math.min(2, s.hype + 0.04);
  const club = c.world.clubs[USER];
  afterMatch(r, club, th.starters as Pro[], sc.win, res.setsWon[0] + res.setsWon[1], 7 - f.no);
  if (sc.win) club.wins++; else club.losses++;
  recordReport(c, res, th, ta, f.opp, `${f.label} vs ${c.names![f.opp].short}${f.squad ? ` (${f.squad})` : ''}`, false);
  s.games.push({
    no: f.no + 1, day: s.day, opp: f.opp, squad: f.squad, setsWon: res.setsWon, win: sc.win, ourOvr, oppOvr: oOvr,
    points: sc.points, parts: sc.parts.map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v.toFixed(1)}`), rating: rt.rating,
  });
  c.results.push({ label: f.label, opp: f.opp, home: true, setsWon: res.setsWon, win: sc.win });
  for (const p of th.starters as Pro[]) if (p.injured > 0) news(c, `${p.name} 부상 (${p.injured}경기 결장)`, 'bad');
  const name = c.names![f.opp].short;
  news(c, `${f.label} ${name}${f.squad ? ` ${f.squad}` : ''}전 ${res.setsWon[0]}:${res.setsWon[1]} ${sc.win ? '승리' : '패배'} · 창단 점수 ${sc.points >= 0 ? '+' : ''}${sc.points.toFixed(1)} · 시청률 ${rt.rating.toFixed(1)}% (${rt.note})`, sc.win ? 'good' : 'bad');
  return `${sc.win ? '승리' : '패배'} ${res.setsWon[0]}:${res.setsWon[1]} · 점수 ${sc.points >= 0 ? '+' : ''}${sc.points.toFixed(1)} · 시청률 ${rt.rating.toFixed(1)}%`;
}

// ───────────────────────── free days ─────────────────────────

export type RookieFree = 'train' | 'practice' | 'rest';
export const PRACTICE_GROWTH: Record<League, number> = { school: 0.5, pro: 0.8, overseas: 1.3 };

function grow(c: Career, mult: number) {
  const club = c.world.clubs[USER];
  const env = clubGrowthMult(club);
  for (const p of club.roster) {
    const play = p.injured > 0 ? 0.3 : 1;
    spendGP(p, seasonGP(p, env) * TRAIN_GP * mult * play, trainModeFor(p));
  }
}

function heal(c: Career, r: Rng) {
  for (const p of c.world.clubs[USER].roster) if (p.injured > 0 && r.chance(0.35)) p.injured--;
}

const trainerRec = (c: Career) => 1 + 0.15 * lvl(staffGrade(c, 'trainer'));

function freeDay(c: Career, r: Rng, choice: RookieFree, league: League = 'school'): string {
  const club = c.world.clubs[USER];
  const s = rk(c);
  heal(c, r);
  if (choice === 'rest') {
    for (const p of club.roster) {
      p.energy = Math.min(100, p.energy + 40 * trainerRec(c));
      p.condition = Math.min(80, p.condition + 8 * trainerRec(c));
      p.sense = Math.max(0, p.sense - 4);
    }
    return '휴식 · 체력·컨디션 회복, 경기감각 하락';
  }
  if (choice === 'train') {
    grow(c, Math.min(1, 0.4 + avgOf(club, p => p.energy) / 100));
    for (const p of club.roster) { p.energy = Math.max(20, p.energy - 10 / trainerRec(c)); p.sense = Math.max(0, p.sense - 1); p.condition = Math.max(0, p.condition - 1); }
    return '훈련 · 능력치 성장 (체력이 낮으면 효과가 줄어요)';
  }
  // practice match vs a random club of the chosen league
  const ids = league === 'pro' ? PRO_IDS : league === 'overseas' ? OVERSEAS_IDS : SCHOOL_IDS;
  const opp = ids[r.int(0, ids.length - 1)];
  const squad = league === 'pro' ? squadFor(starterAvg(club)) : undefined;
  const th = userTeamOf(c), ta = oppTeam(c, opp, squad);
  const res = playMatch([th.team, ta.team], { seed: r.int(1, 2 ** 31), log: true, coaches: [c.autoCoach ? assistantCoach : undefined, aiCoach] });
  grow(c, PRACTICE_GROWTH[league]);
  const starters = new Set(th.starters.map(p => p.id));
  for (const p of club.roster) {
    const gain = (starters.has(p.id) ? 9 : 5) * (league === 'overseas' ? 1.3 : 1);
    p.sense = Math.min(100, p.sense + (p.sense >= 80 ? gain / 2 : gain));
    p.condition = Math.max(0, p.condition - 3);
    p.energy = Math.max(15, p.energy - (starters.has(p.id) ? 18 : 8) / trainerRec(c));
  }
  const rt = ratingFor(c, opp, res.setsWon, league === 'overseas' ? 0.6 : 0.4);
  s.practice.push(rt.rating);
  if (res.winner === 0) s.hype = Math.min(2, s.hype + (league === 'school' ? 0.01 : 0.03));
  const name = `${c.names![opp].short}${squad ? ` ${squad}` : ''}`;
  recordReport(c, res, th, ta, opp, `연습경기 vs ${name}`, true);
  return `연습경기 vs ${name} ${res.setsWon[0]}:${res.setsWon[1]} ${res.winner === 0 ? '승' : '패'} · 경기감각 ↑ · 방송 ${rt.rating.toFixed(1)}%`;
}

const avgOf = (club: Club, f: (p: Pro) => number) => club.roster.reduce((a, p) => a + f(p), 0) / Math.max(1, club.roster.length);

// ───────────────────────── weekly rating & money (design §7, §9) ─────────────────────────

export const payrollWeekly = (c: Career) => c.world.clubs[USER].roster.reduce((a, p) => a + p.salary, 0) / 52;
export const dealsWeekly = (c: Career) => DEALS.filter(d => rk(c).deals.includes(d.id)).reduce((a, d) => a + d.weekly, 0);

function weekEnd(c: Career) {
  const s = rk(c);
  const week = s.day / 7;
  const game = s.games.find(g => g.day > s.day - 7 && g.day <= s.day);
  const prev = s.weeks[s.weeks.length - 1]?.rating ?? 1.0;
  const pr = s.practice.length ? s.practice.reduce((a, b) => a + b, 0) / s.practice.length : 0;
  let rating: number, note: string;
  if (game) { rating = game.rating + pr * 0.2; note = `공식전 ${game.no}차전`; }
  else if (s.weeks.length === 0) { rating = Math.max(1.0, pr) * (1 + s.hype); note = '첫 방송 · 트라이아웃 편'; }
  else { rating = Math.max(prev * 0.85, pr); note = pr ? '연습경기 편' : '훈련 일상 편'; }
  rating = Math.round(rating * 100) / 100;
  s.practice = [];
  // deals: unlock at a rating, drop one if the rating falls well under the latest one's bar
  for (const d of DEALS) {
    if (!s.deals.includes(d.id) && rating >= d.at) { s.deals.push(d.id); news(c, `${d.kind} 계약: ${d.name} (주 +${d.weekly}억)`, 'good'); }
  }
  const last = DEALS.filter(d => s.deals.includes(d.id)).pop();
  if (last && rating < last.at * 0.6) { s.deals = s.deals.filter(x => x !== last.id); news(c, `시청률 하락으로 ${last.name} ${last.kind} 계약 종료`, 'bad'); }
  const club = c.world.clubs[USER];
  const income = ECON.baseIncome + rating * ECON.perRating + dealsWeekly(c);
  const expense = payrollWeekly(c) + ECON.opsWeekly;
  club.cash += income - expense;
  club.income += income; club.expense += expense;
  s.weeks.push({ week, rating, note, income, expense });
  news(c, `${week}주차 시청률 ${rating.toFixed(1)}% (${note}) · 수입 ${income.toFixed(2)}억 · 지출 ${expense.toFixed(2)}억`, rating >= prev ? 'good' : 'info');
}

// ───────────────────────── recruiting (design §5) ─────────────────────────

export interface Prospect { p: Pro; from: number; fee: number; salary: number }

/** Free agents and 고교-대학 players we could sign; fee goes to the school as a development fund */
export function prospects(c: Career): Prospect[] {
  const out: Prospect[] = c.world.freeAgents.map(p => ({ p, from: -1, fee: 0.1, salary: Math.max(ECON.tryoutSalary, askingSalary(p)) }));
  for (const id of SCHOOL_IDS) {
    for (const p of c.world.clubs[id].roster) out.push({ p, from: id, fee: Math.round((0.2 + askingSalary(p) * 1.2) * 100) / 100, salary: ECON.tryoutSalary });
  }
  return out;
}

const SCOUT_SD: Record<string, number> = { S: 1.5, A: 3, B: 4.5, C: 6, none: 8 };

/** What the scout thinks a player's OVR is: [low, high] */
export function estimate(c: Career, p: Pro): [number, number] {
  const s = rk(c);
  const g = staffGrade(c, 'scout') ?? 'none';
  if (s.noise[p.id] === undefined) {
    // stable per player: hash of id and seed
    let h = c.seed ^ 0x9e3779b9;
    for (const ch of p.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    s.noise[p.id] = ((h >>> 0) / 4294967296) * 2 - 1;
  }
  const sd = SCOUT_SD[g];
  const mid = ovr(p) + s.noise[p.id] * sd;
  return [Math.round(mid - sd), Math.round(mid + sd)];
}
/** scouts from B up can read potential */
export const seesPotential = (c: Career) => lvl(staffGrade(c, 'scout')) >= 2;

export function recruit(c: Career, x: Prospect): string | null {
  const s = rk(c);
  const club = c.world.clubs[USER];
  if (!s.revealed) return '트라이아웃이 끝난 뒤 영입할 수 있습니다.';
  if (s.day >= LAST_DAY) return '프로젝트가 끝났습니다.';
  if (club.roster.length >= MAX_SQUAD) return `선수단이 가득 찼습니다 (${MAX_SQUAD}명).`;
  if (club.cash < x.fee) return `자금이 부족합니다 (필요 ${x.fee.toFixed(2)}억).`;
  if (x.from < 0) {
    const i = c.world.freeAgents.indexOf(x.p);
    if (i < 0) return '이미 계약된 선수입니다.';
    c.world.freeAgents.splice(i, 1);
  } else {
    const from = c.world.clubs[x.from];
    const i = from.roster.indexOf(x.p);
    if (i < 0) return '이미 계약된 선수입니다.';
    if (from.roster.length <= 9) return `${c.names![x.from].name}이(가) 더는 선수를 보낼 수 없습니다.`;
    from.roster.splice(i, 1);
  }
  club.cash -= x.fee;
  sign(club, x.p, x.salary);
  news(c, `${x.p.name} (${x.p.position}) 영입${x.from >= 0 ? ` · ${c.names![x.from].short} 발전기금 ${x.fee.toFixed(2)}억` : ''} · 연봉 ${x.salary.toFixed(2)}억`, 'good');
  return null;
}

// ───────────────────────── ending (design §10) ─────────────────────────

export const TIER_MIN: Record<EndingTier, number> = { S: 110, A: 80, B: 55, C: 30, D: -Infinity };

export function scoreParts(c: Career): [string, number][] {
  const s = rk(c);
  const club = c.world.clubs[USER];
  const pts = s.games.reduce((a, g) => a + g.points, 0);
  const avg = s.weeks.length ? s.weeks.reduce((a, w) => a + w.rating, 0) / s.weeks.length : 0;
  const wins = s.games.filter(g => g.win).length;
  return [
    ['경기 점수 합계', pts],
    [`평균 시청률 ${avg.toFixed(2)}% × 6`, avg * 6],
    [`승리 ${wins}회 × 2`, wins * 2],
    [club.cash >= 0 ? `재정 건전 (자금 ${club.cash.toFixed(1)}억)` : `적자 (자금 ${club.cash.toFixed(1)}억 × 4)`, club.cash >= 0 ? 5 : club.cash * 4],
  ];
}
export const scoreTotal = (c: Career) => scoreParts(c).reduce((a, [, v]) => a + v, 0);

export function tierOf(total: number): EndingTier {
  return (['S', 'A', 'B', 'C'] as EndingTier[]).find(t => total >= TIER_MIN[t]) ?? 'D';
}

export const TIER_TEXT: Record<EndingTier, [string, string]> = {
  S: ['S급 엔딩 · 3개 기업 공동 창단', '세 기업이 손을 잡고 8구단을 창단합니다. 다음 시즌 V-리그 정식 참가!'],
  A: ['A급 엔딩 · 모기업 창단 또는 네이밍 스폰서', '한 기업이 구단을 맡겠다고 나섰습니다. 창단 방식을 고르세요.'],
  B: ['B급 엔딩 · 네이밍 스폰서', '모기업은 못 찾았지만 이름을 걸겠다는 기업이 셋 있습니다. 함께할 곳을 고르세요.'],
  C: ['C급 엔딩 · 다음 시즌 재도전', '창단 심사는 통과하지 못했지만, 방송사가 한 시즌 더 지원하기로 했습니다.'],
  D: ['D급 엔딩 · 해체', '창단의 꿈은 여기까지. 선수들은 각자의 길로 떠납니다.'],
};

function makeEnding(c: Career): Ending {
  const total = scoreTotal(c);
  const tier = tierOf(total);
  const options: Ending['options'] = {
    S: [{ name: '한결그룹 · 누리텔레콤 · 달빛생명', kind: '공동 창단', desc: '3개 기업 공동 투자. 첫 시즌 예산 1부 평균 이상' }],
    A: [
      { name: '누리텔레콤', kind: '모기업 창단', desc: '구단을 인수해 창단. 예산 안정, 대신 성적 압박이 큼' },
      { name: '바른제약', kind: '네이밍 스폰서', desc: '구단 이름에 기업명을 붙이고 운영은 독립. 압박은 적고 예산은 빠듯' },
    ],
    B: [
      { name: '하루콩식품', kind: '네이밍 스폰서', desc: '지역 밀착형. 홈 관중 보너스' },
      { name: '온새미음료', kind: '네이밍 스폰서', desc: '방송 연계. 시청률 보너스' },
      { name: '새길건설', kind: '네이밍 스폰서', desc: '장기 계약. 3년 보장' },
    ],
    C: [], D: [],
  }[tier];
  return { tier, total, parts: scoreParts(c), options, choice: tier === 'S' ? 0 : null };
}

export function chooseEnding(c: Career, i: number) {
  const e = rk(c).ending!;
  e.choice = i;
  news(c, `${e.options[i].name} · ${e.options[i].kind} 확정!`, 'good');
}

// ───────────────────────── advancing ─────────────────────────

export interface RookieInput { free?: RookieFree; league?: League; live?: LiveMatch }

export function rookieAdvance(c: Career, input: RookieInput = {}): string | void {
  const s = rk(c);
  const r = rngOf(c);
  let msg: string | void = undefined;
  const k = dayKind(s.day);
  if (k === 'ending') return;
  if (k === 'tryout') { const err = tryoutCheck(c); if (err) return err; finishTryout(c, r); }
  else if (k === 'schedule') {
    const err = scheduleCheck(c); if (err) return err;
    news(c, `공식전 상대 확정: ${s.schedule.map(id => c.names![id].short).join(' → ')}`, 'info');
    heal(c, r);
  }
  else if (k === 'match') msg = playOfficial(c, r, input.live);
  else msg = freeDay(c, r, input.free ?? 'train', input.league);
  if (s.day % 7 === 0) weekEnd(c);
  s.day++;
  c.turnNo++;
  if (s.day === LAST_DAY) {
    weekEnd(c);
    s.ending = makeEnding(c);
    news(c, `창단 심사 결과: ${TIER_TEXT[s.ending.tier][0]} (${s.ending.total.toFixed(1)}점)`, ['S', 'A', 'B'].includes(s.ending.tier) ? 'good' : 'bad');
  }
  saveRng(c, r);
  return msg;
}

/** Train (or rest when tired) until the day before the next match or the end */
export function autoToMatch(c: Career): string {
  const s = rk(c);
  let n = 0;
  while (dayKind(s.day) === 'free') {
    const club = c.world.clubs[USER];
    if (avgOf(club, p => p.energy) < 60 || MATCH_DAYS.includes(s.day + 1)) rookieAdvance(c, { free: 'rest' });
    else if (avgOf(club, p => p.sense) < 72) rookieAdvance(c, { free: 'practice', league: 'overseas' });
    else rookieAdvance(c, { free: 'train' });
    n++;
  }
  return `${n}일 자동 진행 (훈련 · 감각이 떨어지면 해외팀 연습경기 · 지치거나 경기 전날엔 휴식)`;
}

/** What the analyst can see of an opponent's plan */
export function rookieScout(c: Career, opp: number, squad?: Squad): (string | null)[] {
  const t = oppTeam(c, opp, squad).team.tactic;
  const lvlA = c.world.clubs[USER].facilities.analysis;
  const vals = [
    `${DIST_TXT[t.distribution]}${t.trick && t.trick !== 'none' ? ` · ${TRICK_TXT[t.trick]}` : ''}`, TEMPO_TXT[t.tempo],
    t.serve === 'target' ? `목적타 (${AIM_TXT[t.aim ?? 'weak']})` : SERVE_TXT[t.serve], BLOCK_TXT[t.block], `${DEF_TXT[t.defense]} · ${t.reception}인 리시브`,
  ];
  return vals.map((v, i) => (i < lvlA ? v : null));
}

export function opponentStarters(c: Career, opp: number, squad?: Squad): Pro[] {
  return buildTeam(squad ? squadClub(c, opp, squad) : c.world.clubs[opp]).starters;
}

