/**
 * 행동 리포트 (Julius 2026-10-25): after every action (훈련, 연습경기, 휴식, 경기…) show what changed for each player:
 * OVR and stat gains or drops, and 체력·컨디션·경기감각 before → after. Both game modes.
 */
import type { Club, Pro } from '../engine/league/types.ts';
import { OVR_WEIGHT, PHYS_KEYS, TECH_KEYS, TECH_SET } from '../engine/player.ts';

export const STAT_KO: Record<string, string> = {
  jump: '점프력', stamina: '지구력', agility: '민첩성', flexibility: '유연성',
  spike: '스파이크', backAttack: '백어택', quick: '속공', block: '블로킹', serve: '서브', receive: '리시브', dig: '디그', set: '토스', positioning: '위치 선정',
};

/** OVR without the floor, so small training gains still show */
export const ovrExact = (p: Pro) => {
  const [wp, wt] = OVR_WEIGHT[p.position];
  const phys = PHYS_KEYS.reduce((a, k) => a + p.phys[k], 0) / 4;
  const tech = TECH_SET[p.position].reduce((a, k) => a + p.tech[k], 0) / 4;
  return phys * wp + tech * wt;
};

interface PSnap { ovr: number; st: Record<string, number>; e: number; c: number; s: number; inj: number }
export interface Snapshot { players: Record<string, PSnap>; units?: number }

export function snapshot(club: Club, units?: number): Snapshot {
  const players: Record<string, PSnap> = {};
  for (const p of club.roster) {
    const st: Record<string, number> = {};
    for (const k of PHYS_KEYS) st[k] = p.phys[k];
    for (const k of TECH_KEYS) st[k] = p.tech[k];
    players[p.id] = { ovr: ovrExact(p), st, e: p.energy, c: p.condition, s: p.sense, inj: p.injured };
  }
  return { players, units };
}

export interface ReportRow {
  id: string; name: string; pos: Pro['position'];
  ovr: [number, number];
  /** stats that moved, biggest first: [key, delta] */
  stats: [string, number][];
  energy: [number, number]; cond: [number, number]; sense: [number, number];
  injured: boolean; joined?: boolean;
}
export interface TurnReport {
  title: string;
  msg?: string;
  rows: ReportRow[];
  avg: { energy: [number, number]; cond: [number, number]; sense: [number, number] };
  /** extra lines (e.g. 성장 포인트 적립 in career mode, where training pays out later) */
  notes: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function diffReport(before: Snapshot, club: Club, title: string, msg?: string, units?: number): TurnReport {
  const rows: ReportRow[] = [];
  for (const p of club.roster) {
    const b = before.players[p.id];
    const now = { ovr: ovrExact(p), e: p.energy, c: p.condition, s: p.sense };
    const stats: [string, number][] = [];
    if (b) {
      for (const k of PHYS_KEYS) { const d = p.phys[k] - b.st[k]; if (Math.abs(d) >= 0.05) stats.push([k, d]); }
      for (const k of TECH_KEYS) { const d = p.tech[k] - b.st[k]; if (Math.abs(d) >= 0.05) stats.push([k, d]); }
      stats.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    }
    rows.push({
      id: p.id, name: p.name, pos: p.position,
      ovr: [b?.ovr ?? now.ovr, now.ovr], stats,
      energy: [b?.e ?? now.e, now.e], cond: [b?.c ?? now.c, now.c], sense: [b?.s ?? now.s, now.s],
      injured: p.injured > 0 && (b?.inj ?? 0) === 0, joined: !b,
    });
  }
  rows.sort((a, b) => (b.ovr[1] - b.ovr[0]) - (a.ovr[1] - a.ovr[0]));
  const known = rows.filter(r => !r.joined);
  const notes: string[] = [];
  if (units !== undefined && before.units !== undefined && units > before.units + 1e-6) {
    notes.push(`성장 포인트 +${(units - before.units).toFixed(1)} 적립 (누적 ${units.toFixed(1)}) · 스폰서 계약 턴에 능력치로 반영됩니다`);
  }
  return {
    title, msg, rows, notes,
    avg: {
      energy: [mean(known.map(r => r.energy[0])), mean(known.map(r => r.energy[1]))],
      cond: [mean(known.map(r => r.cond[0])), mean(known.map(r => r.cond[1]))],
      sense: [mean(known.map(r => r.sense[0])), mean(known.map(r => r.sense[1]))],
    },
  };
}
