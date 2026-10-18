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

export interface Tactic {
  distribution: Distribution;
  tempo: Tempo;
  serve: ServeTactic;
  block: BlockTactic;
  defense: DefenseTactic;
  reception: 2 | 3;
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
}

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
