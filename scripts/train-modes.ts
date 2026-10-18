/** One 20-year-old (potential A, OH) trained 1 season with each plan: stats and OVR afterwards */
import { Rng } from '../src/engine/rng.ts';
import { makePro, seasonGP, spendGP, type TrainMode } from '../src/engine/league/growth.ts';
import { ovr, PHYS_KEYS, TECH_SET } from '../src/engine/player.ts';

const modes: TrainMode[] = ['integrated', 'physical', 'skill', { focus: 'spike' }, { focus: 'jump' }];
for (const m of modes) {
  const p = makePro(new Rng(5), 'OH', 85, 20, 'normal');
  const before = ovr(p);
  for (let s = 0; s < 1; s++) { spendGP(p, seasonGP(p, 1), m); p.age++; }
  const f = (x: number) => Math.round(x).toString().padStart(3);
  console.log(`${(typeof m === 'object' ? 'focus:' + m.focus : m).padEnd(12)} OVR ${before}→${ovr(p)} | 신체 ${PHYS_KEYS.map(k => f(p.phys[k])).join('')} | 기술 ${TECH_SET.OH.map(k => f(p.tech[k])).join('')}`);
}
