/** Growth check: 6 seasons of the league sim → starter OVR by division, S/A counts, stat spread inside players */
import { createWorld } from '../src/engine/league/world.ts';
import { playSeason } from '../src/engine/league/season.ts';
import { Rng } from '../src/engine/rng.ts';
import { PHYS_KEYS, TECH_SET, ovr } from '../src/engine/player.ts';

const runs = Number(process.argv[2] ?? 3), seasons = 6;
const acc = { ovr: [0, 0, 0], S: 0, A: 0, physSd: 0, techSd: 0, young: 0 };
const sd = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
for (let r = 0; r < runs; r++) {
  const w = createWorld(100 + r); const rng = new Rng(200 + r); const log: any[] = [];
  let rec: any;
  for (let s = 0; s < seasons; s++) rec = playSeason(w, rng, log);
  rec.divStarterOvr.forEach((v: number, i: number) => (acc.ovr[i] += v / runs));
  acc.S += rec.domesticS / runs; acc.A += rec.domesticA / runs;
  const ps = w.clubs.flatMap(c => c.roster).filter(p => !p.foreign);
  acc.physSd += ps.reduce((a, p) => a + sd(PHYS_KEYS.map(k => p.phys[k])), 0) / ps.length / runs;
  acc.techSd += ps.reduce((a, p) => a + sd(TECH_SET[p.position].map(k => p.tech[k])), 0) / ps.length / runs;
  const young = ps.filter(p => p.age <= 24);
  acc.young += young.reduce((a, p) => a + ovr(p), 0) / young.length / runs;
}
console.log(`starter OVR 1/2/3부 ${acc.ovr.map(v => v.toFixed(1)).join(' / ')} · S ${acc.S.toFixed(1)} A ${acc.A.toFixed(1)} · 24세↓ 평균 ${acc.young.toFixed(1)} · 선수 안 편차 신체 ${acc.physSd.toFixed(2)} 기술 ${acc.techSd.toFixed(2)}`);
