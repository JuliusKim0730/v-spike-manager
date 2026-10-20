/**
 * Staff effects (GDD 13, Julius 2026-10-20). Each building holds 1–3 related staff.
 * A club without a `staff` list (balance sim) gets exactly the pre-staff numbers, so the sim stays comparable.
 */
import { RULES } from './rules.ts';
import type { Club, Facility, StaffGrade, StaffRole } from './types.ts';

export const STAFF_ROLES: Record<StaffRole, { facility: Facility; name: string; max: number }> = {
  head: { facility: 'training', name: '수석코치', max: 1 },
  physical: { facility: 'training', name: '신체코치', max: 1 },
  technical: { facility: 'training', name: '기술코치', max: 1 },
  scout: { facility: 'scout', name: '스카우터', max: 3 },
  keeper: { facility: 'stadium', name: '경기장 관리자', max: 1 },
  manager: { facility: 'stadium', name: '매니저', max: 2 },
  doctor: { facility: 'medical', name: '팀닥터', max: 3 },
  analyst: { facility: 'analysis', name: '분석관', max: 3 },
};
export const ROLE_ORDER = Object.keys(STAFF_ROLES) as StaffRole[];
export const rolesOf = (f: Facility) => ROLE_ORDER.filter(r => STAFF_ROLES[r].facility === f);

export const STAFF = {
  /** GDD 13 salary multiplier × division base pay (억) */
  payMult: { S: 3.0, A: 1.8, B: 1.0, C: 0.6 } as Record<StaffGrade, number>,
  basePay: [0.6, 0.35, 0.2],
  /** default staff: head coach = RULES.defaultCoach, one of every other role at this grade */
  defaultGrade: ['B', 'C', 'C'] as StaffGrade[],
  /** physical / skill coach → growth of that stat category (best = 1.0 like the head coach) */
  catCoach: { S: 1.0, A: 0.97, B: 0.94, C: 0.91, none: 0.85 } as Record<string, number>,
  /** GDD 13 medical efficiency of the best doctor; every extra doctor +3% */
  doctor: { S: 1.2, A: 1.1, B: 1.05, C: 1.0, none: 0.9 } as Record<string, number>,
  extraDoctor: 0.03,
  /** staff points of a grade; 1 point in a building lifts its effect by one level */
  points: { S: 1, A: 0.6, B: 0.35, C: 0.2 } as Record<StaffGrade, number>,
  /** stadium keeper → facility upkeep */
  keeper: { S: 0.7, A: 0.8, B: 0.9, C: 0.95, none: 1.1 } as Record<string, number>,
  /** each manager → ticket and goods income */
  manager: { S: 0.12, A: 0.08, B: 0.05, C: 0.03 } as Record<StaffGrade, number>,
  /** firing pays this share of a season's salary */
  severance: 0.5,
};

const RANK: Record<StaffGrade, number> = { S: 4, A: 3, B: 2, C: 1 };

export const staffOf = (c: Club, role: StaffRole) => (c.staff ?? []).filter(s => s.role === role);

export function bestGrade(c: Club, role: StaffRole): StaffGrade | 'none' {
  let best: StaffGrade | 'none' = 'none';
  for (const s of staffOf(c, role)) if (best === 'none' || RANK[s.grade] > RANK[best]) best = s.grade;
  return best;
}

export const staffPay = (division: number, g: StaffGrade) => STAFF.basePay[division] * STAFF.payMult[g];

export function headCoach(c: Club): string {
  return c.staff ? bestGrade(c, 'head') : c.coach ?? RULES.defaultCoach[c.division];
}

/** growth multiplier per stat category from the physical and skill coaches */
export function categoryMult(c: Club): { phys: number; tech: number } {
  if (!c.staff) return { phys: 1, tech: 1 };
  return { phys: STAFF.catCoach[bestGrade(c, 'physical')], tech: STAFF.catCoach[bestGrade(c, 'technical')] };
}

/** injury risk ÷ this, injury length ÷ this */
export function medicalEff(c: Club): number {
  if (!c.staff) return 1;
  const n = staffOf(c, 'doctor').length;
  return STAFF.doctor[bestGrade(c, 'doctor')] + Math.max(0, n - 1) * STAFF.extraDoctor;
}

/**
 * Working level of the analysis room or scout center: no staff halves it, 1+ staff point (one S, two A, three B…)
 * adds a level.
 */
export function effectiveLevel(c: Club, f: 'analysis' | 'scout'): number {
  const lvl = c.facilities[f] ?? 0;
  if (!c.staff) return lvl;
  const role: StaffRole = f === 'analysis' ? 'analyst' : 'scout';
  const team = staffOf(c, role);
  if (team.length === 0) return Math.floor(lvl / 2);
  const pts = team.reduce((a, s) => a + STAFF.points[s.grade], 0);
  return Math.min(5, lvl + (pts >= 1 ? 1 : 0));
}

export const upkeepMult = (c: Club) => (c.staff ? STAFF.keeper[bestGrade(c, 'keeper')] : 1);
export const gateMult = (c: Club) => 1 + staffOf(c, 'manager').reduce((a, s) => a + STAFF.manager[s.grade], 0);

/** staff salaries replace this part of the division's operations share (so default staff costs the same as before) */
export function defaultStaffCost(division: number): number {
  return staffPay(division, RULES.defaultCoach[division] as StaffGrade) + (ROLE_ORDER.length - 1) * staffPay(division, STAFF.defaultGrade[division]);
}
export const staffCost = (c: Club) => (c.staff ?? []).reduce((a, s) => a + s.salary, 0);
/** what staff adds to the books on top of RULES.opsShare */
export const staffExtra = (c: Club) => (c.staff ? staffCost(c) - defaultStaffCost(c.division) : 0);
