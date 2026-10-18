/** Headless run of the career loop: two seasons with default choices. */
import { advance, newCareer, phaseLabel, userClub, userDraftPick, userOnTheClock } from '../src/game/career.ts';
import { ovr } from '../src/engine/player.ts';

const t0 = Date.now();
const c = newCareer({ slot: 0, division: 2, team: 3, funding: 1, games: 28, seed: 7 });
let turns = 0;
const seen = new Set<string>();
while (c.world.year < 3 && turns < 400) {
  const k = c.phase.k;
  if (k === 'fired') { console.log('fired'); break; }
  if (k === 'draft' && userOnTheClock(c)) { userDraftPick(c, c.draft!.pool.sort((a, b) => b.potPhys + b.potTech - a.potPhys - a.potTech)[0]); continue; }
  if (k === 'foreign') c.foreignPick = 2;
  const msg = advance(c, { free: turns % 2 ? 'practice' : 'train', sponsor: 'naming' });
  turns++;
  if (!seen.has(k)) { seen.add(k); }
  if (msg && (k === 'match' && c.day % 7 === 0)) console.log(phaseLabel(c), msg);
}
const u = userClub(c);
console.log('turns', turns, 'ms', Date.now() - t0, 'ms/turn', ((Date.now() - t0) / turns).toFixed(0));
console.log('year', c.world.year, 'div', u.division, 'roster', u.roster.length, 'cash', u.cash.toFixed(1), 'trust', c.trust);
console.log('seasons', JSON.stringify(c.seasons));
console.log('phases', [...seen].join(','));
console.log('save KB', (JSON.stringify(c).length / 1024).toFixed(0));
console.log('names', u.roster.slice(0, 5).map(p => `${p.name}/${p.position}/${ovr(p)}`).join(' '));
console.log(c.news.slice(0, 8).map(n => n.text).join('\n'));
