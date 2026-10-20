/** Numbers taken from design/GDD.md, in one place so the balance sim can tune them. */
import type { Facility, Grade, GrowthType } from './types.ts';

export const RULES = {
  gamesPerSeason: 42,
  rosterSize: 22,
  minByPos: { S: 2, OP: 2, OH: 4, MB: 4, L: 2 } as Record<string, number>,

  // GDD 6.2 — season GP by potential grade
  /** overall growth speed (Julius 2026-10-17: slower, ×0.8) */
  growthScale: 0.8,
  baseGP: { S: 33, A: 27, B: 23, C: 19, D: 16, E: 12, F: 10 } as Record<Grade, number>,
  // GDD 6.5 — growth multiplier by age bracket [19-20, 21-23, 24-26, 27-29, 30-32, 33-35, 36+]
  ageMult: {
    early: [1.4, 1.2, 0.5, 0.2, 0, 0, 0],
    normal: [1.0, 1.1, 1.0, 0.6, 0.2, 0, 0],
    late: [0.6, 0.7, 0.9, 1.0, 0.8, 0.4, 0.1],
    elite: [1.2, 1.2, 1.1, 0.8, 0.5, 0.2, 0],
  } as Record<GrowthType, number[]>,
  // GDD 6.5 — yearly decline in OVR points: [start age, first rate, rate from start+3]
  decline: {
    early: [26, 2.0, 4.0], normal: [29, 1.5, 3.0], late: [33, 0.5, 1.5], elite: [30, 1.0, 2.0],
  } as Record<GrowthType, [number, number, number]>,
  // GDD 6.3 — start ratio of potential at 19
  startRatio: { early: 0.85, normal: 0.75, late: 0.6, elite: 0.9 } as Record<GrowthType, number>,
  growthMix: { early: 0.25, normal: 0.47, late: 0.2, elite: 0.08 } as Record<GrowthType, number>,

  // GDD 15.4 — draft pool potential grade distribution
  draftGrades: { S: 0.012, A: 0.045, B: 0.07, C: 0.11, D: 0.22, E: 0.3, F: 0.243 } as Record<Grade, number>,
  draftPoolPerClub: 3.5,

  // GDD 12.1 — base budget (억) by division
  baseBudget: [60, 30, 15],
  budgetSpread: 0.13,
  payrollShare: { invest: 0.85, balanced: 0.75, saver: 0.65 },
  /** league-wide payroll cap as share of each division's base budget (null = no cap). V-League has one. */
  salaryCap: null as number | null,
  /** transfers from lower divisions (fee = salary × feeMult, paid to the selling club) */
  transfersPerClub: 2,
  transferFeeMult: 1.5,
  reserveShare: { invest: 0.05, balanced: 0.1, saver: 0.2 },

  // GDD 12.2 — salary curve: 0.2억 at OVR 40 → ~6억 at 95
  salary: (ovr: number) => 0.2 * Math.exp(Math.max(0, ovr - 40) * 0.0618),
  foreignOvr: [[88, 4], [78, 4], [72, 3]] as [number, number][],
  // foreigners are a luxury (Julius 2026-10-16): S 15 / A 10 / B 6억
  foreignSalary: (ovr: number) => (ovr >= 90 ? 15 : ovr >= 80 ? 10 : 6),
  /** part of the base budget that moves with last season's rank: 1st ×(1+x), 8th ×(1−x) */
  sponsorPerf: 0.15,
  /** staff + travel + club operations as share of base budget (big clubs run bigger operations) */
  opsShare: [0.28, 0.22, 0.13],
  /** relegated clubs get this share of the division above's budget for one season */
  parachuteShare: 0.7,
  /** players of top-2 clubs ask more when re-signing (winning costs money) */
  winnerRaise: 0.3,
  /** cash below −x × base budget forces player sales in the off turns */
  distressAt: 0.1,
  /** draft order: 'lowerFirst' = 3부 worst club picks first (lets small clubs grow talent) */
  draftOrder: 'lowerFirst' as 'lowerFirst' | 'upperFirst',

  // GDD 11 — facilities
  facilityStart: [[2, 3], [1, 2], [1, 1]] as [number, number][],
  analysisStart: [[1, 3], [0, 1], [0, 0]] as [number, number][],
  /**
   * Growth conditions (Julius 2026-10-17): the best case = 1.0 — a regular starter with a level-5 training
   * facility and an S coach, where a focused stat reaches 99 in 2–3 seasons. Everything else grows slower.
   */
  trainingMult: [0.55, 0.64, 0.73, 0.82, 0.91, 1.0],
  coachMult: { S: 1.0, A: 0.88, B: 0.77, C: 0.69, none: 0.6 } as Record<string, number>,
  /** head coach grade of clubs without staff (balance sim) and of the default staff */
  defaultCoach: ['A', 'B', 'C'] as string[],
  /** share of the segment's matches started: ≥70% / 30–70% / <30%; 2군 (roster slot 15+) and injured */
  playMult: { regular: 1.0, rotation: 0.85, bench: 0.7, reserve: 0.55, injured: 0.3 },
  /** generated veterans (world creation, draft) grew up in a typical environment */
  genGrowthMult: 0.8,
  medicalMult: [1.15, 1.0, 0.92, 0.85, 0.77, 0.7],
  stadiumSeats: [1000, 2000, 3500, 5000, 6500, 8000],
  upgradeBase: [0, 1, 2, 4, 7, 12],
  facilityWeight: { stadium: 2, training: 1.2, medical: 1, restaurant: 0.6, bus: 0.5, analysis: 1, scout: 0.8 } as Record<Facility, number>,

  // GDD 12.3 — revenue
  ticketPrice: [0.00015, 0.0001, 0.00007], // 억 per seat (1.5만 / 1만 / 0.7만 원)
  startFans: [20000, 6000, 2000],
  goodsPerFan: 0.0001,                       // 억 per fan per season
  prize: [[6, 3, 1.5, 1], [2, 1, 0.5, 0.3], [0.8, 0.4, 0.2, 0.1]], // champion, runner-up, 3rd, 4th

  // GDD 7.4 — injuries
  injuryPerSet: 0.0035,
};

export const GRADE_RANGE: Record<Grade, [number, number]> = {
  S: [90, 99], A: [80, 89], B: [70, 79], C: [60, 69], D: [50, 59], E: [40, 49], F: [30, 39],
};

export function gradeOf(v: number): Grade {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  return 'F';
}

export function ageBracket(age: number): number {
  if (age <= 20) return 0;
  if (age <= 23) return 1;
  if (age <= 26) return 2;
  if (age <= 29) return 3;
  if (age <= 32) return 4;
  if (age <= 35) return 5;
  return 6;
}
