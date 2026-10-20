/** Staff hiring (GDD 13, Julius 2026-10-20): default staff for every club, a candidate pool each season, hire and fire. */
import { Rng } from '../engine/rng.ts';
import { RULES } from '../engine/league/rules.ts';
import { ROLE_ORDER, STAFF, STAFF_ROLES, staffOf, staffPay } from '../engine/league/staff.ts';
import type { Club, Staff, StaffGrade, StaffRole, World } from '../engine/league/types.ts';
import { koreanName } from './names.ts';

const GRADES: StaffGrade[] = ['S', 'A', 'B', 'C'];
/** candidate grade odds by the hiring club's division */
const POOL_ODDS = [[0.1, 0.3, 0.4, 0.2], [0.05, 0.2, 0.4, 0.35], [0.02, 0.12, 0.36, 0.5]];
const PER_ROLE = 3;

/** staff ids live on the world so saves and new games share one counter */
const nextId = (w: World) => (w.staffSeq = (w.staffSeq ?? 0) + 1);

function makeStaff(w: World, r: Rng, role: StaffRole, grade: StaffGrade, division: number): Staff {
  const salary = Math.round(staffPay(division, grade) * (0.9 + r.next() * 0.2) * 100) / 100;
  return { id: nextId(w), name: koreanName(r), role, grade, age: r.int(32, 62), salary };
}

/** head coach = RULES.defaultCoach, every other role one person at STAFF.defaultGrade */
export function defaultStaff(w: World, club: Club, r: Rng): Staff[] {
  return ROLE_ORDER.map(role => {
    const g = (role === 'head' ? RULES.defaultCoach[club.division] : STAFF.defaultGrade[club.division]) as StaffGrade;
    const s = makeStaff(w, r, role, g, club.division);
    s.salary = staffPay(club.division, g); // default staff costs exactly what the ops share used to cover
    return s;
  });
}

/** give every club its default staff and a scout center (new game, or a save from before staff) */
export function ensureStaff(w: World, seed: number) {
  const r = new Rng(seed ^ 0x57aff);
  for (const club of w.clubs) {
    if (club.facilities.scout === undefined) club.facilities.scout = club.facilities.analysis;
    if (!club.staff) club.staff = defaultStaff(w, club, r);
  }
}

export function staffPool(w: World, club: Club, r: Rng): Staff[] {
  const out: Staff[] = [];
  for (const role of ROLE_ORDER) for (let i = 0; i < PER_ROLE; i++) {
    out.push(makeStaff(w, r, role, r.pickWeighted(GRADES, POOL_ODDS[club.division]), club.division));
  }
  return out;
}

export function hireStaff(club: Club, pool: Staff[], s: Staff): string | null {
  const meta = STAFF_ROLES[s.role];
  if (staffOf(club, s.role).length >= meta.max) return `${meta.name} 자리가 꽉 찼습니다. 먼저 내보내야 해요.`;
  const i = pool.indexOf(s);
  if (i < 0) return '이미 다른 곳과 계약한 후보입니다.';
  pool.splice(i, 1);
  (club.staff ??= []).push(s);
  return null;
}

export const severanceOf = (s: Staff) => Math.round(s.salary * STAFF.severance * 100) / 100;

export function fireStaff(club: Club, s: Staff): string | null {
  const i = club.staff?.indexOf(s) ?? -1;
  if (i < 0) return '이미 떠난 스태프입니다.';
  club.staff!.splice(i, 1);
  club.cash -= severanceOf(s);
  return null;
}
