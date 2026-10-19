/**
 * All tunable numbers of the match engine in one place.
 * Calibrated by sim/calibrate.ts against the targets in design/ENGINE.md.
 */
/**
 * Tactic strength (Julius 2026-10-16: "둘 다" → counters ×1.5 plus in-match coaching).
 * Every tactic benefit AND its cost is scaled, so tactics stay neutral vs the default and only counters pay.
 */
const TS = 1.5; // hand-tuned per value below where plain ×1.5 broke neutrality (sim/calibrate.ts §4)
/** scale a tactic's deviation from a neutral value */
const dev = (neutral: number, v: number) => neutral + (v - neutral) * TS;

export const CFG = {
  tacticScale: TS,
  /** scales every stat difference in a contact (GDD: small edge per rally compounds over a match) */
  statK: 0.2,

  // ── gauges (GDD 7.1) ──
  gaugeUp: 1.05,
  gaugeDown: 0.95,
  senseUpAt: 75, senseDownBelow: 40,
  condUpAt: 70, condDownBelow: 35,
  fatiguePenaltyBelow: 50, fatiguePenaltyPerPoint: 0.004,

  // ── serve ──
  serveErrBase: { power: 0.14, target: 0.085, safe: dev(0.085, 0.04) },
  serveErrStatSlope: 1.5, // error × (1 − (stat−65)/100 × slope × K)
  servePressure: { power: 9, target: 3, safe: dev(3, -8) },

  // ── reception ──  q = R - S + offset + N(0, noise)
  recvOffset: 2,
  recvNoise: 15,
  recvAceBelow: -24,
  recvCBelow: -8,
  recvBBelow: 8,
  receptionBonus: { 2: -2, 3: 3.5 },
  /** target serve finds the weak receiver more easily when only two receive */
  targetVsTwo: 2 * TS,
  /** two receivers cover more court, so a hard serve gets through more often */
  powerVsTwo: 2,
  /** 3-person reception: outside hitters are late to their approach */
  threeRecvAttackCost: 5 * TS,
  targetServeAimChance: 0.7,

  // ── set ──
  passBase: { A: 1.0, B: 0.84, C: 0.62 },
  tossWeight: 0.45,

  // ── attack ──
  atkErrBase: 0.05,
  atkErrPoorSet: 0.07,
  atkErrFastRisk: 0.035 * TS,
  stuffBase: 0.045,
  stuffPerBlocker: 0.04,
  stuffSlope: 0.0045,
  tipChance: 0.12,
  killScale: 11,
  killBias: 0.35,
  tipBias: -0.35,
  softBlockChance: 0.18,
  coverChance: 0.25,
  softBlockDig: 10,
  killPerBlocker: 0.08,

  // ── tactics ──
  tempoFastBlockerCut: 0.3 * TS,
  commitVsQuick: 36, commitVsWing: -2 * TS,
  commitQuickKillCut: 0.5 * TS, commitWingBlockerCut: 0.3 * TS,
  aceMarkTarget: 27, aceMarkOther: -3,
  readVsHigh: 6,
  defenseDeepVsPower: 1 * TS, defenseDeepVsTip: -6 * TS,
  defenseTipVsPower: -1.5 * TS, defenseTipVsTip: 6 * TS,

  // ── 목적타 구역 (serve 'target' + aim, Julius 2026-10-19) ──
  /** 'hitter': the aimed outside hitter's first attack loses this many stat points (late approach) */
  aimHitterCost: 11, aimHitterWeight: 0.8,
  /** 'seam': between two receivers — strong vs 2-person reception, closed by a 3-person one */
  seamErr: 0.01, seamVsTwo: 5, seamVsThree: -1.5,
  /** 'short': short serve in front of the 3 m line — little pressure, but the middle can't run its quick */
  shortErr: -0.025, shortPressure: -5, shortQuickMul: 0.25, shortFastCut: 1,
  /** the receivers in front are the ones who run the quick / the fast tempo */
  shortVsMiddle: 9, shortVsFast: 6,

  // ── set-play tricks ──
  /** 'decoy' (속공 페이크·시간차): the middle jumps as a decoy; blockers who bite leave the wing open */
  decoyQuickMul: 0.55, decoySetCost: 0.02,
  decoyBite: { read: -1.6, commit: 0.9, aceMark: 0.4 }, decoyStatSlope: 0.07, decoyBlockerCut: 0.8,
  /** 'dump' (세터 투 어택): front-row setter tips the second ball; a tip-ready defense reads it */
  dumpRate: 0.14, dumpBias: -0.65, dumpVs: { deep: 0.1, tip: -1.6 }, dumpVsRead: -0.25,

  // ── in-match coaching ──
  /** a team on a run of 3+ points plays a little better: +step per point beyond 2, capped */
  momentumStep: 2, momentumMax: 6,
  timeoutsPerSet: 2,
  /** sets 1–4: a technical timeout when the leading team first reaches each score */
  technicalAt: [8, 16],
  subsPerSet: 6,
  /** energy a benched player gets back per set */
  benchRecover: 15,

  // ── fatigue per set (GDD 7.4) ──
  drainPerSet: 6,
  drainPos: { OH: 1.2, OP: 1.15, MB: 1.1, S: 1.0, L: 0.85 },
};
