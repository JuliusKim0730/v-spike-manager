/** Best case (starter, training lv5, S coach, full preseason): seasons until a focused stat hits 99, and integrated OVR curve */
import { Rng } from '../src/engine/rng.ts';
import { makePro, seasonGP, spendGP, type TrainMode } from '../src/engine/league/growth.ts';
import { RULES } from '../src/engine/league/rules.ts';
import { ovr } from '../src/engine/player.ts';

const env = Number(process.argv[2] ?? 1);
for (const [pot, label] of [[85, 'A'], [75, 'B']] as const) {
  for (const m of [{ focus: 'spike' }, 'integrated'] as TrainMode[]) {
    const out: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const p = makePro(new Rng(seed), 'OH', pot, 20, 'normal');
      const s0 = Math.round(p.tech.spike), o0 = ovr(p);
      let n = 0;
      while (n < 8 && (typeof m === 'object' ? p.tech.spike < 98.5 : n < 4)) { spendGP(p, seasonGP(p, env), m); p.age++; n++; }
      out.push(typeof m === 'object' ? `${s0}→99:${n}` : `${o0}→${ovr(p)}`);
    }
    console.log(`잠재 ${label} ${typeof m === 'object' ? '스파이크 집중' : '통합 4시즌'} (env ${env}, scale ${RULES.growthScale}):`, out.slice(0, 10).join(' '));
  }
}
