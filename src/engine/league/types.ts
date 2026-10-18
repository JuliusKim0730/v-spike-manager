import type { Player, Team } from '../types.ts';

export type GrowthType = 'early' | 'normal' | 'late' | 'elite';
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Personality = 'invest' | 'balanced' | 'saver';
export type Facility = 'stadium' | 'training' | 'medical' | 'restaurant' | 'bus' | 'analysis';

/** A player with a career: age, potential, contract (GDD 6, 14) */
export interface Pro extends Player {
  age: number;
  growth: GrowthType;
  potGrade: Grade;
  potPhys: number;
  potTech: number;
  salary: number;       // 억 원 / season
  contract: number;     // seasons left
  injured: number;      // matches left out
  foreign: boolean;
  clubId: number;       // -1 = free agent
  peakOvr: number;
  peakAge: number;
  // per growth segment
  segGames: number;
  segPlayed: number;
  /** training plan set by the user (web app); AI clubs leave it empty */
  train?: import('./growth.ts').TrainMode;
}

export interface Club {
  id: number;
  name: string;
  division: 0 | 1 | 2;
  budgetFactor: number;   // per-club variance around the division base (GDD 12.1)
  personality: Personality;
  roster: Pro[];
  facilities: Record<Facility, number>;
  fans: number;
  cash: number;           // running balance
  deficitStreak: number;
  // season record
  wins: number; losses: number; points: number; setsWon: number; setsLost: number;
  streak: number;
  injuries: number;
  income: number; expense: number;
  balancePct: number;     // last season's result as % of base budget
  transferNet: number;    // fees received − paid in this off-season
  forcedSales: number;
  parachute: number;      // seasons left of relegation support
  lastRank: number;
  /** head coach grade (web app; staff system later) */
  coach?: 'S' | 'A' | 'B' | 'C' | 'none';
}

export interface MatchTeam { club: Club; team: Team; }

export interface World {
  year: number;
  clubs: Club[];          // 24
  freeAgents: Pro[];
  retired: Pro[];         // this season's retirees
  history: SeasonRecord[];
}

export interface SeasonRecord {
  year: number;
  champion: [number, number, number];      // club id per division
  promoted: number[];
  relegated: number[];
  divStarterOvr: [number, number, number];
  domesticS: number; domesticA: number;
  retireAges: number[];
  peakAges: Record<GrowthType, number[]>;
  injuriesPerClub: number;
  seasonOutInjuries: number;
  balances: [number[], number[], number[]];  // per division, % of base budget
  deficit3: number;
  firstSeedChampion: number;               // divisions where regular 1st won
  draftTop: { id: string; ovr: number }[];
  divisions: number[];                     // by club id, after promotion/relegation
  transferNet: [number, number, number];   // avg fee balance per club, by division
  forcedSales: [number, number, number];
  skippedForeign: [number, number, number];
  negative: [number, number, number];      // clubs with a losing season, by division
}
