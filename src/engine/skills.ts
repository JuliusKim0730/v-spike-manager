/** GDD 14 — skill catalogue (40) and how players get them */
import type { Position } from './types.ts';
import { Rng } from './rng.ts';

export type SkillGrade = 'S' | 'A' | 'B' | 'C';

export interface SkillDef {
  id: string;
  name: string;
  grade: SkillGrade;
  pos: Position[] | 'all';
  /** true = the match engine already applies its effect */
  wired: boolean;
}

const ALL = 'all' as const;
export const SKILLS: SkillDef[] = [
  // S
  { id: 'ironMan', name: '철인', grade: 'S', pos: ALL, wired: false },
  { id: 'aceInstinct', name: '에이스 본능', grade: 'S', pos: ['OH', 'OP'], wired: true },
  { id: 'ironWall', name: '철벽', grade: 'S', pos: ['MB', 'OP'], wired: true },
  { id: 'fieldGeneral', name: '야전사령관', grade: 'S', pos: ['S'], wired: false },
  { id: 'guardian', name: '수호신', grade: 'S', pos: ['L', 'OH'], wired: false },
  { id: 'serveBomber', name: '서브 폭격기', grade: 'S', pos: ALL, wired: true },
  // A
  { id: 'clutchHitter', name: '클러치 히터', grade: 'A', pos: ['OH', 'OP'], wired: false },
  { id: 'pipeMaster', name: '파이프 장인', grade: 'A', pos: ['OH', 'OP'], wired: false },
  { id: 'quickMaster', name: '속공의 달인', grade: 'A', pos: ['MB'], wired: false },
  { id: 'readBlocker', name: '리딩 블로커', grade: 'A', pos: ['MB'], wired: false },
  { id: 'receiveMaster', name: '리시브 장인', grade: 'A', pos: ['OH', 'L'], wired: true },
  { id: 'targetSniper', name: '목적타 저격수', grade: 'A', pos: ALL, wired: false },
  { id: 'moodMaker', name: '분위기 메이커', grade: 'A', pos: ALL, wired: false },
  { id: 'steelStamina', name: '강철 체력', grade: 'A', pos: ALL, wired: false },
  { id: 'tipMagician', name: '연타 마술사', grade: 'A', pos: ['OH', 'OP'], wired: false },
  { id: 'bigGame', name: '빅게임 플레이어', grade: 'A', pos: ALL, wired: false },
  // B
  { id: 'jumpServer', name: '점프 서버', grade: 'B', pos: ALL, wired: false },
  { id: 'floatServer', name: '플로터 서버', grade: 'B', pos: ALL, wired: false },
  { id: 'softHands', name: '손모양 블로킹', grade: 'B', pos: ['MB', 'OP'], wired: false },
  { id: 'secondSetter', name: '2단 연결', grade: 'B', pos: ['L', 'OH'], wired: false },
  { id: 'timeDiff', name: '시간차 공격', grade: 'B', pos: ['OH', 'MB'], wired: false },
  { id: 'rebound', name: '리바운드', grade: 'B', pos: ['OH', 'OP'], wired: false },
  { id: 'recovery', name: '회복력', grade: 'B', pos: ALL, wired: false },
  { id: 'routine', name: '루틴', grade: 'B', pos: ALL, wired: false },
  { id: 'diligent', name: '부지런함', grade: 'B', pos: ALL, wired: false },
  { id: 'leadership', name: '리더십', grade: 'B', pos: ALL, wired: false },
  { id: 'rightSide', name: '라이트 강자', grade: 'B', pos: ['OP'], wired: false },
  { id: 'coverPlay', name: '커버 플레이', grade: 'B', pos: ALL, wired: false },
  // C
  { id: 'sincere', name: '성실', grade: 'C', pos: ALL, wired: false },
  { id: 'fanService', name: '팬서비스', grade: 'C', pos: ALL, wired: false },
  { id: 'popStar', name: '인기 스타', grade: 'C', pos: ALL, wired: false },
  { id: 'braveHeart', name: '강심장', grade: 'C', pos: ALL, wired: false },
  { id: 'homeBody', name: '홈 체질', grade: 'C', pos: ALL, wired: false },
  { id: 'steadyReceive', name: '안정 리시브', grade: 'C', pos: ['OH', 'L'], wired: false },
  { id: 'serveRoutine', name: '서브 루틴', grade: 'C', pos: ALL, wired: false },
  { id: 'hardWorker', name: '노력파', grade: 'C', pos: ALL, wired: false },
  { id: 'lateBloomer', name: '늦게 피는 꽃', grade: 'C', pos: ALL, wired: false },
  { id: 'maknae', name: '막내 에너지', grade: 'C', pos: ALL, wired: false },
  { id: 'multiPlayer', name: '멀티 플레이어', grade: 'C', pos: ALL, wired: false },
  { id: 'quickFeet', name: '빠른 발', grade: 'C', pos: ['L'], wired: false },
];

export const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]));

/** GDD 14.1 — slots by player grade */
export function skillSlots(ovr: number): number {
  return ovr >= 80 ? 3 : ovr >= 60 ? 2 : 1;
}

/** GDD 14.2 — skill grade odds by player grade [S, A, B, C] */
const GRADE_ODDS: [number, number[]][] = [
  [90, [0.15, 0.35, 0.35, 0.15]],
  [80, [0.07, 0.28, 0.40, 0.25]],
  [70, [0.03, 0.17, 0.40, 0.40]],
  [60, [0.01, 0.09, 0.35, 0.55]],
  [50, [0.005, 0.045, 0.25, 0.70]],
  [0, [0, 0.02, 0.18, 0.80]],
];

export function rollSkill(rng: Rng, ovr: number, pos: Position, owned: string[]): string | null {
  const odds = GRADE_ODDS.find(([min]) => ovr >= min)![1];
  const g = rng.pickWeighted(['S', 'A', 'B', 'C'] as SkillGrade[], odds);
  const pool = SKILLS.filter(s => s.grade === g && !owned.includes(s.id) && (s.pos === 'all' || s.pos.includes(pos)));
  return pool.length ? pool[rng.int(0, pool.length - 1)].id : null;
}

/** GDD 14.1 — a new player owns (slots − 1) skills; a one-slot player has a 40% chance of one */
export function startingSkills(rng: Rng, ovr: number, pos: Position): string[] {
  const slots = skillSlots(ovr);
  const n = slots === 1 ? (rng.chance(0.4) ? 1 : 0) : slots - 1;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = rollSkill(rng, ovr, pos, out);
    if (s) out.push(s);
  }
  return out;
}
