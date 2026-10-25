/** Headless 신인감독모드 runs: tier spread by opponent plan and day plan (design/ROOKIE-MODE.md §10). */
import { ovr } from '../src/engine/player.ts';
import { starterAvg } from '../src/game/career.ts';
import {
  autoToMatch, dayKind, newRookie, rk, rookieAdvance, staffPool, tryoutPlayers, USER, prospects, recruit, estimate, type League,
} from '../src/game/rookie.ts';

const PLANS: Record<string, number[]> = {
  easy: [16, 17, 18, 19, 20, 21, 22],
  mixed: [19, 15, 16, 13, 6, 12, 0],
  hard: [0, 1, 2, 8, 9, 10, 3],
  climb: [20, 15, 14, 13, 12, 5, 0],
};
const DAYS: Record<string, (d: number) => { free: 'train' | 'practice' | 'rest'; league?: League }> = {
  auto: () => ({ free: 'train' }),
  practice: d => (d % 3 === 0 ? { free: 'practice', league: 'overseas' } : d % 3 === 1 ? { free: 'train' } : { free: 'rest' }),
};

function run(seed: number, plan: string, days: string, staffIdx: string[]) {
  const pool = staffPool(seed);
  const staff = staffIdx.map(id => pool.find(s => s.id === id)!);
  const c = newRookie({ slot: 0, name: '테스트', short: '테스트', color: '#f60', staff, seed });
  const s = rk(c);
  // tryout: coach picks + best tryout scorers per position to fill out 14
  const t = s.tryout!;
  const ps = tryoutPlayers(c).sort((a, b) => t.stats[b.id].pts / Math.max(1, t.stats[b.id].g) - t.stats[a.id].pts / Math.max(1, t.stats[a.id].g));
  const need: Record<string, number> = { S: 2, OH: 4, MB: 4, OP: 2, L: 2 };
  for (const p of ps) if (!t.picked.includes(p.id) && t.picked.filter(id => ps.find(q => q.id === id)!.position === p.position).length < need[p.position]) t.picked.push(p.id);
  t.picked = t.picked.slice(0, 16);
  const e = rookieAdvance(c); if (e) throw new Error(e);
  const ovr0 = starterAvg(c.world.clubs[USER]);
  s.schedule = PLANS[plan];
  rookieAdvance(c);
  // spend spare cash on the best 2 estimated prospects
  for (let i = 0; i < 2; i++) {
    const best = prospects(c).sort((a, b) => estimate(c, b.p)[0] - estimate(c, a.p)[0])[0];
    if (best && c.world.clubs[USER].cash > best.fee + 1.5) recruit(c, best);
  }
  while (dayKind(s.day) !== 'ending') {
    const k = dayKind(s.day);
    if (k === 'free') { if (days === 'auto') autoToMatch(c); else rookieAdvance(c, DAYS[days](s.day)); }
    else rookieAdvance(c);
  }
  const club = c.world.clubs[USER];
  return { tier: s.ending!.tier, total: s.ending!.total, wins: s.games.filter(g => g.win).length, ovr0, ovr1: starterAvg(club), cash: club.cash, rating: s.weeks.reduce((a, w) => a + w.rating, 0) / s.weeks.length, games: s.games, deals: s.deals.length };
}

const N = Number(process.argv[2] ?? 12);
const staffSets: Record<string, string[]> = { coachS: ['coach0', 'scout2', 'trainer3', 'pr2'], balanced: ['coach1', 'scout2', 'analyst3', 'pr1'] };
for (const plan of Object.keys(PLANS)) for (const days of Object.keys(DAYS)) for (const [sn, st] of Object.entries(staffSets)) {
  const rs = Array.from({ length: N }, (_, i) => run(1000 + i, plan, days, st));
  const avg = (f: (r: typeof rs[number]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
  const tiers = ['S', 'A', 'B', 'C', 'D'].map(t => `${t}${rs.filter(r => r.tier === t).length}`).join(' ');
  console.log(`${plan.padEnd(6)} ${days.padEnd(8)} ${sn.padEnd(8)} total ${avg(r => r.total)} wins ${avg(r => r.wins)} ovr ${avg(r => r.ovr0)}→${avg(r => r.ovr1)} rating ${avg(r => r.rating)}% cash ${avg(r => r.cash)} deals ${avg(r => r.deals)} | ${tiers}`);
}
const one = run(1000, 'mixed', 'auto', staffSets.balanced);
for (const g of one.games) console.log(g.no, g.opp, g.squad ?? '', g.setsWon.join(':'), g.ourOvr.toFixed(1), g.oppOvr.toFixed(1), g.points.toFixed(1), g.rating.toFixed(2), g.parts.join(' / '));
