export type Position = 'OH' | 'OP' | 'MB' | 'S' | 'L';

export type PhysKey = 'jump' | 'stamina' | 'agility' | 'flexibility';
export type TechKey =
  | 'spike' | 'backAttack' | 'quick' | 'block' | 'serve'
  | 'receive' | 'dig' | 'set' | 'positioning';

/** Skill ids from the catalogue in skills.ts (GDD 14) */
export type SkillId = string;

export interface Player {
  id: string;
  name: string;
  position: Position;
  height: number; // cm
  phys: Record<PhysKey, number>;
  tech: Record<TechKey, number>;
  skills: SkillId[];
  // gauges, 0..100
  sense: number;      // 경기감각
  condition: number;  // 컨디션
  energy: number;     // 체력 게이지
}

export type Distribution = 'left' | 'right' | 'middle' | 'balanced';
export type Tempo = 'high' | 'fast';
export type ServeTactic = 'power' | 'target' | 'safe';
export type BlockTactic = 'read' | 'commit' | 'aceMark';
export type DefenseTactic = 'deep' | 'tip';
/** 목적타 (serve: 'target') — which part of the receiving court the server aims at */
export type ServeAim = 'weak' | 'hitter' | 'seam' | 'short';
/** set-play trick: 속공 페이크(시간차) / 세터 투 어택 */
export type Trick = 'none' | 'decoy' | 'dump';

export interface Tactic {
  distribution: Distribution;
  tempo: Tempo;
  serve: ServeTactic;
  block: BlockTactic;
  defense: DefenseTactic;
  reception: 2 | 3;
  /** only used when serve is 'target'; older saves lack it (= 'weak') */
  aim?: ServeAim;
  /** older saves lack it (= 'none') */
  trick?: Trick;
}

export interface Team {
  name: string;
  /** serve order: [S, OH1, MB1, OP, OH2, MB2] — diagonals S/OP, OH/OH, MB/MB */
  lineup: Player[];
  libero: Player;
  tactic: Tactic;
  /** reserves the coach can bring on between sets */
  bench?: Player[];
}

/** What a coach can see during a match (GDD 7.3 경기 중 개입). Counts are this match so far. */
export interface CoachView {
  setNo: number;
  /** [mine, theirs] */
  score: [number, number];
  setsWon: [number, number];
  me: Team;
  opp: Team;
  /** who the opponent has attacked with */
  oppAttacks: { OH: number; OP: number; MB: number; back: number; total: number };
  /** my reception results */
  myRecv: { A: number; B: number; C: number; aced: number };
  /** points the opponent has won in a row */
  oppRun: number;
  timeoutsLeft: number;
  /** in-set substitutions still allowed (CFG.subsPerSet per set; between-set changes are free) */
  subsLeft: number;
  /** this match's line for a player */
  line(p: Player): PlayerLine;
  /** the match's seeded random number, so AI choices replay with the seed */
  rand(): number;
}

export type BreakKind = 'timeout' | 'technical' | 'set';

/** What a side does in a break: tactic changes and [lineup slot 0–5 or 'L', bench player coming on] */
export interface BreakPlan { tactic?: Partial<Tactic>; subs?: [number | 'L', Player][] }

/** In-match decisions. The player makes these through the UI; AI clubs use src/coach.ts. */
export interface Coach {
  /** before sets 2–5: tactic changes */
  betweenSets?(v: CoachView): Partial<Tactic> | void;
  /** after each point the opponent wins: true = call a timeout */
  wantsTimeout?(v: CoachView): boolean;
  /** during a timeout: tactic changes */
  inTimeout?(v: CoachView): Partial<Tactic> | void;
  /** before sets 2–5: [lineup slot 0–5 or 'L', bench player coming on] */
  substitutions?(v: CoachView): [number | 'L', Player][];
  /** any break (timeout by either side, technical timeout, between sets); runs after the hooks above */
  atBreak?(v: CoachView, kind: BreakKind, calledByMe: boolean): BreakPlan | void;
}

export type Pass = 'A' | 'B' | 'C';

export interface PlayerLine {
  serves: number; aces: number; serveErrors: number;
  receives: number; recvA: number; recvB: number; recvC: number; recvAced: number;
  attacks: number; kills: number; attackErrors: number; blocked: number;
  blocks: number; digs: number;
  sets: number;
}

export interface RallyEvent {
  team: 0 | 1;
  text: string;
  tag: string;
}

export interface SetResult { score: [number, number]; }

export interface MatchResult {
  sets: SetResult[];
  winner: 0 | 1;
  setsWon: [number, number];
  lines: Map<string, PlayerLine>;
  team: [TeamTotals, TeamTotals];
  log: string[];
  /** in-match coaching used: [team0, team1] */
  timeouts: [number, number];
  tacticChanges: [number, number];
  subs: [number, number];
  technicalTimeouts: number;
  /** plays won by a tactic (set play fooled the block, aimed serve ace, marked block, tip defense dig) */
  tacticHits?: [number, number];
}

export interface TeamTotals {
  rallies: number;
  receiveRallies: number; sideouts: number;
  serveRallies: number; breakPoints: number;
  attacks: number; kills: number; attackErrors: number; blocked: number;
  blockPoints: number;
  serves: number; aces: number; serveErrors: number;
  recvA: number; recvB: number; recvC: number;
  attacksPerRally: number;
}
