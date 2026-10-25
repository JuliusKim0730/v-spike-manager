/** Save slots (GDD 1: 계정당 3개). Guest saves live in this browser until accounts arrive. */
import type { Career } from './career.ts';
import { DEFAULT_TACTIC, ID_SEQ } from '../engine/player.ts';

const KEY = (slot: number) => `vbm.save.${slot}`;
export const SLOTS = [0, 1, 2];

export interface SlotInfo { slot: number; team: string; year: number; phase: string; savedAt: number; mode?: 'rookie' }

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function saveCareer(c: Career, meta: { team: string; phase: string }) {
  c.savedAt = Date.now();
  try {
    store()?.setItem(KEY(c.slot), JSON.stringify(c));
    store()?.setItem(KEY(c.slot) + '.meta', JSON.stringify({ slot: c.slot, team: meta.team, year: c.world.year, phase: meta.phase, savedAt: c.savedAt, mode: c.mode }));
    return true;
  } catch { return false; }
}

export function loadCareer(slot: number): Career | null {
  try {
    const raw = store()?.getItem(KEY(slot));
    if (!raw) return null;
    const c = JSON.parse(raw) as Career;
    c.tactic = { ...DEFAULT_TACTIC, ...c.tactic }; // saves before 목적타 구역·세트 플레이
    ID_SEQ.player = c.ids.player; ID_SEQ.pro = c.ids.pro;
    return c;
  } catch { return null; }
}

export function slotInfo(slot: number): SlotInfo | null {
  try {
    const raw = store()?.getItem(KEY(slot) + '.meta');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function deleteSlot(slot: number) {
  try { store()?.removeItem(KEY(slot)); store()?.removeItem(KEY(slot) + '.meta'); } catch { /* ignore */ }
}

export function lastSlot(): number | null {
  const infos = SLOTS.map(slotInfo).filter((x): x is SlotInfo => !!x).sort((a, b) => b.savedAt - a.savedAt);
  return infos[0]?.slot ?? null;
}
